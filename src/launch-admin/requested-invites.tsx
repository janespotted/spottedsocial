import { useEffect, useRef, useState } from "react";
import { supabase } from "../integrations/supabase/client";
import "./requested-invites.css";
import { normalizePhone } from "./types";
import { defaultRequestWave, type RequestWave } from "./request-wave";
import { RemoveFromWave } from "./remove-from-wave";
function WaveAction({
  person,
  waves,
  busy,
  move,
  remove,
}: {
  person: InviteRequest;
  waves: RequestWave[];
  busy: boolean;
  move: (r: InviteRequest, wave: string) => void;
  remove: (r: InviteRequest) => void;
}) {
  const [chosen, setChosen] = useState("");
  const target = waves.some(
    (w) =>
      w.id === chosen &&
      w.status === "draft" &&
      (w.selected < w.capacity || w.id === person.wave_id),
  )
    ? chosen
    : defaultRequestWave(waves, person.wave_id);
  return (
    <div className="request-wave">
      {person.wave_name && <small className="badge">{person.wave_name}</small>}
      {!person.locked ? (
        <>
          <select
            aria-label={`Wave for ${person.first_name} ${person.last_name}`}
            value={target}
            disabled={busy || !target}
            onChange={(e) => setChosen(e.target.value)}
          >
            {!target && <option value="">No available waves</option>}
            {waves
              .filter((w) => w.status === "draft")
              .map((w) => (
                <option
                  key={w.id}
                  value={w.id}
                  disabled={w.selected >= w.capacity && w.id !== person.wave_id}
                >
                  {w.name} · {w.selected}/{w.capacity}
                </option>
              ))}
          </select>
          <button
            className="secondary"
            disabled={busy || !target || target === person.wave_id}
            onClick={() => move(person, target)}
          >
            {person.wave_id ? "Move to wave" : "Add to wave"}
          </button>
          {person.wave_id && waves.some(w => w.id === person.wave_id && w.status === "draft") &&
            <button className="quiet" disabled={busy} aria-label={`Remove ${person.first_name} ${person.last_name} from wave`} onClick={() => remove(person)}>Remove from wave</button>}
        </>
      ) : (
        <small>Review in guest list</small>
      )}
    </div>
  );
}
export interface InviteRequest {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  source_kind?: "website" | "app";
  invitation_texts_at?: string | null;
  phone: string;
  neighborhood: string;
  referred_by: string;
  submitted_at: string;
  reviewed_at: string | null;
  guest_id: string | null;
  wave_id: string | null;
  wave_name: string | null;
  assigned_phone: string | null;
  locked: boolean;
}
interface Page {
  waves: RequestWave[];
  total: number;
  summary: { total: number; new: number; withPhone: number };
  connection: {
    enabledAt: string | null;
    lastDeliveryAt: string | null;
    backfilledAt: string | null;
  };
  rows: InviteRequest[];
}
const date = (v: string | null) =>
  v
    ? new Date(v).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "—";
