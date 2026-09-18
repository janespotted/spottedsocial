import { useSyncExternalStore } from 'react';
import { router } from 'expo-router';
import type { TaggedFriend } from './post-tags';

/**
 * The /tag-friends form sheet is a separate screen, so the composer's
 * current selection and its confirm handler cross the boundary here — the
 * same pattern as the audience picker (lib/audience.ts).
 */
export interface TagPickerRequest {
  /** Ids already selected, so reopening the sheet keeps them checked. */
  selected: string[];
  /** Returns whole friends, not ids — the composer renders their names. */
  onConfirm: (friends: TaggedFriend[]) => void;
}

let request: TagPickerRequest | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function openTagPicker(req: TagPickerRequest): void {
  request = req;
  emit();
  router.push('/tag-friends');
}

export function clearTagRequest(): void {
  request = null;
  emit();
}

export function useTagPickerRequest(): TagPickerRequest | null {
  return useSyncExternalStore(
    (callback) => {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    () => request
  );
}
