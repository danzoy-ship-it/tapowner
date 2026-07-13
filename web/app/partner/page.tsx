'use client';

import { useEffect, useState } from 'react';
import { API_BASE, requestOtp, verifyOtp } from '@/lib/api';

const TOKEN_KEY = 'tapowner_partner_token';

type Step = 'email' | 'otp' | 'dashboard';

interface Dashboard {
  partner: {
    type: string;
    name: string;
    code: string;
    comp_model: string;
    rate: number | null;
    months_cap: number | null;
    status: string;
  };
  clicks: number;
  signups: number;
  paid_conversions: number;
  earned_cents: number;
  paid_out_cents: number;
}

function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function PartnerPage() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) loadDashboard(token);
  }, []);

  async function loadDashboard(token: string) {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/partners/me/dashboard`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        localStorage.removeItem(TOKEN_KEY);
        return;
      }
      setDashboard(await res.json());
      setStep('dashboard');
    } finally {
      setLoading(false);
    }
  }

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await requestOtp(email);
      setStep('otp');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const token = await verifyOtp(email, code);
      localStorage.setItem(TOKEN_KEY, token);
      await loadDashboard(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  if (step === 'dashboard' && dashboard) {
    const referralLink = `${typeof window !== 'undefined' ? window.location.origin : ''}/r/${dashboard.partner.code}`;
    return (
      <div className="flex flex-1 flex-col items-center bg-zinc-50 px-6 py-16 dark:bg-black">
        <div className="w-full max-w-lg">
          <h1 className="mb-1 text-2xl font-semibold text-black dark:text-zinc-50">
            {dashboard.partner.name}
          </h1>
          <p className="mb-6 text-sm text-zinc-500">
            {dashboard.partner.type} · code {dashboard.partner.code}
          </p>

          <div className="mb-6 rounded-lg border border-zinc-300 p-4 dark:border-zinc-700">
            <p className="text-sm text-zinc-500">Your referral link</p>
            <p className="break-all font-mono text-sm">{referralLink}</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Stat label="Clicks" value={String(dashboard.clicks)} />
            <Stat label="Signups" value={String(dashboard.signups)} />
            <Stat label="Paid conversions" value={String(dashboard.paid_conversions)} />
            <Stat label="Earned" value={formatDollars(dashboard.earned_cents)} />
            <Stat label="Paid out" value={formatDollars(dashboard.paid_out_cents)} />
          </div>

          <p className="mt-6 text-xs text-zinc-500">
            Payouts are manual (monthly, $50 minimum). Contact TapOwner if you&rsquo;ve
            crossed $400/yr — a W-9 will be needed.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-6 dark:bg-black">
      <div className="w-full max-w-sm">
        <h1 className="mb-6 text-center text-2xl font-semibold text-black dark:text-zinc-50">
          Partner dashboard
        </h1>

        {step === 'email' && (
          <form onSubmit={handleSendCode} className="flex flex-col gap-4">
            <input
              type="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-lg border border-zinc-300 px-4 py-3 text-base dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-black px-4 py-3 font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
            >
              {loading ? 'Sending…' : 'Send code'}
            </button>
          </form>
        )}

        {step === 'otp' && (
          <form onSubmit={handleVerify} className="flex flex-col gap-4">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Enter the 6-digit code sent to {email}.
            </p>
            <input
              type="text"
              inputMode="numeric"
              required
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="rounded-lg border border-zinc-300 px-4 py-3 text-center text-lg tracking-widest dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-black px-4 py-3 font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
            >
              {loading ? 'Verifying…' : 'Log in'}
            </button>
          </form>
        )}

        {error && <p className="mt-4 text-center text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-300 p-4 dark:border-zinc-700">
      <p className="text-sm text-zinc-500">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
    </div>
  );
}
