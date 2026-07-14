import { useMemo, useState } from 'react';
import {
  ActionSheetIOS,
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
import * as Contacts from 'expo-contacts';
import { File, Paths } from 'expo-file-system';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { logFarmExport, saveProperty, traceParcel, type FarmCriteria, type FarmParcel } from './api';
import { useApp } from './AppContext';
import type { RootNav, RootStackParamList } from './navigation';

type Contact = { phones: string[]; emails: string[] };

// One-by-one emailing stays pleasant up to here; bigger lists belong in a
// proper mail merge via the CSV (Frederick's call: 15).
const EMAIL_MAX = 15;

// RFC-4180 CSV cell (client-side so exports always match the on-screen filter).
function csvCell(value: unknown): string {
  const s = value == null ? '' : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function contactsFor(p: FarmParcel, traced: Record<number, Contact>): Contact {
  const t = traced[p.id];
  if (t) return t;
  return { phones: p.phones ?? [], emails: p.emails ?? [] };
}

function buildCsv(parcels: FarmParcel[], traced: Record<number, Contact>): string {
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

// Farm results, two-stage: (1) Unlock contacts for the filtered list, then
// (2) Actions — the SAME verbs as the individual contact screen, pluralized
// (email w/ full templates, save to Contacts, save to CRM, CSV), behind one
// native action sheet scoped to "these N homes."
export function FarmResultsScreen() {
  const navigation = useNavigation<RootNav>();
  const route = useRoute<RouteProp<RootStackParamList, 'FarmResults'>>();
  const { result } = route.params;
  const { token, config, features, showUpgrade } = useApp();

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [minSqftText, setMinSqftText] = useState('');
  const [minBeds, setMinBeds] = useState(0);
  const [minBaths, setMinBaths] = useState(0);
  const [poolOnly, setPoolOnly] = useState(false);
  const [singleStory, setSingleStory] = useState(false);
  const [traced, setTraced] = useState<Record<number, Contact>>({});
  // Homes the vendor returned no verified contact for (session-scoped). They
  // count as "worked", not "locked", so unlock-all can't loop on them forever.
  const [noMatchIds, setNoMatchIds] = useState<Set<number>>(new Set());
  // One shared "busy" line so only one bulk operation runs at a time.
  const [busy, setBusy] = useState<string | null>(null);

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

  function isUnlocked(p: FarmParcel): boolean {
    const c = contactsFor(p, traced);
    return c.phones.length > 0 || c.emails.length > 0;
  }

  function clearFilters() {
    setMinSqftText('');
    setMinBeds(0);
    setMinBaths(0);
    setPoolOnly(false);
    setSingleStory(false);
  }

  // ---------- Stage 1: unlock ----------

  function handleUnlock() {
    const toUnlock = filtered.filter((p) => !isUnlocked(p) && !noMatchIds.has(p.id));
    if (toUnlock.length === 0) return;
    const already = filtered.length - toUnlock.length;
    const maxCost = ((toUnlock.length * config.trace_price_cents) / 100).toFixed(2);
    Alert.alert(
      `Unlock contacts for ${filtered.length} home${filtered.length === 1 ? '' : 's'}?`,
      `${already > 0 ? `✓ ${already} already unlocked — free\n` : ''}🔓 ${toUnlock.length} new — up to $${maxCost} (included traces first, no-match never charged).`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Unlock', onPress: () => void runUnlock(toUnlock) },
      ]
    );
  }

  async function runUnlock(targets: FarmParcel[]) {
    setBusy(`Unlocking 0/${targets.length}…`);
    let noMatch = 0;
    let stopped: string | null = null;
    const found: Record<number, Contact> = {};
    const misses: number[] = [];
    for (let i = 0; i < targets.length; i++) {
      try {
        const r = await traceParcel(token, targets[i].id);
        if (r.matched) {
          found[targets[i].id] = {
            phones: r.phones.map((x) => x.number),
            emails: r.emails.map((x) => x.email),
          };
        } else {
          noMatch += 1;
          misses.push(targets[i].id);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Trace failed';
        if (/cap|inactive|subscription/i.test(msg)) {
          stopped = msg;
          break;
        }
        noMatch += 1;
        misses.push(targets[i].id);
      }
      setBusy(`Unlocking ${i + 1}/${targets.length}…`);
    }
    const merged = { ...traced, ...found };
    setTraced(merged);
    if (misses.length > 0) {
      setNoMatchIds((prev) => new Set(Array.from(prev).concat(misses)));
    }
    setBusy(null);
    // Frederick's UX call: keep this dead simple. Once the unlock pass finishes
    // there's nothing left to act on, so just confirm it's done — no phone/email
    // breakdown (that read as "only N reachable").
    const anyUnlocked = filtered.some((p) => {
      const c = contactsFor(p, merged);
      return c.phones.length > 0 || c.emails.length > 0;
    });
    let msg: string;
    if (stopped) {
      msg = stopped;
    } else if (!anyUnlocked) {
      msg = 'No verified contacts were found for these — you weren’t charged.';
    } else {
      msg = 'All contacts now unlocked.';
    }
    Alert.alert('Contacts unlocked', msg);
  }

  // ---------- Stage 2: actions ----------

  async function handleExport() {
    if (filtered.length === 0) return;
    setBusy('Exporting…');
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
      if (gate.beta && gate.remaining !== null && gate.remaining <= 25) {
        Alert.alert('Heads up', `${gate.remaining} free beta export rows left this month.`);
      }
    } catch (err) {
      Alert.alert('Export failed', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setBusy(null);
    }
  }

  async function runBulkContacts(targets: FarmParcel[]) {
    const { status } = await Contacts.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Contacts permission needed', 'Allow contacts access in Settings to save owners.');
      return;
    }
    setBusy(`Saving 0/${targets.length}…`);
    let ok = 0;
    for (let i = 0; i < targets.length; i++) {
      const p = targets[i];
      const c = contactsFor(p, traced);
      try {
        await Contacts.addContactAsync({
          contactType: Contacts.ContactTypes.Person,
          name: p.owner_name,
          firstName: p.owner_name,
          company: p.situs_address ?? undefined,
          phoneNumbers: c.phones.map((n) => ({ label: 'mobile', number: n })),
          emails: c.emails.map((e) => ({ label: 'home', email: e })),
        } as Contacts.Contact);
        ok += 1;
      } catch {
        // skip failures, keep going
      }
      setBusy(`Saving ${i + 1}/${targets.length}…`);
    }
    setBusy(null);
    Alert.alert('Done', `${ok} owner${ok === 1 ? '' : 's'} added to your Contacts.`);
  }

  async function runBulkCrm(targets: FarmParcel[]) {
    if (!features.crm) return showUpgrade();
    setBusy(`Saving 0/${targets.length}…`);
    let ok = 0;
    let failed = 0;
    for (let i = 0; i < targets.length; i++) {
      try {
        await saveProperty(token, targets[i].id);
        ok += 1;
      } catch {
        failed += 1;
      }
      setBusy(`Saving ${i + 1}/${targets.length}…`);
    }
    setBusy(null);
    Alert.alert('Done', `${ok} saved to CRM${failed ? ` · ${failed} failed` : ''}.`);
  }

  function handleActions() {
    if (filtered.length === 0) return;
    const n = filtered.length;
    const plural = n === 1 ? '' : 's';
    const withEmails = filtered.filter((p) => contactsFor(p, traced).emails.length > 0);
    const withContacts = filtered.filter((p) => isUnlocked(p));
    const phones = filtered.filter((p) => contactsFor(p, traced).phones.length > 0).length;
    const noMatch = filtered.filter((p) => !isUnlocked(p) && noMatchIds.has(p.id)).length;
    const locked = n - withContacts.length - noMatch;

    const options: string[] = [];
    const handlers: Array<() => void> = [];

    // Frederick's flow (2026-07-14 evaluation): while any home is still locked,
    // lead with unlocking ALL of them — then the actions can honestly say
    // "all 13" instead of counts that read like only some owners are reachable.
    if (locked > 0) {
      const maxCost = ((locked * config.trace_price_cents) / 100).toFixed(2);
      const paid = withContacts.length;
      options.push(`🔓 Unlock remaining ${locked} · up to $${maxCost}`);
      handlers.push(handleUnlock);
      options.push('📄 Export CSV (mailing addresses — free)');
      handlers.push(() => void handleExport());
      options.push('Cancel');
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: `${n} home${plural} · ${paid} unlocked · ${locked} locked`,
          message:
            paid > 0
              ? `${paid} already paid — $0. Unlock the last ${locked} to email, save, and export all ${n} at once.`
              : `Unlock all ${locked} to email, save, and export them at once.`,
          options,
          // The only charging action reads as destructive (red) — a clear "this costs money" signal.
          destructiveButtonIndex: 0,
          cancelButtonIndex: options.length - 1,
        },
        (index) => {
          if (index < handlers.length) handlers[index]();
        }
      );
      return;
    }

    // Everything is worked: phrase actions over the whole list wherever true.
    const allOf = (count: number) => (count === n ? `all ${n}` : `${count} of ${n}`);

    if (withEmails.length > 0) {
      if (withEmails.length > EMAIL_MAX) {
        options.push(`📧 Email via CSV mail merge (${withEmails.length})`);
        handlers.push(() => void handleExport());
      } else {
        options.push(`📧 Email owners (${allOf(withEmails.length)} have emails)`);
        handlers.push(() => {
          if (!features.draft_email) return showUpgrade();
          navigation.navigate('FarmDraft', {
            mode: 'email',
            criteria,
            emailGroups: withEmails.map((p) => contactsFor(p, traced).emails),
          });
        });
      }
    } else {
      // No emails came back — the outreach screen still offers the letter.
      options.push('📧 Draft outreach letter');
      handlers.push(() => {
        if (!features.draft_email) return showUpgrade();
        navigation.navigate('FarmDraft', { mode: 'letter', criteria, emailGroups: [] });
      });
    }

    if (withContacts.length > 0) {
      options.push(`👤 Add ${allOf(withContacts.length)} to Contacts`);
      handlers.push(() => {
        Alert.alert(
          `Add ${withContacts.length} to Contacts?`,
          'Each owner is saved with their phone, email, and property address.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Add', onPress: () => void runBulkContacts(withContacts) },
          ]
        );
      });

      options.push(`💼 Save ${allOf(withContacts.length)} to CRM`);
      handlers.push(() => void runBulkCrm(withContacts));
    }

    options.push('📄 Export CSV');
    handlers.push(() => void handleExport());

    options.push('Cancel');

    ActionSheetIOS.showActionSheetWithOptions(
      {
        title:
          noMatch > 0
            ? `${n} home${plural} · ${withContacts.length} unlocked · ${noMatch} no contact found`
            : `${n} home${plural} · all unlocked`,
        message: `${phones} with phones · ${withEmails.length} with emails.${noMatch > 0 ? ` No verified contact for ${noMatch} — you were not charged.` : ''}`,
        options,
        cancelButtonIndex: options.length - 1,
      },
      (index) => {
        if (index < handlers.length) handlers[index]();
      }
    );
  }

  // No-match homes have no data to buy, so they don't count as "still locked" —
  // otherwise the button keeps offering to unlock homes that can't be unlocked.
  const toUnlockCount = filtered.filter((p) => !isUnlocked(p) && !noMatchIds.has(p.id)).length;
  const anyUnlocked = filtered.some((p) => isUnlocked(p));
  const unlockedCount = filtered.filter((p) => isUnlocked(p)).length;

  return (
    <View style={styles.container}>
      <Text style={styles.countText}>
        {filtersActive
          ? `${filtered.length} of ${result.count} match`
          : `${result.count} ${result.count === 1 ? 'property' : 'properties'}`}
        {result.capped ? ' (limit reached — draw smaller for full coverage)' : ''}
      </Text>

      {/* Primary flow, top to bottom: refine → unlock → act. */}
      <TouchableOpacity
        style={[styles.refineButton, filtersActive && styles.refineButtonActive]}
        onPress={() => setFiltersOpen(!filtersOpen)}
      >
        <Text style={styles.refineButtonText}>
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

      {(toUnlockCount > 0 || anyUnlocked) && (
        <Text style={styles.unlockStatus}>
          {toUnlockCount > 0
            ? `${unlockedCount} of ${filtered.length} unlocked · ${toUnlockCount} left to unlock`
            : `✓ All ${filtered.length} contact${filtered.length === 1 ? '' : 's'} unlocked`}
        </Text>
      )}

      <TouchableOpacity
        style={[styles.actionsButton, (busy !== null || filtered.length === 0) && styles.buttonDisabled]}
        onPress={handleActions}
        disabled={busy !== null || filtered.length === 0}
      >
        <Text style={styles.actionsButtonText}>
          {busy ?? `⚡ Actions for these ${filtered.length} home${filtered.length === 1 ? '' : 's'}…`}
        </Text>
      </TouchableOpacity>

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
  countText: {
    fontSize: 15,
    fontWeight: '700',
    marginTop: 14,
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
  unlockStatus: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
  },
  actionsButton: {
    marginTop: 8,
    marginBottom: 8,
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  actionsButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
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
  rowPhone: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563eb',
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
