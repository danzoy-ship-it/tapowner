import Link from 'next/link';
import Image from 'next/image';
import { API_BASE } from '@/lib/api';

// Server component: pulls the config-driven Texas data-broker notice
// (compliance appendix item 3) so the SOS-prescribed text appears the moment
// it's set in config -- no redeploy.
async function getDataBrokerNotice(): Promise<string> {
  try {
    const res = await fetch(`${API_BASE}/config`, { next: { revalidate: 3600 } });
    if (!res.ok) return '';
    const config = await res.json();
    return typeof config.data_broker_notice === 'string' ? config.data_broker_notice : '';
  } catch {
    return '';
  }
}

export default async function Footer() {
  const notice = await getDataBrokerNotice();

  return (
    <footer className="border-t border-zinc-200 px-6 py-8 text-sm text-zinc-500">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
        <Image
          src="/logo-wordmark.png"
          alt="TapOwner"
          width={211}
          height={40}
          style={{ height: 32, width: 'auto' }}
        />
        {notice && <p className="font-medium text-zinc-700">{notice}</p>}
        <div className="flex gap-6">
          <Link href="/billing" className="hover:text-brand-navy">
            Manage billing
          </Link>
          <Link href="/terms" className="hover:text-brand-navy">
            Terms of Service
          </Link>
          <Link href="/privacy" className="hover:text-brand-navy">
            Privacy Policy
          </Link>
        </div>
        <p>© {new Date().getFullYear()} TapOwner</p>
      </div>
    </footer>
  );
}
