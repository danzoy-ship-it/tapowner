import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { formatCents, type AppConfig } from './api';

// Per TAPOWNER_BUILD.md §3: v1 ships NO purchase link/UI -- plain-text
// instruction to manage the plan on the web (Netflix pattern for App Review).
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
        <Text style={styles.manageText}>{config.manage_plan_url_text}</Text>
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
