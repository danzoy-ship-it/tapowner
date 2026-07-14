import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { File, Paths } from 'expo-file-system';
import { useRoute, type RouteProp } from '@react-navigation/native';
import {
  farmDraft,
  logFarmExport,
  traceParcel,
  type FarmCriteria,
  type FarmParcel,
} from './api';
import { useApp } from './AppContext';
import type { RootStackParamList } from './navigation';

type Contacts = { phones: string[]; emails: string[] };

// RFC-4180 CSV cell (client-side so exports always match the on-screen filter).
function csvCell(value: unknown): string {
  const s = value == null ? '' : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function contactsFor(p: FarmParcel, traced: Record<number, Contacts>): Contacts {
  const t = traced[p.id];
  if (t) return t;
  return { phones: p.phones ?? [], emails: p.emails ?? [] };
}

function buildCsv(parcels: FarmParcel[], traced: Record<number, Contacts>): string {
  const header = [
    'Owner', 'Property Address', 'City', 'ZIP',
    'Mailing Address', 'Mailing City', 'Mailing State', 'Mailing ZIP', 'Absentee',
    'Sqft', 'Beds', 'Baths Full', 'Baths Half', 'Stories', 'Year Built', 'Pool',
    'Phones', 'Emails',
  ];
  const lines = [header.map(csvCell).join(',')];
  for (const p of parcels) {
    const c = contactsFor(p, traced);
    lines.push(
      [
        p.owner_name,
        p.situs_address ?? '',
        p.situs_city ?? '',
        p.situs_zip ?? '',
        p.mailing_address ?? '',
        p.mailing_city ?? '',
        p.mailing_state ?? '',
        p.mailing_zip ?? '',
        p.is_absentee ? 'Yes' : '',
        p.living_area_sqft ?? '',
        p.bedrooms ?? '',
        p.baths_full ?? '',
        p.baths_half ?? '',
        p.stories ?? '',
        p.year_built ?? '',
        p.has_pool === true ? 'Yes' : p.has_pool === false ? 'No' : '',
        c.phones.join('; '),
        c.emails.join('; '),
      ]
        .map(csvCell)
        .join(',')
    );
  }
  return lines.join('\r\n');
}

function rowFacts(p: FarmParcel): string {
  const parts: string[] = [];
  const sqft = p.living_area_sqft ? Math.round(parseFloat(p.living_area_sqft)) : null;
  if (sqft) parts.push(`${sqft.toLocaleString('en-US')} sqft`);
  if (p.bedrooms || p.baths_full) parts.push(`${p.bedrooms ?? '?'}bd/${p.baths_full ?? '?'}ba`);
  const stories = p.stories ? parseFloat(p.stories) : NaN;
  if (Number.isFinite(stories) && stories > 0) parts.push(`${stories} sty`);
  if (p.has_pool) parts.push('Pool');
  return parts.join(' · ');
}

const BED_OPTIONS = [0, 2, 3, 4, 5] as const;
const BATH_OPTIONS = [0, 2, 3] as const;

// Farm results with the reverse-prospecting layer: filter the drawn area by
// home criteria, export the matches (mail-merge), draft the one letter that
// goes to all of them, or bulk-unlock contact info.
export function FarmResultsScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'FarmResults'>>();
  const { result } = route.params;
  const { token, config, features, showUpgrade } = useApp();

  const [exporting, setExporting] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [minSqftText, setMinSqftText] = useState('');
  const [minBeds, setMinBeds] = useState(0);
  const [minBaths, setMinBaths] = useState(0);
  const [poolOnly, setPoolOnly] = useState(false);
  const [singleStory, setSingleStory] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [traced, setTraced] = useState<Record<number, Contacts>>({});
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);

  const minSqft = parseInt(minSqftText, 10) || 0;
  const filtersActive = minSqft > 0 || minBeds > 0 || minBaths > 0 || poolOnly || singleStory;

  const filtered = useMemo(() => {
    if (!filtersActive) return result.parcels;
    return result.parcels.filter((p) => {
      if (minSqft > 0) {
        const sqft = p.living_area_sqft ? parseFloat(p.living_area_sqft) : 0;
        if (!(sqft >= minSqft)) return false;
      }
      if (minBeds > 0 && !((p.bedrooms ?? 0) >= minBeds)) return false;
      if (minBaths > 0 && !((p.baths_full ?? 0) >= minBaths)) return false;
      if (poolOnly && p.has_pool !== true) return false;
      if (singleStory) {
        const stories = p.stories ? parseFloat(p.stories) : NaN;
        if (stories !== 1) return false;
      }
      return true;
    });
  }, [result.parcels, filtersActive, minSqft, minBeds, minBaths, poolOnly, singleStory]);

  const criteria: FarmCriteria = {
    ...(minSqft > 0 ? { min_sqft: minSqft } : {}),
    ...(minBeds > 0 ? { min_beds: minBeds } : {}),
    ...(minBaths > 0 ? { min_baths: minBaths } : {}),
    ...(poolOnly ? { pool: true } : {}),
    ...(singleStory ? { single_story: true } : {}),
  };

  async function handleExport() {
    if (filtered.length === 0) return;
    setExporting(true);
    try {
      const gate = await logFarmExport(token, filtered.length);
      if (!gate.allowed) {
        Alert.alert('Export limit reached', gate.error ?? 'Beta export limit reached — resets on the 1st.');
        return;
      }
      const file = new File(Paths.cache, 'tapowner-farm.csv');
      file.create({ overwrite: true });
      file.write(buildCsv(filtered, traced));
      await Share.share({ url: file.uri });
      if (gate.beta && gate.remaining !== null) {
        // Passive heads-up, not a blocker.
        if (gate.remaining <= 25) {
          Alert.alert('Heads up', `${gate.remaining} free beta export rows left this month.`);
        }
      }
    } catch (err) {
      Alert.alert('Export failed', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setExporting(false);
    }
  }

  async function handleLetter() {
    if (!features.draft_email) return showUpgrade();
    setDrafting(true);
    try {
      const { subject, body } = await farmDraft(token, 'professional', criteria);
      await Share.share({ message: `Subject: ${subject}\n\n${body}` });
    } catch (err) {
      Alert.alert('Letter failed', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setDrafting(false);
    }
  }

  function handleBulkTrace() {
    const targets = filtered.filter((p) => contactsFor(p, traced).phones.length === 0);
    if (targets.length === 0) {
      Alert.alert('All set', 'You already have contact info for every home in this list.');
      return;
    }
    const maxCost = ((targets.length * config.trace_price_cents) / 100).toFixed(2);
    Alert.alert(
      `Get contacts for ${targets.length} home${targets.length === 1 ? '' : 's'}?`,
      `Up to $${maxCost}. Included traces are used first, homes you already unlocked are free, and a no-match is never charged.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Get contacts', onPress: () => void runBulkTrace(targets) },
      ]
    );
  }

  async function runBulkTrace(targets: FarmParcel[]) {
    setBulkProgress({ done: 0, total: targets.length });
    let matched = 0;
    let noMatch = 0;
    let failed = 0;
    const found: Record<number, Contacts> = {};
    for (let i = 0; i < targets.length; i++) {
      const parcel = targets[i];
      try {
        const r = await traceParcel(token, parcel.id);
        if (r.matched) {
          matched += 1;
          found[parcel.id] = {
            phones: r.phones.map((x) => x.number),
            emails: r.emails.map((x) => x.email),
          };
        } else {
          noMatch += 1;
        }
      } catch (err) {
        failed += 1;
        const msg = err instanceof Error ? err.message : '';
        // A cap / subscription stop applies to every remaining call too.
        if (/cap|inactive|subscription/i.test(msg)) {
          setTraced((prev) => ({ ...prev, ...found }));
          setBulkProgress(null);
          Alert.alert('Stopped', `${msg}\n\nGot contacts for ${matched} home${matched === 1 ? '' : 's'} first.`);
          return;
        }
      }
      setBulkProgress({ done: i + 1, total: targets.length });
    }
    setTraced((prev) => ({ ...prev, ...found }));
    setBulkProgress(null);
    Alert.alert(
      'Done',
      `${matched} matched · ${noMatch} no verified contact (not charged)${failed ? ` · ${failed} failed` : ''}.\n\nExport the CSV to take phones & emails with you.`
    );
  }

  function clearFilters() {
    setMinSqftText('');
    setMinBeds(0);
    setMinBaths(0);
    setPoolOnly(false);
    setSingleStory(false);
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.countText}>
          {filtersActive
            ? `${filtered.length} of ${result.count} match`
            : `${result.count} ${result.count === 1 ? 'property' : 'properties'}`}
          {result.capped ? ' (limit reached — draw smaller for full coverage)' : ''}
        </Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity
            style={[styles.headerButton, filtersActive && styles.headerButtonActive]}
            onPress={() => setFiltersOpen(!filtersOpen)}
          >
            <Text style={[styles.headerButtonText, filtersActive && styles.headerButtonTextActive]}>
              Filters{filtersActive ? ' ✓' : ''}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerButton} onPress={handleExport} disabled={exporting}>
            <Text style={styles.headerButtonText}>{exporting ? '…' : '⬇ CSV'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {filtersOpen && (
        <View style={styles.filterPanel}>
          <View style={styles.filterRow}>
            <Text style={styles.filterLabel}>Min sqft</Text>
            <TextInput
              style={styles.sqftInput}
              placeholder="e.g. 3500"
              keyboardType="number-pad"
              value={minSqftText}
              onChangeText={setMinSqftText}
              onSubmitEditing={() => Keyboard.dismiss()}
              returnKeyType="done"
            />
          </View>
          <View style={styles.filterRow}>
            <Text style={styles.filterLabel}>Beds</Text>
            <View style={styles.chipRow}>
              {BED_OPTIONS.map((n) => (
                <TouchableOpacity
                  key={n}
                  style={[styles.chip, minBeds === n && styles.chipSelected]}
                  onPress={() => setMinBeds(n)}
                >
                  <Text style={[styles.chipText, minBeds === n && styles.chipTextSelected]}>
                    {n === 0 ? 'Any' : `${n}+`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <View style={styles.filterRow}>
            <Text style={styles.filterLabel}>Baths</Text>
            <View style={styles.chipRow}>
              {BATH_OPTIONS.map((n) => (
                <TouchableOpacity
                  key={n}
                  style={[styles.chip, minBaths === n && styles.chipSelected]}
                  onPress={() => setMinBaths(n)}
                >
                  <Text style={[styles.chipText, minBaths === n && styles.chipTextSelected]}>
                    {n === 0 ? 'Any' : `${n}+`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <View style={styles.filterRow}>
            <Text style={styles.filterLabel}>Features</Text>
            <View style={styles.chipRow}>
              <TouchableOpacity
                style={[styles.chip, poolOnly && styles.chipSelected]}
                onPress={() => setPoolOnly(!poolOnly)}
              >
                <Text style={[styles.chipText, poolOnly && styles.chipTextSelected]}>Pool</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.chip, singleStory && styles.chipSelected]}
                onPress={() => setSingleStory(!singleStory)}
              >
                <Text style={[styles.chipText, singleStory && styles.chipTextSelected]}>
                  Single story
                </Text>
              </TouchableOpacity>
              {filtersActive && (
                <TouchableOpacity style={styles.clearButton} onPress={clearFilters}>
                  <Text style={styles.clearButtonText}>Clear</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
          <Text style={styles.filterHint}>
            Homes missing a value are excluded while that filter is on.
          </Text>
        </View>
      )}

      <View style={styles.actionRow}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={handleLetter}
          disabled={drafting || filtered.length === 0}
        >
          {drafting ? (
            <ActivityIndicator size="small" color="#111827" />
          ) : (
            <Text style={styles.actionButtonText}>✍ Reverse-prospect letter</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={handleBulkTrace}
          disabled={bulkProgress !== null || filtered.length === 0}
        >
          <Text style={styles.actionButtonText}>
            {bulkProgress ? `Tracing ${bulkProgress.done}/${bulkProgress.total}…` : '☎ Get contacts'}
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => {
          const c = contactsFor(item, traced);
          return (
            <View style={styles.row}>
              <View style={styles.rowMain}>
                <Text style={styles.rowAddress} numberOfLines={1}>
                  {item.situs_address ?? 'Address unavailable'}
                </Text>
                <Text style={styles.rowOwner} numberOfLines={1}>
                  {item.owner_name}
                </Text>
                {(rowFacts(item) !== '' || c.phones.length > 0) && (
                  <Text style={styles.rowFacts}>
                    {[rowFacts(item), c.phones.length > 0 ? '✓ contact' : '']
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                )}
              </View>
              {item.is_absentee && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>Absentee</Text>
                </View>
              )}
            </View>
          );
        }}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            {filtersActive
              ? 'No homes match these filters — loosen them or draw a bigger area.'
              : 'No owners found in that area — try drawing a different one.'}
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingHorizontal: 20,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    gap: 8,
  },
  countText: {
    fontSize: 15,
    fontWeight: '700',
    flexShrink: 1,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 6,
  },
  headerButton: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  headerButtonActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  headerButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2563eb',
  },
  headerButtonTextActive: {
    color: '#fff',
  },
  filterPanel: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
    gap: 10,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  filterLabel: {
    width: 64,
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  sqftInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 14,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    flex: 1,
    alignItems: 'center',
  },
  chip: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 14,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  chipSelected: {
    backgroundColor: '#16a34a',
    borderColor: '#16a34a',
  },
  chipText: {
    fontSize: 12,
    color: '#374151',
  },
  chipTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  clearButton: {
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  clearButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#b91c1c',
  },
  filterHint: {
    fontSize: 11,
    color: '#9ca3af',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    marginBottom: 8,
  },
  actionButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  rowMain: {
    flex: 1,
    marginRight: 8,
  },
  rowAddress: {
    fontSize: 14,
    fontWeight: '600',
  },
  rowOwner: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 1,
  },
  rowFacts: {
    fontSize: 11,
    color: '#9ca3af',
    marginTop: 2,
  },
  badge: {
    backgroundColor: '#fef3c7',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#92400e',
  },
  emptyText: {
    color: '#6b7280',
    paddingVertical: 24,
    textAlign: 'center',
  },
});
