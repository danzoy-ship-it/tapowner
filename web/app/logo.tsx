import Link from 'next/link';

// TapOwner mark: a map pin whose center is a "tap" ripple — the product in one
// glyph (tap a location → the owner). Brand blue #2563eb matches the app's
// primary action color so web and app read as one product.
export function LogoMark({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M16 2.5c-5.8 0-10.5 4.5-10.5 10.2 0 7.1 9.1 15.5 10 16.3.3.3.7.3 1 0 .9-.8 10-9.2 10-16.3C26.5 7 21.8 2.5 16 2.5Z"
        fill="#2563eb"
      />
      {/* tap ripple in the pin head */}
      <circle cx="16" cy="12.5" r="5.5" fill="#fff" />
      <circle cx="16" cy="12.5" r="2.4" fill="#2563eb" />
    </svg>
  );
}

export function Logo({ className = '' }: { className?: string }) {
  return (
    <Link href="/" className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark />
      <span className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        Tap<span className="text-blue-600">Owner</span>
      </span>
    </Link>
  );
}
