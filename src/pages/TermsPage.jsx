import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowUp } from 'lucide-react';
import { Link } from 'react-router-dom';

const sectionNav = [
  { id: 'who-we-are', label: 'Who We Are' },
  { id: 'services-we-provide', label: 'Services We Provide' },
  { id: 'free-brand-review', label: 'Free Brand Review' },
  { id: 'artificial-intelligence-disclosure', label: 'AI Disclosure' },
  { id: 'the-unseen-playbook', label: 'The Unseen Playbook' },
  { id: 'refund-policy', label: 'Refund Policy' },
  { id: 'payments-and-pricing', label: 'Payments & Pricing' },
  { id: 'strategy-call-bookings', label: 'Strategy Call Bookings' },
  { id: 'paid-agency-services', label: 'Paid Agency Services' },
  { id: 'intellectual-property', label: 'Intellectual Property' },
  { id: 'acceptable-use', label: 'Acceptable Use' },
  { id: 'limitation-of-liability', label: 'Limitation of Liability' },
  { id: 'third-party-links-and-services', label: 'Third Party Links & Services' },
  { id: 'data-deletion', label: 'Data Deletion' },
  { id: 'changes-to-these-terms', label: 'Changes to These Terms' },
  { id: 'governing-law', label: 'Governing Law' },
  { id: 'contact', label: 'Contact' },
];

