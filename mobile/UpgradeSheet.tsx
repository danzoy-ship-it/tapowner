import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { formatCents, type AppConfig } from './api';

// Billing link opens the web portal (Frederick override 2026-07-14, allowed
// for US storefront post-2025 ruling). Config-driven: empty manage_plan_url
// falls back to plain text, so App Review pushback needs no app build.
export function UpgradeSheet({ config, onClose }: { config: AppConfig; onClose: () => void }) {
  const closer = config.tiers.closer;
  const price = closer ? formatCents(closer.price_cents) : '$19.99';
  const traces = closer?.included_traces ?? config.closer_included_traces;

  return (
    <View style={styles.overlay}>
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.title}>Closer — {price}/mo</Text>
        <View style={styles.bullets}>
          <Text style={styles.bullet}>• {traces} free traces every month</Text>
          <Text style={styles.bullet}>• AI-drafted outreach emails</Text>
          <Text style={styles.bullet}>• Save properties, notes & pipeline statuses</Text>
          <Text style={styles.bullet}>• Save owners straight to Contacts</Text>
        </View>
        {config.manage_plan_url ? (
          <TouchableOpacity onPress={() => Linking.openURL(config.manage_plan_url)}>
            <Text style={styles.manageText}>{config.manage_plan_url_text} →</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.manageText}>{config.manage_plan_url_text}</Text>
        )}
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Text style={styles.closeButtonText}>Not now</Text>
        </TouchableOpacity>
      </View>
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
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 24,
    paddingBottom: 40,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#d1d5db',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
  },
  bullets: {
    gap: 6,
    marginBottom: 16,
  },
  bullet: {
    fontSize: 15,
    color: '#374151',
  },
  manageText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2563eb',
    marginBottom: 16,
  },
  closeButton: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#374151',
    fontWeight: '600',
  },
});