const fixture: Page = {
  waves: [
    {
      id: "first",
      name: "The first 100",
      status: "draft",
      capacity: 100,
      selected: 0,
    },
    {
      id: "second",
      name: "Next circle",
      status: "draft",
      capacity: 200,
      selected: 0,
    },
  ],
  total: 2,
  summary: { total: 2, new: 2, withPhone: 1 },
  connection: {
    enabledAt: new Date().toISOString(),
    lastDeliveryAt: new Date().toISOString(),
    backfilledAt: new Date().toISOString(),
  },
  rows: [
    {
      id: "000000000000000000000001",
      first_name: "Alex",
      last_name: "Sample",
      email: "alex@example.com",
      phone: "(212) 555-0101",
      neighborhood: "West Village / Greenwich Village",
      referred_by: "A friend",
      submitted_at: new Date().toISOString(),
      reviewed_at: null,
      guest_id: null,
      wave_id: null,
      wave_name: null,
      assigned_phone: null,
      locked: false,
    },
    {
      id: "000000000000000000000002",
      first_name: "Jordan",
      last_name: "Demo",
      email: "jordan@example.com",
      phone: "",
      neighborhood: "A little everywhere",
      referred_by: "Instagram",
      submitted_at: new Date().toISOString(),
      reviewed_at: null,
      guest_id: null,
      wave_id: null,
      wave_name: null,
      assigned_phone: null,
      locked: false,
    },
  ],
};
export function RequestedInvites({
  preview,
  onChanged,
}: {
  preview: boolean;
  onChanged: () => void;
}) {
  const [page, setPage] = useState<Page | null>(null),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState("all"),
    [offset, setOffset] = useState(0);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [revision, setRevision] = useState(0),
    [detail, setDetail] = useState<InviteRequest | null>(null),
    [updated, setUpdated] = useState<string | null>(null);
  const [assignment, setAssignment] = useState<{
      person: InviteRequest;
      wave: string;
    } | null>(null),
    [phone, setPhone] = useState("");
  const assignDialog = useRef<HTMLDialogElement>(null);
  const [removal, setRemoval] = useState<InviteRequest | null>(null);
  useEffect(() => {
    if (assignment && !assignDialog.current?.open)
      assignDialog.current?.showModal();
  }, [assignment]);
  const previewWaves = useRef(fixture.waves);
  const dialog = useRef<HTMLDialogElement>(null),
    lock = useRef(false),
    request = useRef(0),
    alive = useRef(true),
    previewRows = useRef(fixture.rows);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      request.current++;
    };
  }, []);
  useEffect(() => {
    if (detail && !dialog.current?.open) dialog.current?.showModal();
  }, [detail?.id]);
  async function call(action: string, data: Record<string, unknown> = {}) {
    if (preview) {
      if (action === "assign") {
        const target = previewWaves.current.find((w) => w.id === data.wave)!;
        previewRows.current = previewRows.current.map((r) =>
          r.id === data.id
            ? {
                ...r,
                guest_id: r.id,
                wave_id: target.id,
                wave_name: target.name,
                assigned_phone: String(data.phone || r.phone),
                reviewed_at: new Date().toISOString(),
              }
            : r,
        );
        previewWaves.current = previewWaves.current.map((w) => ({
          ...w,
          selected: previewRows.current.filter((r) => r.wave_id === w.id)
            .length,
        }));
        return { ok: true, wave_name: target.name };
      }
      if (action === "review") {
        previewRows.current = previewRows.current.map((r) =>
          r.id === data.id
            ? {
                ...r,
                reviewed_at: data.reviewed ? new Date().toISOString() : null,
              }
            : r,
        );
        return { ok: true };
      }
      const rows = previewRows.current.filter(
        (r) =>
          (status === "all" ||
            (status === "new" ? !r.reviewed_at : !!r.reviewed_at)) &&
          Object.values(r)
            .join(" ")
            .toLowerCase()
            .includes(search.toLowerCase()),
      );
      return {
        ...fixture,
        waves: previewWaves.current,
        summary: {
          ...fixture.summary,
          new: previewRows.current.filter((r) => !r.reviewed_at).length,
        },
        rows,
        total: rows.length,
      };
    }
    const { data: result, error } = await (supabase as any).rpc(
      "requested_invites",
      { p_action: action, p_data: data },
    );
    if (error) throw Error(error.message);
    return result;
  }
  useEffect(() => {
    let current = true,
      firstLoad = true;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      if (!firstLoad && document.visibilityState === "hidden") {
        timer = setTimeout(load, 15000);
        return;
      }
      firstLoad = false;
      const id = ++request.current;
      try {
        const result = await call("list", { search, status, offset });
        if (current && id === request.current) {
          setPage(result);
          setError("");
          setUpdated(new Date().toISOString());
          setLoading(false);
        }
      } catch (e) {
        if (current && id === request.current) {
          setPage(null);
          setDetail(null);
          setAssignment(null);
          setError(
            e instanceof Error
              ? e.message
              : "Could not load requests. Try again.",
          );
          setLoading(false);
        }
      }
      if (current) timer = setTimeout(load, 15000);
    };
    setLoading(true);
    setPage(null);
    timer = setTimeout(load, 180);
    return () => {
      current = false;
      request.current++;
      clearTimeout(timer);
    };
  }, [search, status, offset, revision]);
  async function mark(r: InviteRequest, reviewed: boolean) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await call("review", { id: r.id, reviewed });
      if (alive.current) {
        setDetail(null);
        setNotice(
          reviewed
            ? "Marked as reviewed. No invitation sent."
            : "Moved back to new requests.",
        );
        setRevision((x) => x + 1);
      }
    } catch (e) {
      if (alive.current)
        setError(e instanceof Error ? e.message : "Could not save. Try again.");
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function assign(
    r: InviteRequest,
    wave: string,
    phoneOverride?: string,
  ) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await call("assign", {
        id: r.id,
        wave,
        fromWave: r.wave_id,
        phone: phoneOverride,
      });
      if (alive.current) {
        setAssignment(null);
        setNotice(
          `${r.first_name} added to ${result.wave_name}. No invitation sent.`,
        );
        setRevision((x) => x + 1);
        onChanged();
      }
    } catch (e) {
      if (alive.current) {
        setError(
          e instanceof Error
            ? e.message
            : "Could not move this request. Try again.",
        );
      }
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  function move(r: InviteRequest, wave: string) {
    if (!normalizePhone(r.assigned_phone || r.phone)) {
      setPhone(r.phone);
      setAssignment({ person: r, wave });
    } else void assign(r, wave);
  }
  return (
    <div className="requested-invites">
      <section className="metrics" aria-label="Invitation request totals">
        <div>
          <span>Requests received</span>
          <strong>{page?.summary.total ?? "—"}</strong>
          <small>From the website and app</small>
        </div>
        <div>
          <span>New to review</span>
          <strong>{page?.summary.new ?? "—"}</strong>
          <small>Your next circle starts here</small>
        </div>
        <div>
          <span>Phone provided</span>
          <strong>{page?.summary.withPhone ?? "—"}</strong>
          <small>Optional on the website form</small>
        </div>
      </section>
      {error && (
        <div className="error" role="alert">
          {error}
          <button className="quiet" onClick={() => setRevision((x) => x + 1)}>
            Retry
          </button>
        </div>
      )}
      {notice && (
        <div className="notice" role="status">
          {notice}
        </div>
      )}
      <section className="panel guest-panel">
        <div className="section-title">
          <div>
            <h2>Requested invites</h2>
            <p>Review interest before choosing a wave.</p>
          </div>
          <button
            className="secondary"
            disabled={loading}
            onClick={() => setRevision((x) => x + 1)}
          >
            Refresh
          </button>
        </div>
        <div className="request-connection">
          <span className="badge">
            {!page
              ? "Checking connection"
              : page.connection.enabledAt
                ? "Netlify connected"
                : "Connection pending"}
          </span>
          <span>
            {page?.connection.enabledAt
              ? "New submissions arrive automatically. This view refreshes every 15 seconds."
              : "Existing requests are saved here. Automatic delivery is being connected."}
          </span>
          <small>
            Updated {date(updated)}
            {page?.connection.lastDeliveryAt
              ? ` · Last delivery ${date(page.connection.lastDeliveryAt)}`
              : ""}
          </small>
        </div>
        <div className="filters">
          <input
            aria-label="Search requested invites"
            placeholder="Search names, email, phone…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setOffset(0);
            }}
          />
          <select
            aria-label="Filter requested invites"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setOffset(0);
            }}
          >
            <option value="all">All requests</option>
            <option value="new">New to review</option>
            <option value="reviewed">Reviewed</option>
          </select>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>PERSON</th>
                <th>WAVE</th>
                <th>NEIGHBORHOOD</th>
                <th>REFERRED BY</th>
                <th>RECEIVED</th>
                <th>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {page?.rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <button
                      className="person"
                      onClick={() => setDetail(r)}
                      aria-label={`View request from ${r.first_name} ${r.last_name}`}
                    >
                      <span className="avatar">
                        {r.first_name[0]}
                        {r.last_name[0]}
                      </span>
                      <span>
                        <b>
                          {r.first_name} {r.last_name}
                        </b>
                        <small>{r.email || "Verified phone · Spotted app"}</small>
                        <small>
                          {r.assigned_phone || r.phone || "No phone provided"}
                        </small>
                      </span>
                    </button>
                  </td>
                  <td>
                    <WaveAction
                      person={r}
                      waves={page.waves}
                      busy={busy}
                      move={move}
                      remove={setRemoval}
                    />
                  </td>
                  <td>{r.neighborhood || "—"}</td>
                  <td>{r.referred_by || "—"}</td>
                  <td>
                    <time dateTime={r.submitted_at}>
                      {date(r.submitted_at)}
                    </time>
                  </td>
                  <td>
                    <span className={"badge " + (r.reviewed_at ? "" : "open")}>
                      {r.reviewed_at ? "Reviewed" : "New"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {loading && (
          <p className="empty" role="status">
            Loading requests…
          </p>
        )}
        {page && !page.rows.length && (
          <p className="empty">
            {search || status !== "all"
              ? "No matching requests. Try another search or filter."
              : "Requests from the website and Spotted app will appear here."}
          </p>
        )}
        <div className="pagination">
          <button
            className="secondary"
            disabled={offset === 0 || loading}
            onClick={() => setOffset((x) => Math.max(0, x - 50))}
          >
            Previous
          </button>
          <span>
            {page?.total
              ? `${offset + 1}–${Math.min(offset + 50, page.total)} of ${page.total}`
              : "0 requests"}
          </span>
          <button
            className="secondary"
            disabled={!page || offset + 50 >= page.total || loading}
            onClick={() => setOffset((x) => x + 50)}
          >
            Next
          </button>
        </div>
      </section>
      {detail && (
        <dialog
          ref={dialog}
          className="pool-dialog"
          aria-label="Invite request details"
          onCancel={(e) => {
            if (busy) e.preventDefault();
          }}
          onClose={() => setDetail(null)}
        >
          <section className="panel pool-detail">
            <div className="section-title">
              <div>
                <p className="eyebrow">WEBSITE REQUEST</p>
                <h2>
                  {detail.first_name} {detail.last_name}
                </h2>
              </div>
              <button
                className="quiet"
                disabled={busy}
                onClick={() => dialog.current?.close()}
              >
                Close details
              </button>
            </div>
            <dl className="request-details">
              <dt>Email</dt>
              <dd>{detail.email || "Not requested in the app"}</dd>
              <dt>Source</dt><dd>{detail.source_kind === "app" ? "Spotted app · verified phone" : "Website"}</dd>
              <dt>Invitation text requested</dt><dd>{detail.invitation_texts_at ? date(detail.invitation_texts_at) : "Not recorded"}</dd>
              <dt>Phone</dt>
              <dd>{detail.assigned_phone || detail.phone || "Not provided"}</dd>
              <dt>Usually goes out in</dt>
              <dd>{detail.neighborhood || "Not provided"}</dd>
              <dt>Referred by</dt>
              <dd>{detail.referred_by || "Not provided"}</dd>
              <dt>Requested</dt>
              <dd>{date(detail.submitted_at)}</dd>
              <dt>Status</dt>
              <dd>{detail.reviewed_at ? "Reviewed" : "New to review"}</dd>
            </dl>
            <p>
              Adding someone to a wave reserves their place. Open the wave and
              review outreach when you are ready to invite them.
            </p>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <button
              disabled={busy}
              onClick={() => void mark(detail, !detail.reviewed_at)}
            >
              {busy
                ? "Saving…"
                : detail.reviewed_at
                  ? "Mark as new"
                  : "Mark as reviewed"}
            </button>
          </section>
        </dialog>
      )}
      {removal && <RemoveFromWave waveName={removal.wave_name || "this wave"} count={1}
        personName={`${removal.first_name} ${removal.last_name}`} onClose={() => setRemoval(null)}
        onRemove={async () => {
          if (preview) {
            previewRows.current = previewRows.current.map(r => r.guest_id === removal.guest_id ? { ...r, wave_id: null, wave_name: null } : r);
            previewWaves.current = previewWaves.current.map(w => ({ ...w, selected: previewRows.current.filter(r => r.wave_id === w.id).length }));
          } else {
            const { error } = await (supabase as any).rpc("launch_admin", {
              p_action: "remove_from_wave", p_data: { wave: removal.wave_id, guests: [removal.guest_id] },
            });
            if (error) throw Error(error.message);
          }
          if (alive.current) {
            setNotice(`${removal.first_name} returned to Next up. Their request stays saved here.`);
            setRevision(x => x + 1);
            onChanged();
          }
        }} />}
      {assignment && (
        <dialog
          ref={assignDialog}
          className="pool-dialog"
          aria-label="Add phone number"
          onCancel={(e) => {
            if (busy) e.preventDefault();
          }}
          onClose={() => setAssignment(null)}
        >
          <form
            className="panel pool-detail"
            onSubmit={(e) => {
              e.preventDefault();
              void assign(assignment.person, assignment.wave, phone);
            }}
          >
            <h2>Add a phone number</h2>
            <p>
              {assignment.person.first_name} needs a valid number to join a
              wave. Their original website request stays saved.
            </p>
            <label>
              Phone number
              <input
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 212 555 0100"
                required
              />
            </label>
            <small>Include the country code for numbers outside the US.</small>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="wave-actions">
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => setAssignment(null)}
              >
                Cancel
              </button>
              <button disabled={busy || !normalizePhone(phone)}>
                {busy ? "Saving…" : "Save & add to wave"}
              </button>
            </div>
          </form>
        </dialog>
      )}
    </div>
  );
}
