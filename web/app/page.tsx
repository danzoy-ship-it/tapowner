import Link from 'next/link';
import { LogoMark } from './logo';

export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-white">
      {/* ---------- Hero ---------- */}
      <section className="relative overflow-hidden border-b border-zinc-100">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-brand-orange-50 to-transparent" />
        <div className="relative mx-auto flex w-full max-w-5xl flex-col items-center px-6 py-20 text-center sm:py-28">
          <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-brand-orange/30 bg-brand-orange-50 px-3 py-1 text-xs font-medium text-brand-orange-dark">
            📍 Texas · iPhone · owner data on tap
          </span>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-brand-navy sm:text-6xl">
            Know who owns it.
            <br />
            <span className="text-brand-orange">Before you knock.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-zinc-600 sm:text-xl">
            Tap any property in Texas and see the owner of record — free. Unlock
            their verified phone and email for{' '}
            <strong className="text-brand-navy">29¢</strong>, then let AI draft
            the outreach and save them straight to your CRM.
          </p>
          <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row">
            <Link
              href="/signup"
              className="rounded-full bg-brand-orange px-8 py-3.5 text-base font-medium text-white shadow-sm transition-colors hover:bg-brand-orange-dark"
            >
              Start your free 30-day trial
            </Link>
            <Link
              href="/#reverse-prospecting"
              className="rounded-full px-6 py-3.5 text-base font-medium text-brand-navy hover:text-brand-navy-700"
            >
              See Reverse Prospecting →
            </Link>
          </div>
          <p className="mt-4 text-sm text-zinc-500">
            Full Closer access free for 30 days, then $19.99/mo — or drop to
            Prospector at $9.99. Card required, cancel anytime.
          </p>
          <p className="mt-10 max-w-xl text-sm text-zinc-500">
            The <strong className="font-medium text-brand-navy">$9.99</strong>{' '}
            alternative to $99–232/mo prospecting tools — built for listing
            agents and new agents doing 20–80 lookups a month, not 500.
          </p>
        </div>
      </section>

      {/* ---------- How it works ---------- */}
      <section className="mx-auto w-full max-w-5xl px-6 py-20">
        <h2 className="text-center text-sm font-semibold uppercase tracking-widest text-brand-orange">
          How it works
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-2xl font-semibold tracking-tight text-brand-navy sm:text-3xl">
          From standing on the curb to owner in your CRM — in three taps.
        </p>
        <div className="mt-14 grid gap-8 sm:grid-cols-3">
          <Step
            n={1}
            title="Tap a property"
            body="Open the map on any street. Tap a house and see the owner of record instantly — free, straight from public county appraisal records across all 254 Texas counties."
          />
          <Step
            n={2}
            title="Unlock the contact"
            body="One tap unlocks the owner's verified phone and email for 29¢ — licensed, DNC-scrubbed data with Verified and DNC badges. No-match is never charged."
          />
          <Step
            n={3}
            title="Reach out & track"
            body="AI drafts a personalized email from your own mail app, and the owner saves to your mini-CRM with property notes and a follow-up status."
          />
        </div>
      </section>

      {/* ---------- Reverse Prospecting (flagship) ---------- */}
      <section id="reverse-prospecting" className="scroll-mt-16 bg-brand-navy">
        <div className="mx-auto w-full max-w-5xl px-6 py-20 sm:py-24">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-brand-orange/15 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-brand-orange">
                ⭐ The flagship
              </span>
              <h2 className="mt-5 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                Reverse Prospecting: farm a whole neighborhood in one screen.
              </h2>
              <p className="mt-5 text-lg text-blue-100/80">
                Draw an area on the map. See every owner inside it. Then filter by
                the details that matter —{' '}
                <strong className="text-white">
                  find every 4-bed, 3-bath home with a pool on the block
                </strong>{' '}
                — and reach the whole list at once.
              </p>
              <p className="mt-5 rounded-xl border border-brand-orange/30 bg-brand-orange/10 p-4 text-base text-blue-50">
                “I may have a motivated, qualified buyer looking for a home exactly
                like yours…” — the highest-response outreach in real estate, woven
                with your criteria and honest at scale. One tap sends it, one home
                at a time, from your own mail.
              </p>
              <Link
                href="/signup"
                className="mt-8 inline-block rounded-full bg-brand-orange px-7 py-3 text-base font-medium text-white transition-colors hover:bg-brand-orange-dark"
              >
                Try it free for 30 days
              </Link>
            </div>

            {/* Steps card */}
            <div className="rounded-2xl bg-white/5 p-6 ring-1 ring-white/10 backdrop-blur">
              <ol className="flex flex-col gap-5">
                <FlagStep n={1} title="Draw the area" body="Tap the corners around a block or subdivision." />
                <FlagStep n={2} title="See every owner" body="Protected records excluded, absentee owners flagged." />
                <FlagStep
                  n={3}
                  title="Filter by criteria"
                  body="Min sqft, beds, baths, pool, single-story — with a live match count."
                />
                <FlagStep
                  n={4}
                  title="Contact the whole list"
                  body="Unlock all contacts (included traces first, no-match free), then email each owner, draft one letter, add to Contacts, save to CRM, or export CSV."
                />
              </ol>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Data moat ---------- */}
      <section className="border-b border-zinc-100 bg-brand-orange-50/60">
        <div className="mx-auto w-full max-w-5xl px-6 py-14 text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-brand-orange">
            The data no $99/mo tool has at this price
          </p>
          <p className="mx-auto mt-3 max-w-3xl text-2xl font-semibold tracking-tight text-brand-navy">
            Square footage, beds, baths, and pools on{' '}
            <span className="text-brand-orange">millions of Texas homes</span> —
            mined free from 29 county appraisal districts.
          </p>
          <p className="mx-auto mt-3 max-w-2xl text-zinc-600">
            That&rsquo;s what powers the neighborhood filtering above. It cost us
            nothing, and it&rsquo;s growing every week.
          </p>
        </div>
      </section>

      {/* ---------- Features ---------- */}
      <section className="border-b border-zinc-100 bg-zinc-50">
        <div className="mx-auto w-full max-w-5xl px-6 py-20">
          <h2 className="max-w-2xl text-2xl font-semibold tracking-tight text-brand-navy sm:text-3xl">
            Everything you need to work a farm — in your pocket.
          </h2>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <Feature
              icon="🗺️"
              title="Every Texas parcel, mapped"
              body="A live GPS map of property boundaries across all 254 counties. Pan, zoom, and tap."
            />
            <Feature
              icon="🪪"
              title="Owner of record, free"
              body="Unlimited owner lookups from public county records — with absentee-owner flags built in."
            />
            <Feature
              icon="📞"
              title="Verified phone & email"
              body="Licensed, DNC-scrubbed contact data for 29¢ a lookup. Pay only for the ones you need; no-match is free."
            />
            <Feature
              icon="✍️"
              title="AI outreach drafting"
              body="Seven templates — just-sold, absentee, expired, FSBO, open-house, adjacent-lot, buyer-match — in three tones, from your own account."
              tag="Closer"
            />
            <Feature
              icon="📇"
              title="Mini-CRM"
              body="Save owners with notes and pipeline statuses from New to Listed, export to CSV, and keep read-only access even if you lapse."
              tag="Closer"
            />
            <Feature
              icon="🎯"
              title="Reverse Prospecting"
              body="Draw an area, filter by beds, sqft, or pool, then contact every matching owner at once."
              tag="Closer"
            />
          </div>
        </div>
      </section>

      {/* ---------- Pricing ---------- */}
      <section id="pricing" className="mx-auto w-full max-w-5xl scroll-mt-16 px-6 py-20">
        <h2 className="text-center text-2xl font-semibold tracking-tight text-brand-navy sm:text-3xl">
          Simple pricing. Start on Closer, free.
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-zinc-600">
          Every new account gets 30 days of full Closer — including 10 skip
          traces — free. Keep it, or drop to Prospector anytime.
        </p>

        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          {/* Prospector */}
          <div className="flex flex-col rounded-2xl border border-zinc-200 bg-white p-8">
            <h3 className="text-lg font-semibold text-brand-navy">Prospector</h3>
            <p className="mt-1 text-sm text-zinc-500">For the occasional lookup.</p>
            <p className="mt-5">
              <span className="text-4xl font-semibold text-brand-navy">$9.99</span>
              <span className="text-zinc-500">/mo</span>
            </p>
            <ul className="mt-6 flex flex-col gap-3 text-sm text-zinc-700">
              <Check>Unlimited map & owner-of-record lookups</Check>
              <Check>Skip traces at 29¢ each, pay as you go</Check>
              <Check>vCard export to your contacts</Check>
            </ul>
            <Link
              href="/signup"
              className="mt-8 rounded-full border border-zinc-300 px-6 py-3 text-center text-sm font-medium text-brand-navy transition-colors hover:bg-zinc-100"
            >
              Choose Prospector
            </Link>
          </div>

          {/* Closer — highlighted */}
          <div className="relative flex flex-col rounded-2xl border-2 border-brand-orange bg-white p-8 shadow-lg shadow-brand-orange/10">
            <span className="absolute -top-3 left-8 rounded-full bg-brand-orange px-3 py-1 text-xs font-semibold text-white">
              Most popular · free for 30 days
            </span>
            <h3 className="text-lg font-semibold text-brand-navy">Closer</h3>
            <p className="mt-1 text-sm text-zinc-500">For agents working a farm.</p>
            <p className="mt-5">
              <span className="text-4xl font-semibold text-brand-navy">$19.99</span>
              <span className="text-zinc-500">/mo</span>
            </p>
            <ul className="mt-6 flex flex-col gap-3 text-sm text-zinc-700">
              <Check strong>Everything in Prospector</Check>
              <Check strong>10 skip traces included every month</Check>
              <Check strong>AI email outreach drafting</Check>
              <Check strong>Mini-CRM with notes & pipeline statuses</Check>
              <Check strong>Reverse Prospecting — bulk area farming</Check>
            </ul>
            <Link
              href="/signup"
              className="mt-8 rounded-full bg-brand-orange px-6 py-3 text-center text-sm font-medium text-white transition-colors hover:bg-brand-orange-dark"
            >
              Start free — then $19.99/mo
            </Link>
          </div>
        </div>

        {/* Referral touch */}
        <div className="mt-8 rounded-2xl border border-zinc-200 bg-zinc-50 px-6 py-5 text-center">
          <p className="text-sm text-zinc-600">
            <strong className="text-brand-navy">Refer another agent</strong> and you
            each get a free month.{' '}
            <Link href="/signup" className="font-medium text-brand-orange hover:text-brand-orange-dark">
              Start your trial
            </Link>{' '}
            to get your code.
          </p>
        </div>
      </section>

      {/* ---------- Trust ---------- */}
      <section className="border-t border-zinc-100 bg-zinc-50">
        <div className="mx-auto grid w-full max-w-5xl gap-8 px-6 py-16 sm:grid-cols-3">
          <Trust
            title="Real data only"
            body="We never show an owner we haven't verified from a real source. A wrong owner is worse than no owner."
          />
          <Trust
            title="Licensed & compliant"
            body="Contact data comes from a licensed, DNC-scrubbed provider. You handle your outreach; we flag the do-not-calls."
          />
          <Trust
            title="Public county records"
            body="Ownership comes from the Texas TxGIO StratMap program — informational use, refreshed from county appraisal data."
          />
        </div>
      </section>

      {/* ---------- Final CTA ---------- */}
      <section className="mx-auto w-full max-w-5xl px-6 py-20 text-center">
        <LogoMark size={48} className="mx-auto" />
        <h2 className="mt-5 text-2xl font-semibold tracking-tight text-brand-navy sm:text-3xl">
          Your next listing is on a street you already drive.
        </h2>
        <p className="mx-auto mt-3 max-w-lg text-zinc-600">
          Start with 30 days of full Closer, free. Find the owner, make the call,
          book the appointment.
        </p>
        <Link
          href="/signup"
          className="mt-8 inline-block rounded-full bg-brand-orange px-8 py-3.5 text-base font-medium text-white transition-colors hover:bg-brand-orange-dark"
        >
          Start your free 30-day trial
        </Link>
      </section>
    </div>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <div className="flex flex-col">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-navy text-base font-semibold text-white">
        {n}
      </span>
      <h3 className="mt-5 text-lg font-semibold text-brand-navy">{title}</h3>
      <p className="mt-2 text-zinc-600">{body}</p>
    </div>
  );
}

