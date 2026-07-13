// TODO(Phase 9): move to the config service once it exists.
export const API_BASE = 'https://api-production-7d11.up.railway.app';

// A hung connection (server restart, dead Wi-Fi) must fail visibly, never
// leave a spinner frozen forever.
export async function timedFetch(url: string, init?: RequestInit, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Request timed out — check your connection and try again');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export interface ParcelDetail {
  id: number;
  apn: string | null;
  county_fips: string;
  county_name: string;
  situs_address: string | null;
  owner_name: string | null;
  owner_name_care: string | null;
  mailing_address: string | null;
  is_absentee: boolean | null;
  is_protected: boolean;
  land_use: string | null;
  legal_description: string | null;
  living_area_sqft: string | null;
  year_built: number | null;
  bedrooms: number | null;
  baths_full: number | null;
  baths_half: number | null;
  stories: string | null;
  lot_size_sqft: string | null;
  has_pool: boolean | null;
  has_garage: boolean | null;
  assessed_land_value: string | null;
  assessed_improvement_value: string | null;
  assessed_total_value: string | null;
  last_sale_date: string | null;
  last_sale_price: string | null;
}

export interface TierConfig {
  price_cents: number;
  included_traces: number;
  features: { draft_email: boolean; crm: boolean };
}

export interface AppConfig {
  version: string;
  trial_days: number;
  trace_price_cents: number;
  closer_included_traces: number;
  tiers: { prospector?: TierConfig; closer?: TierConfig };
  draft: {
    templates: DraftTemplate[];
    tones: { id: string; label: string }[];
    rate_limit_per_day: number;
  };
  manage_plan_url_text: string;
}

export const FALLBACK_CONFIG: AppConfig = {
  version: 'fallback',
  trial_days: 30,
  trace_price_cents: 29,
  closer_included_traces: 10,
  tiers: {
    prospector: { price_cents: 999, included_traces: 0, features: { draft_email: false, crm: false } },
    closer: { price_cents: 1999, included_traces: 10, features: { draft_email: true, crm: true } },
  },
  draft: {
    templates: [
      { id: 'just_sold_farming', label: 'Just Sold (Farming)' },
      { id: 'absentee_owner', label: 'Absentee Owner' },
      { id: 'expired_listing', label: 'Expired Listing' },
      { id: 'fsbo', label: 'FSBO Outreach' },
      { id: 'open_house_neighbor_invite', label: 'Open House Neighbor Invite' },
    ],
    tones: [
      { id: 'professional', label: 'Professional' },
      { id: 'friendly', label: 'Friendly' },
      { id: 'direct', label: 'Direct' },
    ],
    rate_limit_per_day: 30,
  },
  manage_plan_url_text: 'Manage your plan at tapowner.com',
};

export async function fetchConfig(): Promise<AppConfig> {
  const res = await timedFetch(`${API_BASE}/config`);
  if (!res.ok) {
    throw new Error(`Config fetch failed: ${res.status}`);
  }
  return res.json();
}

export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export interface GeocodeResult {
  lat: number;
  lng: number;
  formatted_address: string;
}

export async function geocodeAddress(address: string): Promise<GeocodeResult> {
  const res = await timedFetch(`${API_BASE}/geocode?address=${encodeURIComponent(address)}`);
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.error ?? 'Address search failed');
  }
  return body;
}

export async function fetchParcelAt(lat: number, lng: number): Promise<ParcelDetail | null> {
  const res = await timedFetch(`${API_BASE}/parcels/at?lat=${lat}&lng=${lng}`);
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`Parcel lookup failed: ${res.status}`);
  }
  return res.json();
}

export interface TracePhone {
  number: string;
  type: string;
  carrier?: string;
  dnc: boolean;
  tcpa: boolean;
  rank?: number;
  reachable?: boolean;
  tested?: boolean;
}

export interface TraceEmail {
  email: string;
}

export interface TraceResponse {
  matched: boolean;
  phones: TracePhone[];
  emails: TraceEmail[];
  matchQuality?: string;
  freeReview?: boolean;
  message?: string;
}

export async function traceParcel(token: string, parcelId: number): Promise<TraceResponse> {
  const res = await timedFetch(`${API_BASE}/trace/${parcelId}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.error ?? 'Trace failed');
  }
  return body;
}

export interface DraftTemplate {
  id: string;
  label: string;
}

export interface DraftResponse {
  subject: string;
  body: string;
}

export async function draftEmail(
  token: string,
  parcelId: number,
  templateId: string,
  tone: string
): Promise<DraftResponse> {
  const res = await timedFetch(`${API_BASE}/draft`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ parcel_id: parcelId, template_id: templateId, tone }),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.error ?? 'Draft failed');
  }
  return body;
}

export async function updateAgentProfile(
  token: string,
  profile: { name: string; brokerage: string; phone: string }
): Promise<void> {
  const res = await timedFetch(`${API_BASE}/me/profile`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(profile),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? 'Failed to save profile');
  }
}

export const SAVED_PROPERTY_STATUSES = [
  { id: 'new', label: 'New' },
  { id: 'contacted', label: 'Contacted' },
  { id: 'follow_up', label: 'Follow-up' },
  { id: 'appointment', label: 'Appointment' },
  { id: 'listed', label: 'Listed' },
  { id: 'dead', label: 'Dead' },
] as const;

export type SavedPropertyStatus = (typeof SAVED_PROPERTY_STATUSES)[number]['id'];

export interface SavedPropertySummary {
  id: number;
  parcel_id: number;
  status: SavedPropertyStatus;
  created_at: string;
  owner_name: string | null;
  situs_address: string | null;
  situs_city: string | null;
  situs_state: string | null;
  situs_zip: string | null;
  is_absentee: boolean | null;
  is_protected: boolean;
  note_count: string;
  latest_note: string | null;
}

export interface SavedPropertyNote {
  id: number;
  body: string;
  created_at: string;
}

export interface SavedPropertyDetail extends Omit<SavedPropertySummary, 'note_count' | 'latest_note'> {
  notes: SavedPropertyNote[];
}

async function handleJson<T>(res: Response): Promise<T> {
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.error ?? 'Request failed');
  }
  return body;
}

export async function saveProperty(
  token: string,
  parcelId: number,
  note?: string
): Promise<SavedPropertySummary> {
  const res = await timedFetch(`${API_BASE}/saved-properties`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ parcel_id: parcelId, note }),
  });
  return handleJson(res);
}

export async function listSavedProperties(
  token: string,
  status?: SavedPropertyStatus
): Promise<SavedPropertySummary[]> {
  const url = status
    ? `${API_BASE}/saved-properties?status=${status}`
    : `${API_BASE}/saved-properties`;
  const res = await timedFetch(url, { headers: { Authorization: `Bearer ${token}` } });
  return handleJson(res);
}

export async function getSavedProperty(token: string, id: number): Promise<SavedPropertyDetail> {
  const res = await timedFetch(`${API_BASE}/saved-properties/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return handleJson(res);
}

export async function updateSavedPropertyStatus(
  token: string,
  id: number,
  status: SavedPropertyStatus
): Promise<SavedPropertySummary> {
  const res = await timedFetch(`${API_BASE}/saved-properties/${id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  return handleJson(res);
}

export async function addSavedPropertyNote(
  token: string,
  id: number,
  body: string
): Promise<SavedPropertyNote> {
  const res = await timedFetch(`${API_BASE}/saved-properties/${id}/notes`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  });
  return handleJson(res);
}
