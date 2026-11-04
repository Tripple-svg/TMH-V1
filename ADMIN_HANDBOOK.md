# TMH admin handbook

For Francis, Paschal and Chimburuoma. This guide describes the production-polish branch. Deploy its migrations and functions before using the new controls.

## Sign in and protect your account

Open `/admin` with your own invited account. Five failed password attempts pause this browser for 15 minutes, including after a reload. Supabase also enforces its configured server limits. A frontend pause alone cannot stop someone who clears browser storage or calls Auth directly.

In **Security & AI**, add an authenticator, scan its QR code privately and enter the current six-digit code. Keep the page open until verification succeeds. If the connection drops, use **Reload authenticator settings** before starting again. An incomplete setup can be removed and restarted. Do not screenshot or share the QR code, setup key or codes.

After enrollment, save the ten backup codes in your password manager. Each works once and is shown only during generation. **Generate new backup codes** invalidates every previous code. If code generation fails after enrollment, the authenticator remains enabled; reload and generate another set.

If the authenticator is lost, sign in with your password, choose **Use a backup code** within five minutes and enter an unused code. Recovery removes the lost factors and signs out all sessions. Sign in again and enroll a replacement immediately. Recovery does not create an AAL2 token or disable the database authorization rules. Without a backup code, the owner must verify your identity before using trusted Supabase Auth factor administration. Password reset does not remove MFA.

New device and IP combinations can send a login alert to all three team inboxes. **Activity** shows the newest 100 logins over 30 days. City is an approximate IP estimate when the optional IPinfo connection is configured, otherwise it is unavailable. A browser update can change the device reference. An unexpected login requires session revocation and account investigation in Supabase Auth.

## Process support

1. Open **Support Requests**. Live badges announce new requests and bookings. Press the badge to refresh saved records; it does not overwrite an open draft automatically.
2. Expand the request. Check its reference, issue and description. A contact email is unverified and does not establish ownership of a review or purchase.
3. Reply through the email link using the team mailbox. After actually sending the reply, press **I sent the reply**. Opening a mail app alone does not send a response.
4. Choose **In progress**, **Waiting for customer** or **Resolved**, record useful private notes and add a reason before saving.
5. Red cards mean more than 24 hours have passed without a recorded first response. This is an internal priority marker, not a public response-time guarantee.

If someone else saved an update, your draft stays visible. Copy anything needed, then choose **loading the saved status and notes** before saving again.

## Grant another review attempt

Investigate the support request and ownership evidence first. Choose **Reset review / email lookup attempts** only for a legitimate blocked request. It resets that request's stored network budgets, which may be shared. **Reset saved-device verification attempts** applies only when the request has a verified browser identity.

These actions do not return a private key, bypass inbox verification, create another unlimited review or remove a behavior restriction. The customer must use the normal review correction controls to replace a URL or screenshot. Never ask them to email passwords, OTPs or private access links.

**Security & AI > Active rate limits** shows network/device hashes, reasons and reset times. Historical buckets appear after their next request records a window. A raw IP or email cannot be reconstructed from a hash. Clear only after investigating; the action is recorded in the append-only audit log. Daily AI budgets remain separate and are not refunded by this button.

## Delete a review or purchase

Choose **Request deletion** on the record and enter a specific reason. Nothing is deleted yet. A different current admin opens **Activity > Deletion approvals**, checks the record and reason, then approves within 24 hours. The requester cannot approve their own action. If the record changed, request approval again for the new version. Both accounts must still be current admins.

A review deletion removes its linked chats and queues its screenshot cleanup. Purchases and bookings are separate. Use **Retry screenshot cleanup** if deletion succeeded but file cleanup is pending. A purchase deletion removes that purchase and its stored recovery/device grants. It does not cancel or refund a Paystack transaction, cancel a Calendly appointment, or revoke an already-issued signed link immediately. Financial corrections require the provider's normal process.

Customer email-confirmed privacy deletion is a separate rights flow and does not require two staff signatures.

## Leads, exports and reminders

Mark a lead **Contacted** after making contact. Leads still pending after three days enter **Activity > Leads waiting three days**. **Approve team reminder** permits one reminder to the three admin inboxes. It sends no customer email. Provider acceptance is shown separately from inbox delivery. If a lead is contacted before the worker runs, it is not sent.

CSV export defaults to **Redact emails and phones**, including ordinary contact patterns in free-text fields. Uncheck only when contact details are needed for authorized work. Names and business details remain, so a redacted export is not anonymous. Filters and exports apply to loaded reviews, up to 500.

## Bookings and Insights

Bookings opens a monthly calendar using Africa/Lagos dates. Dots mark days with upcoming active/confirmed calls. Select a day for its calls, or choose **Booking cards** for the searchable list. The calendar covers loaded records, not every historical provider booking. Calendly provides the actual meeting link and cancellation controls.

**Insights** uses a 7- or 30-day creation window. Conversation totals include saved review, support and service conversations. Route percentage counts saved evidence of a Call, Playbook or Content route. Retention can remove older route evidence. Click percentages use saved reviews as their denominator, and the same review can click both links. They are not sales or completed-booking conversion rates.

Leak groups classify saved labels as Clarity, Trust, Friction, Positioning or Unclassified. First-message results are safe topic groups, not raw chat excerpts. Content performance counts consented section views lasting two seconds and actions on section controls, deduplicated per browser/section/day. It excludes visitors who decline analytics and does not count unique people. Use these as signals for content review, not revenue attribution.

## Privacy requests and incidents

The footer **Download my data** flow confirms an inbox and emails a ZIP of matching saved reviews and linked chats. The link expires after 24 hours. Purchases, bookings, support and unlinked guest chats require a separate verified request through Support. Do not treat a typed email or session ID as proof. Large exports need personal assistance.

For outages, inspect `/functions/v1/health` and the failed check names. It is healthy only when the database, required RPC, Vault secret, recent cron runs and four recent successful workers pass. Check the matching request ID in structured logs. Logs and Sentry must never contain email, tokens, passwords, request bodies or chat prompts.

UptimeRobot setup is intentionally left for Francis under `francis.teamhaven@gmail.com`. Add Paschal and Chimburuoma as alert contacts. Configure the public website and health URLs from the deployment runbook, then confirm an actual downtime/recovery notification. No monitor or activation invitation was submitted by this pass.
