import * as SecureStore from 'expo-secure-store';
import { API_BASE, timedFetch } from './api';

const TOKEN_KEY = 'tapowner_session_token';

export async function getStoredToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function storeToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export async function requestOtp(email: string): Promise<void> {
  const res = await timedFetch(`${API_BASE}/auth/otp/request`, {
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
  const res = await timedFetch(`${API_BASE}/auth/otp/verify`, {
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

export interface Me {
  id: number;
  email: string;
  agent_profile: Record<string, unknown>;
  tier: 'prospector' | 'closer' | null;
  status: string | null;
  trial_ends_at: string | null;
  included_traces_remaining: number | null;
  period_end: string | null;
}

export async function fetchMe(token: string): Promise<Me | null> {
  const res = await timedFetch(`${API_BASE}/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    return null;
  }
  return res.json();
}
