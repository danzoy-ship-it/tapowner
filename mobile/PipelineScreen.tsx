import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import {
  SAVED_PROPERTY_STATUSES,
  listSavedProperties,
  type SavedPropertyStatus,
  type SavedPropertySummary,
} from './api';
import { useApp } from './AppContext';
import type { RootNav } from './navigation';

export function statusLabel(status: SavedPropertyStatus): string {
  return SAVED_PROPERTY_STATUSES.find((s) => s.id === status)?.label ?? status;
}

export function PipelineScreen() {
  const navigation = useNavigation<RootNav>();
  const { token, features, showUpgrade } = useApp();
  const [filter, setFilter] = useState<SavedPropertyStatus | null>(null);
  const [properties, setProperties] = useState<SavedPropertySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!features.crm) return;
      let cancelled = false;
      setError(null);
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
    }, [token, filter, features.crm])
  );

  if (!features.crm) {
    return (
      <View style={styles.lockedContainer}>
        <Text style={styles.lockedTitle}>CRM is a Closer feature</Text>
        <Text style={styles.lockedBody}>
          Save traced properties, track statuses, and keep notes on every owner conversation.
        </Text>
        <TouchableOpacity style={styles.lockedButton} onPress={showUpgrade}>
          <Text style={styles.lockedButtonText}>See Closer plan</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterRow}
        contentContainerStyle={styles.filterRowContent}
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
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No saved properties{filter ? ' with this status' : ' yet'}</Text>
          <Text style={styles.emptyBody}>
            Trace a property on the map, then Save to CRM to track it here.
          </Text>
        </View>
      )}

      {properties && properties.length > 0 && (
        <FlatList
          data={properties}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.row}
              onPress={() => navigation.navigate('PipelineDetail', { savedPropertyId: item.id })}
            >
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingHorizontal: 20,
  },
  filterRow: {
    flexGrow: 0,
    marginTop: 12,
    marginBottom: 8,
  },
  filterRowContent: {
    gap: 6,
  },
  filterChip: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
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
  errorText: {
    color: '#b91c1c',
    paddingVertical: 8,
  },
  emptyState: {
    paddingVertical: 48,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  emptyBody: {
    fontSize: 13,
    color: '#6b7280',
    textAlign: 'center',
    maxWidth: 260,
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
  lockedContainer: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 10,
  },
  lockedTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  lockedBody: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
  lockedButton: {
    marginTop: 8,
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  lockedButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
});
