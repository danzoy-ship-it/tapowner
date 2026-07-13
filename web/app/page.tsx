import Link from 'next/link';

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-6 dark:bg-black">
      <main className="flex max-w-xl flex-col items-center gap-6 text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-black dark:text-zinc-50">
          TapOwner
        </h1>
        <p className="text-lg text-zinc-600 dark:text-zinc-400">
          Tap any property in Texas. See the owner of record, free. Unlock
          phone and email for $0.29. The $9.99 alternative to $99+/mo
          prospecting tools.
        </p>
        <Link
          href="/signup"
          className="rounded-full bg-black px-8 py-3 text-base font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          Start your free 30-day trial
        </Link>
        <p className="text-sm text-zinc-500 dark:text-zinc-500">
          Full Closer access free for 30 days, then $19.99/mo — or drop to
          Prospector at $9.99.
        </p>
      </main>
    </div>
  );
}
