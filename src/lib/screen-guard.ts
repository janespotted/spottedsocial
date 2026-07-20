import { registerPlugin } from '@capacitor/core';
import { isNativePlatform } from './platform';

interface ScreenGuardPlugin {
  enable(): Promise<void>;
  disable(): Promise<void>;
}

const ScreenGuard = registerPlugin<ScreenGuardPlugin>('ScreenGuard');

export async function enableScreenGuard(): Promise<void> {
  if (!isNativePlatform()) return;
  await ScreenGuard.enable();
}

export async function disableScreenGuard(): Promise<void> {
  if (!isNativePlatform()) return;
  await ScreenGuard.disable();
}
