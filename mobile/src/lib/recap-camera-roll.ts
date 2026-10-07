import {
  AssetField,
  MediaType,
  Query,
  getPermissionsAsync,
  requestPermissionsAsync,
  type PermissionResponse,
} from 'expo-media-library';
import type { RecapStop } from './night-recap';

/**
 * Morning After's camera-roll suggestions: photos the user took during their
 * stops last night, read straight from the photo library ON THE DEVICE.
 * Nothing here uploads anything — the pictures are shown from their `ph://`
 * asset ids (expo-image draws them) and stay on the phone. Asking for library
 * access is always the user's tap on an explained card, never automatic; the
 * camera's library shortcut only ever reads an existing grant.
 */
export type CameraRollAccess = 'all' | 'limited' | 'undetermined' | 'denied';

export interface DevicePhoto {
  /** The `ph://` asset id — also the image source. */
  id: string;
  width: number | null;
  height: number | null;
  takenAt: number;
}

/** A stop with no recorded departure is assumed to last at most this long. */
const OPEN_STOP_MS = 4 * 60 * 60 * 1000;
/** Look at this many library photos at most; the recap shows nine. */
const SCAN_LIMIT = 120;

function toAccess(p: PermissionResponse): CameraRollAccess {
  if (p.granted) return p.accessPrivileges === 'limited' ? 'limited' : 'all';
  return p.canAskAgain ? 'undetermined' : 'denied';
}

export async function getCameraRollAccess(): Promise<CameraRollAccess> {
  return toAccess(await getPermissionsAsync());
}

export async function requestCameraRollAccess(): Promise<CameraRollAccess> {
  return toAccess(await requestPermissionsAsync());
}

/**
 * The time windows of the night's stops: arrival to departure, or to the
 * next arrival, or — when neither was recorded — a few hours, never past now.
 */
export function stopWindows(stops: RecapStop[], now = Date.now()): [number, number][] {
  return stops.map((stop, i) => {
    const start = Date.parse(stop.arrived_at);
    const next = stops[i + 1] ? Date.parse(stops[i + 1].arrived_at) : NaN;
    const left = stop.left_at ? Date.parse(stop.left_at) : NaN;
    const end = !Number.isNaN(left) ? left : !Number.isNaN(next) ? next : start + OPEN_STOP_MS;
    return [start, Math.min(end, now)] as [number, number];
  });
}

/** Photos in the library taken inside any stop's window, oldest first. */
export async function findNightPhotos(stops: RecapStop[], limit: number): Promise<DevicePhoto[]> {
  const windows = stopWindows(stops).filter(([s, e]) => e > s);
  if (windows.length === 0 || limit <= 0) return [];
  const from = Math.min(...windows.map(([s]) => s));
  const to = Math.max(...windows.map(([, e]) => e));
  const found = await new Query()
    .eq(AssetField.MEDIA_TYPE, MediaType.IMAGE)
    .gte(AssetField.CREATION_TIME, Math.floor(from))
    .lte(AssetField.CREATION_TIME, Math.ceil(to))
    .orderBy({ key: AssetField.CREATION_TIME, ascending: true })
    .limit(SCAN_LIMIT)
    .exeForMetadata();
  return found
    .filter((m) => m.creationTime != null && windows.some(([s, e]) => m.creationTime! >= s && m.creationTime! <= e))
    .slice(0, limit)
    .map((m) => ({ id: m.id, width: m.width, height: m.height, takenAt: m.creationTime! }));
}
