import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import BackgroundGeolocation, { type Location, type Subscription } from 'react-native-background-geolocation';
import * as Notifications from 'expo-notifications';
import { DesiredAccuracy, AuthorizationStatus } from '@transistorsoft/background-geolocation-types';
import { supabase } from './supabase';
import { fetchOwnNightStatus, type OwnNightStatus } from './night-status';
import { queryClient } from './query-client';
import { validFix, type LocationFix } from './location-quality';
import {
  automaticUpdatesEnabled, configureTrackingDeadline, ensureLocationReady,
  getLocationPermission, hasLocationAccess, requestAutomaticUpdates,
  setLocationHandler, type LocationPermission,
} from './location-ready';

interface PendingFix { userId: string; revision: string; expiresAt: string; fix: LocationFix }
interface WriteResult {
  status: 'accepted' | 'invalid' | 'ignored' | 'conflict' | 'stopped';
  needs_sample?: boolean;
  venue_changed?: boolean;
  departed?: boolean;
  venue_name?: string | null;
  venue_id?: string | null;
}
export interface TrackingResult { tracking: boolean; permission: LocationPermission }
const pendingKey = (uid: string) => `spotted.location.pending.v1.${uid}`;
let currentUserId: string | null = null;
let status: OwnNightStatus | null = null;
let isTracking = false;
let generation = 0;
let starting: Promise<TrackingResult> | null = null;
let processing: Promise<void> = Promise.resolve();
let lastQueuedAt = 0;
let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
let arrivalWatch: Subscription | null = null;
let watchStarting = false;
let watchUntil = 0;
let watchTimer: ReturnType<typeof setTimeout> | undefined;
let watchCooldownUntil = 0;
let listenersInstalled = false;
let motionWakePending = false;
const pausedUsers = new Set<string>();
const pausedKey = (uid: string) => `spotted.location.paused.v1.${uid}`;

function active(s: OwnNightStatus | null): s is OwnNightStatus {
  return !!s && s.status === 'out' && !s.is_private_party && Date.parse(s.expires_at) > Date.now();
}
function fromNative(location: Location): LocationFix {
  return {
    lat: location.coords.latitude, lng: location.coords.longitude,
    accuracy: location.coords.accuracy, recordedAt: typeof location.timestamp === 'number' ?
      (Number.isFinite(location.timestamp) ? new Date(location.timestamp).toISOString() : '') : location.timestamp,
    speed: typeof location.coords.speed === 'number' && location.coords.speed >= 0 ? location.coords.speed : null,
  };
}
function stopArrivalWatch(): void {
  arrivalWatch?.remove(); arrivalWatch = null;
  watchUntil = 0;
  if (watchTimer) clearTimeout(watchTimer);
  watchTimer = undefined;
}

/** A bounded arrival burst supplies dwell samples even after someone stops
 * walking. Never a permanent background watch or battery-draining heartbeat. */
async function sampleArrival(): Promise<void> {
  if (arrivalWatch || watchStarting || Date.now() < watchCooldownUntil || !active(status)) return;
  const version = generation;
  watchStarting = true;
  watchUntil = Math.min(Date.now() + 120_000, Date.parse(status.expires_at));
  try {
    await ensureLocationReady();
    if (version !== generation || !isTracking) return;
    const sub = await BackgroundGeolocation.watchPosition(
      { interval: 10_000, desiredAccuracy: DesiredAccuracy.High, persist: false, timeout: 20_000 },
      (location) => {
        if (version !== generation || Date.now() >= watchUntil) { stopArrivalWatch(); return; }
        enqueueLocation(location);
      },
      () => stopArrivalWatch()
    );
    if (version !== generation || Date.now() >= watchUntil) { sub.remove(); return; }
    arrivalWatch = sub;
    watchTimer = setTimeout(() => {
      stopArrivalWatch();
      watchCooldownUntil = Date.now() + 60_000;
    }, Math.max(0, watchUntil - Date.now()));
  } catch { stopArrivalWatch(); }
  finally { watchStarting = false; }
}

