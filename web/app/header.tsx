import Link from 'next/link';
import { Logo } from './logo';

// Site-wide top bar. White identity, navy links, orange CTA.
export default function Header() {
  return (
    <header className="sticky top-0 z-20 border-b border-zinc-200/70 bg-white/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-3">
        <Logo height={28} />
        <nav className="flex items-center gap-5 text-sm">
          <Link
            href="/#reverse-prospecting"
            className="hidden text-brand-navy/80 hover:text-brand-navy sm:block"
          >
            Reverse Prospecting
          </Link>
          <Link href="/#pricing" className="hidden text-brand-navy/80 hover:text-brand-navy sm:block">
            Pricing
          </Link>
          <Link href="/partner" className="hidden text-brand-navy/80 hover:text-brand-navy sm:block">
            Partners
          </Link>
          <Link
            href="/signup"
            className="rounded-full bg-brand-orange px-4 py-2 font-medium text-white transition-colors hover:bg-brand-orange-dark"
          >
            Start free trial
          </Link>
        </nav>
      </div>
    </header>
  );
}
