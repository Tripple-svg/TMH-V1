import { useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
export default function DataAccessPage() {
  const [params] = useSearchParams(),
    token = params.get("token");
  const [email, setEmail] = useState(""),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false);
  const submit = async (event) => {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const { data, error: failure } = await supabase.functions.invoke(
        token ? "confirm-data-export" : "request-data-export",
        { body: token ? { token } : { email: email.trim() } },
      );
      let result = data;
      if (failure?.context instanceof Response)
        result = await failure.context
          .clone()
          .json()
          .catch(() => null);
      if (failure || !data?.ok)
        throw Error(
          result?.error ||
            "This request could not be confirmed. Try again shortly.",
        );
      setDone(true);
    } catch (failure) {
      setError(failure.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <main className="min-h-screen bg-zinc-50 px-5 py-12 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <section className="mx-auto max-w-lg rounded-3xl border border-zinc-200 bg-white/70 p-6 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.035] sm:p-9">
        <Link to="/" className="text-xs text-zinc-500 underline">
          Back to TMH
        </Link>
        <p className="mt-8 text-[10px] uppercase tracking-[0.2em] text-zinc-500">
          Your privacy
        </p>
        <h1 className="mt-3 font-serif text-3xl">Download my data</h1>
        <p className="mt-4 text-sm leading-7 text-zinc-500">
          Receive a ZIP of your matching saved reviews and linked chats after
          confirming your email. For purchases, bookings, support records or
          unlinked guest chats,{" "}
          <Link to="/support" className="underline">
            contact the team
          </Link>{" "}
          for an ownership check. Never send private access keys.
        </p>
        {done ? (
          <p role="status" className="mt-6 text-sm leading-7">
            {token
              ? "The email provider accepted your archive. Check your inbox and spam folder."
              : "Check your inbox for a confirmation link valid for 24 hours. If it does not arrive, contact info@themarketinghaven.xyz."}
          </p>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-5">
            {!token && (
              <label className="block text-sm">
                Email address
                <input
                  type="email"
                  required
                  maxLength={254}
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={busy}
                  className="mt-2 w-full rounded-xl border border-zinc-300 bg-transparent px-4 py-3 dark:border-white/15"
                />
              </label>
            )}
            {token && (
              <p className="text-sm leading-6">
                Confirm to email the archive to the inbox that requested this
                link.
              </p>
            )}
            {error && (
              <p role="alert" className="text-sm text-red-500">
                {error}
                {token&&<Link to="/data-access" className="mt-3 block underline">Request a new confirmation link</Link>}
              </p>
            )}
            <button
              disabled={busy}
              className="w-full rounded-xl bg-zinc-950 px-4 py-3 text-sm text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-950"
            >
              {busy
                ? "Confirming…"
                : token
                  ? "Confirm and email my archive"
                  : "Send confirmation link"}
            </button>
          </form>
        )}
        <p className="mt-6 text-xs text-zinc-500">
          <Link to="/privacy" className="underline">
            Privacy notice
          </Link>{" "}
          ·{" "}
          <Link to="/support" className="underline">
            Get help
          </Link>
        </p>
      </section>
    </main>
  );
}
