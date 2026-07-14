import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { formatCents, type AppConfig, type ParcelDetail } from './api';

function formatNumber(value: string | number | null): string | null {
  if (value === null) return null;
  const n = typeof value === 'string' ? parseFloat(value) : value;
  if (!Number.isFinite(n)) return null;
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function factsLine(detail: ParcelDetail): string {
  const parts: string[] = [];
  if (detail.year_built) parts.push(`Built ${detail.year_built}`);
  const sqft = formatNumber(detail.living_area_sqft);
  if (sqft) parts.push(`${sqft} sqft`);
  const stories = detail.stories ? parseFloat(detail.stories) : NaN;
  if (Number.isFinite(stories) && stories > 0) {
    parts.push(`${stories} ${stories === 1 ? 'story' : 'stories'}`);
  }
  const lot = formatNumber(detail.lot_size_sqft);
  if (lot) parts.push(`${lot} sqft lot`);
  const value = formatNumber(detail.assessed_total_value);
  if (value) parts.push(`$${value} assessed`);
  return parts.join(' · ');
}

// Slim by design: facts + one primary action. Everything after the unlock
// lives on the Contact screen.
export function PropertyCard({
  loading,
  detail,
  config,
  onGetContact,
  onClose,
}: {
  loading: boolean;
  detail: ParcelDetail | null;
  config: AppConfig;
  onGetContact: (detail: ParcelDetail) => void;
  onClose: () => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.handle} />
      <TouchableOpacity style={styles.closeButton} onPress={onClose} hitSlop={8}>
        <Text style={styles.closeButtonText}>✕</Text>
      </TouchableOpacity>

      {loading && (
        <View style={styles.loadingRow}>
          <ActivityIndicator />
          <Text style={styles.loadingText}>Looking up owner…</Text>
        </View>
      )}

      {!loading && !detail && <Text style={styles.notFoundText}>No parcel data at this location.</Text>}

      {!loading && detail && (
        <>
          <Text style={styles.address} numberOfLines={2}>
            {detail.situs_address ?? 'Address unavailable'}
          </Text>

          <View style={styles.badgeRow}>
            {detail.is_absentee && (
              <View style={[styles.badge, styles.badgeAbsentee]}>
                <Text style={styles.badgeText}>Absentee owner</Text>
              </View>
            )}
            {detail.has_pool && (
              <View style={[styles.badge, styles.badgePool]}>
                <Text style={styles.badgeText}>Pool</Text>
              </View>
            )}
          </View>

          {detail.is_protected ? (
            <Text style={styles.protectedText}>Protected record (Texas Tax Code §25.025)</Text>
          ) : (
            <>
              {detail.owner_name && (
                <View style={styles.fieldBlock}>
                  <Text style={styles.fieldLabel}>OWNER</Text>
                  <Text style={styles.fieldValue} numberOfLines={2}>
                    {detail.owner_name}
                  </Text>
                </View>
              )}
              {detail.mailing_address && (
                <View style={styles.fieldBlock}>
                  <Text style={styles.fieldLabel}>MAILING ADDRESS</Text>
                  <Text style={styles.fieldValue} numberOfLines={2}>
                    {detail.mailing_address}
                  </Text>
                </View>
              )}
            </>
          )}

          {factsLine(detail) !== '' && <Text style={styles.facts}>{factsLine(detail)}</Text>}

          {!detail.is_protected && (
            <TouchableOpacity style={styles.ctaButton} onPress={() => onGetContact(detail)}>
              <Text style={styles.ctaButtonText}>
                Get Contact Info — {formatCents(config.trace_price_cents)}
              </Text>
            </TouchableOpacity>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#d1d5db',
    marginBottom: 8,
  },
  closeButton: {
    position: 'absolute',
    top: 12,
    right: 16,
    padding: 4,
    zIndex: 2,
  },
  closeButtonText: {
    fontSize: 18,
    color: '#6b7280',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 20,
    gap: 8,
  },
  loadingText: {
    color: '#6b7280',
  },
  notFoundText: {
    paddingVertical: 20,
    color: '#6b7280',
  },
  address: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 6,
    paddingRight: 28,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 6,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  badgeAbsentee: {
    backgroundColor: '#fef3c7',
  },
  badgePool: {
    backgroundColor: '#dbeafe',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  protectedText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#b91c1c',
    marginVertical: 6,
  },
  // Stacked label-above-value: long owner names and mailing addresses wrap
  // cleanly instead of two right-aligned columns mashing into each other.
  fieldBlock: {
    marginTop: 8,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9ca3af',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  fieldValue: {
    fontSize: 15,
    fontWeight: '500',
    color: '#111827',
    lineHeight: 20,
  },
  facts: {
    color: '#6b7280',
    fontSize: 13,
    marginTop: 10,
  },
  ctaButton: {
    marginTop: 14,
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  ctaButtonText: {
    fontWeight: '600',
    color: '#fff',
  },
});
