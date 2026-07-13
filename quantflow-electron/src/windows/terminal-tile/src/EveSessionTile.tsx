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
  const eventCount = useRef(0);

  useEffect(() => {
    let disposed = false;
    let refreshing = false;
    latestRevision.current = -1;
    eventCount.current = 0;
    const refresh = async () => {
      if (refreshing) return;
      refreshing = true;
      try {
        const result = await window.api.agentosEveSnapshot(tileId, eventCount.current);
        if (disposed || !result.ok || !result.snapshot) return;
        if (result.snapshot.revision !== latestRevision.current) {
          latestRevision.current = result.snapshot.revision;
          setSnapshot((previous) => {
            const appendEvents = previous?.eveSessionId === result.snapshot?.eveSessionId
              && result.snapshot?.eventStartIndex === eventCount.current;
            eventCount.current = result.snapshot?.eventCount ?? 0;
            return appendEvents && previous
              ? { ...result.snapshot!, events: [...previous.events, ...result.snapshot!.events] }
              : result.snapshot!;
          });
        }
      } catch {
        // The next serialized refresh can recover when the local host restarts.
      } finally {
        refreshing = false;
      }
    };
    void refresh();
    const refreshTimer = window.setInterval(() => { void refresh(); }, 500);
    return () => {
      disposed = true;
      window.clearInterval(refreshTimer);
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