async function deliver(pending: PendingFix, version: number): Promise<void> {
  if (version !== generation || pending.userId !== currentUserId || !active(status)) return;
  if (pending.revision !== status.updated_at || Date.parse(pending.expiresAt) <= Date.now() || !validFix(pending.fix)) {
    await AsyncStorage.removeItem(pendingKey(pending.userId));
    return;
  }
  const { fix } = pending;
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 15_000);
  const request = supabase.rpc('record_live_location', {
    p_lat: fix.lat, p_lng: fix.lng, p_accuracy: fix.accuracy,
    p_recorded_at: fix.recordedAt, p_status_updated_at: pending.revision,
    p_speed: fix.speed ?? undefined,
  }).abortSignal(abort.signal);
  const { data, error } = await Promise.resolve(request).finally(() => clearTimeout(timeout));
  if (error) throw error; // retain ONE latest sample for reconnect, preserving capture time
  const result = data as unknown as WriteResult;
  await AsyncStorage.removeItem(pendingKey(pending.userId)).catch(() => {});
  if (version !== generation) return;
  if (result.status === 'stopped') { void stopBackgroundLocation(); return; }
  if (result.status === 'conflict') {
    status = await fetchOwnNightStatus(pending.userId);
    stopArrivalWatch();
    return;
  }
  if (result.status !== 'accepted') return;
  void queryClient.invalidateQueries({ queryKey: ['map-data'] });
  if (result.venue_changed || result.departed) {
    // The database updated the venue and check-ins together. Refresh every
    // surface from that committed result; never fabricate a local check-in.
    for (const key of ['own-night-status', 'friends-out', 'leaderboard', 'profile-page', 'plans', 'friend-card']) {
      void queryClient.invalidateQueries({ queryKey: [key] });
    }
    if (result.venue_changed && result.venue_name && AppState.currentState !== 'active') {
      void Notifications.scheduleNotificationAsync({
        content: { title: `Now at ${result.venue_name}`, body: 'Your spot updated. Tap to change it.', data: { url: '/check-in' } },
        trigger: null,
      }).catch(() => {});
    }
    // Friends' arrival alerts are created by the database in the same
    // transaction as the venue change (nightlife_notification_coverage).
  }
  if (result.needs_sample) void sampleArrival();
  else stopArrivalWatch();
}

function enqueueLocation(location: Location): void {
  const uid = currentUserId;
  const snapshot = status;
  const version = generation;
  const fix = fromNative(location);
  if (!uid || !isTracking || !active(snapshot) || !snapshot.updated_at || !validFix(fix)) return;
  const recorded = Date.parse(fix.recordedAt);
  // SDK one-shots and watch events can also hit onLocation. Duplicate samples
  // cannot count as dwell, race each other, or produce multiple check-ins.
  if (recorded - lastQueuedAt < 10_000) return;
  lastQueuedAt = recorded;
  const pending: PendingFix = { userId: uid, revision: snapshot.updated_at, expiresAt: snapshot.expires_at, fix };
  processing = processing.then(async () => {
    if (version !== generation || currentUserId !== uid) return;
    await AsyncStorage.setItem(pendingKey(uid), JSON.stringify(pending)).catch(() => {});
    if (version !== generation) { await AsyncStorage.removeItem(pendingKey(uid)); return; }
    await deliver(pending, version);
  }).catch(() => {
    // No GPS coordinates in logs. A transient network/auth error must not
    // permanently stop the native watcher; the next fix/reconnect retries.
    console.warn('[Location] Upload deferred until connectivity returns');
  });
}
setLocationHandler(enqueueLocation);

export async function retryPendingLocation(): Promise<void> {
  const uid = currentUserId;
  const version = generation;
  if (!uid || !active(status)) return;
  processing = processing.then(async () => {
    const raw = await AsyncStorage.getItem(pendingKey(uid));
    if (!raw || version !== generation) return;
    let pending: PendingFix;
    try { pending = JSON.parse(raw); } catch { await AsyncStorage.removeItem(pendingKey(uid)); return; }
    if (!pending || !pending.fix || pending.userId !== uid) { await AsyncStorage.removeItem(pendingKey(uid)); return; }
    await deliver(pending, version);
  }).catch(() => {});
  await processing;
}

/** One-shot, fresh and accuracy-checked. Does not prompt or start sharing. */
export async function getCurrentPosition(): Promise<LocationFix | null> {
  try {
    if (!hasLocationAccess(await getLocationPermission())) return null;
    const native = await BackgroundGeolocation.getCurrentPosition({ timeout: 10, samples: 2, desiredAccuracy: 35, persist: false, maximumAge: 0 });
    const fix = fromNative(native);
    return validFix(fix) ? fix : null;
  } catch { return null; }
}

function installListeners(): void {
  if (listenersInstalled) return;
  listenersInstalled = true;
  BackgroundGeolocation.onMotionChange(({ location }) => enqueueLocation(location));
  BackgroundGeolocation.onActivityChange(({ activity, confidence }) => {
    // iOS's stationary geofence can take ~200m to wake. A confident walking
    // event starts moving-mode GPS sooner for short hops between nearby bars.
    if (!isTracking || !active(status) || motionWakePending || confidence < 80 ||
        !['walking', 'running', 'on_foot'].includes(activity)) return;
    const version = generation;
    motionWakePending = true;
    void BackgroundGeolocation.getState().then(async (state) => {
      if (version !== generation || !isTracking || state.isMoving) return;
      await BackgroundGeolocation.changePace(true);
      if (version !== generation) { await BackgroundGeolocation.stop(); return; }
      await getCurrentPosition();
    }).catch(() => {}).finally(() => { motionWakePending = false; });
  });
  BackgroundGeolocation.onConnectivityChange(({ connected }) => { if (connected) void retryPendingLocation(); });
  BackgroundGeolocation.onProviderChange((provider) => {
    if (!provider.enabled || (provider.status !== AuthorizationStatus.Always && provider.status !== AuthorizationStatus.WhenInUse)) void stopBackgroundLocation();
    else if (provider.status !== AuthorizationStatus.Always && AppState.currentState !== 'active') void stopBackgroundLocation();
  });
}

