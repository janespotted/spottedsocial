import { Monitoring } from './monitoring';
import { PlanningPool } from './planning-pool';
import { createRoot } from "react-dom/client";
import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../integrations/supabase/client";
import {
  parseGuestImport,
  invitationText,
  csvCell,
  stateLabels,
  type Snapshot,
  type Guest,
  type GuestPage,
} from "./types";
import "./style.css";
const preview =
  import.meta.env.DEV &&
  import.meta.env.VITE_LAUNCH_PREVIEW === "true" &&
  ["localhost", "127.0.0.1"].includes(location.hostname);
const testWorkspace = String(import.meta.env.VITE_SUPABASE_URL).includes(
  "mdwmkpefuvcozoqprvvo",
);
const api = async <T,>(
  action: string,
  data: Record<string, unknown> = {},
): Promise<T> => {
  const { data: result, error } = await (supabase as any).rpc("launch_admin", {
    p_action: action,
    p_data: data,
  });
  if (error) throw Error(error.message);
  return result;
};
const date = (v: string | null) =>
  v
    ? new Date(v).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "—";
function App() {
  const [session, setSession] = useState<Session | null>(null),
    [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [page, setPage] = useState<GuestPage>({ rows: [], total: 0 });
  const [email, setEmail] = useState(""),
    [code, setCode] = useState(""),
    [codeSent, setCodeSent] = useState(false),
    [authReady, setAuthReady] = useState(false);
  const [wave, setWave] = useState(location.hash === "#monitoring" ? "monitoring" : location.hash === "#planning-pool" ? "pool" : "all"),
    [status, setStatus] = useState("all"),
    [search, setSearch] = useState(""),
    [offset, setOffset] = useState(0),
    [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [modal, setModal] = useState<
      "wave" | "import" | "settings" | "review" | null
    >(null),
    [detail, setDetail] = useState<Guest | null>(null);
  const [name, setName] = useState(""),
    [capacity, setCapacity] = useState("100"),
    [importText, setImportText] = useState(""),
    [installUrl, setInstallUrl] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [consent, setConsent] = useState("");
  const dialogRef = useRef<HTMLElement | null>(null);
  const identity = useRef<string | null>(null),
    generation = useRef(0),
    snapshotRequest = useRef(0),
    guestRequest = useRef(0),
    locked = useRef(false),
    requestId = useRef(crypto.randomUUID());
  useEffect(() => {
    const hash = wave === "monitoring" ? "#monitoring" : wave === "pool" ? "#planning-pool" : "";
    history.replaceState(null, "", location.pathname + location.search + hash);
  }, [wave]);
  const activeWave = snapshot?.waves.find((w) => w.id === wave);
  const detailWave = snapshot?.waves.find((w) => w.id === detail?.wave_id);
  useEffect(() => {
    if (!modal && !detail) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.querySelector<HTMLElement>("button")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) {
        setModal(null);
        setDetail(null);
      }
      if (e.key === "Tab") {
        const items = [
          ...dialog.querySelectorAll<HTMLElement>(
            "button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href]",
          ),
        ];
        const first = items[0],
          last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    dialog.addEventListener("keydown", key);
    return () => {
      dialog.removeEventListener("keydown", key);
      document.body.style.overflow = old;
      previous?.focus();
    };
  }, [modal, detail?.id, busy]);
  useEffect(() => {
    if (preview) {
      setAuthReady(true);
      return;
    }
    let eventSeen = false;
    supabase.auth.getSession().then(({ data }) => {
      if (!eventSeen) {
        identity.current = data.session?.user.id || null;
        setSession(data.session);
      }
      setAuthReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_, s) => {
      eventSeen = true;
      const changed = identity.current !== (s?.user.id || null);
      identity.current = s?.user.id || null;
      setSession(s);
      if (changed || !s) {
        // Token refresh and duplicate sign-in events must not cancel a read
        // for the same person. Account changes invalidate every pending read.
        generation.current++;
        setSnapshot(null);
        setPage({ rows: [], total: 0 });
        setDetail(null);
        setSelected([]);
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);
  async function load() {
    const current = generation.current;
    const request = ++snapshotRequest.current;
    const result = await api<Snapshot>("snapshot");
    if (current === generation.current && request === snapshotRequest.current) {
      setSnapshot(result);
      setInstallUrl(result.settings.installUrl || "");
    }
  }
  async function loadGuests() {
    const current = generation.current;
    const request = ++guestRequest.current;
    if (preview) {
      const fixture = await import("./preview");
      const rows = fixture.guests.filter(
        (g) =>
          (wave === "all" ||
            (wave === "queue" ? !g.wave_id : g.wave_id === wave)) &&
          (status === "all" || g.state === status) &&
          (!search ||
            (g.name + " " + g.phone)
              .toLowerCase()
              .includes(search.toLowerCase())),
      );
      if (current === generation.current && request === guestRequest.current)
        setPage({ rows, total: rows.length });
      return;
    }
    const result = await api<GuestPage>("guests", {
      wave,
      status,
      search,
      offset,
    });
    if (current === generation.current && request === guestRequest.current)
      setPage(result);
  }
  useEffect(() => {
    setError("");
    setSnapshot(null);
    setDetail(null);
    setSelected([]);
    if (preview) {
      void import("./preview").then((x) => {
        setSnapshot(x.snapshot);
        setPage({ rows: x.guests, total: x.guests.length });
      });
      return;
    }
    if (session) {
      identity.current = session.user.id;
      void load().catch((e) => setError(e.message));
    }
  }, [session?.user.id]);
  useEffect(() => {
    if (!snapshot || wave === "pool" || wave === "monitoring") return;
    const t = setTimeout(
      () => void loadGuests().catch((e) => setError(e.message)),
      180,
    );
    return () => clearTimeout(t);
  }, [wave, status, search, offset, !!snapshot]);
  useEffect(() => {
    setSelected([]);
    setOffset(0);
  }, [wave, status, search]);
  async function run(work: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not finish. Try again.");
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  async function mutate(action: string, data: Record<string, unknown> = {}) {
    if (preview)
      throw Error(
        "This is a visual preview. Switch to the connected test workspace to make changes.",
      );
    const result = await api<any>(action, data);
    await load();
    await loadGuests();
    return result;
  }
  const openModal = (m: typeof modal) => {
    requestId.current = crypto.randomUUID();
    setConfirmation("");
    setModal(m);
  };
  async function sendCode() {
    await run(async () => {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          shouldCreateUser: false,
          emailRedirectTo: location.origin + "/launch-admin.html",
        },
      });
      if (error) throw error;
      setCodeSent(true);
    });
  }
  const download = () => {
    const content = [
      "Name,Phone,Status,Wave,Delivery",
      ...page.rows.map((g) =>
        [
          g.name,
          g.phone,
          stateLabels[g.state],
          snapshot?.waves.find((w) => w.id === g.wave_id)?.name || "",
          g.delivery || "",
        ]
          .map(csvCell)
          .join(","),
      ),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([content], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "spotted-current-page.csv";
    a.click();
    URL.revokeObjectURL(url);
  };
  const dismiss = () => {
    if (!busy) {
      setModal(null);
      setDetail(null);
    }
  };
  if (!authReady)
    return (
      <main className="login">
        <span className="mark">S</span>
        <p>Opening Launch Center…</p>
      </main>
    );
  if (!preview && !session)
    return (
      <main className="login">
        <span className="mark">S</span>
        <p className="eyebrow">SPOTTED / PRIVATE ACCESS</p>
        <h1>
          Your people.
          <br />
          Your pace.
        </h1>
        <p>Sign in with the email connected to your Spotted admin account.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (codeSent)
              void run(async () => {
                const { error } = await supabase.auth.verifyOtp({
                  email: email.trim(),
                  token: code.trim(),
                  type: "email",
                });
                if (error) throw error;
              });
            else void sendCode();
          }}
        >
          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={codeSent}
            />
          </label>
          {codeSent && (
            <p>
              Check your email for the sign-in link. If it includes a code, you
              can enter it below.
            </p>
          )}
          {codeSent && (
            <label>
              Email code
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoComplete="one-time-code"
                inputMode="numeric"
                required
              />
            </label>
          )}
          <button disabled={busy}>
            {busy
              ? "Checking…"
              : codeSent
                ? "Open Launch Center"
                : "Email me a sign-in link"}
          </button>
          {codeSent && (
            <button
              type="button"
              className="quiet"
              onClick={() => setCodeSent(false)}
            >
              Use another email
            </button>
          )}
        </form>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <small>Only server-approved rollout administrators can enter.</small>
      </main>
    );
  return (
    <div className="workspace">
      <aside>
        <a className="wordmark" href="/launch-admin.html">
          <span className="mark">S</span>spotted
          <span className="wordmark-dot">.</span>
        </a>
        <div className="sidebar-title">LAUNCH CENTER</div>
        <button
          className={wave === "all" ? "nav active" : "nav"}
          onClick={() => setWave("all")}
        >
          <span>Overview</span>
          <span>↗</span>
        </button>
        <button
          className={wave === "queue" ? "nav active" : "nav"}
          onClick={() => setWave("queue")}
        >
          <span>Next up</span>
          <span>{snapshot?.pending ?? "—"}</span>
        </button>
        <button className={wave === "pool" ? "nav active" : "nav"} onClick={() => { setWave("pool"); history.replaceState(null, '', '#planning-pool'); }}><span>Planning pool</span><span>↗</span></button>
        <button className={wave === "monitoring" ? "nav active" : "nav"} onClick={() => { setWave("monitoring"); history.replaceState(null, "", "#monitoring"); }}><span>Monitoring</span><span>↗</span></button>
        <div className="sidebar-title">YOUR WAVES</div>
        {snapshot?.waves.map((w) => (
          <button
            key={w.id}
            className={wave === w.id ? "nav active" : "nav"}
            onClick={() => setWave(w.id)}
          >
            <span>
              <i className={"dot " + w.status} />
              {w.name}
            </span>
            <span>{w.selected}</span>
          </button>
        ))}
        <button className="nav subtle" onClick={() => openModal("wave")}>
          ＋ Create a wave
        </button>
        <div className="sidebar-bottom">
          <span className="environment">
            {preview
              ? "VISUAL PREVIEW"
              : testWorkspace
                ? "TEST WORKSPACE"
                : "LIVE WORKSPACE"}
          </span>
          <button className="nav" onClick={() => openModal("settings")}>
            Launch settings <span>↗</span>
          </button>
          {!preview && (
            <button
              className="nav subtle"
              onClick={() =>
                void run(async () => {
                  await supabase.auth.signOut();
                })
              }
            >
              Sign out
            </button>
          )}
        </div>
      </aside>
      <main>
        <header>
          <span>{wave === "monitoring" ? "NEW YORK + LOS ANGELES" : "NEW YORK CITY"}</span>
          <span className="mode">
            <i
              className={"dot " + (snapshot?.settings.gated ? "open" : "draft")}
            />
            {snapshot?.settings.gated ? "Invite-only" : "Admission open"}
          </span>
        </header>
        {preview && (
          <div className="preview-banner">
            Design preview · fictional people and numbers · no invitations can
            be sent
          </div>
        )}
        <section className="heading">
          <div>
            <p className="eyebrow">A GOOD NIGHT STARTS WITH GOOD PEOPLE</p>
            <h1>
              {activeWave?.name ||
                (wave === "monitoring" ? "Your launch, in view." : wave === "pool" ? "Your first circle." : wave === "queue" ? "Who’s next." : "Let the right people in.")}
            </h1>
            <p>
              {wave === "monitoring" ? "Invitations, activity and technical health. Private to the founder." : wave === "pool" ? "Save everyone here. Choose your first 100 when you’re ready." : activeWave
                ? "Every place has a name. Every invitation stays accounted for."
                : wave === "queue"
                  ? "Completed nominations and your hand-picked guests, ready for a future wave."
                  : "Build your circle in waves. See exactly who’s on the list—and who’s joined."}
            </p>
          </div>
          {wave !== "pool" && wave !== "monitoring" && <button onClick={() => openModal("import")}>＋ Add people</button>}
        </section>
        {error && (
          <div role="alert" className="error">
            {error}
            <button
              className="quiet"
              onClick={() =>
                void run(async () => {
                  await load();
                  await loadGuests();
                })
              }
            >
              Retry
            </button>
          </div>
        )}
        {notice && (
          <div role="status" className="notice">
            {notice}
          </div>
        )}
        {!snapshot ? (
          <section className="panel">
            <h2>
              {error ? "Admin access unavailable" : "Loading your launch…"}
            </h2>
            <p>
              {error
                ? "Use the account with your Spotted rollout-admin access."
                : "Your private guest lists are being loaded."}
            </p>
          </section>
        ) : wave === "monitoring" ? <Monitoring key={session?.user.id || "preview"} preview={preview} /> : wave === "pool" ? <PlanningPool key={session?.user.id || "preview"} preview={preview} onQueue={() => setWave("queue")} /> : (
          <>
            <section className="panel" aria-label="Launch readiness">
              <h2>Before you open a wave</h2>
              <ul>
                <li>{snapshot.settings.installUrl ? '✓ Install link saved — verify testers can install' : '○ Add a working TestFlight or App Store install link'}</li>
                <li>{snapshot.waves.some(w => w.selected > 0) ? '✓ People assigned to a wave' : '○ Choose people from the planning pool and collect verified phone numbers'}</li>
                <li>{snapshot.settings.gated && snapshot.settings.requirePhone ? '✓ Phone-based invitation access is on' : '○ Admission is open — enable phone-based invitations when ready'}</li>
                <li>{snapshot.settings.smsEnabled ? '✓ SMS enabled — verify delivery before sending' : '○ SMS is off — use reviewed manual invitations or configure a sender'}</li>
              </ul>
              <button onClick={() => openModal("settings")}>Review launch settings</button>
            </section>
            <section className="metrics">
              <div>
                <span>Members inside</span>
                <strong>{snapshot.summary.members}</strong>
                <small>
                  {snapshot.summary.legacy} existing members preserved
                </small>
              </div>
              <div>
                <span>Invited · not joined</span>
                <strong>
                  {snapshot.waves.reduce((n, w) => n + w.awaiting, 0)}
                </strong>
                <small>Invitation sent, setup not complete</small>
              </div>
              <div>
                <span>Waiting for a wave</span>
                <strong>{snapshot.pending}</strong>
                <small>No access or invitation sent yet</small>
              </div>
              <div>
                <span>Waves open</span>
                <strong>
                  {snapshot.waves.filter((w) => w.status === "open").length}
                </strong>
                <small>You decide when the next opens</small>
              </div>
            </section>
            <section className="wave-grid">
              {(activeWave ? [activeWave] : snapshot.waves).map((w) => (
                <article key={w.id} className="wave-card">
                  <div className="card-top">
                    <span className={"badge " + w.status}>
                      {w.status === "draft"
                        ? "Preparing"
                        : w.status === "paused"
                          ? "Paused"
                          : "Open"}
                    </span>
                    <button className="quiet" onClick={() => setWave(w.id)}>
                      View guest list ↗
                    </button>
                  </div>
                  <h2>{w.name}</h2>
                  <div className="capacity">
                    <strong>{w.selected}</strong>
                    <span>/ {w.capacity} places</span>
                  </div>
                  <div className="progress">
                    <span
                      style={{
                        width: `${Math.min(100, (100 * w.joined) / w.capacity)}%`,
                      }}
                    />
                    <i
                      style={{
                        width: `${Math.min(100, (100 * Math.max(0, w.selected - w.joined)) / w.capacity)}%`,
                      }}
                    />
                  </div>
                  <div className="wave-numbers">
                    <span>
                      <b>{w.invited}</b> invited
                    </span>
                    <span>
                      <b>{w.started}</b> started
                    </span>
                    <span>
                      <b>{w.joined}</b> joined
                    </span>
                  </div>
                  {wave === w.id && (
                    <div className="wave-actions">
                      <button onClick={() => openModal("review")}>
                        {w.status === "draft"
                          ? "Review & open wave"
                          : w.status === "paused"
                            ? "Review & resume"
                            : "Review this wave"}
                      </button>
                      {w.status === "open" && (
                        <button
                          className="secondary"
                          disabled={busy}
                          onClick={() => {
                            if (
                              confirm(
                                "Pause unclaimed invitations in this wave? People already joining keep access.",
                              )
                            )
                              void run(async () => {
                                await mutate("pause_wave", { id: w.id });
                              });
                          }}
                        >
                          Pause invitations
                        </button>
                      )}
                    </div>
                  )}
                </article>
              ))}
            </section>
            <section className="panel guest-panel">
              <div className="section-title">
                <div>
                  <h2>
                    {wave === "queue"
                      ? "Waiting for their moment"
                      : "The guest list"}
                  </h2>
                  <p>
                    {page.total} people · open a person to see invitation
                    history
                  </p>
                </div>
                <button className="secondary" onClick={download}>
                  Export this page
                </button>
              </div>
              <div className="filters">
                <input
                  aria-label="Search people"
                  placeholder="Search name, phone or nominator…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <select
                  aria-label="Filter status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="all">All statuses</option>
                  {Object.entries(stateLabels).map(([v, label]) => (
                    <option key={v} value={v}>
                      {label}
                    </option>
                  ))}
                </select>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await load();
                      await loadGuests();
                    })
                  }
                >
                  Refresh
                </button>
              </div>
              {selected.length > 0 && (
                <div className="selection">
                  <b>{selected.length} selected</b>
                  <select
                    aria-label="Assign selected people to wave"
                    defaultValue=""
                    onChange={(e) => {
                      const id = e.target.value;
                      if (id)
                        void run(async () => {
                          await mutate("assign", { id, guests: selected });
                          setSelected([]);
                          setNotice("Guest list updated. No invitations sent.");
                        });
                    }}
                  >
                    <option value="" disabled>
                      Add to draft wave…
                    </option>
                    {snapshot.waves
                      .filter((w) => w.status === "draft")
                      .map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name} · {w.capacity - w.selected} places left
                        </option>
                      ))}
                  </select>
                  {activeWave?.status === "draft" && (
                    <button
                      className="quiet"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await mutate("remove", { guests: selected });
                          setSelected([]);
                        })
                      }
                    >
                      Return to queue
                    </button>
                  )}
                </div>
              )}
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>
                        <input
                          type="checkbox"
                          aria-label="Select this page"
                          checked={
                            page.rows.length > 0 &&
                            page.rows.every((g) => selected.includes(g.id))
                          }
                          onChange={(e) =>
                            setSelected(
                              e.target.checked
                                ? page.rows.map((g) => g.id)
                                : [],
                            )
                          }
                        />
                      </th>
                      <th>PERSON</th>
                      <th>HOW THEY FOUND US</th>
                      <th>STATUS</th>
                      <th>INVITATION</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {page.rows.map((g) => (
                      <tr key={g.id}>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`Select ${g.name || g.phone}`}
                            checked={selected.includes(g.id)}
                            onChange={(e) =>
                              setSelected(
                                e.target.checked
                                  ? [...selected, g.id]
                                  : selected.filter((id) => id !== g.id),
                              )
                            }
                          />
                        </td>
                        <td>
                          <button
                            className="person"
                            onClick={() => {
                              setDetail(g);
                              setConsent("");
                            }}
                          >
                            <span className="avatar">
                              {(g.name || "?")
                                .split(" ")
                                .map((n) => n[0])
                                .slice(0, 2)
                                .join("")}
                            </span>
                            <span>
                              <b>{g.name || "Name not added"}</b>
                              <small>{g.phone}</small>
                            </span>
                          </button>
                        </td>
                        <td>
                          {g.source === "seed"
                            ? "Hand-picked"
                            : g.nominator_name || "Member nomination"}
                        </td>
                        <td>
                          <span className={"badge " + g.state}>
                            {stateLabels[g.state]}
                          </span>
                        </td>
                        <td>
                          <span>
                            {g.delivery
                              ? g.delivery.replace("_", " ")
                              : g.invited_via === "manual"
                                ? "Personally shared"
                                : "Not sent"}
                          </span>
                          <small>{date(g.invited_at)}</small>
                        </td>
                        <td>
                          <button
                            aria-label={`Open ${g.name || g.phone}`}
                            className="quiet"
                            onClick={() => setDetail(g)}
                          >
                            ↗
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!page.rows.length && (
                <div className="empty">
                  <h3>
                    {search ? "No matches yet" : "A little anticipation."}
                  </h3>
                  <p>
                    {search
                      ? "Try another name or number."
                      : "Add your first people or wait for completed nominations."}
                  </p>
                </div>
              )}
              <div className="pagination">
                <span>
                  Showing {page.rows.length ? offset + 1 : 0}–
                  {offset + page.rows.length} of {page.total}
                </span>
                <button
                  className="quiet"
                  disabled={!offset || busy}
                  onClick={() => setOffset(Math.max(0, offset - 100))}
                >
                  Previous
                </button>
                <button
                  className="quiet"
                  disabled={offset + 100 >= page.total || busy}
                  onClick={() => setOffset(offset + 100)}
                >
                  Next
                </button>
              </div>
            </section>
            <section className="footnote">
              <b>Selected → Access open → Invited → Started → Joined</b>
              <span>
                Verified phone numbers unlock invitations. Apple sign-in follows
                the same rule.
              </span>
            </section>
          </>
        )}
      </main>
      {(modal || detail) && (
        <div className="overlay" onClick={dismiss}>
          <section
            ref={dialogRef}
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-label={detail ? "Guest details" : modal || "Launch controls"}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="close quiet"
              aria-label="Close dialog"
              onClick={dismiss}
            >
              ×
            </button>
            {detail ? (
              <>
                <p className="eyebrow">GUEST DETAILS</p>
                <h2>{detail.name || detail.phone}</h2>
                <p>{detail.phone}</p>
                <span className={"badge " + detail.state}>
                  {stateLabels[detail.state]}
                </span>
                <dl>
                  <dt>Wave</dt>
                  <dd>
                    {detailWave
                      ? `${detailWave.name} · ${detailWave.status}`
                      : "Not selected yet"}
                  </dd>
                  <dt>Nominated by</dt>
                  <dd>{detail.nominator_name || "Hand-picked by you"}</dd>
                  <dt>Invitation sent</dt>
                  <dd>{date(detail.invited_at)}</dd>
                  <dt>Phone verified / claimed</dt>
                  <dd>{date(detail.claimed_at)}</dd>
                  <dt>Onboarding complete</dt>
                  <dd>{date(detail.joined_at)}</dd>
                  <dt>SMS delivery</dt>
                  <dd>
                    {detail.delivery || "Not sent"}
                    {detail.error_code && ` · ${detail.error_code}`}
                  </dd>
                  <dt>SMS permission</dt>
                  <dd>
                    {detail.suppressed_at
                      ? "Opted out"
                      : detail.consent_at
                        ? "Recipient consent recorded"
                        : "Not recorded"}
                  </dd>
                </dl>
                {detailWave?.status === "open" &&
                  ["ready", "invited"].includes(detail.state) && (
                    <>
                      <h3>Send their invitation</h3>
                      <p>
                        Personal sharing works without an automated SMS sender.
                        Copying a message does not mark it as sent.
                      </p>
                      <button
                        disabled={!snapshot?.settings.installUrl}
                        onClick={() =>
                          void run(async () => {
                            await navigator.clipboard.writeText(
                              invitationText(snapshot!.settings.installUrl!),
                            );
                            setNotice(
                              "Invitation copied. Mark it sent after you actually share it.",
                            );
                          })
                        }
                      >
                        Copy invitation
                      </button>
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await mutate("manual_sent", { id: detail.id });
                            setDetail(null);
                            setNotice("Personal invitation recorded.");
                          })
                        }
                      >
                        I’ve personally sent this invitation
                      </button>
                      <h3>Automated SMS</h3>
                      {!detail.consent_at && (
                        <>
                          <p>
                            Record the recipient’s own request for a Spotted
                            invitation text. A friend’s nomination isn’t
                            permission.
                          </p>
                          <label>
                            How and when they opted in
                            <textarea
                              value={consent}
                              onChange={(e) => setConsent(e.target.value)}
                              placeholder="Requested a launch text via our signup form today…"
                            />
                          </label>
                          <button
                            className="secondary"
                            disabled={
                              busy ||
                              consent.trim().length < 10 ||
                              !!detail.suppressed_at
                            }
                            onClick={() =>
                              void run(async () => {
                                await mutate("consent", {
                                  id: detail.id,
                                  at: new Date(Date.now() - 1000).toISOString(),
                                  note: consent,
                                });
                                setDetail(null);
                              })
                            }
                          >
                            Record recipient permission
                          </button>
                        </>
                      )}
                      <button
                        disabled={
                          busy ||
                          !detail.consent_at ||
                          !snapshot?.settings.smsEnabled ||
                          !!detail.suppressed_at
                        }
                        onClick={() => {
                          if (
                            confirm(
                              `Queue one Spotted invitation text to ${detail.phone}?`,
                            )
                          )
                            void run(async () => {
                              await mutate("queue_sms", { id: detail.id });
                              const { error } = await supabase.functions.invoke(
                                "launch-send-invitations",
                                { body: {} },
                              );
                              if (error)
                                throw Error(
                                  "Invitation queued; sender did not confirm. Refresh to check before sending again.",
                                );
                              await loadGuests();
                              setDetail(null);
                              setNotice(
                                "Sender run finished. Check delivery status for the result.",
                              );
                            });
                        }}
                      >
                        Send one invitation SMS
                      </button>
                      {!snapshot?.settings.smsEnabled && (
                        <small>
                          Automated sender is not enabled. Personal sharing is
                          available once the app link is set.
                        </small>
                      )}
                    </>
                  )}
                {["ready", "invited"].includes(detail.state) && (
                  <button
                    className="danger quiet"
                    disabled={busy}
                    onClick={() => {
                      if (
                        confirm(
                          "Revoke this unused invitation? It will remain in the wave history.",
                        )
                      )
                        void run(async () => {
                          await mutate("revoke", { id: detail.id });
                          setDetail(null);
                        });
                    }}
                  >
                    Revoke unused invitation
                  </button>
                )}
              </>
            ) : modal === "wave" ? (
              <>
                <p className="eyebrow">YOUR NEXT CHAPTER</p>
                <h2>Create a wave</h2>
                <p>Choose the people first. Open access when you’re ready.</p>
                <label>
                  Wave name
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="The first 100"
                    maxLength={60}
                  />
                </label>
                <label>
                  Maximum people
                  <input
                    type="number"
                    min="1"
                    max="500"
                    value={capacity}
                    onChange={(e) => setCapacity(e.target.value)}
                  />
                </label>
                <button
                  disabled={
                    busy || !name.trim() || +capacity < 1 || +capacity > 500
                  }
                  onClick={() =>
                    void run(async () => {
                      await mutate("create_wave", {
                        id: requestId.current,
                        name: name.trim(),
                        capacity: +capacity,
                      });
                      setWave(requestId.current);
                      setModal(null);
                      setName("");
                    })
                  }
                >
                  Create draft wave
                </button>
              </>
            ) : modal === "import" ? (
              <>
                <p className="eyebrow">THE FIRST NAMES ON THE LIST</p>
                <h2>Add your people</h2>
                <p>
                  Paste one person per line: phone number, name. You can also
                  upload a CSV. This only adds them to your queue.
                </p>
                <label>
                  Guest list
                  <textarea
                    rows={8}
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    placeholder={
                      "+1 202 555 0101, Alex Morgan\n+1 202 555 0102, Sam Chen"
                    }
                  />
                </label>
                <label className="file">
                  Or choose a CSV
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        if (f.size > 100000) {
                          setError("Choose a CSV smaller than 100 KB.");
                          return;
                        }
                        void f.text().then(setImportText);
                      }
                    }}
                  />
                </label>
                <button
                  disabled={busy || !importText.trim()}
                  onClick={() =>
                    void run(async () => {
                      const rows = parseGuestImport(importText);
                      const r = await mutate("import", { rows });
                      setNotice(
                        `${r.added} added · ${r.duplicates} duplicates skipped · ${r.invalid} invalid rows`,
                      );
                      setImportText("");
                      setWave("queue");
                      setModal(null);
                    })
                  }
                >
                  Review & add to queue
                </button>
              </>
            ) : modal === "settings" ? (
              <>
                <p className="eyebrow">YOU CONTROL THE DOOR</p>
                <h2>Launch settings</h2>
                <label>
                  App installation link
                  <input
                    value={installUrl}
                    onChange={(e) => setInstallUrl(e.target.value)}
                    placeholder="External TestFlight or App Store link"
                  />
                </label>
                <p>
                  Use a link guests can actually install from. Internal
                  TestFlight build links won’t work.
                </p>
                <button
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await mutate("settings", { installUrl });
                      setNotice("Installation link saved.");
                      setModal(null);
                    })
                  }
                >
                  Save installation link
                </button>
                <hr />
                <h3>
                  {snapshot?.settings.gated
                    ? "Invite-only is active"
                    : "Enable invite-only admission"}
                </h3>
                <p>
                  Existing members keep access. New people must verify an
                  invited phone number, finish their profile, and nominate two
                  people.
                </p>
                {!snapshot?.settings.gated && (
                  <>
                    <label>
                      Type REQUIRE INVITATIONS to confirm
                      <input
                        value={confirmation}
                        onChange={(e) => setConfirmation(e.target.value)}
                      />
                    </label>
                    <button
                      disabled={busy || confirmation !== "REQUIRE INVITATIONS"}
                      onClick={() =>
                        void run(async () => {
                          await mutate("settings", {
                            gated: true,
                            confirmation,
                          });
                          setModal(null);
                          setNotice(
                            "Invite-only admission is active. Open a reviewed wave to admit its guests.",
                          );
                        })
                      }
                    >
                      Require invitations for new members
                    </button>
                  </>
                )}
                <small>
                  Automated SMS:{" "}
                  {snapshot?.settings.smsEnabled ? "enabled" : "not enabled"}.
                  Sender credentials stay on the server.
                </small>
              </>
            ) : modal === "review" ? (
              <>
                <p className="eyebrow">ONE LAST LOOK</p>
                <h2>{activeWave?.name}</h2>
                <p>
                  <b>{activeWave?.selected} named people</b> out of a maximum{" "}
                  {activeWave?.capacity}. Opening this wave lets only their
                  verified phone numbers claim access.
                </p>
                <p>
                  Existing members and other waves are unchanged. Messages are
                  sent separately, so you can choose personal sharing or
                  eligible SMS.
                </p>
                <button
                  disabled={
                    busy ||
                    !activeWave?.selected ||
                    !snapshot?.settings.gated ||
                    !snapshot.settings.installUrl
                  }
                  onClick={() =>
                    void run(async () => {
                      await mutate("open_wave", { id: wave });
                      setModal(null);
                      setNotice(
                        "Wave opened. Review each invitation before sending.",
                      );
                    })
                  }
                >
                  {activeWave?.status === "open"
                    ? "Keep wave open"
                    : "Open access for this guest list"}
                </button>
                {!snapshot?.settings.installUrl && (
                  <p className="error">
                    Set an external TestFlight or App Store link in Launch
                    settings first.
                  </p>
                )}
                {!snapshot?.settings.gated && (
                  <p className="error">
                    Enable invite-only admission in Launch settings before
                    opening a wave.
                  </p>
                )}
              </>
            ) : null}
            {busy && <p role="status">Saving…</p>}
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
          </section>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
