export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'https://api-production-7d11.up.railway.app';

export async function requestOtp(email: string): Promise<void> {
  const res = await fetch(`${API_BASE}/auth/otp/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? 'Failed to send code');
  }
}

export async function verifyOtp(email: string, code: string): Promise<string> {
  const res = await fetch(`${API_BASE}/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code }),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.error ?? 'Invalid code');
  }
  return body.token as string;
}

const ATTRIBUTION_KEY = 'tapowner_referral';

export function getStoredReferral(): { code: string; attributedAt: number } | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(ATTRIBUTION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function createPortalSession(token: string): Promise<string> {
  const res = await fetch(`${API_BASE}/billing/portal-session`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.error ?? 'Could not open billing portal');
  }
  return body.url as string;
}

export async function createCheckoutSession(email: string): Promise<string> {
  const referral = getStoredReferral();
  const res = await fetch(`${API_BASE}/billing/checkout-session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      ...(referral ? { referralCode: referral.code, referralAttributedAt: referral.attributedAt } : {}),
    }),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.error ?? 'Could not start checkout');
  }
  return body.url as string;
}
