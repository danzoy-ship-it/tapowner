import Link from 'next/link';
import Image from 'next/image';

// The REAL TapOwner art (mobile/assets/logo-*.png, trimmed into web/public).
// Never re-draw the mark as an SVG — these are the brand assets.

export function LogoMark({
  className = '',
  size = 40,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <Image
      src="/logo-mark.png"
      alt="TapOwner"
      width={size}
      height={size}
      className={className}
      priority
    />
  );
}

export function Logo({ height = 30 }: { height?: number }) {
  // Wordmark aspect ratio ~5.27:1 (trimmed asset is 1133×215).
  const width = Math.round(height * (1133 / 215));
  return (
    <Link href="/" className="inline-flex items-center" aria-label="TapOwner home">
      <Image
        src="/logo-wordmark.png"
        alt="TapOwner"
        width={width}
        height={height}
        priority
        style={{ height, width: 'auto' }}
      />
    </Link>
  );
}
