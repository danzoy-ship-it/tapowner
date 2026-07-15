import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useRoute, type RouteProp } from '@react-navigation/native';
import {
  SAVED_PROPERTY_STATUSES,
  addSavedPropertyNote,
  getSavedProperty,
  updateSavedPropertyStatus,
  type SavedPropertyDetail,
  type SavedPropertyNote,
  type SavedPropertyStatus,
} from './api';
import { useApp } from './AppContext';
import type { RootStackParamList } from './navigation';

// Compact facts line for the CRM record — mirrors the map card's summary.
function factsLine(d: SavedPropertyDetail): string {
  const parts: string[] = [];
  if (d.living_area_sqft) {
    const n = Math.round(parseFloat(d.living_area_sqft));
    if (Number.isFinite(n) && n > 0) parts.push(`${n.toLocaleString('en-US')} sqft`);
  }
  if (d.bedrooms || d.baths_full) parts.push(`${d.bedrooms ?? '?'}bd/${d.baths_full ?? '?'}ba`);
  if (d.has_pool) parts.push('Pool');
  if (d.year_built) parts.push(`Built ${d.year_built}`);
  return parts.join(' · ');
}

// Show the best few contacts by default (phones come reachable-first from the
// trace); a dozen numbers/emails on one owner is common, so collapse the rest.
const CONTACT_PREVIEW = 3;

