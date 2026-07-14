import { createContext, useContext } from 'react';
import type { AppConfig } from './api';
import type { Me } from './auth';

export interface TierFeatures {
  draft_email: boolean;
  crm: boolean;
}

export interface AppContextValue {
  token: string;
  me: Me | null;
  config: AppConfig;
  features: TierFeatures;
  // True when the subscription is not usable (canceled / past_due / expired).
  // The app stays open in read-only mode: saved data + already-traced contacts
  // are viewable, but new traces, drafts, and saves are blocked.
  readOnly: boolean;
  refreshMe: () => Promise<void>;
  logout: () => Promise<void>;
  showUpgrade: () => void;
}

export const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp outside provider');
  return value;
}
