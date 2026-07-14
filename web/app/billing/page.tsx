'use client';

import { useState } from 'react';
import { createPortalSession, requestOtp, verifyOtp } from '@/lib/api';

type Step = 'email' | 'otp' | 'redirecting';

// "Manage your plan at tapowner.com" lands here: verify the account email,
// then hand off to Stripe's Customer Portal (plan switching + cancel live
// there -- this site never touches card data).
export default function BillingPage() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const token = await verifyOtp(email, code);
      setStep('redirecting');
      const url = await createPortalSession(token);
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setStep('otp');
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-6 dark:bg-black">
      <div className="w-full max-w-sm">
        <h1 className="mb-2 text-center text-2xl font-semibold text-black dark:text-zinc-50">
          Manage your plan
        </h1>
        <p className="mb-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
          Switch plans, update your card, or cancel — all in the secure Stripe portal.
        </p>

        {step === 'email' && (
          <form onSubmit={handleSendCode} className="flex flex-col gap-4">
            <input
              type="email"
              required
              placeholder="you@brokerage.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-lg border border-zinc-300 px-4 py-3 text-base dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-brand-orange px-4 py-3 font-medium text-white transition-colors hover:bg-brand-orange-dark disabled:opacity-50"
            >
              {loading ? 'Sending…' : 'Send code'}
            </button>
          </form>
        )}

        {step === 'otp' && (
          <form onSubmit={handleVerifyCode} className="flex flex-col gap-4">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Enter the 6-digit code sent to {email}.
            </p>
            <input
              type="text"
              inputMode="numeric"
              required
              maxLength={6}
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="rounded-lg border border-zinc-300 px-4 py-3 text-center text-lg tracking-widest dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-brand-orange px-4 py-3 font-medium text-white transition-colors hover:bg-brand-orange-dark disabled:opacity-50"
            >
              {loading ? 'Verifying…' : 'Open billing portal'}
            </button>
          </form>
        )}

        {step === 'redirecting' && (
          <p className="text-center text-zinc-600 dark:text-zinc-400">
            Taking you to the billing portal…
          </p>
        )}

        {error && <p className="mt-4 text-center text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}
