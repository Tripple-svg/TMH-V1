import React, { useEffect, useState } from 'react';
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
                Privacy Policy
              </h1>
              <p className="mt-5 max-w-2xl text-[15px] leading-7 text-zinc-600 sm:text-base sm:leading-8 dark:text-zinc-300">
                The Marketing Haven (&quot;TMH&quot;, &quot;we&quot;, &quot;our&quot;) operates this website, Haven AI, and the services offered here. This policy explains what information we collect, why we collect it, how we store it, and the control you have over it. By using this website, you agree to this policy.
              </p>
            </div>

            <div className="space-y-12 px-6 py-10 sm:px-10 sm:py-14">
              <section id="who-we-are" className="scroll-mt-10">
                <h2 className="text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl dark:text-white">1. Who We Are</h2>
                <p className="mt-4 text-[15px] leading-7 text-zinc-600 sm:text-base sm:leading-8 dark:text-zinc-300">
                  The Marketing Haven is a digital marketing agency based in Nigeria. We operate as part of a larger organization structure. For the purposes of this policy, The Marketing Haven is the entity responsible for the personal data you submit through this website. You can contact us at info@themarketinghaven.xyz for any privacy concern.
                </p>
              </section>

              <section id="information-we-collect" className="scroll-mt-10">
                <h2 className="text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl dark:text-white">2. Information We Collect</h2>
                <div className="mt-4 space-y-4 text-[15px] leading-7 text-zinc-600 sm:text-base sm:leading-8 dark:text-zinc-300">
                  <p>We collect the following categories of information:</p>
                  <p>
                    <span className="font-semibold text-zinc-900 dark:text-white">Information you provide directly:</span> your full name, email address, phone number or WhatsApp number, brand or business name, website URL, social media handles, screenshots you upload, and any messages you send to Haven AI or through the brand review form.
                  </p>
                  <p>
                    <span className="font-semibold text-zinc-900 dark:text-white">Information collected automatically:</span> device type and browser, approximate location (country and city derived from IP address), number of visits, first visit timestamp, traffic source (such as UTM parameters), referring website, and how you interact with Haven AI during a conversation.
                  </p>
                  <p>
                    <span className="font-semibold text-zinc-900 dark:text-white">Information from payments:</span> when you purchase The Unseen Playbook, our payment partner Paystack processes the transaction. We receive a payment reference and the email you entered. We do not receive or store your card details. Paystack handles those directly and stores them under their own security standards.
                  </p>
                </div>
              </section>

              <section id="how-we-use-your-information" className="scroll-mt-10">
                <h2 className="text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl dark:text-white">3. How We Use Your Information</h2>
                <div className="mt-4 space-y-4 text-[15px] leading-7 text-zinc-600 sm:text-base sm:leading-8 dark:text-zinc-300">
                  <p>Your information is used to:</p>
                  <ul className="list-disc space-y-1 pl-5 marker:text-zinc-400 dark:marker:text-zinc-500">
                    <li>Run your brand diagnostic review through Haven AI</li>
                    <li>Generate tailored strategic recommendations for your brand</li>
                    <li>Deliver products you have paid for, including The Unseen Playbook</li>
                    <li>Send you a payment receipt through Paystack</li>
                    <li>Send you a welcome email when you submit a brand review</li>
                    <li>Prepare for strategy calls you have booked</li>
                    <li>Improve the accuracy and usefulness of Haven AI over time</li>
                    <li>Contact you with follow-up information relevant to your review</li>
                  </ul>
                  <p>We do not sell your personal information. We do not share it with advertising networks.</p>
                </div>
              </section>

              <section id="artificial-intelligence-processing" className="scroll-mt-10">
                <h2 className="text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl dark:text-white">4. Artificial Intelligence Processing</h2>
                <p className="mt-4 text-[15px] leading-7 text-zinc-600 sm:text-base sm:leading-8 dark:text-zinc-300">
                  Haven AI runs on Google&apos;s Gemini models, with a fallback model provided by Groq. When you chat with Haven, your messages are sent to these services for processing. Your website and social media content may also be sent to these services when you request a brand review or upload a screenshot. We do not use your conversations to train public models. Google and Groq process this data under their own terms as service providers.
                </p>
              </section>

              <section id="service-providers" className="scroll-mt-10">
                <h2 className="text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl dark:text-white">5. Service Providers We Work With</h2>
                <div className="mt-4 space-y-4 text-[15px] leading-7 text-zinc-600 sm:text-base sm:leading-8 dark:text-zinc-300">
                  <p>To operate this website we rely on the following third parties, each of which may process parts of your data:</p>
                  <ul className="list-disc space-y-1 pl-5 marker:text-zinc-400 dark:marker:text-zinc-500">
                    <li><span className="font-semibold text-zinc-900 dark:text-white">Supabase:</span> database, file storage, and backend functions. Servers are located in the European Union.</li>
                    <li><span className="font-semibold text-zinc-900 dark:text-white">Paystack:</span> payment processing and receipts for The Unseen Playbook.</li>
                    <li><span className="font-semibold text-zinc-900 dark:text-white">Google (Gemini):</span> artificial intelligence processing for Haven and brand review scoring.</li>
                    <li><span className="font-semibold text-zinc-900 dark:text-white">Groq:</span> fallback AI processing when the primary model is unavailable.</li>
                    <li><span className="font-semibold text-zinc-900 dark:text-white">Jina AI:</span> reads your website URL when you request a website brand review.</li>
                    <li><span className="font-semibold text-zinc-900 dark:text-white">Calendly:</span> handles bookings for free strategy calls.</li>
                    <li><span className="font-semibold text-zinc-900 dark:text-white">Resend:</span> sends transactional emails for brand review confirmations.</li>
                    <li><span className="font-semibold text-zinc-900 dark:text-white">hCaptcha:</span> verifies that form submissions come from real visitors and not automated bots.</li>
                    <li><span className="font-semibold text-zinc-900 dark:text-white">Netlify:</span> hosts this website.</li>
                  </ul>
                  <p>Each of these providers is bound by their own privacy and security commitments. We choose providers that meet reasonable industry standards for data protection.</p>
                </div>
              </section>

              <section id="cookies-and-local-storage" className="scroll-mt-10">
                <h2 className="text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl dark:text-white">6. Cookies and Local Storage</h2>
                <div className="mt-4 space-y-4 text-[15px] leading-7 text-zinc-600 sm:text-base sm:leading-8 dark:text-zinc-300">
                  <p>We use browser cookies and local storage to run this website. Specifically:</p>
                  <ul className="list-disc space-y-1 pl-5 marker:text-zinc-400 dark:marker:text-zinc-500">
                    <li>A consent flag that remembers whether you have accepted or declined cookie use</li>
                    <li>A session identifier to keep track of your visit count and preferences</li>
                    <li>Haven AI conversation history so that you can return to an in-progress chat</li>
                    <li>Purchase status for The Unseen Playbook so that you are not asked to pay twice</li>
                  </ul>
                  <p>If you decline cookie consent, we do not store tracking cookies. Essential local storage items (such as purchase status and chat history) remain so that the website functions correctly. You can clear all local storage at any time through your browser settings.</p>
                </div>
              </section>

              <section id="data-storage-and-security" className="scroll-mt-10">
                <h2 className="text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl dark:text-white">7. Data Storage and Security</h2>
                <p className="mt-4 text-[15px] leading-7 text-zinc-600 sm:text-base sm:leading-8 dark:text-zinc-300">
                  Data is stored in Supabase with row level security enabled. Screenshots you upload are stored in a private storage bucket that only The Marketing Haven team can access. Payment card details never reach our servers. We use encrypted connections throughout the site.
                </p>
              </section>

              <section id="data-retention" className="scroll-mt-10">
                <h2 className="text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl dark:text-white">8. Data Retention</h2>
                <p className="mt-4 text-[15px] leading-7 text-zinc-600 sm:text-base sm:leading-8 dark:text-zinc-300">
                  We keep your information for as long as it is needed to deliver the service you requested and to follow up on your brand review. If you ask us to delete your data, we will do so within a reasonable time, except where we are required to retain records for legal, tax, or accounting purposes.
                </p>
              </section>

              <section id="your-rights" className="scroll-mt-10">
                <h2 className="text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl dark:text-white">9. Your Rights</h2>
                <div className="mt-4 space-y-4 text-[15px] leading-7 text-zinc-600 sm:text-base sm:leading-8 dark:text-zinc-300">
                  <p>Under the Nigeria Data Protection Regulation (NDPR) and applicable law, you have the right to:</p>
                  <ul className="list-disc space-y-1 pl-5 marker:text-zinc-400 dark:marker:text-zinc-500">
                    <li>Request a copy of the personal data we hold about you</li>
                    <li>Ask us to correct information that is inaccurate</li>
                    <li>Ask us to delete your information</li>
                    <li>Object to certain uses of your information</li>
                    <li>Withdraw consent for cookies by clearing your browser storage</li>
                  </ul>
                  <p>To exercise any of these rights, email us at info@themarketinghaven.xyz. We will respond as soon as we can.</p>
                </div>
              </section>

              <section id="children" className="scroll-mt-10">
                <h2 className="text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl dark:text-white">10. Children</h2>
                <p className="mt-4 text-[15px] leading-7 text-zinc-600 sm:text-base sm:leading-8 dark:text-zinc-300">
                  This website and its services are intended for business owners and professionals. We do not knowingly collect data from anyone under 18. If you believe a minor has submitted information, contact us and we will remove it.
                </p>
              </section>

              <section id="changes-to-this-policy" className="scroll-mt-10">
                <h2 className="text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl dark:text-white">11. Changes to This Policy</h2>
                <p className="mt-4 text-[15px] leading-7 text-zinc-600 sm:text-base sm:leading-8 dark:text-zinc-300">
                  We may update this policy from time to time. When we do, we will change the effective date at the top. Material changes will be reflected on this page. Continued use of the site after an update means you accept the updated policy.
                </p>
              </section>

              <section id="contact" className="scroll-mt-10">
                <h2 className="text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl dark:text-white">12. Contact</h2>
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
