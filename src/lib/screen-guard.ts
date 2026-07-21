import { registerPlugin } from '@capacitor/core';
import { isNativePlatform } from './platform';

interface ScreenGuardPlugin {
  enable(): Promise<void>;
  disable(): Promise<void>;
}

const ScreenGuard = registerPlugin<ScreenGuardPlugin>('ScreenGuard');

export async function enableScreenGuard(): Promise<void> {
  console.log('[ScreenGuard JS] enableScreenGuard called, isNative:', isNativePlatform());
  if (!isNativePlatform()) return;
  try {
    await ScreenGuard.enable();
    console.log('[ScreenGuard JS] enable() resolved');
  } catch (e) {
    console.error('[ScreenGuard JS] enable() failed:', e);
  }
}

export async function disableScreenGuard(): Promise<void> {
  console.log('[ScreenGuard JS] disableScreenGuard called, isNative:', isNativePlatform());
  if (!isNativePlatform()) return;
  try {
    await ScreenGuard.disable();
    console.log('[ScreenGuard JS] disable() resolved');
  } catch (e) {
    console.error('[ScreenGuard JS] disable() failed:', e);
  }
}
