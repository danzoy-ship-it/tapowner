import { useCallback, useState } from 'react';
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
  type SavedPropertyStatus,
} from './api';
import { useApp } from './AppContext';
import type { RootStackParamList } from './navigation';

export function PipelineDetailScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'PipelineDetail'>>();
  const { savedPropertyId } = route.params;
  const { token, readOnly } = useApp();

  const [detail, setDetail] = useState<SavedPropertyDetail | null>(null);
  const [noteText, setNoteText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <View style={styles.content}>
        <Text style={styles.address}>{detail.situs_address ?? 'Address unavailable'}</Text>
        {detail.owner_name && <Text style={styles.owner}>{detail.owner_name}</Text>}

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

        <Text style={styles.sectionLabel}>Notes</Text>
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
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
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
  emptyText: {
    color: '#6b7280',
    paddingVertical: 12,
  },
  errorText: {
    color: '#b91c1c',
    paddingVertical: 6,
    fontSize: 13,
  },
  noteInputRow: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 8,
    paddingBottom: 8,
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
