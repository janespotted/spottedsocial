/**
 * App toast: one message at a time, optional action (Undo), auto-dismiss.
 * Rendered by components/toast-host.tsx at the root. Native sheets and
 * modals sit above the root view, so show a toast AFTER dismissing a sheet
 * (the callers here all do), or it will be covered.
 */
export interface ToastAction {
  label: string;
  onPress: () => void | Promise<void>;
}

export interface ToastItem {
  id: number;
  message: string;
  action?: ToastAction;
  /** ms; default 3000, 6000 with an action (time to change your mind). */
  duration: number;
  /** Called when the toast goes away without the action being taken. */
  onExpire?: () => void;
}

type Listener = (toast: ToastItem | null) => void;

let current: ToastItem | null = null;
let seq = 0;
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l(current);
}

export function showToast(
  message: string,
  opts: { action?: ToastAction; duration?: number; onExpire?: () => void } = {}
): number {
  const id = ++seq;
  current = {
    id,
    message,
    action: opts.action,
    duration: opts.duration ?? (opts.action ? 6000 : 3000),
    onExpire: opts.onExpire,
  };
  emit();
  return id;
}

export function dismissToast(id?: number): void {
  if (!current || (id !== undefined && current.id !== id)) return;
  current = null;
  emit();
}

export function subscribeToast(listener: Listener): () => void {
  listeners.add(listener);
  listener(current);
  return () => {
    listeners.delete(listener);
  };
}
