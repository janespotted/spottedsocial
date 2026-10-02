/**
 * Full-screen confetti, drawn by components/confetti.tsx's ConfettiHost at
 * the root. Unlike a toast it does not wait for sheets to close: the host
 * renders into a FullWindowOverlay, above native sheets and modals.
 */
type Listener = (id: number) => void;

let seq = 0;
const listeners = new Set<Listener>();

export function fireConfetti(): void {
  const id = ++seq;
  for (const l of listeners) l(id);
}

export function subscribeConfetti(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
