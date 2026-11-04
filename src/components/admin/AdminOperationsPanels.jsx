import { useCallback, useEffect, useRef, useState } from "react";
import { percent } from "../../lib/adminProduction";
const card = "rounded-2xl border border-white/10 bg-white/[0.025] p-4 sm:p-5";
const button =
  "min-h-11 rounded-lg border border-white/20 px-4 py-2 text-xs disabled:opacity-40";
function useRecords(onRequest, onAuthLost, action, extra = null) {
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const revision = useRef(0);
  const request = useCallback(
    async (payload) => {
      try {
        const result = await onRequest(payload);
        if (result.code === "unauthorised") onAuthLost();
        return result;
      } catch {
        return { ok: false, error: "Could not connect. Try again." };
      }
    },
    [onRequest, onAuthLost],
  );
  const load = useCallback(async () => {
    const current = ++revision.current;
    setBusy(true);
    const result = await request({
      action,
      ...(extra == null ? {} : { days: extra }),
    });
    if (current !== revision.current) return;
    if (result.ok) {
      setData(result);
      setError("");
    } else setError(result.error || "Could not load records.");
    setBusy(false);
  }, [request, action, extra]);
  useEffect(() => {
    const ref = revision;
    const timer = setTimeout(() => void load(), 0);
    return () => {
      clearTimeout(timer);
      ref.current++;
    };
  }, [load]);
  const mutate = async (payload) => {
    if (busy) return;
    setBusy(true);
    setError("");
    const result = await request(payload);
    if (!result.ok) {
      setError(result.error || "This action could not be confirmed.");
      setBusy(false);
    } else await load();
  };
  return { data, error, busy, load, mutate };
}
function Status({ error, busy }) {
  return (
    <>
      {error && (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      )}
      {busy && (
        <p role="status" className="text-xs text-zinc-500">
          Checking saved records…
        </p>
      )}
    </>
  );
}
export function InsightsPanel({ onRequest, onAuthLost }) {
  const [days, setDays] = useState(30);
  const { data, error, busy, load } = useRecords(
      onRequest,
      onAuthLost,
      "insights",
      days,
    ),
    stats = data?.insights;
  return (
    <section aria-label="Insights" className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-medium">Insights</h2>
          <p className="mt-2 max-w-2xl text-xs leading-6 text-zinc-400">
            Aggregate conversations and saved reviews created in this period.
            Route and click counts show interest, not purchases or completed
            bookings.
          </p>
        </div>
        <label className="text-xs">
          Period
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="ml-3 rounded-lg border border-white/15 bg-zinc-950 p-3"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
          </select>
        </label>
        <button className={button} disabled={busy} onClick={() => void load()}>
          Refresh
        </button>
      </div>
      <Status error={error} busy={busy} />
      {stats && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["Conversations", stats.conversations],
              ["Reached a route", percent(stats.routed, stats.conversations)],
              [
                "Clicked Playbook",
                percent(stats.playbookClicks, stats.reviews),
              ],
              ["Clicked Call", percent(stats.callClicks, stats.reviews)],
            ].map(([label, value]) => (
              <article className={card} key={label}>
                <p className="text-xs text-zinc-500">{label}</p>
                <p className="mt-3 text-3xl">{value}</p>
              </article>
            ))}
          </div>
          <p className="text-xs text-zinc-500">
            Click percentages use {stats.reviews} saved reviews as the
            denominator. A review can click both. Guest clicks are not included.
            Retention can remove old route evidence.
          </p>
          <div className="grid gap-4 lg:grid-cols-2">
            <article className={card}>
              <h3 className="font-medium">Main leaks</h3>
              <p className="mt-2 text-xs leading-6 text-zinc-500">
                Saved lead leak labels grouped by wording. Unclassified means
                the label did not match a category.
              </p>
              <ul className="mt-4 space-y-3">
                {stats.leaks.map((row) => (
                  <li key={row.label} className="flex justify-between text-sm">
                    <span>{row.label}</span>
                    <span className="text-zinc-400">{row.total}</span>
                  </li>
                ))}
              </ul>
            </article>
            <article className={card}>
              <h3 className="font-medium">Top first-message topics</h3>
              <p className="mt-2 text-xs leading-6 text-zinc-500">
                Up to five safe topic groups. Original messages and personal
                details stay out of this view.
              </p>
              <ul className="mt-4 space-y-3">
                {stats.firstTurns.map((row) => (
                  <li
                    key={row.topic}
                    className="flex justify-between gap-3 text-sm"
                  >
                    <span>{row.topic}</span>
                    <span className="text-zinc-400">{row.total}</span>
                  </li>
                ))}
              </ul>
            </article>
          </div>
          <article className={card}>
            <h3 className="font-medium">Content performance</h3>
            <p className="mt-2 text-xs leading-6 text-zinc-500">
              Consented browser profiles per section and day. A view needs two
              seconds on screen. Actions count clicks on section links or
              buttons. These are interest signals, not completed sales.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {data.content?.map((row) => (
                <div
                  key={row.content_id}
                  className="rounded-xl border border-white/10 p-4"
                >
                  <p className="text-sm capitalize">
                    {row.content_id.replaceAll("-", " ")}
                  </p>
                  <p className="mt-2 text-xs text-zinc-400">
                    {row.views || 0} views · {row.actions || 0} actions
                  </p>
                </div>
              ))}
            </div>
            {!data.content?.length && (
              <p className="mt-4 text-xs text-zinc-500">
                No consented content events in this period.
              </p>
            )}
          </article>
        </>
      )}
    </section>
  );
}
export function RateLimitsPanel({ onRequest, onAuthLost }) {
  const { data, error, busy, load, mutate } = useRecords(
    onRequest,
    onAuthLost,
    "limits",
  );
  return (
    <section aria-label="Active rate limits" className="space-y-4">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h2 className="text-lg">Active rate limits</h2>
          <p className="mt-2 max-w-2xl text-xs leading-6 text-zinc-500">
            Network and device references are hashed. Raw emails and IPs were
            never stored with these budgets. Existing windows appear after their
            next request. AI daily budgets remain in the controls above.
          </p>
        </div>
        <button className={button} disabled={busy} onClick={() => void load()}>
          Refresh limits
        </button>
      </div>
      <Status error={error} busy={busy} />
      {data?.limits?.length
        ? data.limits.map((row) => (
            <article className={card} key={row.id}>
              <p className="text-sm">
                {row.reason.replaceAll("_", " ")} · {row.identity_type}
              </p>
              <p className="mt-2 break-all font-mono text-[11px] text-zinc-500">
                {row.id}
              </p>
              <p className="mt-2 text-xs text-zinc-400">
                Reset:{" "}
                {row.reset_at
                  ? new Date(row.reset_at).toLocaleString()
                  : "Manual review required"}{" "}
                · {row.requests} attempts
              </p>
              <button
                className={`${button} mt-4`}
                disabled={busy}
                onClick={() => {
                  const reason = window.prompt(
                    "Why should this limit be cleared? Use at least 10 characters.",
                  );
                  if (reason?.trim().length >= 10)
                    void mutate({ action: "clearLimit", id: row.id, reason });
                }}
              >
                Clear after review
              </button>
            </article>
          ))
        : data && (
            <p className="text-sm text-zinc-500">
              No active limits in this view.
            </p>
          )}
    </section>
  );
}
export function DeletionApprovalsPanel({ onRequest, onAuthLost }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  const { data, error, busy, load, mutate } = useRecords(
    onRequest,
    onAuthLost,
    "approvals",
  );
  return (
    <section aria-label="Deletion approvals" className="space-y-4">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h2 className="text-lg">Deletion approvals</h2>
          <p className="mt-2 text-xs leading-6 text-zinc-500">
            A different current admin must approve within 24 hours. Changes to
            the record invalidate the request. Deleting a purchase removes its
            saved download grants.
          </p>
        </div>
        <button className={button} disabled={busy} onClick={() => void load()}>
          Refresh approvals
        </button>
      </div>
      <Status error={error} busy={busy} />
      {data?.approvals?.map((row) => (
        <article key={row.id} className={card}>
          <p className="text-sm">
            {row.record_type === "review" ? "Review" : "Purchase"} ·{" "}
            {row.executed_at
              ? "Deleted"
              : Date.parse(row.expires_at) < now
                ? "Expired"
                : "Awaiting another admin"}
          </p>
          <p className="mt-2 break-all font-mono text-xs text-zinc-500">
            {row.record_id}
          </p>
          <p className="mt-3 whitespace-pre-wrap break-words text-sm text-zinc-300">
            {row.reason}
          </p>
          <p className="mt-2 text-xs text-zinc-500">
            Requested by {row.requested_by}. Expires{" "}
            {new Date(row.expires_at).toLocaleString()}.
          </p>
          {!row.executed_at && Date.parse(row.expires_at) > now && (
            <button
              className={`${button} mt-4 text-red-200`}
              disabled={busy || row.requested_by === data.actorId}
              onClick={() => {
                if (
                  window.confirm(
                    "Approve permanent deletion of this exact record? Review the reference and reason first.",
                  )
                )
                  void mutate({ action: "approveDeletion", id: row.id });
              }}
            >
              {row.requested_by === data.actorId
                ? "Another admin must approve"
                : "Approve and delete"}
            </button>
          )}
          {row.executed_at && row.cleanup_path && !row.cleanup_completed_at && (
            <button
              className={`${button} mt-4`}
              disabled={busy}
              onClick={() =>
                void mutate({ action: "retryCleanup", id: row.id })
              }
            >
              Retry screenshot cleanup
            </button>
          )}
        </article>
      ))}
      {data && !data.approvals.length && (
        <p className="text-sm text-zinc-500">No deletion requests.</p>
      )}
    </section>
  );
}
export function FollowupPanel({ onRequest, onAuthLost }) {
  const { data, error, busy, load, mutate } = useRecords(
    onRequest,
    onAuthLost,
    "followups",
  );
  return (
    <section aria-label="Lead follow-up reminders" className="space-y-4">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h2 className="text-lg">Leads waiting three days</h2>
          <p className="mt-2 text-xs leading-6 text-zinc-500">
            Approve one reminder to the three admin inboxes. Customer follow-up
            stays with the team. No reminder sends until approved.
          </p>
        </div>
        <button className={button} disabled={busy} onClick={() => void load()}>
          Refresh reminders
        </button>
      </div>
      <Status error={error} busy={busy} />
      {data?.nudges?.map((row) => (
        <article key={row.review_id} className={card}>
          <p className="break-all font-mono text-xs">{row.review_id}</p>
          <p className="mt-2 text-xs text-zinc-500">
            Due {new Date(row.due_at).toLocaleString()} ·{" "}
            {row.accepted_at
              ? "Email provider accepted"
              : row.approved_at
                ? "Approved, queued"
                : "Awaiting approval"}
          </p>
          {!row.approved_at && (
            <button
              className={`${button} mt-3`}
              disabled={busy}
              onClick={() =>
                void mutate({ action: "approveNudge", id: row.review_id })
              }
            >
              Approve team reminder
            </button>
          )}
        </article>
      ))}
      {data && !data.nudges.length && (
        <p className="text-sm text-zinc-500">
          No leads waiting for a reminder.
        </p>
      )}
    </section>
  );
}
export function ActivityPanel({ onRequest, onAuthLost }) {
  const { data, error, busy, load } = useRecords(
    onRequest,
    onAuthLost,
    "activity",
  );
  return (
    <div className="space-y-8">
      <section aria-label="Admin login activity" className="space-y-4">
        <div className="flex justify-between gap-3">
          <div>
            <h2 className="text-lg">Recent team sign-ins</h2>
            <p className="mt-2 text-xs leading-6 text-zinc-500">
              Newest 100 sign-ins, retained for 30 days. City is an approximate
              IP estimate when configured. No city means unavailable.
            </p>
          </div>
          <button
            className={button}
            onClick={() => void load()}
            disabled={busy}
          >
            Refresh
          </button>
        </div>
        <Status error={error} busy={busy} />
        {data?.events?.map((row) => (
          <article key={row.id} className={card}>
            <p className="text-sm">{row.device}</p>
            <p className="mt-2 break-all text-xs text-zinc-400">
              Admin {row.actor_id}
            </p>
            <p className="mt-2 text-xs text-zinc-500">
              {row.ip_address} · {row.city || "City unavailable"} ·{" "}
              {new Date(row.occurred_at).toLocaleString()}
            </p>
          </article>
        ))}
        {data && !data.events.length && (
          <p className="text-sm text-zinc-500">No sign-ins recorded yet.</p>
        )}
      </section>
      <DeletionApprovalsPanel onRequest={onRequest} onAuthLost={onAuthLost} />
      <FollowupPanel onRequest={onRequest} onAuthLost={onAuthLost} />
    </div>
  );
}
