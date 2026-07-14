'use client';

import { useCallback, useEffect, useState } from 'react';
import { API_BASE } from '@/lib/api';

// Admin console for Frederick: list every partner with program stats, create
// new partner codes, record manual payouts, and revoke/reactivate codes.
// Gated by the shared ADMIN_SECRET (sessionStorage — cleared when the tab
// closes; never localStorage). This is the "manager" half of the referral
// system; partners see their own numbers at /partner.

const SECRET_KEY = 'tapowner_admin_secret';

interface Partner {
  id: number;
  type: string;
  name: string;
  code: string;
  email: string | null;
  comp_model: string;
  rate: number | null;
  months_cap: number | null;
  status: string;
  clicks: number;
  signups: number;
  paid_conversions: number;
  earned_cents: number;
  paid_out_cents: number;
  owed_cents: number;
}

function dollars(cents: number): string {
  const neg = cents < 0;
  return `${neg ? '-' : ''}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

export default function AdminPage() {
  const [secret, setSecret] = useState('');
  const [authed, setAuthed] = useState(false);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [threshold, setThreshold] = useState(5000);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async (s: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/admin/partners`, {
        headers: { 'x-admin-secret': s },
      });
      if (res.status === 401) {
        setError('Wrong admin secret.');
        return false;
      }
      if (!res.ok) {
        setError('Could not load partners.');
        return false;
      }
      const body = await res.json();
      setPartners(body.partners);
      setThreshold(body.payout_threshold_cents ?? 5000);
      return true;
    } catch {
      setError('Network error.');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const stored = sessionStorage.getItem(SECRET_KEY);
    if (stored) {
      setSecret(stored);
      void load(stored).then((ok) => setAuthed(ok));
    }
  }, [load]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    const ok = await load(secret);
    if (ok) {
      sessionStorage.setItem(SECRET_KEY, secret);
      setAuthed(true);
    }
  }

  async function handlePayout(p: Partner) {
    if (!confirm(`Record a payout of ${dollars(p.owed_cents)} to ${p.name}?`)) return;
    setBusyId(p.id);
    try {
      const res = await fetch(`${API_BASE}/admin/partners/${p.id}/payout`, {
        method: 'POST',
        headers: { 'x-admin-secret': secret },
      });
      if (!res.ok) throw new Error();
      await load(secret);
    } catch {
      setError('Payout failed.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleStatus(p: Partner, status: 'active' | 'revoked') {
    const verb = status === 'revoked' ? 'Revoke' : 'Reactivate';
    if (!confirm(`${verb} ${p.name}'s code (${p.code})?`)) return;
    setBusyId(p.id);
    try {
      const res = await fetch(`${API_BASE}/admin/partners/${p.id}/status`, {
        method: 'POST',
        headers: { 'x-admin-secret': secret, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
      await load(secret);
    } catch {
      setError('Status change failed.');
    } finally {
      setBusyId(null);
    }
  }

  if (!authed) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-6 dark:bg-black">
        <form onSubmit={handleLogin} className="w-full max-w-sm">
          <h1 className="mb-6 text-center text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
            Admin console
          </h1>
          <input
            type="password"
            required
            placeholder="Admin secret"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            className="w-full rounded-lg border border-zinc-300 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
          <button
            type="submit"
            disabled={loading}
            className="mt-4 w-full rounded-lg bg-brand-orange px-4 py-3 font-medium text-white disabled:opacity-50 hover:bg-brand-orange-dark"
          >
            {loading ? 'Checking…' : 'Enter'}
          </button>
          {error && <p className="mt-4 text-center text-sm text-red-600">{error}</p>}
        </form>
      </div>
    );
  }

  const totalOwed = partners.reduce((s, p) => s + Math.max(0, p.owed_cents), 0);

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 px-6 py-12 dark:bg-black">
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
              Referral &amp; commission manager
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              {partners.length} partner{partners.length === 1 ? '' : 's'} ·{' '}
              <span className="font-medium text-zinc-700 dark:text-zinc-300">
                {dollars(totalOwed)} owed
              </span>{' '}
              · payout threshold {dollars(threshold)}
            </p>
          </div>
          <button
            onClick={() => load(secret)}
            className="rounded-full border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Refresh
          </button>
        </div>

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        <CreatePartner secret={secret} onCreated={() => load(secret)} />

        <div className="mt-8 overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
              <tr>
                <th className="px-4 py-3">Partner</th>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3 text-right">Clicks</th>
                <th className="px-4 py-3 text-right">Signups</th>
                <th className="px-4 py-3 text-right">Paid</th>
                <th className="px-4 py-3 text-right">Earned</th>
                <th className="px-4 py-3 text-right">Owed</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {partners.map((p) => {
                const overThreshold = p.owed_cents >= threshold;
                return (
                  <tr
                    key={p.id}
                    className={`border-b border-zinc-100 last:border-0 dark:border-zinc-900 ${
                      p.status === 'revoked' ? 'opacity-50' : ''
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-zinc-900 dark:text-zinc-50">{p.name}</div>
                      <div className="text-xs text-zinc-500">
                        {p.type}
                        {p.email ? ` · ${p.email}` : ''}
                        {p.status === 'revoked' ? ' · revoked' : ''}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-mono text-xs text-zinc-900 dark:text-zinc-50">{p.code}</div>
                      <div className="mt-1 flex items-center gap-2 text-xs">
                        <button
                          onClick={() => {
                            void navigator.clipboard.writeText(
                              `${window.location.origin}/r/${p.code}`
                            );
                          }}
                          className="text-brand-orange hover:text-brand-orange-dark"
                          title={`${typeof window !== 'undefined' ? window.location.origin : ''}/r/${p.code}`}
                        >
                          Copy link
                        </button>
                        <a
                          href={`${API_BASE}/partners/${p.code}/qr`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-zinc-500 hover:text-brand-navy"
                        >
                          QR
                        </a>
                      </div>
                      <div className="mt-0.5 text-[10px] uppercase tracking-wide text-zinc-400">
                        {p.comp_model === 'flat'
                          ? '$20 flat'
                          : p.type === 'affiliate'
                            ? '25% · 12mo'
                            : 'give-a-month'}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{p.clicks}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{p.signups}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{p.paid_conversions}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{dollars(p.earned_cents)}</td>
                    <td
                      className={`px-4 py-3 text-right font-medium tabular-nums ${
                        overThreshold ? 'text-blue-600' : 'text-zinc-700 dark:text-zinc-300'
                      }`}
                    >
                      {dollars(p.owed_cents)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        {p.owed_cents > 0 && (
                          <button
                            onClick={() => handlePayout(p)}
                            disabled={busyId === p.id}
                            className={`rounded-full px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${
                              overThreshold
                                ? 'bg-brand-orange text-white hover:bg-brand-orange-dark'
                                : 'border border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900'
                            }`}
                          >
                            Pay out
                          </button>
                        )}
                        {p.status === 'active' ? (
                          <button
                            onClick={() => handleStatus(p, 'revoked')}
                            disabled={busyId === p.id}
                            className="rounded-full border border-zinc-300 px-3 py-1.5 text-xs text-zinc-500 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
                          >
                            Revoke
                          </button>
                        ) : (
                          <button
                            onClick={() => handleStatus(p, 'active')}
                            disabled={busyId === p.id}
                            className="rounded-full border border-zinc-300 px-3 py-1.5 text-xs text-zinc-500 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
                          >
                            Reactivate
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {partners.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-zinc-500">
                    No partners yet — create one above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-xs text-zinc-500">
          &ldquo;Owed&rdquo; is unpaid ledger net (clawbacks included). Paying out marks all
          current unpaid entries settled. Collect a W-9 from any partner crossing $400/yr.
        </p>
      </div>
    </div>
  );
}

function CreatePartner({
  secret,
  onCreated,
}: {
  secret: string;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState('affiliate');
  const [compModel, setCompModel] = useState('recurring');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Comp model only applies to affiliates: 25%/12mo recurring vs a $20 flat
  // bounty. founding_agent/user_referral are give-a-month, no comp model.
  const showComp = type === 'affiliate';

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/partners`, {
        method: 'POST',
        headers: { 'x-admin-secret': secret, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          name: name.trim(),
          email: email.trim(),
          ...(showComp ? { comp_model: compModel } : {}),
          ...(showComp && compModel === 'flat' ? { rate: null, months_cap: null } : {}),
          ...(code.trim() ? { code: code.trim() } : {}),
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? 'Could not create partner');
        return;
      }
      setResult(`Created ${body.name} — code ${body.code}`);
      setName('');
      setEmail('');
      setCode('');
      onCreated();
    } catch {
      setError('Network error.');
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-full bg-brand-orange px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-orange-dark"
      >
        + Create partner
      </button>
    );
  }

  return (
    <form
      onSubmit={handleCreate}
      className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs text-zinc-500">
          Type
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          >
            <option value="affiliate">affiliate</option>
            <option value="founding_agent">founding_agent (lifetime Closer)</option>
            <option value="user_referral">user_referral (give-a-month)</option>
          </select>
        </label>
        {showComp && (
          <label className="flex flex-col gap-1 text-xs text-zinc-500">
            Comp model
            <select
              value={compModel}
              onChange={(e) => setCompModel(e.target.value)}
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            >
              <option value="recurring">25% of subs · first 12 months</option>
              <option value="flat">$20 flat per activation</option>
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1 text-xs text-zinc-500">
          Name
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-500">
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-500">
          Custom code (optional)
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="auto"
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button
          type="submit"
          disabled={loading}
          className="rounded-full bg-brand-orange px-5 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-brand-orange-dark"
        >
          {loading ? 'Creating…' : 'Create'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
        >
          Cancel
        </button>
        {result && <span className="text-sm text-green-600">{result}</span>}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </form>
  );
}