export function PipelineDetailScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'PipelineDetail'>>();
  const { savedPropertyId } = route.params;
  const { token, readOnly } = useApp();

  const [detail, setDetail] = useState<SavedPropertyDetail | null>(null);
  const [noteText, setNoteText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAllPhones, setShowAllPhones] = useState(false);
  const [showAllEmails, setShowAllEmails] = useState(false);
  const notesRef = useRef<FlatList<SavedPropertyNote>>(null);

  const load = useCallback(() => {
    getSavedProperty(token, savedPropertyId)
      .then(setDetail)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'));
  }, [token, savedPropertyId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handleStatusChange(status: SavedPropertyStatus) {
    if (!detail) return;
    setDetail({ ...detail, status });
    try {
      await updateSavedPropertyStatus(token, savedPropertyId, status);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status');
    }
  }

  async function handleAddNote() {
    if (!noteText.trim()) return;
    Keyboard.dismiss();
    setSaving(true);
    setError(null);
    try {
      await addSavedPropertyNote(token, savedPropertyId, noteText.trim());
      setNoteText('');
      load();
      // reveal the just-added note at the bottom of the log
      setTimeout(() => notesRef.current?.scrollToEnd({ animated: true }), 350);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add note');
    } finally {
      setSaving(false);
    }
  }

  if (!detail) {
    return (
      <View style={styles.loadingContainer}>
        {error ? <Text style={styles.errorText}>{error}</Text> : <ActivityIndicator />}
      </View>
    );
  }

  // Chronological: oldest first, newest at the bottom — a running comms log you
  // scroll down to catch up on.
  const orderedNotes = [...detail.notes].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      {/* One scroller for the whole record: the notes list carries all the
          header content, so any amount of contacts + notes scrolls and the
          bottom is always reachable. The "add note" bar is pinned below it. */}
      <FlatList
        ref={notesRef}
        style={styles.notesList}
        contentContainerStyle={styles.content}
        data={orderedNotes}
        keyExtractor={(item) => String(item.id)}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <>
            <Text style={styles.address}>{detail.situs_address ?? 'Address unavailable'}</Text>
            {detail.owner_name && <Text style={styles.owner}>{detail.owner_name}</Text>}
            {factsLine(detail) !== '' && <Text style={styles.facts}>{factsLine(detail)}</Text>}
            {detail.mailing_address && (
              <Text style={styles.mailing}>✉ Mails to: {detail.mailing_address}</Text>
            )}

            {((detail.phones?.length ?? 0) > 0 || (detail.emails?.length ?? 0) > 0) && (
              <>
                <Text style={styles.sectionLabel}>Contact</Text>
                {(showAllPhones ? detail.phones : detail.phones?.slice(0, CONTACT_PREVIEW))?.map((p) => (
                  <View key={p.number} style={styles.contactRow}>
                    <Text style={styles.contactValue}>{p.number}</Text>
                    <View style={styles.contactMetaRow}>
                      {p.type ? <Text style={styles.contactMeta}>{p.type}</Text> : null}
                      {p.dnc && (
                        <View style={styles.dncBadge}>
                          <Text style={styles.dncBadgeText}>DNC</Text>
                        </View>
                      )}
                    </View>
                  </View>
                ))}
                {(detail.phones?.length ?? 0) > CONTACT_PREVIEW && (
                  <TouchableOpacity onPress={() => setShowAllPhones(!showAllPhones)}>
                    <Text style={styles.showMore}>
                      {showAllPhones
                        ? 'Show fewer numbers'
                        : `Show ${(detail.phones?.length ?? 0) - CONTACT_PREVIEW} more number${
                            (detail.phones?.length ?? 0) - CONTACT_PREVIEW === 1 ? '' : 's'
                          }`}
                    </Text>
                  </TouchableOpacity>
                )}
                {(showAllEmails ? detail.emails : detail.emails?.slice(0, CONTACT_PREVIEW))?.map((e) => (
                  <Text key={e} style={styles.contactEmail}>
                    {e}
                  </Text>
                ))}
                {(detail.emails?.length ?? 0) > CONTACT_PREVIEW && (
                  <TouchableOpacity onPress={() => setShowAllEmails(!showAllEmails)}>
                    <Text style={styles.showMore}>
                      {showAllEmails
                        ? 'Show fewer emails'
                        : `Show ${(detail.emails?.length ?? 0) - CONTACT_PREVIEW} more email${
                            (detail.emails?.length ?? 0) - CONTACT_PREVIEW === 1 ? '' : 's'
                          }`}
                    </Text>
                  </TouchableOpacity>
                )}
              </>
            )}

            <Text style={styles.sectionLabel}>Status</Text>
            {readOnly ? (
              <View style={[styles.chip, styles.chipSelected, styles.statusBadgeRO]}>
                <Text style={styles.chipTextSelected}>
                  {SAVED_PROPERTY_STATUSES.find((s) => s.id === detail.status)?.label ?? detail.status}
                </Text>
              </View>
            ) : (
              <View style={styles.chipWrap}>
                {SAVED_PROPERTY_STATUSES.map((s) => (
                  <TouchableOpacity
                    key={s.id}
                    style={[styles.chip, detail.status === s.id && styles.chipSelected]}
                    onPress={() => handleStatusChange(s.id)}
                  >
                    <Text style={[styles.chipText, detail.status === s.id && styles.chipTextSelected]}>
                      {s.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <Text style={styles.sectionLabel}>Notes — oldest first, latest at the bottom</Text>
          </>
        }
        renderItem={({ item }) => (
          <View style={styles.noteRow}>
            <Text style={styles.noteDate}>
              {new Date(item.created_at).toLocaleString([], {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
            </Text>
            <Text style={styles.noteBody}>{item.body}</Text>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No history yet — add the first note below.</Text>
        }
      />

      {error && <Text style={styles.errorText}>{error}</Text>}

      {!readOnly && (
        <View style={styles.noteInputRow}>
          <TextInput
            style={styles.noteInput}
            placeholder="Add a note…"
            value={noteText}
            onChangeText={setNoteText}
          />
          <TouchableOpacity style={styles.addNoteButton} onPress={handleAddNote} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.addNoteButtonText}>Add</Text>}
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    padding: 20,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  address: {
    fontSize: 18,
    fontWeight: '700',
  },
  owner: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 2,
  },
  facts: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 4,
  },
  mailing: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 6,
  },
  contactRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  contactValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  contactMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  contactMeta: {
    fontSize: 12,
    color: '#6b7280',
  },
  dncBadge: {
    backgroundColor: '#fee2e2',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  dncBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#b91c1c',
  },
  contactEmail: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  showMore: {
    color: '#2563eb',
    fontWeight: '600',
    fontSize: 13,
    paddingVertical: 8,
  },
  sectionLabel: {
    marginTop: 16,
    marginBottom: 8,
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipSelected: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  statusBadgeRO: {
    alignSelf: 'flex-start',
  },
  chipText: {
    fontSize: 12,
    color: '#374151',
  },
  chipTextSelected: {
    color: '#fff',
  },
  notesList: {
    flex: 1,
  },
  noteRow: {
    paddingVertical: 8,
    paddingLeft: 10,
    borderLeftWidth: 2,
    borderLeftColor: '#e5e7eb',
    marginBottom: 8,
  },
  noteDate: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9ca3af',
    marginBottom: 3,
  },
  noteBody: {
    fontSize: 14,
    color: '#111827',
    lineHeight: 19,
  },
  emptyText: {
    color: '#6b7280',
    paddingVertical: 12,
  },
  errorText: {
    color: '#b91c1c',
    paddingVertical: 6,
    paddingHorizontal: 20,
    fontSize: 13,
  },
  noteInputRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 10,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    backgroundColor: '#fff',
  },
  noteInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  addNoteButton: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingHorizontal: 18,
    justifyContent: 'center',
  },
  addNoteButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
});
