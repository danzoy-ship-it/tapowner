import { useState } from 'react';
import {
  Alert,
  FlatList,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { File, Paths } from 'expo-file-system';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { farmCsv } from './api';
import { useApp } from './AppContext';
import type { RootStackParamList } from './navigation';

// Farm results: every owner inside the drawn area. v1 is list + CSV export
// (mail-merge an open-house invite) -- owner/mailing data is already-licensed
// county data, so nothing here costs a trace.
export function FarmResultsScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'FarmResults'>>();
  const { polygon, result } = route.params;
  const { token } = useApp();
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      const csv = await farmCsv(token, polygon);
      const file = new File(Paths.cache, 'tapowner-farm.csv');
      file.create({ overwrite: true });
      file.write(csv);
      await Share.share({ url: file.uri });
    } catch (err) {
      Alert.alert('Export failed', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.countText}>
          {result.count} {result.count === 1 ? 'property' : 'properties'}
          {result.capped ? ' (limit reached — draw a smaller area for full coverage)' : ''}
        </Text>
        <TouchableOpacity style={styles.exportButton} onPress={handleExport} disabled={exporting}>
          <Text style={styles.exportButtonText}>{exporting ? 'Exporting…' : '⬇  Export CSV'}</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.hint}>
        Export includes owner names and mailing addresses — ready for postcards or a mail merge.
      </Text>

      <FlatList
        data={result.parcels}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.rowMain}>
              <Text style={styles.rowAddress} numberOfLines={1}>
                {item.situs_address ?? 'Address unavailable'}
              </Text>
              <Text style={styles.rowOwner} numberOfLines={1}>
                {item.owner_name}
              </Text>
            </View>
            {item.is_absentee && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>Absentee</Text>
              </View>
            )}
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No owners found in that area — try drawing a different one.</Text>
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
  },
  countText: {
    fontSize: 15,
    fontWeight: '700',
    flexShrink: 1,
    marginRight: 8,
  },
  exportButton: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  exportButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2563eb',
  },
  hint: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
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
