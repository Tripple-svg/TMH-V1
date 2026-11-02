# Optional Zoho Mail support notifications

This integration creates a Support workspace request when a signed Zoho event
reports mail addressed to `info@themarketinghaven.xyz`. It copies **only sender
address, subject and received time**. Read the message and reply in Zoho Mail.
It does not sync a mailbox, copy bodies/attachments, send an automatic reply or
prove that a sender owns a review or purchase. The Support notification worker
notifies both `francis.teamhaven@gmail.com` and `paschal.tmh@gmail.com`.

Official contract: [Zoho Mail outgoing webhooks](https://www.zoho.com/mail/help/dev-platform/webhook.html).
Zoho signs the full original request bytes with HMAC SHA-256, encoded as base64
in `x-hook-signature`. Its `x-hook-secret` is sent only on initial registration.

## Deploy and enroll privately

1. Apply `20261031000000_support_requests.sql` and
   `20261031000002_zoho_support.sql`. Deploy `zoho-support-webhook` with Supabase
   JWT verification disabled; the endpoint authenticates Zoho's HMAC instead.
   Deploy/schedule the Support notification worker separately.
2. Generate a new random **32-byte value encoded as 64 hexadecimal characters**
   using a trusted password manager or cryptographic generator. Store it only as
   the Supabase Edge secret `ZOHO_WEBHOOK_ENROLLMENT_TOKEN`. Do not put it in the
   frontend, source control, screenshots, chat, or a public document.
3. In the Zoho Mail account receiving `info@themarketinghaven.xyz`, open
   **Settings → Integrations → Developer Space → Outgoing Webhooks → Add new
   configuration**. Select **Mail**, limit the filter to incoming support emails
   addressed to that mailbox, and enable **Limited Data List**. Do not enable a
   custom function that rewrites the payload. Set the webhook URL to:

   `https://dkpoygkduktusrnsbpaq.supabase.co/functions/v1/zoho-support-webhook?setup=YOUR_PRIVATE_ENROLLMENT_TOKEN`

   Keep the filter focused on genuine support mail (for example a manually
   applied support tag). Exclude automated notifications and spam so they do
   not fill the queue or generate unnecessary team alerts.

4. Save the configuration. The first POST must include both Zoho headers and
   receives HTTP 200 only after the enrollment token and signature pass. It pins
   Zoho's signing secret in the private database table. That initial probe does
   **not** create a support request. If saving fails, check status codes without
   copying the full URL, secret headers or email payload into logs.
5. Once registration succeeds, **remove `ZOHO_WEBHOOK_ENROLLMENT_TOKEN` from Edge
   secrets**. The value in the saved URL then cannot authorize registration;
   normal delivery still verifies the pinned secret. Enrollment URLs can appear
   in infrastructure access logs, so treat the token as short lived. Do not
   publish the URL even after disabling enrollment.
6. Send a real support email to `info@themarketinghaven.xyz`, then verify one new
   **Zoho** support request and both team notifications. The sender is labelled
   unverified. Do not use its email address to bypass inbox verification or
   grant access. Check Zoho if notifications stop: Zoho may disable an outgoing
   webhook after prolonged endpoint failures.

## Rotation and limits

- No public request can replace a pinned signing secret. To recreate the Zoho
  configuration, disable its old webhook, provision a **new** enrollment token,
  have a database operator delete only the `provider='zoho'` integration row, and
  repeat enrollment. Do not delete support requests. Disable enrollment again.
- String message IDs deduplicate independently of other fields. Zoho's example
  numeric IDs exceed JavaScript's exact integer range, so numeric/missing IDs
  use the signed raw-body hash: an identical retry deduplicates; a rewritten or
  reordered payload may be a distinct event. Existing requests are never
  overwritten by webhook retries.
- Only events whose `toAddress` includes the support mailbox are accepted into
  the queue. Mail to unrelated addresses is ignored. Configure the Mail entity
  and Limited Data List in Zoho; this is not a Streams/Tasks integration.
- JSON and request sizes are bounded. HTML, message summaries, attachment data,
  CC lists and sender display names are not persisted. Support contact emails
  remain unverified even when transport authentication succeeds.
- Availability of Developer Space/outgoing webhooks depends on the Zoho account;
  confirm it in that mailbox before enabling this optional integration.
