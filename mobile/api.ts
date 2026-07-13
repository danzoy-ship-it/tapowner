// TODO(Phase 9): move to the config service once it exists.
export const API_BASE = 'https://api-production-7d11.up.railway.app';

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

export async function fetchParcelAt(lat: number, lng: number): Promise<ParcelDetail | null> {
  const res = await fetch(`${API_BASE}/parcels/at?lat=${lat}&lng=${lng}`);
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
  const res = await fetch(`${API_BASE}/trace/${parcelId}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.error ?? 'Trace failed');
  }
  return body;
}