function FlagStep({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <li className="flex gap-4">
      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-brand-orange text-sm font-semibold text-white">
        {n}
      </span>
      <div>
        <h3 className="font-semibold text-white">{title}</h3>
        <p className="mt-0.5 text-sm text-blue-100/70">{body}</p>
      </div>
    </li>
  );
}

function Feature({
  icon,
  title,
  body,
  tag,
}: {
  icon: string;
  title: string;
  body: string;
  tag?: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-6">
      <div className="flex items-center gap-3">
        <span className="text-2xl" aria-hidden="true">
          {icon}
        </span>
        {tag && (
          <span className="rounded-full bg-brand-orange-50 px-2 py-0.5 text-xs font-medium text-brand-orange-dark">
            {tag}
          </span>
        )}
      </div>
      <h3 className="mt-4 font-semibold text-brand-navy">{title}</h3>
      <p className="mt-2 text-sm text-zinc-600">{body}</p>
    </div>
  );
}

function Check({ children, strong }: { children: React.ReactNode; strong?: boolean }) {
  return (
    <li className="flex items-start gap-2.5">
      <svg
        className={`mt-0.5 h-4 w-4 flex-shrink-0 ${strong ? 'text-brand-orange' : 'text-zinc-400'}`}
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M13.5 4.5 6.5 11.5 3 8"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span>{children}</span>
    </li>
  );
}

function Trust({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h3 className="font-semibold text-brand-navy">{title}</h3>
      <p className="mt-2 text-sm text-zinc-600">{body}</p>
    </div>
  );
}
