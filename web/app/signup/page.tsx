'use client';

import { useState } from 'react';
import { createCheckoutSession, requestOtp, verifyOtp } from '@/lib/api';

type Step = 'email' | 'otp' | 'redirecting';

export default function SignupPage() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [agreed, setAgreed] = useState(false);
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
      await verifyOtp(email, code);
      setStep('redirecting');
      const url = await createCheckoutSession(email);
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-6 dark:bg-black">
      <div className="w-full max-w-sm">
        <h1 className="mb-6 text-center text-2xl font-semibold text-black dark:text-zinc-50">
          Start your free trial
        </h1>

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
            <label className="flex items-start gap-2 text-sm text-zinc-600 dark:text-zinc-400">
              <input
                type="checkbox"
                required
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-1"
              />
              <span>
                I agree to the{' '}
                <a href="/terms" target="_blank" className="underline">
                  Terms of Service
                </a>{' '}
                and{' '}
                <a href="/privacy" target="_blank" className="underline">
                  Privacy Policy
                </a>
                , including using contact data lawfully and handling my own outreach compliance.
              </span>
            </label>
            <button
              type="submit"
              disabled={loading || !agreed}
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
              {loading ? 'Verifying…' : 'Verify & continue'}
            </button>
          </form>
        )}

        {step === 'redirecting' && (
          <p className="text-center text-zinc-600 dark:text-zinc-400">
            Taking you to checkout…
          </p>
        )}

        {error && <p className="mt-4 text-center text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}