/** Idempotent resume. Network failure leaves an existing valid watcher alive;
 * a known stop/private party/expiry shuts it down. Never prompts. */
export function startBackgroundLocation(userId: string): Promise<TrackingResult> {
  if (starting) return starting;
  const version = generation;
  starting = (async (): Promise<TrackingResult> => {
    let permission: LocationPermission = 'not_determined';
    try {
      if (pausedUsers.has(userId) || await AsyncStorage.getItem(pausedKey(userId)) === '1') {
        return { tracking: false, permission };
      }
      permission = await getLocationPermission();
      const provider = await BackgroundGeolocation.getProviderState();
      if (!provider.enabled) { await stopBackgroundLocation(); return { tracking: false, permission }; }
      const next = await fetchOwnNightStatus(userId);
      if (version !== generation || pausedUsers.has(userId)) return { tracking: false, permission };
      if (!active(next) || !hasLocationAccess(permission) ||
          (AppState.currentState !== 'active' && permission !== 'always')) {
        await stopBackgroundLocation();
        return { tracking: false, permission };
      }
      if (currentUserId && currentUserId !== userId) return { tracking: false, permission };
      currentUserId = userId;
      status = next;
      installListeners();
      if (!isTracking) {
        await configureTrackingDeadline(next.expires_at);
        if (version !== generation) return { tracking: false, permission };
        const state = await BackgroundGeolocation.start();
        if (version !== generation) { await BackgroundGeolocation.stop(); return { tracking: false, permission }; }
        isTracking = state.enabled;
        lastQueuedAt = 0;
      }
      if (deadlineTimer) clearTimeout(deadlineTimer);
      deadlineTimer = setTimeout(() => { void stopBackgroundLocation(); }, Math.max(0, Date.parse(next.expires_at)-Date.now()));
      void retryPendingLocation();
      return { tracking: isTracking, permission };
    } catch {
      return { tracking: isTracking && currentUserId === userId && active(status), permission };
    }
  })().finally(() => { starting = null; });
  return starting;
}

export async function enableAutomaticUpdates(userId: string): Promise<TrackingResult> {
  const permission = await requestAutomaticUpdates();
  if (permission === 'always' && await automaticUpdatesEnabled()) {
    const { error } = await supabase.from('night_statuses').update({ automatic_venue_updates: true })
      .eq('user_id', userId).eq('status', 'out').eq('is_private_party', false).gt('expires_at', new Date().toISOString());
    if (error) throw error;
  }
  return startBackgroundLocation(userId);
}

/** Cancel synchronously, drain in-flight writes before callers clear the pin.
 * Clearing currentUserId also prevents later one-shot GPS from re-sharing. */
export async function stopBackgroundLocation(): Promise<void> {
  const uid = currentUserId;
  generation += 1;
  currentUserId = null; status = null; isTracking = false; lastQueuedAt = 0;
  stopArrivalWatch();
  if (deadlineTimer) clearTimeout(deadlineTimer);
  deadlineTimer = undefined;
  try { await ensureLocationReady(); await BackgroundGeolocation.stop(); } catch { /* retry at next resume */ }
  await processing;
  if (uid) await AsyncStorage.removeItem(pendingKey(uid));
}

/** Foreground refresh: a failed fix makes NO write and never makes old GPS fresh. */
export async function recordPresenceHeartbeat(userId: string): Promise<boolean> {
  const result = await startBackgroundLocation(userId);
  if (!result.tracking || currentUserId !== userId) return false;
  const version = generation;
  const fix = await getCurrentPosition();
  if (!fix || version !== generation) return true;
  // getCurrentPosition emits onLocation; await the serialized upload it queued.
  await processing;
  return true;
}

/** Explicit status changes latch GPS off locally, including when offline.
 * Only a successfully completed, user-confirmed check-in clears this latch. */
export async function pauseLocationForStatusChange(userId: string): Promise<void> {
  pausedUsers.add(userId);
  const stopping = stopBackgroundLocation();
  await AsyncStorage.setItem(pausedKey(userId), '1');
  await stopping;
}
export async function allowLocationAfterCheckin(userId: string): Promise<void> {
  await AsyncStorage.removeItem(pausedKey(userId));
  pausedUsers.delete(userId);
}
