import { useEffect, useRef, useState } from "react";

export function RemoveFromWave({ waveName, count, personName, onRemove, onClose }: {
  waveName: string;
  count: number;
  personName?: string;
  onRemove: () => Promise<void>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  async function remove() {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      await onRemove();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove. Please try again.");
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return <dialog ref={dialog} className="pool-dialog wave-removal" aria-labelledby="wave-removal-title"
    onCancel={e => { if (busy) e.preventDefault(); }} onClose={onClose}>
    <section className="panel pool-detail">
      <p className="eyebrow">EDIT YOUR WAVE</p>
      <h2 id="wave-removal-title">Remove from {waveName}?</h2>
      <p>{count === 1 ? personName || "This person" : `These ${count} people`} will return to <strong>Next up</strong>. You can add {count === 1 ? "them" : "these people"} to a wave again later.</p>
      <p className="muted">Contact details and original requests stay saved. No message is sent.</p>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="wave-actions">
        <button className="secondary" autoFocus disabled={busy} onClick={onClose}>Keep in wave</button>
        <button disabled={busy} onClick={() => void remove()}>{busy ? "Removing…" : "Remove from wave"}</button>
      </div>
    </section>
  </dialog>;
}
