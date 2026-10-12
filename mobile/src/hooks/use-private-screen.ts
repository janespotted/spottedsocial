import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useIsFocused } from 'expo-router/react-navigation';
import * as ScreenCapture from 'expo-screen-capture';

let sequence: Promise<unknown> = Promise.resolve();
/** Fail closed until native protection is applied; serialize blur/focus races. */
export function usePrivateScreen(key: string, enabled = true) {
  const focused = useIsFocused();
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useFocusEffect(useCallback(() => {
    if (!enabled) return;
    let active = true;
    setReady(false);
    setFailed(false);
    sequence = sequence.catch(() => {}).then(async () => {
      await ScreenCapture.preventScreenCaptureAsync(key);
      if (active) setReady(true);
    }).catch(() => { if (active) { setReady(false); setFailed(true); } });
    return () => {
      active = false;
      setReady(false);
      sequence = sequence.catch(() => {}).then(() => ScreenCapture.allowScreenCaptureAsync(key));
    };
  }, [key, enabled, attempt]));
  return { focused, ready: !enabled || (focused && ready), failed, retry: () => setAttempt(n => n + 1) };
}
