import Link from 'next/link';
import { LogoMark } from './logo';

export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-white dark:bg-black">
      {/* ---------- Hero ---------- */}
      <section className="relative overflow-hidden border-b border-zinc-100 dark:border-zinc-900">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-blue-50/80 to-transparent dark:from-blue-950/20" />
        <div className="relative mx-auto flex w-full max-w-5xl flex-col items-center px-6 py-20 text-center sm:py-28">
          <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300">
            📍 Texas · iPhone · owner data on tap
          </span>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-zinc-900 sm:text-6xl dark:text-zinc-50">
            Know who owns it.
            <br />
            <span className="text-blue-600">Before you knock.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-zinc-600 sm:text-xl dark:text-zinc-400">
            Tap any property in Texas and see the owner of record — free. Unlock
            their verified phone and email for <strong className="text-zinc-900 dark:text-zinc-100">$0.29</strong>,
            then let AI draft the outreach and save them straight to your CRM.
          </p>
          <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row">
            <Link
              href="/signup"
              className="rounded-full bg-blue-600 px-8 py-3.5 text-base font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
            >
              Start your free 30-day trial
            </Link>
            <Link
              href="/#pricing"
              className="rounded-full px-6 py-3.5 text-base font-medium text-zinc-700 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-white"
            >
              See pricing →
            </Link>
          </div>
          <p className="mt-4 text-sm text-zinc-500">
            Full Closer access free for 30 days, then $19.99/mo — or drop to
            Prospector at $9.99. Card required, cancel anytime.
          </p>
          <p className="mt-10 max-w-xl text-sm text-zinc-500">
            The <strong className="font-medium text-zinc-700 dark:text-zinc-300">$9.99</strong>{' '}
            alternative to $99–232/mo prospecting tools — built for listing
            agents and new agents doing 20–80 lookups a month, not 500.
          </p>
        </div>
      </section>

      {/* ---------- How it works ---------- */}
      <section className="mx-auto w-full max-w-5xl px-6 py-20">
        <h2 className="text-center text-sm font-semibold uppercase tracking-widest text-blue-600">
          How it works
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-50">
          From standing on the curb to owner in your CRM — in three taps.
        </p>
        <div className="mt-14 grid gap-8 sm:grid-cols-3">
          <Step
            n={1}
            title="Tap a property"
            body="Open the map on any street. Tap a house and see the owner of record instantly — free, straight from public county appraisal records."
          />
          <Step
            n={2}
            title="Unlock the contact"
            body="One tap unlocks the owner's verified phone and email for $0.29 — licensed, DNC-scrubbed data, only what the provider returns for that owner."
          />
          <Step
            n={3}
            title="Reach out & track"
            body="AI drafts a personalized email from your own mail app, and the owner saves to your mini-CRM with property notes and a follow-up status."
          />
        </div>
      </section>

      {/* ---------- Features ---------- */}
      <section className="border-y border-zinc-100 bg-zinc-50 dark:border-zinc-900 dark:bg-zinc-950/40">
        <div className="mx-auto w-full max-w-5xl px-6 py-20">
          <h2 className="max-w-2xl text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-50">
            Everything you need to farm a neighborhood — in your pocket.
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
              body="Licensed, DNC-scrubbed contact data for $0.29 a lookup. Pay only for the ones you need."
            />
            <Feature
              icon="✍️"
              title="AI outreach drafting"
              body="Personalized just-sold, absentee, expired, FSBO, and open-house emails — sent from your own account."
              tag="Closer"
            />
            <Feature
              icon="📇"
              title="Mini-CRM"
              body="Auto-save owners to contacts with property notes and pipeline statuses, from New to Listed."
              tag="Closer"
            />
            <Feature
              icon="🎯"
              title="Farm mode"
              body="Draw an area, filter by beds, sqft, or pool, then contact every matching owner at once."
              tag="Closer"
            />
          </div>
        </div>
      </section>

      {/* ---------- Pricing ---------- */}
      <section id="pricing" className="mx-auto w-full max-w-5xl scroll-mt-20 px-6 py-20">
        <h2 className="text-center text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-50">
          Simple pricing. Start on Closer, free.
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-zinc-600 dark:text-zinc-400">
          Every new account gets 30 days of full Closer — including 10 skip
          traces — free. Keep it, or drop to Prospector anytime.
        </p>

        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          {/* Prospector */}
          <div className="flex flex-col rounded-2xl border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-950">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Prospector</h3>
            <p className="mt-1 text-sm text-zinc-500">For the occasional lookup.</p>
            <p className="mt-5">
              <span className="text-4xl font-semibold text-zinc-900 dark:text-zinc-50">$9.99</span>
              <span className="text-zinc-500">/mo</span>
            </p>
            <ul className="mt-6 flex flex-col gap-3 text-sm text-zinc-700 dark:text-zinc-300">
              <Check>Unlimited map & owner-of-record lookups</Check>
              <Check>Skip traces at $0.29 each, pay as you go</Check>
              <Check>vCard export to your contacts</Check>
            </ul>
            <Link
              href="/signup"
              className="mt-8 rounded-full border border-zinc-300 px-6 py-3 text-center text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-900"
            >
              Choose Prospector
            </Link>
          </div>

          {/* Closer — highlighted */}
          <div className="relative flex flex-col rounded-2xl border-2 border-blue-600 bg-white p-8 shadow-lg shadow-blue-600/5 dark:bg-zinc-950">
            <span className="absolute -top-3 left-8 rounded-full bg-blue-600 px-3 py-1 text-xs font-semibold text-white">
              Most popular · free for 30 days
            </span>
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Closer</h3>
            <p className="mt-1 text-sm text-zinc-500">For agents working a farm.</p>
            <p className="mt-5">
              <span className="text-4xl font-semibold text-zinc-900 dark:text-zinc-50">$19.99</span>
              <span className="text-zinc-500">/mo</span>
            </p>
            <ul className="mt-6 flex flex-col gap-3 text-sm text-zinc-700 dark:text-zinc-300">
              <Check strong>Everything in Prospector</Check>
              <Check strong>10 skip traces included every month</Check>
              <Check strong>AI email outreach drafting</Check>
              <Check strong>Mini-CRM with notes & pipeline statuses</Check>
              <Check strong>Farm mode — bulk area prospecting</Check>
            </ul>
            <Link
              href="/signup"
              className="mt-8 rounded-full bg-blue-600 px-6 py-3 text-center text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              Start free — then $19.99/mo
            </Link>
          </div>
        </div>
      </section>

      {/* ---------- Trust ---------- */}
      <section className="border-t border-zinc-100 bg-zinc-50 dark:border-zinc-900 dark:bg-zinc-950/40">
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
        <LogoMark className="mx-auto h-10 w-10" />
        <h2 className="mt-5 text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-50">
          Your next listing is on a street you already drive.
        </h2>
        <p className="mx-auto mt-3 max-w-lg text-zinc-600 dark:text-zinc-400">
          Start with 30 days of full Closer, free. Find the owner, make the call,
          book the appointment.
        </p>
        <Link
          href="/signup"
          className="mt-8 inline-block rounded-full bg-blue-600 px-8 py-3.5 text-base font-medium text-white transition-colors hover:bg-blue-700"
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
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-base font-semibold text-white">
        {n}
      </span>
      <h3 className="mt-5 text-lg font-semibold text-zinc-900 dark:text-zinc-50">{title}</h3>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">{body}</p>
    </div>
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
    <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center gap-3">
        <span className="text-2xl" aria-hidden="true">
          {icon}
        </span>
        {tag && (
          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
            {tag}
          </span>
        )}
      </div>
      <h3 className="mt-4 font-semibold text-zinc-900 dark:text-zinc-50">{title}</h3>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{body}</p>
    </div>
  );
}

function Check({ children, strong }: { children: React.ReactNode; strong?: boolean }) {
  return (
    <li className="flex items-start gap-2.5">
      <svg
        className={`mt-0.5 h-4 w-4 flex-shrink-0 ${strong ? 'text-blue-600' : 'text-zinc-400'}`}
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
      <h3 className="font-semibold text-zinc-900 dark:text-zinc-50">{title}</h3>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{body}</p>
    </div>
  );
}
