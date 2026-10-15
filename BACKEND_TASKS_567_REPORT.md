# Backend Tasks 5, 6, 7 — local review report

Branch: `feat/backend-tasks-567`, created from clean `dev` on 15 October 2026.
All changes are unstaged. No commit or push was run.

The user selected **prepare local changes and report blocked live steps**. This is a locally tested implementation, not a completed production rollout. Supabase was not connected; only frontend credentials were available. No live database, bucket, function deployment, payment, booking, email delivery, or Calendly subscription was changed or verified.

**The PDF remains in `public/The_Unseen_Playbook!.pdf`.** Its private upload could not be confirmed, so it was not deleted. The existing public exposure remains until the transfer script succeeds and the frontend is rebuilt and deployed. The current local build still includes that asset. Do not deploy this frontend before the storage move and edge function deployment.

## Files created

- `supabase/functions/verify-paystack/index.ts` — verifies Paystack status, exact reference, NGN currency and either permitted price; verifies bucket privacy and returns a one-hour attachment URL.
- `supabase/functions/capture-booking-lead/index.ts` — validates and stores the normalized email, optional permitted service ID, and IP through the service role.
- `supabase/functions/calendly-webhook/index.ts` — verifies the raw-body HMAC and timestamp, builds review briefings, matches the newest services intent, and invokes confirmation delivery.
- `supabase/functions/send-tmh-booking-confirmation/index.ts` — service-role-only Resend sender with service copy, stored send flags, and stable provider idempotency keys.
- `supabase/migrations/20261015000000_private_playbook.sql` — creates or makes `playbook-private` private and checks its privacy.
- `supabase/migrations/20261015000001_brand_reviews_email_unique.sql` — prepares the unique index on `lower(email)`; does not delete existing duplicates if index creation fails.
- `supabase/migrations/20261015000002_booking_intents.sql` — creates the intent table, email index, nullable confirmation flag, RLS with no anon policies, service-role access, and a review-only confirmation flag.
- `supabase/config.toml` — declares the new functions' gateway settings; webhook HMAC and internal sender authorization are verified by their handlers.
- `scripts/move-playbook-private.mjs` — checks privacy before upload, verifies uploaded bytes, rechecks privacy, then removes the public source file.
- `scripts/setup-calendly-webhook.mjs` — creates a user-scoped `invitee.created` subscription, prevents duplicate setup, and prints the signing key after successful creation.
- `tests/backend-tasks.test.mjs` — eleven mocked handler tests across the three tasks.
- `tests/booking-ui.test.mjs` — four tests executing the booking modal with lightweight hooks.
- `tests/playbook-ui.test.mjs` — three tests executing the shop's restore, download, and recovery flows with lightweight hooks.
- `BACKEND_TASKS_567_REPORT.md` — this report and exact requested diffs.

## Files modified

- `src/components/ShopSection.jsx` — uses verified signed URLs, restores by stored reference, refreshes re-downloads, and shows recovery instructions while preserving the congratulations note.
- `src/components/haven/context/HavenContext.jsx` — stores booking source/service and exposes `bookingContext` in the provider's returned `value` object.
- `src/components/services/ServiceGrid.jsx` — passes the service ID into booking and removes the unused scheduling toast.
- `src/components/haven/components/HavenDrawer.jsx` — captures email only for Services, preserves the review link behavior and click timestamp, and clears stale Services context when a chat booking chip is used.
- `src/pages/AdminDashboard.jsx` — adds the Briefed column and adjusts table spans; search already matched email and remains unchanged.
- `supabase/functions/admin-fetch-leads/index.ts` — adds independent, sanitized `support_sessions` without changing the existing leads shape or adding support UI.

All six DO NOT TOUCH files are unchanged. ThinkingIndicator, chat imports, consent/dismissConsent logic, ResizeObserver scrolling, and force-scroll logic are unchanged. Existing admin controls and features remain present.

## Task 6 findings

The repository did not define a unique index on `lower(brand_reviews.email)`. A conditional migration is prepared; the live index catalogue was not accessible, so live existence is unconfirmed.

The existing `check-email-exists` handler trims input, escapes wildcard characters, and uses an exact case-insensitive ILIKE lookup. Its local test passes. `BrandReviewModal.jsx` already calls that function before advancing and blocks a positive match; it was not modified. The live deployed function and duplicate submission were not tested. Existing lookup failures return `exists:false`, and the form continues on request failures; the database unique index is therefore the final enforcement layer.

## Secrets and Calendly configuration

