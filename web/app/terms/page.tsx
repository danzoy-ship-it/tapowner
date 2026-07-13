import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Terms of Service — TapOwner' };

// DRAFT for attorney review (compliance appendix item 5). The five numbered
// user-conduct clauses in §3 are required verbatim-in-substance by the
// compliance gate (item 2a-2e) -- do not weaken them.
export default function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12 text-zinc-800 dark:text-zinc-200">
      <p className="mb-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
        DRAFT — pending attorney review. Not yet in effect.
      </p>

      <h1 className="mb-2 text-3xl font-semibold text-black dark:text-zinc-50">Terms of Service</h1>
      <p className="mb-8 text-sm text-zinc-500">Last updated: July 13, 2026</p>

      <section className="space-y-6 text-[15px] leading-7">
        <div>
          <h2 className="mb-2 text-xl font-semibold text-black dark:text-zinc-50">1. What TapOwner is</h2>
          <p>
            TapOwner is a subscription service for licensed real estate professionals. It displays
            property ownership information compiled from public county appraisal records, and — when
            you choose to purchase a lookup — contact information supplied by a licensed data
            provider. TapOwner is operated from Texas and currently covers Texas properties.
          </p>
        </div>

        <div>
          <h2 className="mb-2 text-xl font-semibold text-black dark:text-zinc-50">2. Your account and billing</h2>
          <p>
            Plans are billed monthly through Stripe. Trials convert to a paid subscription
            automatically unless canceled before the trial ends. Per-lookup contact charges
            (&quot;traces&quot;) are metered to your subscription — you are only charged when a lookup
            returns verified contact data. You can cancel anytime; access continues through the end of
            the paid period. Manage your plan at tapowner.com.
          </p>
        </div>

        <div>
          <h2 className="mb-2 text-xl font-semibold text-black dark:text-zinc-50">3. Acceptable use — the important part</h2>
          <p className="mb-3">By using TapOwner you agree to ALL of the following:</p>
          <ol className="list-decimal space-y-3 pl-6">
            <li>
              <strong>Lawful use only.</strong> You will use TapOwner and any data obtained through it
              solely for lawful purposes connected to your real estate business.
            </li>
            <li>
              <strong>No FCRA uses.</strong> TapOwner is not a consumer reporting agency and its data
              is not a consumer report. You will not use it to determine eligibility for credit,
              insurance, employment, housing/tenant screening, or any other purpose covered by the
              Fair Credit Reporting Act.
            </li>
            <li>
              <strong>You own your outreach compliance.</strong> You are solely responsible for
              ensuring your calls, texts, and emails comply with all applicable laws — including the
              TCPA and federal/state Do-Not-Call rules for calls and texts, and CAN-SPAM for email.
              Do-Not-Call and litigation-risk flags shown in the app are informational aids, not legal
              advice, and displaying a number does not mean it is lawful for you to call it.
            </li>
            <li>
              <strong>Honor opt-outs.</strong> If a property owner asks you not to contact them, you
              will honor that request promptly and permanently.
            </li>
            <li>
              <strong>No harassment or stalking.</strong> You will not use TapOwner to harass,
              intimidate, stalk, or harm any person, or to locate a person for any purpose unrelated
              to a legitimate real estate inquiry.
            </li>
          </ol>
          <p className="mt-3">
            We may suspend or terminate accounts that violate this section, without refund.
          </p>
        </div>

        <div>
          <h2 className="mb-2 text-xl font-semibold text-black dark:text-zinc-50">4. Data accuracy</h2>
          <p>
            Ownership records come from county appraisal districts and are updated on their schedule,
            not in real time. Contact data comes from a licensed third-party provider and is not
            guaranteed to be current or accurate. Verify independently before acting on it.
          </p>
        </div>

        <div>
          <h2 className="mb-2 text-xl font-semibold text-black dark:text-zinc-50">5. License and restrictions</h2>
          <p>
            Your subscription grants a personal, non-transferable license to use the data inside
            TapOwner for your own business. You may save individual contacts you have purchased. You
            may not resell, redistribute, scrape, bulk-export, or use the service to build or enrich
            any database or competing product.
          </p>
        </div>

        <div>
          <h2 className="mb-2 text-xl font-semibold text-black dark:text-zinc-50">6. Disclaimers and liability</h2>
          <p>
            The service is provided &quot;as is&quot; without warranties of any kind. To the maximum
            extent permitted by law, TapOwner&apos;s total liability for any claim is limited to the
            amount you paid in the twelve months before the claim arose.
          </p>
        </div>

        <div>
          <h2 className="mb-2 text-xl font-semibold text-black dark:text-zinc-50">7. Changes and contact</h2>
          <p>
            We may update these terms; material changes will be announced by email or in the app.
            Questions: fred@salasers.com.
          </p>
        </div>
      </section>
    </main>
  );
}
