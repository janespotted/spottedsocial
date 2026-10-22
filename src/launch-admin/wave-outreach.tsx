import { useEffect, useRef, useState } from "react";
import { supabase } from "../integrations/supabase/client";
import "./wave-outreach.css";
interface Recipient {
  id: string;
  name: string;
  phone: string;
  readiness: string;
  delivery: string | null;
}
interface Review {
  wave: { name: string; status: string; capacity: number };
  rows: Recipient[];
  message: string;
  token: string;
  ready: number;
  total: number;
  blockers: string[];
}
const rpc = async (action: string, data: Record<string, unknown>) => {
  const { data: result, error } = await (supabase as any).rpc(
    "launch_outreach",
    { p_action: action, p_data: data },
  );
  if (error) throw Error(error.message);
  return result;
};
export function WaveOutreach({
  wave,
  preview,
  onClose,
  onUpdated,
  onSetup,
  onGuest,
}: {
  wave: string;
  preview: boolean;
  onClose: () => void;
  onUpdated: () => void;
  onSetup: () => void;
  onGuest: (id: string, phone: string) => void;
}) {
  const [review, setReview] = useState<Review | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [sender, setSender] = useState(false),
    [search, setSearch] = useState("");
  const dialog = useRef<HTMLDialogElement>(null),
    alive = useRef(true),
    locked = useRef(false),
    request = useRef(crypto.randomUUID()),
    latest = useRef(0);
  const load = async () => {
    const version = ++latest.current;
    setConfirmed(false);
    try {
      const result: Review = preview
        ? {
            wave: {
              name: wave === "first" ? "The first 100" : "Next circle",
              status: "draft",
              capacity: 100,
            },
            rows: [
              {
                id: "preview-3",
                name: "Taylor Rivera",
                phone: "+12025550103",
                readiness: "Ready",
                delivery: null,
              },
              {
                id: "preview-4",
                name: "Casey Park",
                phone: "+12025550104",
                readiness: "Needs SMS permission",
                delivery: null,
              },
            ],
            message:
              "Spotted: your New York invitation is open. Join with the phone number receiving this text: [Add the app download link] Reply STOP to opt out.",
            token: "preview",
            ready: 1,
            total: 2,
            blockers: [
              "Review and open this wave.",
              "Save a working TestFlight or App Store link in Launch settings.",
              "Configure and verify the invitation SMS sender.",
            ],
          }
        : await rpc("review", { wave });
      if (!alive.current || version !== latest.current) return;
      setReview(result);
      setError("");
      request.current = crypto.randomUUID();
      if (!preview) {
        const { data, error } = await supabase.functions.invoke(
          "launch-send-invitations",
          { body: { action: "preflight" } },
        );
        if (alive.current && version === latest.current)
          setSender(!error && data?.ready === true);
      }
    } catch (e) {
      if (alive.current && version === latest.current) {
        setReview(null);
        setSender(false);
        setError(
          e instanceof Error
            ? e.message
            : "Could not load outreach. Try again.",
        );
      }
    }
  };
  useEffect(() => {
    alive.current = true;
    dialog.current?.showModal();
    void load();
    return () => {
      alive.current = false;
      latest.current++;
    };
  }, []);
  async function drain(scope: Record<string, string>) {
    for (let i = 0; i < 60 && alive.current; i++) {
      const { data, error } = await supabase.functions.invoke(
        "launch-send-invitations",
        { body: scope },
      );
      if (error || data?.error)
        throw Error(
          "Sending paused. Refresh delivery status, then use Resume queued texts. Sent invitations will not be repeated.",
        );
      if (data.processed === 0) return;
      if (alive.current)
        setNotice(
          "Sending invitations… Keep this page open. Delivery results will appear below.",
        );
    }
    if (alive.current)
      throw Error(
        "The remaining texts are saved. Refresh and resume queued texts to continue.",
      );
  }
  async function send(resume = false) {
    if (locked.current || !review || !sender || preview) return;
    locked.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (resume) await drain({ waveId: wave });
      else {
        const result = await rpc("queue", {
          wave,
          token: review.token,
          requestId: request.current,
        });
        if (alive.current)
          setNotice(`${result.queued} invitations queued. Sending…`);
        await drain({ batchId: result.batchId });
        request.current = crypto.randomUUID();
      }
      if (alive.current) {
        await load();
        setNotice(
          "Sender run complete. Check the delivery column below; provider acceptance is not confirmed delivery.",
        );
        onUpdated();
      }
    } catch (e) {
      if (alive.current) {
        await load();
        setError(
          e instanceof Error
            ? e.message
            : "Could not finish. Refresh before trying again.",
        );
      }
    } finally {
      locked.current = false;
      if (alive.current) setBusy(false);
    }
  }
  const queued =
    review?.rows.filter((r) => r.delivery === "queued").length || 0;
  return (
    <dialog
      ref={dialog}
      className="outreach-dialog"
      aria-label="Wave outreach"
      onCancel={(e) => {
        if (busy) e.preventDefault();
      }}
      onClose={onClose}
    >
      <section className="panel outreach-content">
        <div className="section-title">
          <div>
            <p className="eyebrow">WAVE OUTREACH</p>
            <h2>{review?.wave.name || "Prepare your invitations"}</h2>
          </div>
          <button className="quiet" disabled={busy} onClick={onClose}>
            Close outreach
          </button>
        </div>
        <p>
          One invitation text per person, sent privately. Review the list before
          sending.
        </p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="notice">
            {notice}
          </p>
        )}
        {!review ? (
          <button className="secondary" onClick={() => void load()}>
            Reload outreach
          </button>
        ) : (
          <>
            <div className="outreach-totals">
              <div>
                <strong>{review.total}</strong>
                <span>selected / {review.wave.capacity} places</span>
              </div>
              <div>
                <strong>{review.ready}</strong>
                <span>ready for a first text</span>
              </div>
              <div>
                <strong>{review.total - review.ready}</strong>
                <span>excluded from this send</span>
              </div>
            </div>
            <div className="outreach-steps">
              <p className="eyebrow">BEFORE LAUNCH</p>
              <ol>
                <li>Collect and select your guests.</li>
                <li>
                  Save the app link, confirm SMS permission, and verify the
                  sender.
                </li>
                <li>Open the wave, review recipients, then send.</li>
              </ol>
              {review.total < review.wave.capacity && (
                <p>
                  {review.wave.capacity - review.total} places remain. You can
                  launch a smaller wave when ready.
                </p>
              )}
            </div>
            <div className="outreach-message">
              <p className="eyebrow">EXACT TEXT MESSAGE</p>
              <p>{review.message}</p>
            </div>
            {!!review.blockers.length && (
              <div className="outreach-setup">
                <h3>Still to do</h3>
                <ul>
                  {review.blockers.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
                <button className="secondary" disabled={busy} onClick={onSetup}>
                  Launch settings
                </button>
                <small>
                  Open the wave from its guest list. Record individual SMS
                  permission by opening a person below.
                </small>
              </div>
            )}
            {!sender && (
              <p className="muted">
                Sender not ready or not verified. SMS stays disabled until
                server configuration is checked.
              </p>
            )}
            <div className="filters">
              <input
                aria-label="Search outreach recipients"
                placeholder="Find a person or delivery status…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <button
                className="secondary"
                disabled={busy}
                onClick={() => void load()}
              >
                Refresh review
              </button>
            </div>
            <div className="outreach-list">
              <table>
                <thead>
                  <tr>
                    <th>PERSON</th>
                    <th>THIS SEND</th>
                    <th>DELIVERY</th>
                  </tr>
                </thead>
                <tbody>
                  {review.rows
                    .filter((r) =>
                      (
                        r.name +
                        " " +
                        r.phone +
                        " " +
                        r.readiness +
                        " " +
                        (r.delivery || "")
                      )
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                    )
                    .map((r) => (
                      <tr key={r.id}>
                        <td>
                          <button
                            className="quiet"
                            disabled={busy}
                            onClick={() => onGuest(r.id, r.phone)}
                          >
                            {r.name || "Unnamed guest"}
                          </button>
                          <small>{r.phone}</small>
                        </td>
                        <td>{r.readiness}</td>
                        <td>{r.delivery || "Not sent"}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
              {!review.rows.length && (
                <p className="empty">
                  Add your first guests from Requested invites or the Planning
                  pool.
                </p>
              )}
            </div>
            <p className="muted">
              Previously invited, opted-out and unapproved numbers are excluded.
              Failed or uncertain deliveries need individual review. Keep this
              page open while sending; unfinished texts stay queued if you
              leave.
            </p>
            <label className="outreach-confirm">
              <input
                type="checkbox"
                checked={confirmed}
                disabled={
                  busy || review.blockers.length > 0 || !sender || preview
                }
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              I reviewed the message and {review.ready}{" "}
              {review.ready === 1 ? "recipient" : "recipients"}. Send one text
              to each.
            </label>
            <div className="wave-actions">
              <button
                disabled={
                  busy ||
                  !confirmed ||
                  !sender ||
                  !!review.blockers.length ||
                  preview
                }
                onClick={() => void send()}
              >
                {busy
                  ? "Sending…"
                  : `Send ${review.ready} ${review.ready === 1 ? "invitation" : "invitations"}`}
              </button>
              {queued > 0 && (
                <button
                  className="secondary"
                  disabled={
                    busy || !sender || review.wave.status !== "open" || preview
                  }
                  onClick={() => void send(true)}
                >
                  Resume {queued} queued texts
                </button>
              )}
            </div>
          </>
        )}
      </section>
    </dialog>
  );
}
