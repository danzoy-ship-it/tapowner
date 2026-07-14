import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  Platform,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as MailComposer from 'expo-mail-composer';
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

const BED_OPTIONS = [0, 2, 3, 4, 5, 6] as const;
const BATH_OPTIONS = [0, 2, 3, 4, 5, 6] as const;

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
  const [emailProgress, setEmailProgress] = useState<{ done: number; total: number } | null>(null);

  // One-by-one emailing stays pleasant up to here; bigger lists belong in a
  // proper mail merge via the CSV (Frederick's call: 15).
  const EMAIL_MAX = 15;

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

  function clearFilters() {
    setMinSqftText('');
    setMinBeds(0);
    setMinBaths(0);
    setPoolOnly(false);
    setSingleStory(false);
  }

  // "Unlocked" = we already hold any contact data for this home.
  function isUnlocked(p: FarmParcel): boolean {
    const c = contactsFor(p, traced);
    return c.phones.length > 0 || c.emails.length > 0;
  }

  // Per-owner emailing through the agent's OWN Mail account: one pre-addressed
  // composer per home (never one blast), reviewed and sent individually --
  // compliant and deliverable. Big lists go via CSV + mail merge instead.
  async function runEmailLoop(targets: FarmParcel[], contacts: Record<number, Contacts>) {
    setEmailProgress({ done: 0, total: targets.length });
    try {
      const { subject, body } = await farmDraft(token, 'professional', criteria);
      const mailAvailable = await MailComposer.isAvailableAsync();
      if (!mailAvailable) {
        setEmailProgress(null);
        Alert.alert(
          'Mail is not set up on this device',
          'Sharing the letter instead — grab the addresses from the CSV export.'
        );
        await Share.share({ message: `Subject: ${subject}\n\n${body}` });
        return;
      }
      for (let i = 0; i < targets.length; i++) {
        const home = targets[i];
        await MailComposer.composeAsync({
          recipients: contactsFor(home, contacts).emails,
          subject,
          body,
        });
        setEmailProgress({ done: i + 1, total: targets.length });
        if (Platform.OS === 'ios' && i < targets.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 800));
        }
      }
    } catch (err) {
      Alert.alert('Email failed', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setEmailProgress(null);
    }
  }

  // Step 3 of Contact owners: phones are the agent's primary move (Frederick),
  // so "Show phone numbers" leads; emailing is the secondary option.
  function offerNextStep(contacts: Record<number, Contacts>, note?: string) {
    const withPhones = filtered.filter((p) => contactsFor(p, contacts).phones.length > 0);
    const withEmails = filtered.filter((p) => contactsFor(p, contacts).emails.length > 0);
    if (withPhones.length === 0 && withEmails.length === 0) {
      Alert.alert('No contacts found', note ?? 'No verified contact info came back — you were not charged for misses.');
      return;
    }
    const buttons = [
      { text: `Show phone numbers (${withPhones.length})`, style: 'default' as const },
    ];
    if (withEmails.length > 0) {
      if (withEmails.length > EMAIL_MAX) {
        buttons.push({
          text: `Email via CSV mail merge (${withEmails.length})`,
          style: 'default' as const,
          // @ts-expect-error onPress is valid on Alert buttons
          onPress: () => void handleExport(),
        });
      } else {
        buttons.push({
          text: `Open ${withEmails.length} pre-addressed email${withEmails.length === 1 ? '' : 's'}`,
          style: 'default' as const,
          // @ts-expect-error onPress is valid on Alert buttons
          onPress: () => {
            if (!features.draft_email) return showUpgrade();
            void runEmailLoop(withEmails, contacts);
          },
        });
      }
    }
    Alert.alert(
      `${withPhones.length || withEmails.length} owner${(withPhones.length || withEmails.length) === 1 ? '' : 's'} ready`,
      `${note ? note + '\n' : ''}Phones for ${withPhones.length}, emails for ${withEmails.length}. Numbers are on the list below and in the CSV.`,
      buttons
    );
  }

  // ONE intention, one button: "Contact owners" unlocks whatever is missing
  // (with an upfront cost line), then offers calls first, emails second.
  function handleContactOwners() {
    if (filtered.length === 0) return;
    const toUnlock = filtered.filter((p) => !isUnlocked(p));
    const already = filtered.length - toUnlock.length;
    if (toUnlock.length === 0) {
      offerNextStep(traced);
      return;
    }
    const maxCost = ((toUnlock.length * config.trace_price_cents) / 100).toFixed(2);
    Alert.alert(
      `Contact ${filtered.length} owner${filtered.length === 1 ? '' : 's'}`,
      `${already > 0 ? `✓ ${already} already unlocked — free\n` : ''}🔓 ${toUnlock.length} new to unlock — up to $${maxCost} (included traces first, no-match never charged)\n\nYou'll get phone numbers and emails, then choose calls or emails.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Unlock & continue', onPress: () => void unlockThenOffer(toUnlock) },
      ]
    );
  }

  async function unlockThenOffer(targets: FarmParcel[]) {
    setBulkProgress({ done: 0, total: targets.length });
    let noMatch = 0;
    let stopped: string | null = null;
    const found: Record<number, Contacts> = {};
    for (let i = 0; i < targets.length; i++) {
      const parcel = targets[i];
      try {
        const r = await traceParcel(token, parcel.id);
        if (r.matched) {
          found[parcel.id] = {
            phones: r.phones.map((x) => x.number),
            emails: r.emails.map((x) => x.email),
          };
        } else {
          noMatch += 1;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Trace failed';
        if (/cap|inactive|subscription/i.test(msg)) {
          stopped = msg;
          break;
        }
        noMatch += 1;
      }
      setBulkProgress({ done: i + 1, total: targets.length });
    }
    const merged = { ...traced, ...found };
    setTraced(merged);
    setBulkProgress(null);
    const notes: string[] = [];
    if (noMatch > 0) notes.push(`${noMatch} had no verified contact (not charged).`);
    if (stopped) notes.push(stopped);
    offerNextStep(merged, notes.length ? notes.join(' ') : undefined);
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
        <TouchableOpacity style={styles.headerButton} onPress={handleExport} disabled={exporting}>
          <Text style={styles.headerButtonText}>{exporting ? '…' : '⬇ CSV'}</Text>
        </TouchableOpacity>
      </View>

      {/* Primary action first: refine the list, THEN act on it below. */}
      <TouchableOpacity
        style={[styles.refineButton, filtersActive && styles.refineButtonActive]}
        onPress={() => setFiltersOpen(!filtersOpen)}
      >
        <Text style={[styles.refineButtonText, filtersActive && styles.refineButtonTextActive]}>
          🔍 Refine — beds, sqft, pool…{filtersActive ? ' ✓' : ''}
        </Text>
      </TouchableOpacity>

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
          <TouchableOpacity
            style={styles.applyButton}
            onPress={() => {
              Keyboard.dismiss();
              setFiltersOpen(false);
            }}
          >
            <Text style={styles.applyButtonText}>
              Show {filtered.length} {filtered.length === 1 ? 'home' : 'homes'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {(() => {
        const toUnlockCount = filtered.filter((p) => !isUnlocked(p)).length;
        const suffix =
          filtered.length === 0
            ? ''
            : toUnlockCount > 0
              ? ` · ~$${((toUnlockCount * config.trace_price_cents) / 100).toFixed(2)}`
              : ' · all unlocked';
        return (
          <TouchableOpacity
            style={styles.contactButton}
            onPress={handleContactOwners}
            disabled={bulkProgress !== null || emailProgress !== null || filtered.length === 0}
          >
            <Text style={styles.contactButtonText}>
              {bulkProgress
                ? `Unlocking ${bulkProgress.done}/${bulkProgress.total}…`
                : emailProgress
                  ? `Emailing ${emailProgress.done}/${emailProgress.total}…`
                  : `✆ Contact owners (${filtered.length})${suffix}`}
            </Text>
          </TouchableOpacity>
        );
      })()}

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
                {rowFacts(item) !== '' && <Text style={styles.rowFacts}>{rowFacts(item)}</Text>}
                {c.phones.length > 0 && (
                  <Text style={styles.rowPhone} numberOfLines={1}>
                    ✆ {c.phones[0]}
                    {c.phones.length > 1 ? `  +${c.phones.length - 1} more` : ''}
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
  headerButton: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  headerButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2563eb',
  },
  refineButton: {
    marginTop: 10,
    backgroundColor: '#111827',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  refineButtonActive: {
    backgroundColor: '#16a34a',
  },
  refineButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  refineButtonTextActive: {
    color: '#fff',
  },
  contactButton: {
    marginTop: 8,
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  contactButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  rowPhone: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563eb',
    marginTop: 2,
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
  applyButton: {
    backgroundColor: '#16a34a',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  applyButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
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
