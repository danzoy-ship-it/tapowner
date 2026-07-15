import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatCents, type AppConfig, type ParcelDetail } from './api';
import { tagLabel } from './featureTags';

function formatNumber(value: string | number | null): string | null {
  if (value === null) return null;
  const n = typeof value === 'string' ? parseFloat(value) : value;
  if (!Number.isFinite(n)) return null;
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function formatMoney(value: string | null): string | null {
  const n = formatNumber(value);
  return n ? `$${n}` : null;
}

function storiesText(detail: ParcelDetail): string | null {
  const n = detail.stories ? parseFloat(detail.stories) : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  return `${n} ${n === 1 ? 'story' : 'stories'}`;
}

function bathsText(detail: ParcelDetail): string | null {
  if (!detail.baths_full && !detail.baths_half) return null;
  const parts: string[] = [];
  if (detail.baths_full) parts.push(`${detail.baths_full} full`);
  if (detail.baths_half) parts.push(`${detail.baths_half} half`);
  return parts.join(' · ');
}

function factsLine(detail: ParcelDetail): string {
  const parts: string[] = [];
  if (detail.year_built) parts.push(`Built ${detail.year_built}`);
  const sqft = formatNumber(detail.living_area_sqft);
  if (sqft) parts.push(`${sqft} sqft`);
  const stories = storiesText(detail);
  if (stories) parts.push(stories);
  const lot = formatNumber(detail.lot_size_sqft);
  if (lot) parts.push(`${lot} sqft lot`);
  const value = formatMoney(detail.assessed_total_value);
  if (value) parts.push(`${value} assessed`);
  return parts.join(' · ');
}

function DetailRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

// Compact by default: facts + one primary action. "More" expands to a
// full-screen sheet with every field we hold, so new data (beds/baths/pool/
// casita as counties land) never has to cram into the bottom third.
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
  const insets = useSafeAreaInsets();
  const [expanded, setExpanded] = useState(false);

  function close() {
    setExpanded(false);
    onClose();
  }

  const badges = detail && (
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
      {detail.has_garage && (
        <View style={[styles.badge, styles.badgePool]}>
          <Text style={styles.badgeText}>Garage</Text>
        </View>
      )}
      {(detail.owner_portfolio_count ?? 0) > 0 && (
        <View style={[styles.badge, styles.badgePortfolio]}>
          <Text style={styles.badgeText}>
            Owns {detail.owner_portfolio_count} more
          </Text>
        </View>
      )}
      {detail.senior_owner && (
        <View style={[styles.badge, styles.badgeSenior]}>
          <Text style={styles.badgeText}>65+ exemption</Text>
        </View>
      )}
      {(detail.tenure_years ?? 0) >= 15 && (
        <View style={[styles.badge, styles.badgeSenior]}>
          <Text style={styles.badgeText}>Owned {detail.tenure_years}y</Text>
        </View>
      )}
    </View>
  );

  const ownerBlocks = detail && (
    <>
      {detail.is_protected ? (
        <Text style={styles.protectedText}>Protected record (Texas Tax Code §25.025)</Text>
      ) : (
        <>
          {detail.owner_name && (
            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>OWNER</Text>
              <Text style={styles.fieldValue} numberOfLines={expanded ? undefined : 2}>
                {detail.owner_name}
              </Text>
              {expanded && detail.owner_name_care && (
                <Text style={styles.fieldSubValue}>c/o {detail.owner_name_care}</Text>
              )}
            </View>
          )}
          {detail.mailing_address && (
            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>MAILING ADDRESS</Text>
              <Text style={styles.fieldValue} numberOfLines={expanded ? undefined : 2}>
                {detail.mailing_address}
              </Text>
            </View>
          )}
        </>
      )}
    </>
  );

  const unlocked = detail?.already_unlocked === true;
  const cta = detail && !detail.is_protected && (
    <TouchableOpacity
      style={[styles.ctaButton, unlocked && styles.ctaButtonUnlocked]}
      onPress={() => onGetContact(detail)}
    >
      <Text style={styles.ctaButtonText}>
        {unlocked
          ? 'Contact this person — Free'
          : `Contact this person — ${formatCents(config.trace_price_cents)}`}
      </Text>
    </TouchableOpacity>
  );

  // ---------- full-screen expanded sheet ----------
  if (expanded && detail) {
    return (
      <View style={[styles.expandedContainer, { paddingTop: insets.top + 6 }]}>
        <TouchableOpacity style={styles.moreButton} onPress={() => setExpanded(false)} hitSlop={10}>
          <View style={styles.handle} />
          <Text style={styles.moreButtonText}>Less ▾</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.closeButtonExpanded} onPress={close} hitSlop={8}>
          <Text style={styles.closeButtonText}>✕</Text>
        </TouchableOpacity>

        <ScrollView
          style={styles.expandedScroll}
          contentContainerStyle={{ paddingBottom: 16 }}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.addressExpanded}>{detail.situs_address ?? 'Address unavailable'}</Text>
          {badges}
          {ownerBlocks}

          <Text style={styles.sectionHeader}>Property details</Text>
          <DetailRow label="Year built" value={detail.year_built ? String(detail.year_built) : null} />
          <DetailRow
            label="Living area"
            value={formatNumber(detail.living_area_sqft) ? `${formatNumber(detail.living_area_sqft)} sqft` : null}
          />
          <DetailRow label="Stories" value={storiesText(detail)} />
          <DetailRow label="Bedrooms" value={detail.bedrooms ? String(detail.bedrooms) : null} />
          <DetailRow label="Bathrooms" value={bathsText(detail)} />
          <DetailRow
            label="Lot size"
            value={formatNumber(detail.lot_size_sqft) ? `${formatNumber(detail.lot_size_sqft)} sqft` : null}
          />
          {/* County-recorded yes/no facts + extra features (spa, casita, deck…).
              Rows hide when the county didn't record the fact (per build doc §4:
              omit, never show a placeholder). */}
          <DetailRow
            label="Pool"
            value={detail.has_pool === true ? 'Yes' : detail.has_pool === false ? 'No' : null}
          />
          <DetailRow
            label="Garage"
            value={detail.has_garage === true ? 'Yes' : detail.has_garage === false ? 'No' : null}
          />
          <DetailRow
            label="Features"
            value={
              detail.features && detail.features.filter((t) => t !== 'pool' && t !== 'garage').length > 0
                ? detail.features
                    .filter((t) => t !== 'pool' && t !== 'garage')
                    .map(tagLabel)
                    .join(' · ')
                : null
            }
          />

          <Text style={styles.sectionHeader}>Valuation</Text>
          <DetailRow label="Assessed land" value={formatMoney(detail.assessed_land_value)} />
          <DetailRow label="Assessed improvements" value={formatMoney(detail.assessed_improvement_value)} />
          <DetailRow label="Assessed total" value={formatMoney(detail.assessed_total_value)} />
          <DetailRow
            label="Last sale"
            value={
              detail.last_sale_date
                ? `${detail.last_sale_date.slice(0, 10)}${formatMoney(detail.last_sale_price) ? ` · ${formatMoney(detail.last_sale_price)}` : ''}`
                : null
            }
          />
          <DetailRow
            label="Owned"
            value={
              detail.tenure_years != null
                ? `${detail.tenure_years} year${detail.tenure_years === 1 ? '' : 's'}`
                : null
            }
          />
          <DetailRow
            label="Owner"
            value={
              detail.senior_owner
                ? `65+ exemption${detail.homestead ? ' · owner-occupied' : ''}`
                : detail.homestead
                  ? 'Owner-occupied (homestead)'
                  : null
            }
          />

          <Text style={styles.sectionHeader}>Record</Text>
          <DetailRow
            label="Also owns"
            value={
              (detail.owner_portfolio_count ?? 0) > 0
                ? `${detail.owner_portfolio_count} other propert${detail.owner_portfolio_count === 1 ? 'y' : 'ies'} (same owner & mailing address)`
                : null
            }
          />
          <DetailRow label="County" value={detail.county_name} />
          <DetailRow label="Parcel ID (APN)" value={detail.apn} />
          <DetailRow label="Land use" value={detail.land_use} />
          <DetailRow label="Legal description" value={detail.legal_description} />
        </ScrollView>

        <View style={{ paddingBottom: insets.bottom > 0 ? 4 : 12 }}>{cta}</View>
      </View>
    );
  }

  // ---------- compact bottom card ----------
  return (
    <View style={styles.card}>
      {detail ? (
        <TouchableOpacity style={styles.moreButton} onPress={() => setExpanded(true)} hitSlop={10}>
          <View style={styles.handle} />
          <Text style={styles.moreButtonText}>More ▴</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.handle} />
      )}
      <TouchableOpacity style={styles.closeButton} onPress={close} hitSlop={8}>
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
          {badges}
          {ownerBlocks}
          {factsLine(detail) !== '' && <Text style={styles.facts}>{factsLine(detail)}</Text>}
          {cta}
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
    paddingTop: 8,
    paddingBottom: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  expandedContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#fff',
    paddingHorizontal: 20,
  },
  expandedScroll: {
    flex: 1,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#d1d5db',
  },
  moreButton: {
    alignItems: 'center',
    gap: 3,
    paddingVertical: 4,
    marginBottom: 4,
  },
  moreButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
  },
  closeButton: {
    position: 'absolute',
    top: 12,
    right: 16,
    padding: 4,
    zIndex: 2,
  },
  closeButtonExpanded: {
    position: 'absolute',
    top: 54,
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
  addressExpanded: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 10,
    marginBottom: 8,
    paddingRight: 32,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 6,
    flexWrap: 'wrap',
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
  badgePortfolio: {
    backgroundColor: '#e0e7ff',
  },
  badgeSenior: {
    backgroundColor: '#fef3c7',
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
  fieldSubValue: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 1,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
    marginTop: 18,
    marginBottom: 4,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  detailLabel: {
    fontSize: 14,
    color: '#6b7280',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
    flexShrink: 1,
    textAlign: 'right',
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
  ctaButtonUnlocked: {
    backgroundColor: '#16a34a',
  },
  ctaButtonText: {
    fontWeight: '600',
    color: '#fff',
  },
});
