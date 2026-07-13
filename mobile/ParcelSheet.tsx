import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { ParcelDetail } from './api';

function formatNumber(value: string | number | null): string | null {
  if (value === null) return null;
  const n = typeof value === 'string' ? parseFloat(value) : value;
  if (!Number.isFinite(n)) return null;
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function formatCurrency(value: string | null): string | null {
  const n = formatNumber(value);
  return n === null ? null : `$${n}`;
}

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function bedsBathsLine(detail: ParcelDetail): string | null {
  const parts: string[] = [];
  if (detail.bedrooms !== null) parts.push(`${detail.bedrooms} bed`);
  const baths = [detail.baths_full ?? 0, (detail.baths_half ?? 0) * 0.5].reduce((a, b) => a + b, 0);
  if (detail.baths_full !== null || detail.baths_half !== null) parts.push(`${baths} bath`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

function lastSaleLine(detail: ParcelDetail): string | null {
  const price = formatCurrency(detail.last_sale_price);
  const date = formatDate(detail.last_sale_date);
  if (!price && !date) return null;
  if (price && date) return `Sold ${price} on ${date}`;
  return price ? `Sold ${price}` : `Sold ${date}`;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

export function ParcelSheet({
  loading,
  detail,
  onClose,
}: {
  loading: boolean;
  detail: ParcelDetail | null;
  onClose: () => void;
}) {
  return (
    <View style={styles.sheet}>
      <View style={styles.handle} />
      <TouchableOpacity style={styles.closeButton} onPress={onClose}>
        <Text style={styles.closeButtonText}>✕</Text>
      </TouchableOpacity>

      {loading && (
        <View style={styles.loadingRow}>
          <ActivityIndicator />
          <Text style={styles.loadingText}>Looking up owner…</Text>
        </View>
      )}

      {!loading && !detail && (
        <Text style={styles.notFoundText}>No parcel data at this location.</Text>
      )}

      {!loading && detail && (
        <>
          <Text style={styles.address}>{detail.situs_address ?? 'Address unavailable'}</Text>

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
            <Text style={styles.protectedText}>
              Protected record (Texas Tax Code §25.025)
            </Text>
          ) : (
            <>
              {detail.owner_name && <Row label="Owner" value={detail.owner_name} />}
              {detail.mailing_address && (
                <Row label="Mailing address" value={detail.mailing_address} />
              )}
            </>
          )}

          {detail.year_built !== null && (
            <Row label="Year built" value={String(detail.year_built)} />
          )}
          {formatNumber(detail.living_area_sqft) && (
            <Row label="Living area" value={`${formatNumber(detail.living_area_sqft)} sqft`} />
          )}
          {bedsBathsLine(detail) && <Row label="Beds / baths" value={bedsBathsLine(detail)!} />}
          {formatNumber(detail.lot_size_sqft) && (
            <Row label="Lot size" value={`${formatNumber(detail.lot_size_sqft)} sqft`} />
          )}
          {lastSaleLine(detail) && <Row label="Last sale" value={lastSaleLine(detail)!} />}
          {formatCurrency(detail.assessed_total_value) && (
            <Row label="Assessed value" value={formatCurrency(detail.assessed_total_value)!} />
          )}

          <TouchableOpacity style={styles.ctaButton} disabled>
            <Text style={styles.ctaButtonText}>Get Contact Info — $0.29</Text>
            <Text style={styles.ctaButtonSubtext}>Coming in beta</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
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
  },
  closeButtonText: {
    fontSize: 18,
    color: '#6b7280',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  loadingText: {
    color: '#6b7280',
  },
  notFoundText: {
    paddingVertical: 24,
    color: '#6b7280',
  },
  address: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 8,
    paddingRight: 24,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
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
    marginVertical: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  rowLabel: {
    color: '#6b7280',
  },
  rowValue: {
    fontWeight: '500',
    flexShrink: 1,
    textAlign: 'right',
  },
  ctaButton: {
    marginTop: 16,
    backgroundColor: '#e5e7eb',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  ctaButtonText: {
    fontWeight: '600',
    color: '#9ca3af',
  },
  ctaButtonSubtext: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 2,
  },
});
