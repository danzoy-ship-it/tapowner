import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Privacy Policy — TapOwner' };

// DRAFT for attorney review (compliance appendix item 5).
export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12 text-zinc-800 dark:text-zinc-200">
      <p className="mb-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
        DRAFT — pending attorney review. Not yet in effect.
      </p>

      <h1 className="mb-2 text-3xl font-semibold text-black dark:text-zinc-50">Privacy Policy</h1>
      <p className="mb-8 text-sm text-zinc-500">Last updated: July 13, 2026</p>

      <section className="space-y-6 text-[15px] leading-7">
        <div>
          <h2 className="mb-2 text-xl font-semibold text-black dark:text-zinc-50">1. Two kinds of people, two kinds of data</h2>
          <p>
            TapOwner handles data about <strong>subscribers</strong> (real estate professionals with
            accounts) and about <strong>property owners</strong> (whose ownership records appear in
            the product). This policy covers both.
          </p>
        </div>

        <div>
          <h2 className="mb-2 text-xl font-semibold text-black dark:text-zinc-50">2. What we collect from subscribers</h2>
          <ul className="list-disc space-y-2 pl-6">
            <li>
              <strong>Account:</strong> your email address, and the agent profile you choose to enter
              (name, brokerage, phone) used to sign your outreach emails.
            </li>
            <li>
              <strong>Billing:</strong> handled by Stripe. We never see or store your card number.
            </li>
            <li>
              <strong>Usage:</strong> product events (app opens, lookups purchased, emails drafted,
              properties saved) tied to your account, used to operate and improve the service.
            </li>
            <li>
              <strong>Location:</strong> used on your device to center the map around you. Your GPS
              location is not stored on our servers.
            </li>
            <li>
              <strong>Contacts:</strong> the app writes a contact to your phone only when you tap
              &quot;Save to Contacts,&quot; using the standard iOS contact form. We never read your
              address book.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="mb-2 text-xl font-semibold text-black dark:text-zinc-50">3. Where property-owner data comes from</h2>
          <p>
            Ownership records (owner name, property and mailing address, assessed values) come from
            public records published by Texas county appraisal districts through the state&apos;s
            StratMap program. Contact information (phone numbers, email addresses) is supplied
            per-lookup by a licensed data provider that performs Do-Not-Call scrubbing, and is
            purchased by a subscriber for their own business use.
          </p>
        </div>

        <div>
          <h2 className="mb-2 text-xl font-semibold text-black dark:text-zinc-50">4. Who we share data with</h2>
          <p className="mb-2">Only the processors needed to run the service:</p>
          <ul className="list-disc space-y-2 pl-6">
            <li><strong>Stripe</strong> — payments and subscriptions.</li>
            <li><strong>BatchData</strong> — the licensed contact-data provider (receives the property address you look up).</li>
            <li><strong>Anthropic</strong> — AI email drafting (receives the property details and your agent profile for the draft you request; their API does not train on this data).</li>
            <li><strong>Railway</strong> — cloud hosting for our servers and database.</li>
            <li><strong>Google</strong> — address search geocoding (receives the address text you type).</li>
          </ul>
          <p className="mt-2">We do not sell subscriber data. We do not run ads.</p>
        </div>

        <div>
          <h2 className="mb-2 text-xl font-semibold text-black dark:text-zinc-50">5. Property owners: your choices</h2>
          <p>
            If you are a property owner and want your contact information suppressed from TapOwner
            lookups, email fred@salasers.com with the property address and we will suppress it and
            forward the request to our data provider. Ownership records themselves are public county
            records; corrections to those must be made with your county appraisal district.
          </p>
        </div>

        <div>
          <h2 className="mb-2 text-xl font-semibold text-black dark:text-zinc-50">6. Retention and security</h2>
          <p>
            Purchased contact results are cached for up to 90 days. Account data is kept while your
            account is active and deleted on verified request. Data is encrypted in transit, access
            is restricted, and we maintain a written information security program.
          </p>
        </div>

        <div>
          <h2 className="mb-2 text-xl font-semibold text-black dark:text-zinc-50">7. Contact</h2>
          <p>
            Privacy questions or deletion requests: fred@salasers.com. Material changes to this
            policy will be announced by email or in the app.
          </p>
        </div>
      </section>
    </main>
  );
}
