import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowUp } from 'lucide-react';
import { Link } from 'react-router-dom';

const sectionNav = [
  { id: 'who-we-are', label: 'Who We Are' },
  { id: 'information-we-collect', label: 'Information We Collect' },
  { id: 'how-we-use-your-information', label: 'How We Use Your Information' },
  { id: 'artificial-intelligence-processing', label: 'AI Processing' },
  { id: 'service-providers', label: 'Service Providers' },
  { id: 'cookies-and-local-storage', label: 'Cookies & Local Storage' },
  { id: 'data-storage-and-security', label: 'Data Storage & Security' },
  { id: 'data-retention', label: 'Data Retention' },
  { id: 'your-rights', label: 'Your Rights' },
  { id: 'children', label: 'Children' },
  { id: 'changes-to-this-policy', label: 'Changes to This Policy' },
  { id: 'contact', label: 'Contact' },
];

export default function PrivacyPage() {
  const [activeSection, setActiveSection] = useState(sectionNav[0].id);

  useEffect(() => {
    const target=sectionNav.some(section=>'#'+section.id===window.location?.hash)?document.getElementById(window.location.hash.slice(1)):null;
    if(target)target.scrollIntoView({behavior:'instant',block:'start'});else window.scrollTo({ top: 0, behavior: 'auto' });

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntry = entries.find((entry) => entry.isIntersecting);
        if (visibleEntry) setActiveSection(visibleEntry.target.id);
      },
      { rootMargin: '-18% 0px -68% 0px', threshold: 0 },
    );

    const sections = sectionNav
      .map(({ id }) => document.getElementById(id))
      .filter(Boolean);

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  return (
    <main className="min-h-screen scroll-smooth bg-white text-zinc-900 transition-colors duration-300 dark:bg-zinc-950 dark:text-zinc-100">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10"
      >
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm font-medium text-zinc-600 transition-colors hover:text-blue-600 dark:text-zinc-400 dark:hover:text-blue-400"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to site
        </Link>

        <div className="mt-10 grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_14rem] lg:gap-16">
          <article className="overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-100/70 backdrop-blur-xl dark:border-white/[0.08] dark:bg-white/[0.03]">
            <div className="border-b border-zinc-200 px-6 py-10 sm:px-10 sm:py-14 dark:border-white/[0.08]">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                Effective Date: 26 October 2026 · Updated: 5 November 2026 · Chat notice version 2026-10-26
              </p>
              <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-zinc-950 sm:text-5xl dark:text-white">
                Privacy Policy
              </h1>
              <p className="mt-5 max-w-2xl text-[15px] leading-7 text-zinc-600 sm:text-base sm:leading-8 dark:text-zinc-300">
                The Marketing Haven (&quot;TMH&quot;, &quot;we&quot;, &quot;our&quot;) operates this website, Haven AI, and the services offered here. This notice explains what we collect, how conversations are saved and reviewed, and how to exercise your rights. Reading or acknowledging this notice is not blanket consent to every use of your data and does not waive your privacy rights.
              </p>
            </div>

            <div className="space-y-12 px-6 py-10 sm:px-10 sm:py-14">
              <section id="who-we-are" className="scroll-mt-10">
                <h2 className="text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl dark:text-white">1. Who We Are</h2>
                <div className="mt-4 space-y-4 text-[15px] leading-7 text-zinc-600 sm:text-base sm:leading-8 dark:text-zinc-300">
                  <p>
                    The Marketing Haven is a digital marketing agency based in Nigeria. TMH operates as a business unit of Move Multi Brand (MMB), a company registered in Nigeria under RC 26338986. All data processing described in this policy is carried out by The Marketing Haven under the authority of MMB.
                  </p>
                  <p>
                    For the purposes of this policy, The Marketing Haven is the entity responsible for the personal data you submit through this website. You can contact us at info@themarketinghaven.xyz for any privacy concern.
                  </p>
                </div>
              </section>

              <section id="information-we-collect" className="scroll-mt-10">
                <h2 className="text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl dark:text-white">2. Information We Collect</h2>
                <div className="mt-4 space-y-4 text-[15px] leading-7 text-zinc-600 sm:text-base sm:leading-8 dark:text-zinc-300">
                  <p>We collect the following categories of information:</p>
                  <p>
                    <span className="font-semibold text-zinc-900 dark:text-white">Information you provide directly:</span> your full name, email address, phone number or WhatsApp number, brand or business name, website URL, social media handles, screenshots you upload, and any messages you send to Haven AI or through the brand review form.
                  </p>
                  <p>
                    <span className="font-semibold text-zinc-900 dark:text-white">Visit and service information:</span> device type, visit count, first visit timestamp, traffic source such as UTM parameters, referring website, chat timestamps, session identifiers, interaction counts, and the date and version of the chat notice acknowledged. Hosting, security and AI providers may also process IP addresses and technical logs. A guest conversation does not require an email address, but anything identifying you in its messages remains personal data.
                  </p>
                  <p>
                    <span className="font-semibold text-zinc-900 dark:text-white">Information from payments:</span> Paystack processes purchases of The Unseen Playbook. We store the buyer email, payment reference, amount, purchase date, and thank-you email delivery metadata such as provider acceptance, attempts and errors. We do not receive or store your card details. Playbook recovery confirms control of the checkout inbox using a six-digit code that expires after 10 minutes. Codes are stored as keyed hashes, not readable codes; verified device grants expire after 30 days and can be revoked.
                  </p>
                  <p>
                    <span className="font-semibold text-zinc-900 dark:text-white">Saved review access:</span> the current service permits one saved brand review per email address. This is a saved record, not a password-based account. Private access keys stored in your browser let you return to that review. Typing an email address alone does not grant access to its review or conversations. Clearing browser data or changing devices can remove that access; contact the team for help recovering it.
                  </p>
                  <p>
                    <span className="font-semibold text-zinc-900 dark:text-white">Support and service conversations:</span> we save brand review, support and service chat messages, their responses and session metadata on our backend. Short excerpts of business facts you provide may be kept with that conversation so Haven can follow the discussion after it grows longer. These notes are scoped to that conversation and are removed when its server record is deleted. Guest chats use a private browser key and a visitor identifier; they are not verified email accounts. When your browser supplies valid proof of access to a saved review, its support and service chats can be linked to that lead, including earlier guest chats associated with the same verified browser identity. We do not link chat histories merely because someone types a matching email address.
                  </p>
                  <p>
                    <span className="font-semibold text-zinc-900 dark:text-white">Strategy call booking email:</span> when you initiate a booking through the Services section or the chat drawer, we record the email you provide so we can prepare for the call and match it to any prior review you may have submitted.
                  </p>
                </div>
              </section>

              <section id="how-we-use-your-information" className="scroll-mt-10">
                <p className="mb-5 text-[15px] leading-7 text-zinc-600 dark:text-zinc-300"><span className="font-semibold text-zinc-900 dark:text-white">Support requests:</span> our <Link to="/support" className="underline underline-offset-4">support form</Link> records your contact email, optional name, issue category, description and request reference. Where your browser proves access to a saved visitor identity, we attach that identifier. We also keep a keyed network identifier for abuse prevention and limited attempt resets; it is not your raw IP address. A typed contact email does not verify ownership or unlock private records. Authorized staff can view requests, record notes and take audited recovery actions. If the Zoho incoming-mail integration is enabled, we also record sender, subject, received time and a message identifier; it does not import attachments or the full email body. Separate emails remain in the mail provider under its retention settings.</p>
                <h2 className="text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl dark:text-white">3. How We Use Your Information</h2>
                <div className="mt-4 space-y-4 text-[15px] leading-7 text-zinc-600 sm:text-base sm:leading-8 dark:text-zinc-300">
                  <p>Your information is used to:</p>
                  <ul className="list-disc space-y-1 pl-5 marker:text-zinc-400 dark:marker:text-zinc-500">
                    <li>Run your brand diagnostic review through Haven AI</li>
                    <li>Generate tailored strategic recommendations for your brand</li>
                    <li>Deliver products you have paid for, including The Unseen Playbook</li>
                    <li>Send you a payment receipt through Paystack</li>
                    <li>Send transactional messages about your review, purchase or booking</li>
                    <li>Prepare for strategy calls you have booked</li>
                    <li>Make saved brand review, support and service conversations available to the TMH team in the internal admin dashboard for support, service preparation, quality review and safety</li>
                    <li>Monitor for abuse, misuse, harassment, or violations of our Terms of Service</li>
                    <li>Improve the accuracy and usefulness of Haven AI over time</li>
                    <li>Contact you with follow-up information relevant to your review</li>
                    <li>If you opt in at Playbook checkout, send one check-in email about 24 hours after payment with application guidance and a link to our services. You can decline at checkout or cancel using the link in that email.</li>
                  </ul>
                  <p>We do not sell your personal information. We do not share it with advertising networks.</p>
                  <p>
                    <span className="font-semibold text-zinc-900 dark:text-white">Purposes and lawful bases:</span> we process information needed to respond to your requests, provide the review or chat service, and fulfil purchases or bookings as part of providing those services or taking steps you request before an agreement. Proportionate security, abuse prevention, complaint handling and service reliability are pursued as legitimate interests, subject to your rights and an assessment of those interests. We also retain information where a legal obligation requires it. If a particular use relies on consent, that consent must be requested separately and can be withdrawn; acknowledging the chat notice is not permission for unrelated marketing.
                  </p>
                </div>
              </section>

              <section id="artificial-intelligence-processing" className="scroll-mt-10">
                <p className="mb-5 text-[15px] leading-7 text-zinc-600 dark:text-zinc-300">Haven uses functional platform context to help you: the current service conversation, your securely linked review, cryptographically verified Playbook access, and an active or pending booking linked to your browser or verified review. The AI receives a limited summary, such as whether access is verified and the scheduled call times, rather than your private access keys, payment card details or receipt reference. A pending booking means a booking page was opened; a download request does not prove a file saved, and a scheduled meeting does not prove attendance. Booking updates can be delayed while Calendly syncs. We do not infer ownership from a typed email, and Haven cannot automatically identify every purchase or booking on another device. This functional context works separately from optional analytics; declining analytics does not disable purchase recovery, chat or booking protection.</p>
                <p className="mb-5 text-[15px] leading-7 text-zinc-600 dark:text-zinc-300">We apply daily AI call and token allowances to saved reviews, browser identities, keyed network references and the service as a whole. Counters and reservations protect availability and cost. A temporary pause or cooldown does not establish misconduct. Relevant sections of our curated knowledge are selected for each question; private Playbook guidance still requires server verification of purchase. Aggregate Insights group route interest, saved review link clicks, leak labels and first-message topics. They do not display original first messages or identify visitors.</p>
                <h2 className="text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl dark:text-white">4. Artificial Intelligence Processing</h2>
                <div className="mt-4 space-y-4 text-[15px] leading-7 text-zinc-600 sm:text-base sm:leading-8 dark:text-zinc-300">
                  <p>
                    Haven uses Google&apos;s Gemini models as its primary AI provider and Groq as a fallback when the primary provider is unavailable. Relevant messages, brand information, extracted website content and uploaded screenshots are shared with the configured provider to produce a response or score. Image-based reviews may be unavailable when an appropriate image-processing provider is not enabled; you can continue by describing your situation in chat. Do not include passwords, payment card details, sensitive personal information or confidential third-party material in a chat or screenshot.
                  </p>
                  <p>
                    Provider retention, human review and model-improvement practices depend on the provider, service tier and account settings. Google&apos;s unpaid Gemini API terms allow submitted content and responses to be used to improve products and machine learning, with possible human review. During the current testing phase, TMH may use this unpaid tier; paid-service data-use terms apply only after the corresponding account configuration is active. This setting is not a guarantee about every provider&apos;s handling of data. See <a href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">Google&apos;s Gemini API terms</a> for the paid/unpaid distinction. Ask us about current provider settings before submitting material that requires specific confidentiality assurances.
                  </p>
                  <p>
                    Because Haven&apos;s outputs are generated by a probabilistic AI system, the same input may produce slightly different results on different runs. This applies to scores, diagnoses, and recommendations. AI outputs are directional guidance, not certified measurements or professional advice.
                  </p>
                  <p>
                    <span className="font-semibold text-zinc-900 dark:text-white">Human review of conversations:</span> TMH team members with admin access can read saved messages and responses from all three chat scopes, view submitted review details, and inspect payment and email-delivery records. Linked chats appear together under the saved lead; other guest chats appear separately. This is not a conversation visible only to an AI. Team review is intended for responding to enquiries, preparing services and calls, handling errors and complaints, and proportionate safety and quality review.
                  </p>
                  <p>
                    <span className="font-semibold text-zinc-900 dark:text-white">Flags and review:</span> automated misuse detection records a first strike, issues a yellow warning on the second distinct abusive message, and restricts access with a red flag on the third. Administrators can review the context and clear or change a flag. Specific criticism and legitimate complaints are not misuse. Warning, restriction and internal alert emails are sent through Resend where an appropriate email is available; guest notices can be shown in the chat instead. Alerts may include a known name, email or visitor identifier, chat source, session ID, status and reason. A flag can be wrong. To challenge a warning, restriction or score and request human review, email info@themarketinghaven.xyz. Acknowledging this policy does not make automated assessments conclusive.
                  </p>
                </div>
              </section>

              <section id="service-providers" className="scroll-mt-10">
                <h2 className="text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl dark:text-white">5. Service Providers We Work With</h2>
                <div className="mt-4 space-y-4 text-[15px] leading-7 text-zinc-600 sm:text-base sm:leading-8 dark:text-zinc-300">
                  <p>To operate this website we rely on the following third parties, each of which may process parts of your data:</p>
                  <ul className="list-disc space-y-1 pl-5 marker:text-zinc-400 dark:marker:text-zinc-500">
                    <li><span className="font-semibold text-zinc-900 dark:text-white">Supabase:</span> review and chat records, private file storage, access verification and backend functions.</li>
                    <li><span className="font-semibold text-zinc-900 dark:text-white">Paystack:</span> payment processing and receipts for The Unseen Playbook.</li>
                    <li><span className="font-semibold text-zinc-900 dark:text-white">Google (Gemini):</span> artificial intelligence processing for Haven and brand review scoring.</li>
                    <li><span className="font-semibold text-zinc-900 dark:text-white">Groq:</span> fallback AI processing when the primary model is unavailable.</li>
                    <li><span className="font-semibold text-zinc-900 dark:text-white">Jina AI:</span> reads your website URL when you request a website brand review.</li>
                    <li><span className="font-semibold text-zinc-900 dark:text-white">Calendly:</span> handles bookings for free strategy calls.</li>
                    <li><span className="font-semibold text-zinc-900 dark:text-white">Resend:</span> transactional purchase, booking, warning, restriction and team-alert emails, with delivery metadata.</li>
                    <li><span className="font-semibold text-zinc-900 dark:text-white">Operational monitoring:</span> Sentry receives restricted technical error reports when configured; session replay and automatic collection of chat content, identities, cookies and payment details are disabled in our integration. The provider still handles the network connection used to deliver an event. UptimeRobot checks public availability URLs. IPinfo can estimate a city from a staff sign-in IP for security alerts; this is not a precise location or proof of a person&apos;s identity.</li>
                    <li><span className="font-semibold text-zinc-900 dark:text-white">Zoho Mail:</span> our support inbox and replies; when configured, incoming-mail metadata can create an admin support notice. Team email notifications include limited request details.</li>
                    <li><span className="font-semibold text-zinc-900 dark:text-white">hCaptcha:</span> verifies that form submissions come from real visitors and not automated bots.</li>
                    <li><span className="font-semibold text-zinc-900 dark:text-white">Netlify:</span> hosts this website.</li>
                  </ul>
                  <p>These providers have their own terms and retention practices. Some processing and storage may occur outside Nigeria. Contact us for information about the providers, locations and transfer safeguards relevant to your request. Publishing this notice is not itself consent to unrestricted international transfers.</p>
                </div>
              </section>

              <section id="cookies-and-local-storage" className="scroll-mt-10">
                <p className="mb-4 text-[15px] leading-7 text-zinc-600 dark:text-zinc-300">With optional analytics consent, we also count views of six named homepage sections and actions on their links or buttons. A view requires at least two seconds of visibility. We send only the section identifier and event type with the separate analytics profile proof. Short-lived receipts prevent duplicate daily counts and expire after two days; daily section totals contain no visitor identifiers and expire after 395 days. We do not collect clicked link text, destination URLs, form contents or a browsing-path history for this measurement. Declining or withdrawing optional consent stops it.</p>
                <p className="mb-4 text-[15px] leading-7 text-zinc-600 dark:text-zinc-300">Optional visit analytics stay off until you accept the current notice and that choice is recorded. We ask again after 13 calendar months, or when an old affirmative choice has no current dated receipt. Declining does not stop reviews, purchases or support. If you accept, first-party presence records use a separate browser identifier and private token digest, with first and last activity times. Visible pages send an occasional heartbeat. Admin sees aggregate counts of consented browser profiles and recent activity, not a list of everyone online, identities of people, email addresses or a browsing-path history. Withdrawing the choice stops future heartbeats; retained records expire after 13 months without activity.</p>
                <h2 className="text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl dark:text-white">6. Cookies and Local Storage</h2>
                <div className="mt-4 space-y-4 text-[15px] leading-7 text-zinc-600 sm:text-base sm:leading-8 dark:text-zinc-300">
                  <p>We use browser cookies and local storage to run this website. Specifically:</p>
                  <ul className="list-disc space-y-1 pl-5 marker:text-zinc-400 dark:marker:text-zinc-500">
                    <li>A consent flag that remembers whether you have accepted or declined cookie use</li>
                    <li>Visit counters, traffic-source information and theme preferences</li>
                    <li>Haven AI conversation history so that you can return to an in-progress chat</li>
                    <li>Private review and guest-chat access keys, pending form retries, and notice acknowledgments</li>
                    <li>Purchase references and private device access keys used to request a verified Playbook download again. A prepared checkout can be saved before payment completes so an interrupted window can be checked safely. A saved reference alone is not proof of payment. Reader access is separately verified before private Playbook guidance is available to Haven.</li>
                    <li>For team admins, a random browser identifier used to recognize returning browsers for security alerts. It remains until browser storage is cleared and does not grant account access.</li>
                  </ul>
                  <p>Optional visit counters and traffic attribution are collected only after you accept cookies. Declining removes the local visit counter and its first-visit timestamp; necessary chat access keys and service storage remain available. You can withdraw that choice by clearing the cookie preference and choosing Decline when the banner returns. Clearing local or session storage can remove access keys, drafts and locally saved chat history. It does not delete server records. Use the deletion process below for server data, and do not share private access keys with anyone.</p>
                </div>
              </section>

              <section id="data-storage-and-security" className="scroll-mt-10">
                <p className="mb-5 text-[15px] leading-7 text-zinc-600 dark:text-zinc-300">Staff security records include sign-in time, a general browser and operating system label, observed IP address and, when configured through IPinfo, an approximate city. A browser identifier not seen for 30 days can trigger an alert to the authorized admin team. A change of IP address alone does not create a new browser. Sign-in device and activity records expire after 30 days. Authenticator backup codes are stored as keyed hashes and are single use. Destructive staff requests require approval by a different current admin and leave an audit record. Optional Sentry error reporting sends a restricted technical event without request bodies, emails, tokens, chat text or password fields. Error tracking is disabled when its connection is not configured.</p>
                <p className="mb-4 text-[15px] leading-7 text-zinc-600 dark:text-zinc-300">Authorized staff actions are recorded in an internal audit trail using the staff account identifier, action, record reference, changed field names, time and a keyed network identifier. The audit does not copy full private notes, passwords, tokens or raw IP addresses. Server-side AI request budgets and operational diagnostics help prevent abuse and excessive spending. If a personal data incident occurs, we assess it and make the notifications required by applicable law.</p>
                <h2 className="text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl dark:text-white">7. Data Storage and Security</h2>
                <p className="mt-4 text-[15px] leading-7 text-zinc-600 sm:text-base sm:leading-8 dark:text-zinc-300">
                  Records are stored in Supabase with row level security and protected backend access checks. Review screenshots are stored in a private bucket. The admin workspace can expose personal information to people holding its access credentials, so those credentials and browser access keys must be protected. Payment card details are handled by Paystack. No website can promise absolute security; contact us if you believe information or an access key has been exposed.
                </p>
              </section>

              <section id="data-retention" className="scroll-mt-10">
                <p className="mb-4 text-[15px] leading-7 text-zinc-600 dark:text-zinc-300">Conversation text, turn responses, compact memory and routing evidence are scheduled for removal after 180 days without session activity. Minimal session, saved-review and ownership metadata can remain for the service and operational purposes described here. Optional analytics consent receipts are scheduled for removal after two years; inactive presence profiles expire after 13 months. Browser-local copies and records held by providers follow their separate controls. Contact us for an access, correction, portability, objection or restriction request; these categories may require human ownership verification and are not all automated by the review-deletion button.</p>
                <p className="mb-4 text-[15px] leading-7 text-zinc-600 dark:text-zinc-300">Resolved website support requests and their action history are scheduled for removal 90 days after the last update. Open requests remain until resolved or reviewed for deletion. Contact us about a support record or email held by a provider. A review-deletion request does not silently delete a separate support ticket. Failed screenshot removals retain a private cleanup record so the deletion can be retried.</p>
                <h2 className="text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl dark:text-white">8. Data Retention</h2>
                <div className="mt-4 space-y-4 text-[15px] leading-7 text-zinc-600 sm:text-base sm:leading-8 dark:text-zinc-300">
                  <p>Retention depends on the purpose of the record, your request and applicable obligations. We do not publish a fixed retention period for every record category here. Ask us which records remain, why they are needed and what deletion or restriction is available. The online chat viewer shows bounded saved history; this does not mean every related operational record has been erased.</p>
                  <p>
                    <span className="font-semibold text-zinc-900 dark:text-white">Abuse prevention retention.</span> If your access was restricted because of misuse, harassment, or a violation of our Terms of Service, we may retain a limited record of the abuse and your identifying information for as long as necessary to prevent further abuse and to comply with legal obligations.
                  </p>
                  <p>
                    <span className="font-semibold text-zinc-900 dark:text-white">Scope of the automated deletion flow:</span> after email confirmation, it targets the matching saved brand review, chat sessions linked to that review, and its stored screenshots. It does not automatically remove purchase records, booking records or intents, unlinked guest conversations, deletion-request records, or every operational, security and email-delivery record. Contact the team to review those categories and any lawful reason for retaining them. Providers such as Paystack, Calendly and Resend also maintain their own records under their terms and applicable requirements.
                  </p>
                </div>
              </section>

              <section id="your-rights" className="scroll-mt-10">
                <p className="mb-5 text-[15px] leading-7 text-zinc-600 dark:text-zinc-300">Use <Link to="/data-access" className="underline underline-offset-4">Download my data</Link> to request your matching saved reviews and linked chat text. After email confirmation, we email a ZIP archive to the same inbox. The confirmation link expires after 24 hours. Temporary export snapshots are removed after provider acceptance, with expired request records scheduled for cleanup. This automated flow does not include every purchase, booking, support, staff security or unlinked guest record. Contact us for those categories and a proportionate ownership check. Access, correction, deletion, restriction and portability requests remain available regardless of whether this automated flow can locate a record.</p>
                <h2 className="text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl dark:text-white">9. Your Rights</h2>
                <div className="mt-4 space-y-4 text-[15px] leading-7 text-zinc-600 sm:text-base sm:leading-8 dark:text-zinc-300">
                  <p>The Nigeria Data Protection Act 2023 and applicable law provide rights, subject to relevant conditions and exceptions, including the ability to:</p>
                  <ul className="list-disc space-y-1 pl-5 marker:text-zinc-400 dark:marker:text-zinc-500">
                    <li>Request a copy of the personal data we hold about you</li>
                    <li>Ask us to correct information that is inaccurate</li>
                    <li>Ask us to delete your information</li>
                    <li>Object to certain uses of your information</li>
                    <li>Request restriction of processing and data portability where applicable</li>
                    <li>Withdraw consent where processing relies on it, without changing the lawfulness of earlier processing</li>
                    <li>Challenge applicable automated decisions, explain your position, and ask for human intervention</li>
                    <li>Lodge a complaint with the Nigeria Data Protection Commission (NDPC)</li>
                  </ul>
                  <p>
                    <span className="font-semibold text-zinc-900 dark:text-white">Making a request:</span> use the footer Data Deletion link for a saved review associated with your email, or email info@themarketinghaven.xyz with the subject &quot;Privacy Request&quot;. A matching saved review requires email confirmation before automated deletion. For guest chats without an associated email, include the session ID and ask the team for a secure way to verify access; a typed email or session ID alone is not proof of ownership. Never send private access keys in an ordinary email. We may need proportionate verification before disclosing or deleting records, and will explain any records that cannot be removed through the automated flow.
                  </p>
                  <p>For a human review of an access restriction or a privacy concern, contact info@themarketinghaven.xyz. You can also contact the <a href="https://ndpc.gov.ng/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">Nigeria Data Protection Commission</a> and read its <a href="https://ndpc.gov.ng/faqs/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">guidance on data protection rights</a>. You do not have to give up those rights to use Haven.</p>
                </div>
              </section>

              <section id="children" className="scroll-mt-10">
                <h2 className="text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl dark:text-white">10. Children</h2>
                <p className="mt-4 text-[15px] leading-7 text-zinc-600 sm:text-base sm:leading-8 dark:text-zinc-300">
                  This service is intended for adults aged 18 or over, including individual creators and business or brand owners. If you are under 18, do not submit personal information. Contact us if you believe a child has supplied data so that we can review the record and the appropriate response.
                </p>
              </section>

              <section id="changes-to-this-policy" className="scroll-mt-10">
                <h2 className="text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl dark:text-white">11. Changes to This Policy</h2>
                <p className="mt-4 text-[15px] leading-7 text-zinc-600 sm:text-base sm:leading-8 dark:text-zinc-300">
                  We may update this notice as the service changes. The date and version appear at the top; the chat service records the version acknowledged before a conversation. Material changes will be explained through the service where appropriate. A notice update does not automatically supply consent for a new purpose that requires separate consent.
                </p>
              </section>

              <section id="contact" className="scroll-mt-10">
                <h2 className="text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl dark:text-white">12. Contact</h2>
                <p className="mt-4 text-[15px] leading-7 text-zinc-600 sm:text-base sm:leading-8 dark:text-zinc-300">
                  The Marketing Haven<br />
                  A business unit of Move Multi Brand (RC 26338986)<br />
                  Email: <a href="mailto:info@themarketinghaven.xyz" className="underline underline-offset-4">info@themarketinghaven.xyz</a><br />
                  <Link to="/support" className="underline underline-offset-4">Send a support or privacy request</Link><br />
                  Website: themarketinghaven.xyz
                </p>
              </section>
            </div>

            <footer className="flex flex-col gap-4 border-t border-zinc-200 px-6 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-10 dark:border-white/[0.08]">
              <a href="#top" onClick={(event) => { event.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="inline-flex items-center gap-2 text-sm font-medium text-zinc-600 transition-colors hover:text-blue-600 dark:text-zinc-400 dark:hover:text-blue-400">
                <ArrowUp className="h-4 w-4" />
                Back to top
              </a>
              <Link to="/" className="text-sm font-medium text-zinc-600 transition-colors hover:text-blue-600 dark:text-zinc-400 dark:hover:text-blue-400">
                Back to site
              </Link>
            </footer>
          </article>

          <aside className="hidden lg:block">
            <nav aria-label="Privacy policy sections" className="sticky top-10 rounded-2xl border border-zinc-200 bg-zinc-100/70 p-4 backdrop-blur-xl dark:border-white/[0.08] dark:bg-white/[0.03]">
              <p className="px-3 pb-3 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">On this page</p>
              <ul className="space-y-1">
                {sectionNav.map((section) => (
                  <li key={section.id}>
                    <a
                      href={`#${section.id}`}
                      aria-current={activeSection === section.id ? 'location' : undefined}
                      className={`block px-3 py-2 text-sm transition-colors ${activeSection === section.id ? 'font-semibold text-blue-600 dark:text-blue-400' : 'text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white'}`}
                    >
                      {section.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>
        </div>
      </motion.div>
    </main>
  );
}