- `PAYSTACK_SECRET_KEY`: required by `verify-paystack`. Its live presence could not be inspected; add it if missing.
- `CALENDLY_WEBHOOK_SECRET`: required before live webhook testing. **No exact signing key is available: no subscription was created in this session.** No key was hardcoded or saved in source.
- `CALENDLY_API_TOKEN`: already in Supabase secrets according to the request. The local setup script needs the PAT supplied in its own process environment; it cannot read the stored Supabase secret value.
- `RESEND_API_KEY`: reuse the existing welcome-email secret; live presence was not inspected.
- Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to edge functions. The local PDF transfer script needs those values in its process environment; never use a service-role key as a Vite environment variable.

Calendly's current PAT documentation accepts a caller-supplied `signing_key`; its documented create response does not promise to return a newly generated key. The setup script generates a key, supplies it to Calendly, and prints the returned key if present or otherwise the supplied key after successful subscription creation. Save that exact output as `CALENDLY_WEBHOOK_SECRET` before testing.

Sources: [Calendly subscription API](https://developer.calendly.com/api-docs/calendly-api/webhooks/create-webhook-subscription), [signature verification](https://developer.calendly.com/api-docs/overview/webhooks/webhook-signatures).

Target callback after deployment: `https://dkpoygkduktusrnsbpaq.supabase.co/functions/v1/calendly-webhook`, event `invitee.created`, scope `user`. No extra dashboard subscription is needed if the setup script succeeds. Existing dashboard configuration was not inspected.

The handler accepts the requested `payload.event.start_time` shape and also the current documented `payload.scheduled_event.start_time` shape, where `payload.event` is a URI. Both use `payload.email` and `payload.name`. [Calendly sample payload](https://developer.calendly.com/api-docs/calendly-api/webhooks/get-sample-webhook-data)

Review-only bookings have no services intent, so their confirmation guard is `brand_reviews.booking_confirmation_sent`. Services bookings use `booking_intents.confirmation_sent`. Both also use a stable Resend idempotency key for concurrent delivery retries. [Resend idempotency](https://resend.com/changelog/idempotency-keys)

## Local validation

Run: `node --test tests/backend-tasks.test.mjs tests/booking-ui.test.mjs tests/playbook-ui.test.mjs`

Result: **18 passed, 0 failed**. External services and the database are mocked; these are not claims about live payments or bookings. Edge TypeScript was transpiled for execution in the Node harness; the Deno CLI was unavailable, so no Deno typecheck or deployed-runtime test was run.

Production build passed. Vite retains its large-chunk warning. Both setup scripts pass `node --check`. `git diff --check` passed. Protected-file diffs and the staged diff are empty.

Targeted ESLint comparison against HEAD found no added diagnostics. Existing error counts before → after: ShopSection 4 → 4, HavenDrawer 6 → 6, HavenContext 11 → 11, ServiceGrid 1 → 0, AdminDashboard 4 → 4. These files still have 25 pre-existing errors; lint is not clean.

## Numbered test checklist — Task 5

1. **PASS locally:** invalid references, wrong payment status/reference/currency/amount, unapproved origins, and a public bucket cannot issue a download URL. Both 10000 and 963900 kobo are accepted for successful NGN payments.
2. **PASS locally:** the handler requests a 3600-second signed attachment URL. Returning users verify the stored reference before seeing a download link.
3. **PASS locally:** re-download requests a new URL and triggers download with that URL; persistence contains the reference and download flag, never the signed URL. Failed verification displays the recovery email and reference.
4. **PENDING live:** apply the private-bucket migration. With `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the process environment, run `node scripts/move-playbook-private.mjs`. Confirm privacy, upload and removal succeed. Rebuild afterward so the PDF leaves `dist` too.
5. **PENDING live:** deploy `verify-paystack`, ensure `PAYSTACK_SECRET_KEY` exists, then deploy the frontend. Complete the ₦100 payment and confirm the actual PDF downloads from the signed URL.
6. **PENDING live:** obtain a short-lived test URL and confirm access is denied after expiry; close/reopen the browser and confirm a fresh URL is issued. No real payment or expiry test was performed here.

## Numbered test checklist — Task 6

1. **PASS locally:** the existing lookup handles trimmed/mixed-case emails and escaped wildcard characters; invalid emails do not trigger a database lookup.
2. **PENDING live:** inspect `pg_indexes` for a UNIQUE index on `lower(email)`. Apply the prepared index migration if needed; resolve existing duplicates explicitly if creation fails.
3. **PENDING live:** submit the same existing email in different letter cases through the form on an allowed origin, confirm the function returns `exists:true`, and confirm no second review row is inserted.

## Numbered test checklist — Task 7

1. **PASS locally:** the review modal has no email field or prefill/capture call and preserves `tmh_calendly_clicked_at`; the Services modal blocks invalid emails inline.
2. **PASS locally:** Services capture finishes before Calendly navigation and preserves the correct service ID and encoded email; capture failures leave the modal open. An intent alone does not send an email.
3. **PASS locally:** raw-body signatures reject missing, forged, tampered, stale, or future timestamps. Unknown invitees return `matched:false` without inserts or email calls.
4. **PASS locally:** matched reviews receive the scheduled start time and briefing fields plus only the last five audit messages. Review-only bookings receive one generic confirmation across repeated delivery.
5. **PASS locally:** the newest services intent selects the right copy for web/growth/content; repeated webhook delivery is guarded, failed sending remains retryable, concurrent requests use the same provider key, and anonymous callers cannot invoke the sender.
6. **PASS locally:** admin returns support sessions independently of review IDs, strips image fields, caps each transcript at its last 60 messages, and preserves the existing lead response.
7. **PENDING live:** apply the booking migration and deploy `capture-booking-lead`, `calendly-webhook`, `send-tmh-booking-confirmation`, and the updated `admin-fetch-leads` using `supabase/config.toml`. Create the subscription with `node scripts/setup-calendly-webhook.mjs` and save its printed signing key in Supabase before testing.
8. **PENDING live:** submit a review, chat 3–4 messages, book through `__BOOK_CALL__`, and inspect `call_booked_at`, `pre_call_briefing`, and one actual confirmation email.
9. **PENDING live:** book through each service and inspect its intent/service ID and actual email copy. Repeat a signed delivery and confirm no second email.
10. **PENDING live:** abandon Services after opening Calendly and confirm the intent exists with `confirmation_sent:false` and no email.
11. **PENDING live:** inspect the admin Network response for `support_sessions`, verify Briefed indicators, and confirm email search, filters, sort, pagination, CSV export, booked badges, urgency borders, transcript viewing, and toasts still work.

## Exact requested diffs

The following are the full `git diff` outputs for the four specifically requested files. No changes are staged.

```diff
diff --git a/src/components/haven/components/HavenDrawer.jsx b/src/components/haven/components/HavenDrawer.jsx
index 5a32763..4ef4c34 100644
--- a/src/components/haven/components/HavenDrawer.jsx
+++ b/src/components/haven/components/HavenDrawer.jsx
@@ -14,6 +14,7 @@ import ActionModals from './ActionModals';
 import ChatMessage from './chat/ChatMessage';
 import ChatInput from './chat/ChatInput';
 import HavenScoreCard from './HavenScoreCard';
+import { supabase } from '../../../lib/supabase';
 
 const LOGO_SRC = '/Tmhh.jpeg';
 const CALENDLY_URL = 'https://calendly.com/themarketinghaven01/30min';
@@ -153,6 +154,12 @@ const QuickPromptCards = React.memo(function QuickPromptCards({ onSelectPrompt }
 });
 
 function BookingModal({ isOpen, onClose }) {
+  const { bookingContext } = useHaven();
+  const [bookingEmail, setBookingEmail] = useState('');
+  const [bookingError, setBookingError] = useState('');
+  const [capturing, setCapturing] = useState(false);
+  const fromServices = bookingContext.source === 'services';
+  const validEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
   const [hasOpenedBefore, setHasOpenedBefore] = useState(false);
   const [lastOpenedLabel, setLastOpenedLabel] = useState('');
 
@@ -185,7 +192,37 @@ function BookingModal({ isOpen, onClose }) {
     }
   }, [isOpen]);
 
-  const handleChooseTime = () => {
+  const handleChooseTime = async (event) => {
+    if (fromServices) {
+      event.preventDefault();
+      if (capturing) return;
+      const email = bookingEmail.trim();
+      if (!validEmail(email)) {
+        setBookingError('Please enter a valid email address.');
+        return;
+      }
+      // Open synchronously to preserve the browser's user gesture, then navigate
+      // only after capture succeeds so Calendly cannot outrun the intent insert.
+      const bookingWindow = window.open('about:blank', '_blank');
+      if (bookingWindow) bookingWindow.opener = null;
+      setCapturing(true);
+      setBookingError('');
+      try {
+        const { data, error } = await supabase.functions.invoke('capture-booking-lead', {
+          body: { email, serviceId: bookingContext.serviceId },
+        });
+        if (error || !data?.ok) throw new Error('Capture failed');
+        const url = `${CALENDLY_URL}?email=${encodeURIComponent(email)}`;
+        if (bookingWindow) bookingWindow.location.href = url;
+        else window.location.assign(url);
+      } catch {
+        bookingWindow?.close();
+        setBookingError('We could not save your booking details. Please try again.');
+        return;
+      } finally {
+        setCapturing(false);
+      }
+    }
     try {
       localStorage.setItem(CALENDLY_CLICKED_KEY, new Date().toISOString());
     } catch {}
@@ -223,9 +260,21 @@ function BookingModal({ isOpen, onClose }) {
               </div>
             )}
 
-            <a href={CALENDLY_URL} target="_blank" rel="noopener noreferrer" onClick={handleChooseTime}
+            {fromServices && (
+              <div className="relative text-left space-y-2">
+                <label htmlFor="booking-email" className="block text-xs text-zinc-300">Email for your booking</label>
+                <input id="booking-email" type="email" placeholder="your@email.com" value={bookingEmail}
+                  onChange={(event) => { setBookingEmail(event.target.value); setBookingError(''); }}
+                  onBlur={() => { if (bookingEmail && !validEmail(bookingEmail.trim())) setBookingError('Please enter a valid email address.'); }}
+                  aria-invalid={Boolean(bookingError)} aria-describedby={bookingError ? 'booking-email-error' : undefined}
+                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white" />
+                {bookingError && <p id="booking-email-error" role="alert" className="text-xs text-red-400">{bookingError}</p>}
+              </div>
+            )}
+            <a href={fromServices ? `${CALENDLY_URL}?email=${encodeURIComponent(bookingEmail.trim())}` : CALENDLY_URL}
+              target="_blank" rel="noopener noreferrer" onClick={handleChooseTime} aria-disabled={capturing}
               className="relative flex items-center justify-center gap-2 w-full px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-all shadow-lg shadow-blue-600/20">
-              <span>Choose a Time</span><ExternalLink className="w-4 h-4" />
+              <span>{capturing ? 'Saving...' : 'Choose a Time'}</span><ExternalLink className="w-4 h-4" />
             </a>
 
             <p className="relative text-[11px] leading-relaxed text-zinc-500">
@@ -249,7 +298,7 @@ function BookingModal({ isOpen, onClose }) {
 
 export default function HavenDrawer() {
   const {
-    isOpen, closeDrawer, activeScope, activeService, viewState,
+    isOpen, closeDrawer, openDrawer, activeScope, activeService, viewState,
     sessions = [], activeSessionId, currentSession, messages = [],
     createNewSession, switchSession, togglePinSession, deleteSession,
     sendMessage, sendNavChipIntent, isThinking, userProfile = {},
@@ -436,6 +485,7 @@ export default function HavenDrawer() {
   const handleChipSelect = useCallback((text) => {
     if (text === '__BOOK_CALL__') {
       updateUserProfile?.({ clickedBookingLink: true });
+      openDrawer('booking');
       setShowBookingModal(true);
       return;
     }
@@ -459,7 +509,7 @@ export default function HavenDrawer() {
 
     armForceScroll();
     sendMessage(text);
-  }, [sendMessage, closeDrawer, armForceScroll, updateUserProfile]);
+  }, [sendMessage, closeDrawer, openDrawer, armForceScroll, updateUserProfile]);
 
   const handleNavChipSelect = useCallback((navChip) => {
     if (!navChip || !navChip.text) return;
diff --git a/src/components/haven/context/HavenContext.jsx b/src/components/haven/context/HavenContext.jsx
index a3b6e38..3e08fd3 100644
--- a/src/components/haven/context/HavenContext.jsx
+++ b/src/components/haven/context/HavenContext.jsx
@@ -244,6 +244,7 @@ export function HavenProvider({ children }) {
   const [toastMessage, setToastMessage]   = useState('');
   const [activeMenuSessionId, setActiveMenuSessionId] = useState(null);
   const [bookingNoticeOpen, setBookingNoticeOpen]     = useState(false);
+  const [bookingContext, setBookingContext] = useState({ source: null, serviceId: null });
 
   const [supportSessions, setSupportSessions] = useState([makeDefaultSupportSession()]);
   const [serviceSessions, setServiceSessions] = useState([]);
@@ -636,6 +637,7 @@ export function HavenProvider({ children }) {
         },
       });
     } else if (targetMode === 'booking') {
+      setBookingContext({ source: payload.source ?? null, serviceId: payload.serviceId ?? null });
       setBookingNoticeOpen(true);
       return;
     } else {
@@ -938,7 +940,7 @@ export function HavenProvider({ children }) {
     createNewSession, switchSession, togglePinSession, deleteSession, clearChat,
     addMessage, sendMessage, sendNavChipIntent, isThinking, setIsThinking, stopResponse,
     userProfile, updateUserProfile,
-    bookingNoticeOpen, setBookingNoticeOpen,
+    bookingNoticeOpen, setBookingNoticeOpen, bookingContext,
     showToast, toastMessage, triggerToast,
     activeMenuSessionId, setActiveMenuSessionId,
     hasExistingReview, getSavedReviewFormData, clearExistingReview,
diff --git a/src/components/services/ServiceGrid.jsx b/src/components/services/ServiceGrid.jsx
index c43448f..5817280 100644
--- a/src/components/services/ServiceGrid.jsx
+++ b/src/components/services/ServiceGrid.jsx
@@ -57,7 +57,6 @@ const SERVICES = [
 
 export default function ServiceGrid() {
   const [selectedService, setSelectedService] = useState(null);
-  const [bookingToast, setBookingToast] = useState(false);
 
   const { openDrawer } = useHaven();
 
@@ -82,8 +81,9 @@ export default function ServiceGrid() {
   };
 
   const handleBookCall = () => {
+    const svc = selectedService;
     setSelectedService(null);
-    openDrawer('booking');
+    openDrawer('booking', { source: 'services', serviceId: svc.id });
   };
 
   return (
@@ -230,18 +230,6 @@ export default function ServiceGrid() {
                 </button>
               </div>
 
-              <AnimatePresence>
-                {bookingToast && (
-                  <motion.div
-                    initial={{ opacity: 0, y: 10 }}
-                    animate={{ opacity: 1, y: 0 }}
-                    exit={{ opacity: 0, y: 10 }}
-                    className="mt-4 p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-xl text-center text-xs font-medium text-blue-700 dark:text-blue-300"
-                  >
-                    📅 Calendar scheduling coming soon. Use "Get More Info" to chat with Haven now.
-                  </motion.div>
-                )}
-              </AnimatePresence>
             </motion.div>
           </div>
         )}
diff --git a/src/pages/AdminDashboard.jsx b/src/pages/AdminDashboard.jsx
index d74d8a2..8c130cd 100644
--- a/src/pages/AdminDashboard.jsx
+++ b/src/pages/AdminDashboard.jsx
@@ -547,6 +547,9 @@ function LeadRow({ lead, password, onLeadChange, onAuthLost, showToast }) {
           {lead.biggest_leak || '—'}
         </td>
         <td className="p-2 align-top text-xs text-zinc-400">{lead.utm_source || 'direct'}</td>
+        <td className="p-2 align-top text-xs text-zinc-400" title={lead.pre_call_briefing ? 'Pre-call briefing ready' : 'No briefing'}>
+          {lead.pre_call_briefing ? '✓' : '—'}
+        </td>
         <td className="p-2 align-top text-xs text-zinc-400 whitespace-nowrap">
           <div>{formatDate(lead.created_at)}</div>
           <div className="text-[10px] text-zinc-600">{relativeTime(lead.created_at)}</div>
@@ -560,7 +563,7 @@ function LeadRow({ lead, password, onLeadChange, onAuthLost, showToast }) {
       </tr>
       {expanded && (
         <tr className="border-b border-zinc-800 bg-zinc-900/30">
-          <td colSpan={11} className="p-4">
+          <td colSpan={12} className="p-4">
             <LeadDetails lead={lead} />
           </td>
         </tr>
@@ -891,6 +894,7 @@ export default function AdminDashboard() {
                 <th className="p-2">Temp</th>
                 <th className="p-2">Leak</th>
                 <th className="p-2">UTM</th>
+                <th className="p-2">Briefed</th>
                 <th className="p-2">Created</th>
                 <th className="p-2">Follow-up</th>
                 <th className="p-2">Notes</th>
@@ -898,9 +902,9 @@ export default function AdminDashboard() {
             </thead>
             <tbody>
               {loading && leads.length === 0 ? (
-                <tr><td colSpan={11} className="p-6 text-center text-zinc-500">Loading…</td></tr>
+                <tr><td colSpan={12} className="p-6 text-center text-zinc-500">Loading…</td></tr>
               ) : pagedLeads.length === 0 ? (
-                <tr><td colSpan={11} className="p-6 text-center text-zinc-500">No leads match these filters.</td></tr>
+                <tr><td colSpan={12} className="p-6 text-center text-zinc-500">No leads match these filters.</td></tr>
               ) : (
                 pagedLeads.map((lead) => (
                   <LeadRow
```
