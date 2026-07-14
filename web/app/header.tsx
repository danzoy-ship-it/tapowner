import Link from 'next/link';
import { Logo } from './logo';

// Site-wide top bar. Kept lightweight so it sits comfortably above the minimal
// form pages (signup, billing, partner) as well as the marketing home.
export default function Header() {
  return (
    <header className="sticky top-0 z-20 border-b border-zinc-200/70 bg-white/80 backdrop-blur dark:border-zinc-800/70 dark:bg-black/70">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-3">
        <Logo />
        <nav className="flex items-center gap-5 text-sm">
          <Link
            href="/#pricing"
            className="hidden text-zinc-600 hover:text-zinc-900 sm:block dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            Pricing
          </Link>
          <Link
            href="/partner"
            className="hidden text-zinc-600 hover:text-zinc-900 sm:block dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            Partners
          </Link>
          <Link
            href="/signup"
            className="rounded-full bg-blue-600 px-4 py-2 font-medium text-white transition-colors hover:bg-blue-700"
          >
            Start free trial
          </Link>
        </nav>
      </div>
    </header>
  );
}
