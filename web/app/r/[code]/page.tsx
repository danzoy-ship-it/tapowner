'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { API_BASE } from '@/lib/api';

const ATTRIBUTION_KEY = 'tapowner_referral';

export default function ReferralLandingPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();

  useEffect(() => {
    const code = params.code?.trim().toUpperCase();
    if (!code) {
      router.replace('/signup');
      return;
    }

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/partners/${code}`);
        if (res.ok) {
          localStorage.setItem(
            ATTRIBUTION_KEY,
            JSON.stringify({ code, attributedAt: Date.now() })
          );
          // Fire-and-forget click tracking -- don't block the redirect on it.
          fetch(`${API_BASE}/referrals/click`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code }),
          }).catch(() => {});
        }
      } finally {
        router.replace('/signup');
      }
    })();
  }, [params.code, router]);

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 dark:bg-black">
      <p className="text-zinc-600 dark:text-zinc-400">Redirecting…</p>
    </div>
  );
}
