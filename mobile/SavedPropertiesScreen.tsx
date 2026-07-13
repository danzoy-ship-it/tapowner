import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  SAVED_PROPERTY_STATUSES,
  addSavedPropertyNote,
  getSavedProperty,
  listSavedProperties,
  updateSavedPropertyStatus,
  type SavedPropertyDetail,
  type SavedPropertyStatus,
  type SavedPropertySummary,
} from './api';

function statusLabel(status: SavedPropertyStatus): string {
  return SAVED_PROPERTY_STATUSES.find((s) => s.id === status)?.label ?? status;
}

function ListView({
  token,
  onSelect,
  onClose,
}: {
  token: string;
  onSelect: (id: number) => void;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState<SavedPropertyStatus | null>(null);
  const [properties, setProperties] = useState<SavedPropertySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setProperties(null);
    listSavedProperties(token, filter ?? undefined)
      .then((rows) => {
        if (!cancelled) setProperties(rows);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
      });
    return () => {
      cancelled = true;
    };
  }, [token, filter]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Saved Properties</Text>
        <TouchableOpacity onPress={onClose}>
          <Text style={styles.closeText}>Close</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterRow}
        data={[null, ...SAVED_PROPERTY_STATUSES.map((s) => s.id)]}
        keyExtractor={(item) => item ?? 'all'}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.filterChip, filter === item && styles.filterChipSelected]}
            onPress={() => setFilter(item)}
          >
            <Text style={[styles.filterChipText, filter === item && styles.filterChipTextSelected]}>
              {item ? statusLabel(item) : 'All'}
            </Text>
          </TouchableOpacity>
        )}
      />

      {error && <Text style={styles.errorText}>{error}</Text>}

      {!properties && !error && (
        <View style={styles.loadingRow}>
          <ActivityIndicator />
        </View>
      )}

      {properties && properties.length === 0 && (
        <Text style={styles.emptyText}>No saved properties yet.</Text>
      )}

      {properties && properties.length > 0 && (
        <FlatList
          data={properties}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.row} onPress={() => onSelect(item.id)}>
              <View style={styles.rowHeader}>
                <Text style={styles.rowAddress} numberOfLines={1}>
                  {item.situs_address ?? 'Address unavailable'}
                </Text>
                <View style={styles.statusBadge}>
                  <Text style={styles.statusBadgeText}>{statusLabel(item.status)}</Text>
                </View>
              </View>
              {item.owner_name && <Text style={styles.rowOwner}>{item.owner_name}</Text>}
              {item.latest_note && (
                <Text style={styles.rowNote} numberOfLines={1}>
                  {item.latest_note}
                </Text>
              )}
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

function DetailView({ token, id, onBack }: { token: string; id: number; onBack: () => void }) {
  const [detail, setDetail] = useState<SavedPropertyDetail | null>(null);
  const [noteText, setNoteText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    getSavedProperty(token, id)
      .then(setDetail)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleStatusChange(status: SavedPropertyStatus) {
    if (!detail) return;
    setDetail({ ...detail, status });
    try {
      await updateSavedPropertyStatus(token, id, status);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status');
    }
  }

  async function handleAddNote() {
    if (!noteText.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await addSavedPropertyNote(token, id, noteText.trim());
      setNoteText('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add note');
    } finally {
      setSaving(false);
    }
  }

  if (!detail) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack}>
            <Text style={styles.closeText}>Back</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.loadingRow}>
          <ActivityIndicator />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.closeText}>Back</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.title}>{detail.situs_address ?? 'Address unavailable'}</Text>
      {detail.owner_name && <Text style={styles.rowOwner}>{detail.owner_name}</Text>}

      <Text style={styles.label}>Status</Text>
      <View style={styles.pickerRow}>
        {SAVED_PROPERTY_STATUSES.map((s) => (
          <TouchableOpacity
            key={s.id}
            style={[styles.filterChip, detail.status === s.id && styles.filterChipSelected]}
            onPress={() => handleStatusChange(s.id)}
          >
            <Text
              style={[styles.filterChipText, detail.status === s.id && styles.filterChipTextSelected]}
            >
              {s.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Notes</Text>
      <FlatList
        style={styles.notesList}
        data={detail.notes}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <View style={styles.noteRow}>
            <Text style={styles.noteBody}>{item.body}</Text>
            <Text style={styles.noteDate}>{new Date(item.created_at).toLocaleDateString()}</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>No notes yet.</Text>}
      />

      {error && <Text style={styles.errorText}>{error}</Text>}

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
    </KeyboardAvoidingView>
  );
}

export function SavedPropertiesScreen({ token, onClose }: { token: string; onClose: () => void }) {
  const [selectedId, setSelectedId] = useState<number | null>(null);

  return (
    <View style={styles.overlay}>
      {selectedId === null ? (
        <ListView token={token} onSelect={setSelectedId} onClose={onClose} />
      ) : (
        <DetailView token={token} id={selectedId} onBack={() => setSelectedId(null)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#fff',
  },
  container: {
    flex: 1,
    paddingTop: 56,
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  closeText: {
    color: '#2563eb',
    fontWeight: '600',
  },
  filterRow: {
    flexGrow: 0,
    marginBottom: 12,
  },
  filterChip: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 6,
    marginBottom: 6,
  },
  filterChipSelected: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  filterChipText: {
    fontSize: 12,
    color: '#374151',
  },
  filterChipTextSelected: {
    color: '#fff',
  },
  loadingRow: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptyText: {
    color: '#6b7280',
    paddingVertical: 16,
  },
  errorText: {
    color: '#b91c1c',
    marginBottom: 8,
  },
  row: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowAddress: {
    fontSize: 15,
    fontWeight: '600',
    flexShrink: 1,
    marginRight: 8,
  },
  rowOwner: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
  },
  rowNote: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 4,
  },
  statusBadge: {
    backgroundColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#374151',
  },
  label: {
    color: '#374151',
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 8,
    fontSize: 13,
  },
  pickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  notesList: {
    flex: 1,
    marginBottom: 8,
  },
  noteRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  noteBody: {
    fontSize: 14,
    color: '#111827',
  },
  noteDate: {
    fontSize: 11,
    color: '#9ca3af',
    marginTop: 2,
  },
  noteInputRow: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 24,
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
