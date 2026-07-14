import { useMemo, useState } from 'react';
import {
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
import type { FarmParcel } from './api';
import type { RootStackParamList } from './navigation';

// RFC-4180 CSV cell (client-side so exports always match the on-screen filter).
function csvCell(value: unknown): string {
  const s = value == null ? '' : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function buildCsv(parcels: FarmParcel[]): string {
  const header = [
    'Owner', 'Property Address', 'City', 'ZIP',
    'Mailing Address', 'Mailing City', 'Mailing State', 'Mailing ZIP', 'Absentee',
    'Sqft', 'Beds', 'Baths Full', 'Baths Half', 'Stories', 'Year Built', 'Pool',
  ];
  const lines = [header.map(csvCell).join(',')];
  for (const p of parcels) {
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
  if (p.bedrooms || p.baths_full) {
    parts.push(`${p.bedrooms ?? '?'}bd/${p.baths_full ?? '?'}ba`);
  }
  const stories = p.stories ? parseFloat(p.stories) : NaN;
  if (Number.isFinite(stories) && stories > 0) parts.push(`${stories} sty`);
  if (p.has_pool) parts.push('Pool');
  return parts.join(' · ');
}

const BED_OPTIONS = [0, 2, 3, 4, 5] as const;
const BATH_OPTIONS = [0, 2, 3] as const;

// Farm results with a criteria layer ("neighborhood search"): filter the drawn
// area by sqft/beds/baths/pool/single-story, then export exactly what matches.
export function FarmResultsScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'FarmResults'>>();
  const { result } = route.params;
  const [exporting, setExporting] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [minSqftText, setMinSqftText] = useState('');
  const [minBeds, setMinBeds] = useState(0);
  const [minBaths, setMinBaths] = useState(0);
  const [poolOnly, setPoolOnly] = useState(false);
  const [singleStory, setSingleStory] = useState(false);

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

  async function handleExport() {
    setExporting(true);
    try {
      const file = new File(Paths.cache, 'tapowner-farm.csv');
      file.create({ overwrite: true });
      file.write(buildCsv(filtered));
      await Share.share({ url: file.uri });
    } catch (err) {
      Alert.alert('Export failed', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setExporting(false);
    }
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
            <Text style={styles.headerButtonText}>{exporting ? 'Exporting…' : '⬇ CSV'}</Text>
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

      <Text style={styles.hint}>
        Export includes owner names, mailing addresses, and home facts — mail-merge ready.
      </Text>

      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.rowMain}>
              <Text style={styles.rowAddress} numberOfLines={1}>
                {item.situs_address ?? 'Address unavailable'}
              </Text>
              <Text style={styles.rowOwner} numberOfLines={1}>
                {item.owner_name}
              </Text>
              {rowFacts(item) !== '' && <Text style={styles.rowFacts}>{rowFacts(item)}</Text>}
            </View>
            {item.is_absentee && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>Absentee</Text>
              </View>
            )}
          </View>
        )}
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
  hint: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 6,
    marginBottom: 8,
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
