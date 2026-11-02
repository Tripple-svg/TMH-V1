**TMH privacy operations and preliminary risk assessment · 1 November 2026**

This is an implementation record and an operator workbook. It is not legal certification, a regulator filing or proof that provider contracts have been signed. The owner must approve the retention choices, confirm actual provider regions and complete the organizational actions below before public launch.

**Correcting the legal references**

The NDPA groups data-subject rights in sections 34–38. DPIA is section 28; breach response is section 40; international transfers are sections 41–43. Section 45 concerns fees. A 13-month renewal interval is a TMH product choice for optional analytics consent here, not a verified blanket statutory expiry for every kind of consent. A DPIA depends on the processing risk; using AI does not alone establish every legal classification. [NDPA published by NDPC](https://ndpc.gov.ng/wp-content/uploads/2024/03/Nigeria_Data_Protection_Act_2023.pdf)

**What the product actually supports**

| Request | Implemented operation | Remaining human step |
| --- | --- | --- |
| Access | Saved review/chat can be reopened with its private browser capability; staff can inspect authorized records. Support form records a request. | Verify identity and provide all applicable records. There is no automatic whole-platform subject-access package. |
| Rectification | Review source correction replaces a wrong URL/screenshot under ownership proof and revision checks. | Correct other personal fields after verifying ownership; do not delete/recreate a lead to avoid investigating an error. |
| Erasure | Email-confirmed review deletion requires an explicit click and atomically removes the matched review/chats; screenshot cleanup can resume after failure. | Separate purchases, bookings, support, guest identities, security records and provider copies require scope/retention review. |
| Restriction/objecting | Optional analytics can be declined; processing pauses and moderation appeals have operational controls. | A behavior restriction is NOT a legal processing-restriction request. Review and handle a privacy restriction/objection separately. |
| Withdrawal of consent | Declining optional analytics stops future presence heartbeats and optional visit attribution. The single optional purchase follow-up has its own unsubscribe flow. | Consent withdrawal does not automatically erase records held for another lawful purpose. Record the request and explanation. |
| Portability | Staff have individual transcripts/lead CSV as operational tools. | No customer-facing portable JSON bundle is implemented. A staff CSV alone is not proof that a portability request has been fulfilled; verify identity, scope and lawful conditions. |
| Human review | Contact actions and tracked support requests support an appeal of a score or restriction. Admin can review context and change flags. | An accountable person must actually investigate; never treat an AI flag as conclusive evidence. |
| Complaint | Privacy notice links to NDPC and provides contact/support channels. | Acknowledge, investigate, preserve evidence and document the response. |

Typed emails, request IDs and signed incoming-mail events do not prove ownership. Do not ask people to email passwords, OTPs or private access links. A rate-limit reset enables a new attempt; it does not authorize access. Support can clear the specific review/email-lookup budget or a verified saved-device OTP lock, with an audit reason. A lost review capability remains an ownership-verification case, not an email-only lookup.

**Data and retention register**

| Category | Product handling / chosen period | Activation or limitation |
| --- | --- | --- |
| Chat text, turn responses, compact conversation memory and routing evidence | Clear after 180 days without session activity. Keep minimal session/capability and operational metadata so ownership does not break. | Apply privacy migration and schedule its daily maintenance job. Browser-local copies are separate. Active conversations keep context under the existing bounded history rules. |
| Saved review scores, contact details and screenshots | Retained for the saved service until verified deletion or a documented periodic purpose review. | No invented automatic expiry of private access. Set an owner for reviewing old leads before launch. |
| Optional whole-site presence | Separate consented browser UUID, token digest, first/last seen; no email, raw IP, path history or fingerprint. Remove after 13 months without activity. | Counts describe retained consented browser profiles and activity in a five-minute window, not unique humans or everyone visiting the site. Daily cleanup also runs during quiet periods. |
| Optional analytics consent | Timestamp/version receipt through a bounded, rate-limited Edge Function; affirmative preference reconfirmed after 13 calendar months. Older undated affirmative choices are asked again. | Analytics stays off until the current receipt is acknowledged. Declining does not create an analytics identity. Cookie receipts expire after two years through maintenance. |
| Resolved support requests/actions | Remove 90 days after last update. Open requests remain for resolution/review. | Support retention job; manual handling for exceptional lawful retention. |
| Operational AI usage alerts | Existing 90-day cleanup for usage/accepted alerts. Budget reservations preserve uncertain spending after crashes. | Keep unknown reservations charged; do not refund them automatically as if providers never billed. |
| Admin audit | Append-only metadata: actor UUID, action, record type/ID, changed field names, timestamp, keyed network identifier. No full note/email/token snapshots. | New actions only; no fabricated history. Owner must adopt an archive/retention policy. Database ownership remains privileged and can alter schema. |
| Purchases/bookings/accounting | Separate from review deletion; private downloads use expiring signed URLs and recovery ownership checks. | Confirm accounting/consumer retention requirements with the appropriate adviser; no arbitrary purge of paid entitlements. |
| Zoho/Resend/provider copies | Controlled by their contracts/settings. Optional Zoho integration copies minimal incoming-mail metadata, not the full mailbox. | Confirm provider retention and handle requests across those systems; deleting a website row does not erase external inboxes. |

**Preliminary DPIA: decisions still required**

Purpose: help a brand owner understand visible communication, choose a proportionate next step, obtain support, buy the Playbook and book appropriate agency work. Do not use screenshots or chat logs for autonomous training or unrelated enrichment.

Data flows: browser → Supabase private records → selected Gemini/Groq processing; website URL → Jina reader; payment → Paystack; transactional/team mail → Resend; bookings → Calendly; direct support mail → Zoho. Screenshots may accidentally contain third-party or sensitive information. Tell users to crop unnecessary information and avoid submitting credentials or private customer data.

| Risk | Current safeguard | Residual issue / owner action |
| --- | --- | --- |
| Screenshot contains personal data | Private bucket, strict encoded image/type/dimension/size checks, access proof and scoped signed URLs. | Validation is not malware scanning, OCR redaction or a pixel-decoder guarantee. Confirm provider processing terms and staff access. |
| Wrong score / recommendation | Evidence-based rubric, insufficient-evidence state, explicit scope disclaimer and correction control. | Evaluate with real businesses, record disagreements, and improve tested prompts manually. A numerical score is not a sales prediction. |
| Wrong automatic restriction | Server-owned strikes, legitimate criticism excluded, private context, human appeal and admin review. | Sample false positives and ensure a real person responds to appeals. |
| Staff misuse / compromised staff account | Current Auth role checks, transactional mutation checks, append-only audit, session-scoped frontend authentication. | Enroll MFA, define who can grant roles, rehearse demotion, and protect owner access and secrets. |
| Missing/undelivered notification | Durable support queue, stable mail idempotency, retry markers and explicit acceptance status. | Accepted by Resend is not delivered/read. Check cron runs and provider delivery events; configure independent uptime/error monitoring. |
| Cost abuse / provider outage | Atomic subject/network/global attempt and token reservations, request/input/output bounds, timeouts, pauses and alerts. | Configure ceilings against your actual budget and provider billing limits. Shared/rotating networks and bot traffic remain risks. |

Before real-user testing at scale, the owner should review whether the residual risks require further controls, a formal DPIA filing/consultation, registration, a DPO or professional review. This draft does not settle those questions for TMH.

**Cross-border transfer register: complete with evidence**

The repository cannot prove the live Supabase region, provider subprocessor countries or a signed transfer mechanism. For each of Supabase, Google, Groq, Jina, Paystack, Resend, Calendly, Zoho and Netlify record: exact contracting entity/plan, categories and purposes, region/subprocessors, retention, DPA version/date, applicable transfer basis and assessment, safeguards and owner. Obtain and review actual agreements; do not simply write “SCCs” or “EU region” and assume compliance. [NDPC guidance on international transfers](https://ndpc.gov.ng/faqs/)

**Incident response procedure**

1. Assign an incident owner and record when TMH became aware, the facts, affected categories, approximate people/records, likely impact and containment steps. Preserve minimal relevant evidence securely.
2. Contain the incident: pause affected AI functions through Admin, revoke the affected staff account/keys through the correct provider, stop an exposed webhook and investigate audit/provider logs. Do not erase evidence or publish private payloads.
3. Assess notification obligations promptly. NDPA section 40 provides a 72-hour Commission notification for qualifying risk and affected-person notification for high risk; use the current NDPC procedure and obtain appropriate legal help. Do not wait for a perfect investigation before assessing the deadline. [NDPC GAID](https://ndpc.gov.ng/wp-content/uploads/2025/07/NDP-ACT-GAID-2025-MARCH-20TH.pdf)
4. Record decisions, notices, timing, investigation and remediation. Regulatory/customer notices require human approval; this implementation sends none automatically.
5. Restore a known safe deployment and verify database AND Storage restoration. Run an exercise with synthetic records before launch; a backup that has never been restored is unproven.