export default function TermsPage() {
  const [activeSection, setActiveSection] = useState(sectionNav[0].id);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });

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
                Effective Date: 26 October 2026 · Notice version 2026-10-26
              </p>
              <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-zinc-950 sm:text-5xl dark:text-white">
                Terms of Service
              </h1>
              <p className="mt-5 max-w-2xl text-[15px] leading-7 text-zinc-600 sm:text-base sm:leading-8 dark:text-zinc-300">
                These Terms of Service govern services offered by The Marketing Haven (&quot;TMH&quot;, &quot;we&quot;, &quot;our&quot;). Read them before submitting a review, starting a Haven conversation or purchasing a product. The Privacy Policy separately explains our handling of personal data. Accepting these terms does not waive your data protection or other statutory rights, or provide blanket consent to unrelated uses of your information.
              </p>
            </div>

            <div className="space-y-12 px-6 py-10 sm:px-10 sm:py-14">
              <section id="who-we-are" className="scroll-mt-10">
                <h2 className="text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl dark:text-white">1. Who We Are</h2>
                <div className="mt-4 space-y-4 text-[15px] leading-7 text-zinc-600 sm:text-base sm:leading-8 dark:text-zinc-300">
                  <p>
                    The Marketing Haven is a digital marketing agency based in Nigeria. TMH operates as a business unit of Move Multi Brand (MMB), a company registered in Nigeria under RC 26338986. All agreements are entered into through The Marketing Haven as the contracting entity, under the authority of MMB.
                  </p>
                  <p>
                    Contact: info@themarketinghaven.xyz.
                  </p>
                </div>
              </section>

              <section id="services-we-provide" className="scroll-mt-10">
                <h2 className="text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl dark:text-white">2. Services We Provide</h2>
                <div className="mt-4 space-y-4 text-[15px] leading-7 text-zinc-600 sm:text-base sm:leading-8 dark:text-zinc-300">
                  <p>The Marketing Haven offers:</p>
                  <ul className="list-disc space-y-1 pl-5 marker:text-zinc-400 dark:marker:text-zinc-500">
                    <li>Free brand diagnostic reviews through Haven AI</li>
                    <li>Free strategy calls booked through Calendly</li>
                    <li>The Unseen Playbook, a paid digital product</li>
                    <li>Paid agency services including website builds, landing pages, VSL funnels, ad copywriting, content strategy, brand positioning, marketing consultancy, paid ads, and branding</li>
                  </ul>
                </div>
              </section>

              <section id="free-brand-review" className="scroll-mt-10">
                <h2 className="text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl dark:text-white">3. Free Brand Review</h2>
                <div className="mt-4 space-y-4 text-[15px] leading-7 text-zinc-600 sm:text-base sm:leading-8 dark:text-zinc-300">
                  <p>
                    The free brand review is provided at no cost. Haven AI conducts a conversational diagnostic and offers strategic direction based on the information you provide. Results depend on the accuracy of your inputs. The review is not a guarantee of any specific business outcome and is not a substitute for a professional consulting engagement.
                  </p>
                  <p>
                    <span className="font-semibold text-zinc-900 dark:text-white">Scores and diagnoses are AI-generated approximations, not fixed measurements.</span> Running the same review more than once may produce a slightly different score, or a different shade of the same underlying diagnosis. Treat the score as directional information, not an absolute or certified result. You are free to accept, reject, or ignore any part of the review, and nothing in the review constitutes legal, financial, medical, or other professional advice.
                  </p>
                  <p>
                    <span className="font-semibold text-zinc-900 dark:text-white">Saved conversations and team access.</span> Brand review, support and service chats, including messages and responses, are saved on our backend and can be viewed by TMH team members with admin access. When valid private access proof links your browser to a saved review, its conversations appear together under that lead. Guest chats without that proof are shown separately and do not verify an email identity. We use these records to provide support, prepare requested services and calls, handle errors and complaints, and review safety and quality. Our Privacy Policy explains the purposes, lawful bases and your rights; these terms alone do not authorize unrelated monitoring.
                  </p>
                </div>
              </section>

              <section id="artificial-intelligence-disclosure" className="scroll-mt-10">
                <h2 className="text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl dark:text-white">4. Artificial Intelligence Disclosure</h2>
                <div className="mt-4 space-y-4 text-[15px] leading-7 text-zinc-600 sm:text-base sm:leading-8 dark:text-zinc-300">
                  <p>
                    Haven is an artificial intelligence system serving individual creators and business or brand owners. It can produce incomplete or inaccurate responses. Apply your judgement and ask the team for clarification when needed. A recommendation to buy the Playbook or book a call is optional; you do not have to purchase or book to express a concern about your review.
                  </p>
                  <p>
                    Haven&apos;s advice does not automatically place an order or book a call for you. Scores and diagnoses are directional and may vary; they are not promises of revenue or business success. Automated misuse detection can raise a warning for team review, as described below. You can challenge a score or flag and ask for a person to review it by emailing info@themarketinghaven.xyz.
                  </p>
                </div>
              </section>

              <section id="the-unseen-playbook" className="scroll-mt-10">
                <h2 className="text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl dark:text-white">5. The Unseen Playbook</h2>
                <div className="mt-4 space-y-4 text-[15px] leading-7 text-zinc-600 sm:text-base sm:leading-8 dark:text-zinc-300">
                  <p>
                    The Unseen Playbook is a digital product delivered as a PDF. When you purchase it, you receive a personal licence to read and use the material for your own business or personal development. This licence may not be transferred, resold, shared publicly, or used to create derivative products. All content remains the intellectual property of The Marketing Haven.
                  </p>
                  <p>
                    <span className="font-semibold text-zinc-900 dark:text-white">Purchasing is optional.</span> The Playbook is an educational product, not a guarantee of an outcome. A recommendation from Haven does not require you to buy it. Your applicable consumer rights remain in place whether a purchase follows an AI conversation or another part of this website.
                  </p>
                </div>
              </section>

              <section id="refund-policy" className="scroll-mt-10">
                <h2 className="text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl dark:text-white">6. Refund Policy</h2>
                <div className="mt-4 space-y-4 text-[15px] leading-7 text-zinc-600 sm:text-base sm:leading-8 dark:text-zinc-300">
                  <p>Subject to applicable consumer law, our policy is not to offer change-of-mind refunds after a completed digital purchase has been made available and accessed.</p>
                  <p>If your download fails, you believe you were charged in error, or the product has a problem, contact info@themarketinghaven.xyz so that we can investigate. Nothing in this policy removes a refund, remedy or other statutory right that cannot lawfully be excluded.</p>
                </div>
              </section>

              <section id="payments-and-pricing" className="scroll-mt-10">
                <h2 className="text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl dark:text-white">7. Payments and Pricing</h2>
                <div className="mt-4 space-y-4 text-[15px] leading-7 text-zinc-600 sm:text-base sm:leading-8 dark:text-zinc-300">
                  <p>Payments for The Unseen Playbook are processed by Paystack. We do not receive or store your card details. By making a payment, you agree to Paystack&apos;s own terms of service. The price shown at checkout is the price charged.</p>
                  <p><span className="font-semibold text-zinc-900 dark:text-white">No discounts and no haggling.</span> The listed price is the price. We do not offer discounts, coupon codes, or price reductions through chat, direct message, or negotiation on any platform. Any exception to this, if one is ever offered, will be published clearly on this website in advance and will apply equally to all buyers. Anyone claiming to offer a discount on our behalf is not authorized to do so.</p>
                </div>
              </section>

              <section id="strategy-call-bookings" className="scroll-mt-10">
                <h2 className="text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl dark:text-white">8. Strategy Call Bookings</h2>
                <p className="mt-4 text-[15px] leading-7 text-zinc-600 sm:text-base sm:leading-8 dark:text-zinc-300">
                  Strategy calls are free and follow the duration and availability shown in Calendly. We may need to reschedule or cancel a call with reasonable notice. Repeatedly missing calls without notice may lead to a review of booking access. When you provide a booking email, we record it to prepare for the call and match booking records to a prior review where appropriate. Providing an email for booking does not grant access to someone else&apos;s chat history.
                </p>
              </section>

              <section id="paid-agency-services" className="scroll-mt-10">
                <h2 className="text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl dark:text-white">9. Paid Agency Services</h2>
                <p className="mt-4 text-[15px] leading-7 text-zinc-600 sm:text-base sm:leading-8 dark:text-zinc-300">
                  Paid services such as website builds, funnels, ad copywriting, and branding are governed by separate written agreements issued at the time of engagement. Those agreements define the scope of work, deliverables, timelines, and payment terms. These Terms of Service do not override any provision in a signed service agreement.
                </p>
              </section>

              <section id="intellectual-property" className="scroll-mt-10">
                <h2 className="text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl dark:text-white">10. Intellectual Property</h2>
                <p className="mt-4 text-[15px] leading-7 text-zinc-600 sm:text-base sm:leading-8 dark:text-zinc-300">
                  All content on this website, including Haven AI&apos;s responses, The Unseen Playbook, brand assets, copy, design, code, and framework, is the intellectual property of The Marketing Haven. You may not reproduce, distribute, or create derivative works without written permission, except where the law allows for personal, non commercial use.
                </p>
              </section>

              <section id="acceptable-use" className="scroll-mt-10">
                <h2 className="text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl dark:text-white">11. Acceptable Use</h2>
                <div className="mt-4 space-y-4 text-[15px] leading-7 text-zinc-600 sm:text-base sm:leading-8 dark:text-zinc-300">
                  <p>
                    You agree not to misuse this website. The following are prohibited and constitute a material breach of these terms:
                  </p>
                  <ul className="list-disc space-y-1 pl-5 marker:text-zinc-400 dark:marker:text-zinc-500">
                    <li>Sexual, romantic, or otherwise inappropriate content directed at Haven AI, any TMH team member, or the team generally</li>
                    <li>Attempting to extract personal, private, or non-public information about any TMH team member or about the company&apos;s internal operations, contracts, clients, or unreleased plans</li>
                    <li>Harassment, threats, hate speech, or abusive language of any kind</li>
                    <li>Deliberate mockery, trolling, spam, or misuse of the platform for anything outside brand, marketing, and business context</li>
                    <li>Attempting to break into our systems, uploading malicious files, or impersonating anyone else</li>
                  </ul>
                  <p>
                    <span className="font-semibold text-zinc-900 dark:text-white">Warnings and team alerts.</span> Automated misuse detection records a first strike, issues a yellow warning on the second distinct abusive message, and applies a red restriction on the third. Yellow and red transitions alert the TMH team through Resend. Administrators can review the context and clear or change a restriction. Specific criticism and legitimate complaints are not misuse. Warning and restriction emails may be sent where a linked email is available; guest notices can appear in the chat instead. A flag is an assessment that can be mistaken, not proof of unlawful conduct.
                  </p>
                  <p>
                    <span className="font-semibold text-zinc-900 dark:text-white">Review and appeal.</span> If access is restricted, email info@themarketinghaven.xyz to explain the context and request human review. We may retain relevant safety records where necessary and lawful and respond to valid legal requests. A chat restriction does not itself remove statutory consumer rights or automatically cancel an existing purchase or separate service agreement.
                  </p>
                </div>
              </section>

              <section id="limitation-of-liability" className="scroll-mt-10">
                <h2 className="text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl dark:text-white">12. Limitation of Liability</h2>
                <div className="mt-4 space-y-4 text-[15px] leading-7 text-zinc-600 sm:text-base sm:leading-8 dark:text-zinc-300">
                  <p>
                    Haven guidance and free strategy calls do not guarantee business outcomes. You remain responsible for assessing decisions for your business. To the extent permitted by applicable law, our total liability relating to a particular service is limited to the amount paid for that service. No limit in these terms applies where the law does not allow it.
                  </p>
                  <p>
                    Nothing in these terms excludes rights or liabilities that cannot lawfully be excluded, including applicable data protection and consumer rights. If an AI response or service has caused a concern, contact the team so that it can be reviewed.
                  </p>
                </div>
              </section>

              <section id="third-party-links-and-services" className="scroll-mt-10">
                <h2 className="text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl dark:text-white">13. Third Party Links and Services</h2>
                <p className="mt-4 text-[15px] leading-7 text-zinc-600 sm:text-base sm:leading-8 dark:text-zinc-300">
                  This website links to and integrates with services we do not own, including Calendly, Paystack, and TikTok. We are not responsible for the content, policies, or practices of those services. When you use them, their own terms apply.
                </p>
              </section>

              <section id="data-deletion" className="scroll-mt-10">
                <h2 className="text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl dark:text-white">14. Data Deletion</h2>
                <div className="mt-4 space-y-4 text-[15px] leading-7 text-zinc-600 sm:text-base sm:leading-8 dark:text-zinc-300">
                  <p>
                    You may request access, correction, deletion or restriction of personal data, subject to applicable conditions. Use the footer Data Deletion link for an email-associated saved review, or email info@themarketinghaven.xyz with the subject &quot;Privacy Request&quot;.
                  </p>
                  <p>
                    The automated email-confirmed flow targets the matching saved brand review, its linked chat sessions and stored screenshots. It does not automatically delete purchase or booking records, unlinked guest chats, deletion-request records or every security, operational and email-delivery record. Contact the team about those categories and any lawful need to retain them. For guest chats without an associated email, provide the session ID and ask for a secure ownership-verification method; the ID or a typed email alone is not sufficient proof. Do not email private access keys.
                  </p>
                  <p>
                    Providers including Paystack, Calendly and Resend maintain their own records under their terms and applicable requirements. We will explain the scope of a request and any retention reason rather than promise that every copy held by every service has been erased. See the Privacy Policy for your rights under the Nigeria Data Protection Act 2023, including human review and a complaint to the NDPC.
                  </p>
                </div>
              </section>

              <section id="changes-to-these-terms" className="scroll-mt-10">
                <h2 className="text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl dark:text-white">15. Changes to These Terms</h2>
                <p className="mt-4 text-[15px] leading-7 text-zinc-600 sm:text-base sm:leading-8 dark:text-zinc-300">
                  We may update these terms from time to time. When we do, we will change the effective date at the top of this page. Continued use of the site after an update means you accept the updated terms.
                </p>
              </section>

              <section id="governing-law" className="scroll-mt-10">
                <h2 className="text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl dark:text-white">16. Governing Law</h2>
                <p className="mt-4 text-[15px] leading-7 text-zinc-600 sm:text-base sm:leading-8 dark:text-zinc-300">
                  These terms are governed by the laws of the Federal Republic of Nigeria. Any dispute arising from the use of this website or its services will be subject to the jurisdiction of Nigerian courts.
                </p>
              </section>

              <section id="contact" className="scroll-mt-10">
                <h2 className="text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl dark:text-white">17. Contact</h2>
                <p className="mt-4 text-[15px] leading-7 text-zinc-600 sm:text-base sm:leading-8 dark:text-zinc-300">
                  The Marketing Haven<br />
                  A business unit of Move Multi Brand (RC 26338986)<br />
                  Email: info@themarketinghaven.xyz<br />
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
            <nav aria-label="Terms of service sections" className="sticky top-10 rounded-2xl border border-zinc-200 bg-zinc-100/70 p-4 backdrop-blur-xl dark:border-white/[0.08] dark:bg-white/[0.03]">
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
