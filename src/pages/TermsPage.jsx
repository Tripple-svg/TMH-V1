import React, { useEffect, useState } from 'react';
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
                Effective Date: September 2026
              </p>
              <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-zinc-950 sm:text-5xl dark:text-white">
                Terms of Service
              </h1>
              <p className="mt-5 max-w-2xl text-[15px] leading-7 text-zinc-600 sm:text-base sm:leading-8 dark:text-zinc-300">
                These Terms of Service govern your use of this website and the services offered by The Marketing Haven (&quot;TMH&quot;, &quot;we&quot;, &quot;our&quot;). By using this website or interacting with Haven AI, you agree to these terms. If you do not agree, please do not use the site.
              </p>
            </div>

            <div className="space-y-12 px-6 py-10 sm:px-10 sm:py-14">
              <section id="who-we-are" className="scroll-mt-10">
                <h2 className="text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl dark:text-white">1. Who We Are</h2>
                <p className="mt-4 text-[15px] leading-7 text-zinc-600 sm:text-base sm:leading-8 dark:text-zinc-300">
                  The Marketing Haven is a digital marketing agency based in Nigeria. We operate as part of a larger organization structure and enter into all agreements through The Marketing Haven as the contracting entity. Contact: info@themarketinghaven.xyz.
                </p>
              </section>

              <section id="services-we-provide" className="scroll-mt-10">
                <h2 className="text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl dark:text-white">2. Services We Provide</h2>
                <div className="mt-4 space-y-4 text-[15px] leading-7 text-zinc-600 sm:text-base sm:leading-8 dark:text-zinc-300">
                  <p>The Marketing Haven offers:</p>
                  <ul className="list-disc space-y-1 pl-5 marker:text-zinc-400 dark:marker:text-zinc-500">
                    <li>Free brand diagnostic reviews through Haven AI</li>
                    <li>Free 25 minute strategy calls booked through Calendly</li>
                    <li>The Unseen Playbook, a paid digital product</li>
                    <li>Paid agency services including website builds, landing pages, VSL funnels, ad copywriting, content strategy, brand positioning, marketing consultancy, paid ads, and branding</li>
                  </ul>
                </div>
              </section>

              <section id="free-brand-review" className="scroll-mt-10">
                <h2 className="text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl dark:text-white">3. Free Brand Review</h2>
                <p className="mt-4 text-[15px] leading-7 text-zinc-600 sm:text-base sm:leading-8 dark:text-zinc-300">
                  The free brand review is provided at no cost. Haven AI conducts a conversational diagnostic and offers strategic direction based on the information you provide. Results depend on the accuracy of your inputs. The review is not a guarantee of any specific business outcome and is not a substitute for a professional consulting engagement.
                </p>
              </section>

              <section id="artificial-intelligence-disclosure" className="scroll-mt-10">
                <h2 className="text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl dark:text-white">4. Artificial Intelligence Disclosure</h2>
                <p className="mt-4 text-[15px] leading-7 text-zinc-600 sm:text-base sm:leading-8 dark:text-zinc-300">
                  Haven AI is an artificial intelligence system. It may occasionally produce responses that are incomplete, inaccurate, or not suitable for your specific situation. You should apply your own judgement before acting on anything Haven says. When Haven recommends a strategy call, we encourage you to take it, since a human conversation is often the right next step for anything complex.
                </p>
              </section>

              <section id="the-unseen-playbook" className="scroll-mt-10">
                <h2 className="text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl dark:text-white">5. The Unseen Playbook</h2>
                <p className="mt-4 text-[15px] leading-7 text-zinc-600 sm:text-base sm:leading-8 dark:text-zinc-300">
                  The Unseen Playbook is a digital product delivered as a PDF. When you purchase it, you receive a personal licence to read and use the material for your own business or personal development. This licence may not be transferred, resold, shared publicly, or used to create derivative products. All content remains the intellectual property of The Marketing Haven.
                </p>
              </section>

              <section id="refund-policy" className="scroll-mt-10">
                <h2 className="text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl dark:text-white">6. Refund Policy</h2>
                <div className="mt-4 space-y-4 text-[15px] leading-7 text-zinc-600 sm:text-base sm:leading-8 dark:text-zinc-300">
                  <p>All purchases of The Unseen Playbook are final. Because the product is delivered digitally and made available for download immediately upon payment confirmation, we do not offer refunds once a purchase has been completed and the download has been accessed.</p>
                  <p>If you experience a genuine technical problem with your download, or you believe you were charged in error, contact us at info@themarketinghaven.xyz. We will investigate and resolve legitimate issues. This does not extend to a general right of return on a completed digital purchase.</p>
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
                  Strategy calls are free and run for 25 minutes. We reserve the right to reschedule or cancel a call with reasonable notice. Repeatedly missing scheduled calls without notice may result in restricted booking access. Booking is handled by Calendly, and their own terms apply to the scheduling process.
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
                <p className="mt-4 text-[15px] leading-7 text-zinc-600 sm:text-base sm:leading-8 dark:text-zinc-300">
                  You agree not to misuse this website. This includes not attempting to break into our systems, not uploading malicious files, not using Haven AI to generate content that is illegal or harmful, and not impersonating anyone else. We reserve the right to restrict access if we detect misuse.
                </p>
              </section>

              <section id="limitation-of-liability" className="scroll-mt-10">
                <h2 className="text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl dark:text-white">12. Limitation of Liability</h2>
                <p className="mt-4 text-[15px] leading-7 text-zinc-600 sm:text-base sm:leading-8 dark:text-zinc-300">
                  The Marketing Haven is not liable for any business outcomes that result from acting on recommendations from Haven AI or from any free strategy call. All guidance is provided for informational purposes. You are responsible for your own business decisions. To the fullest extent permitted by law, our total liability for any claim related to this website or its services is limited to the amount you paid us, if any, for the specific service in question.
                </p>
              </section>

              <section id="third-party-links-and-services" className="scroll-mt-10">
                <h2 className="text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl dark:text-white">13. Third Party Links and Services</h2>
                <p className="mt-4 text-[15px] leading-7 text-zinc-600 sm:text-base sm:leading-8 dark:text-zinc-300">
                  This website links to and integrates with services we do not own, including Calendly, Paystack, and TikTok. We are not responsible for the content, policies, or practices of those services. When you use them, their own terms apply.
                </p>
              </section>

              <section id="changes-to-these-terms" className="scroll-mt-10">
                <h2 className="text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl dark:text-white">14. Changes to These Terms</h2>
                <p className="mt-4 text-[15px] leading-7 text-zinc-600 sm:text-base sm:leading-8 dark:text-zinc-300">
                  We may update these terms from time to time. When we do, we will change the effective date at the top of this page. Continued use of the site after an update means you accept the updated terms.
                </p>
              </section>

              <section id="governing-law" className="scroll-mt-10">
                <h2 className="text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl dark:text-white">15. Governing Law</h2>
                <p className="mt-4 text-[15px] leading-7 text-zinc-600 sm:text-base sm:leading-8 dark:text-zinc-300">
                  These terms are governed by the laws of the Federal Republic of Nigeria. Any dispute arising from the use of this website or its services will be subject to the jurisdiction of Nigerian courts.
                </p>
              </section>

              <section id="contact" className="scroll-mt-10">
                <h2 className="text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl dark:text-white">16. Contact</h2>
                <p className="mt-4 text-[15px] leading-7 text-zinc-600 sm:text-base sm:leading-8 dark:text-zinc-300">
                  The Marketing Haven<br />
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
