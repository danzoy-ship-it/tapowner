import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { formatCents, type AppConfig } from './api';

// Shown when /me reports a subscription that is no longer trialing/active.
// Two tier choices per the build doc; no purchase link (§3 -- web only).
export function ExpiryScreen({
  config,
  onRecheck,
  onLogout,
}: {
  config: AppConfig;
  onRecheck: () => void;
  onLogout: () => void;
}) {
  const prospector = config.tiers.prospector;
  const closer = config.tiers.closer;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Your trial has ended</Text>
      <Text style={styles.subtitle}>Pick a plan to keep tapping into owner data.</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          Prospector — {prospector ? formatCents(prospector.price_cents) : '$9.99'}/mo
        </Text>
        <Text style={styles.cardLine}>Owner of record on every tap, pay-per-trace contacts</Text>
      </View>

      <View style={[styles.card, styles.cardFeatured]}>
        <Text style={styles.cardTitle}>
          Closer — {closer ? formatCents(closer.price_cents) : '$19.99'}/mo
        </Text>
        <Text style={styles.cardLine}>
          {closer?.included_traces ?? 10} free traces monthly + AI outreach + CRM
        </Text>
      </View>

      <Text style={styles.manageText}>{config.manage_plan_url_text}</Text>

      <TouchableOpacity style={styles.recheckButton} onPress={onRecheck}>
        <Text style={styles.recheckButtonText}>I've updated my plan — refresh</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onLogout}>
        <Text style={styles.logoutText}>Log out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: '#fff',
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 12,
  },
  card: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    padding: 16,
  },
  cardFeatured: {
    borderColor: '#2563eb',
    borderWidth: 2,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  cardLine: {
    fontSize: 13,
    color: '#6b7280',
  },
  manageText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2563eb',
    textAlign: 'center',
    marginTop: 8,
  },
  recheckButton: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  recheckButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  logoutText: {
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 8,
  },
});
