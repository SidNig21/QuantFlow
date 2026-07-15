import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { defaultMessageReducer, useEveAgent, type EveMessageData } from "eve/react";

type Snapshot = {
  tileId: string;
  baseUrl: string;
  eveSessionId: string | null;
  initialSession: { sessionId: string; streamIndex: number } | null;
  eventStartIndex: number;
  eventCount: number;
  events: unknown[];
  revision: number;
  phase: "idle" | "working" | "error";
  error: string | null;
};

// Snapshot poll cadence. A streaming turn needs a tight loop; an idle or
// hidden tile does not — dozens of idle Eve tiles each refetching the full
// (and growing) snapshot at the active rate is pure overhead, so back off.
const ACTIVE_POLL_MS = 500;
const IDLE_POLL_MS = 2_000;
const HIDDEN_POLL_MS = 10_000;

function projectEvents(events: unknown[]): EveMessageData {
  const reducer = defaultMessageReducer();
  return events.reduce(
    (data, event) => reducer.reduce(data, event as never),
    reducer.initial(),
  );
}

function partText(part: { type: string; text?: string; toolName?: string; state?: string }): string {
  if (part.type === "text" || part.type === "reasoning") return part.text ?? "";
  if (part.type === "dynamic-tool") return `[tool ${part.toolName ?? "call"}: ${part.state ?? "working"}]`;
  return "";
}

function EveSessionReactContract({ snapshot }: { snapshot: Snapshot }) {
  useEveAgent({
    host: snapshot.baseUrl,
    initialSession: snapshot.initialSession ?? undefined,
    initialEvents: [],
    optimistic: false,
  });
  return null;
}

/**
 * A view-only projection of the durable Eve session. `useEveAgent` remains
 * seeded with the Eve session contract, but it is deliberately never asked to
 * send: all writes must go renderer -> AgentOS host queue -> ACP adapter.
 * Broker snapshots are reduced directly so streaming revisions do not remount
 * the store mid-turn.
 */
export function EveSessionTile({ tileId }: { tileId: string }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [draft, setDraft] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const latestRevision = useRef(-1);
  const latestPhase = useRef<Snapshot["phase"]>("idle");
  const wakeRef = useRef<() => void>(() => {});

  useEffect(() => {
    let disposed = false;
    let refreshing = false;
    let timer: number | undefined;
    latestRevision.current = -1;
    latestPhase.current = "idle";
    // Always fetch the full snapshot (startIndex 0) and replace state.
    // An incremental append protocol lived here briefly and lost events to a
    // bookkeeping race during cold registration (blank tile B, 2026-07-13);
    // full replacement is correct by construction at session-scale volumes.
    // Reintroduce chunking only with T-PERF, as a stateless protocol.
    const refresh = async () => {
      if (refreshing) return;
      refreshing = true;
      try {
        const result = await window.api.agentosEveSnapshot(tileId);
        if (disposed || !result.ok || !result.snapshot) return;
        latestPhase.current = result.snapshot.phase;
        if (result.snapshot.revision !== latestRevision.current) {
          latestRevision.current = result.snapshot.revision;
          setSnapshot(result.snapshot);
        }
      } catch {
        // The next serialized refresh can recover when the local host restarts.
      } finally {
        refreshing = false;
      }
    };

    const nextDelayMs = () => {
      if (document.hidden) return HIDDEN_POLL_MS;
      return latestPhase.current === "working" ? ACTIVE_POLL_MS : IDLE_POLL_MS;
    };
    const scheduleNext = () => {
      if (disposed) return;
      timer = window.setTimeout(() => { void tick(); }, nextDelayMs());
    };
    const tick = async () => {
      await refresh();
      scheduleNext();
    };
    // Let a fresh submit or a return-to-visible pull the next poll forward
    // instead of waiting out the idle backoff.
    const wake = () => {
      if (disposed) return;
      if (timer) window.clearTimeout(timer);
      void tick();
    };
    wakeRef.current = wake;
    const onVisible = () => { if (!document.hidden) wake(); };
    document.addEventListener("visibilitychange", onVisible);

    void refresh();
    scheduleNext();
    return () => {
      disposed = true;
      wakeRef.current = () => {};
      if (timer) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [tileId]);

  const projection = useMemo(
    () => projectEvents(snapshot?.events ?? []),
    [snapshot?.events],
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setSubmitError(null);
    try {
      const result = await window.api.agentosEvePrompt(tileId, text);
      if (!result.ok) throw new Error(result.error ?? "Prompt failed");
      setDraft("");
      // The turn is now starting; poll at the active rate immediately rather
      // than waiting out the idle backoff for the reply to appear.
      latestPhase.current = "working";
      wakeRef.current();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : String(error));
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="eve-session-tile" aria-label="Eve session tile">
      {snapshot ? (
        <EveSessionReactContract
          key={snapshot.eveSessionId ?? "unregistered"}
          snapshot={snapshot}
        />
      ) : null}
      <header>
        <span className="eve-session-title">Eve</span>
        <span className={`eve-session-phase phase-${snapshot?.phase ?? "idle"}`}>
          {snapshot?.phase === "working" ? "working" : snapshot?.phase === "error" ? "error" : "ready"}
        </span>
      </header>
      <section className="eve-session-transcript" aria-live="polite">
        {projection.messages.length === 0 ? (
          <p className="eve-session-empty">Ready for a human or cabled peer turn.</p>
        ) : projection.messages.map((message) => (
          <article className={`eve-message eve-message-${message.role}`} key={message.id}>
            <span className="eve-message-role">{message.role === "user" ? "received" : "Eve"}</span>
            {message.parts.map((part, index) => {
              const text = partText(part);
              return text ? <p key={`${message.id}-${index}`}>{text}</p> : null;
            })}
          </article>
        ))}
      </section>
      {snapshot?.error || submitError ? (
        <p className="eve-session-error">{snapshot?.error ?? submitError}</p>
      ) : null}
      <form className="eve-session-input" onSubmit={submit}>
        <input
          aria-label="Message Eve"
          disabled={sending}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Message Eve"
          value={draft}
        />
        <button disabled={sending || !draft.trim()} type="submit">Send</button>
      </form>
    </main>
  );
}
