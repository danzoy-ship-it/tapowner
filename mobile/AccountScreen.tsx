import { useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { formatCents, updateAgentProfile } from './api';
import { useApp } from './AppContext';

export function AccountScreen() {
  const { token, me, config, refreshMe, logout } = useApp();
  const existing = (me?.agent_profile ?? {}) as { name?: string; brokerage?: string; phone?: string };

  const [name, setName] = useState(existing.name ?? '');
  const [brokerage, setBrokerage] = useState(existing.brokerage ?? '');
  const [phone, setPhone] = useState(existing.phone ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tier = me?.tier ? config.tiers[me.tier] : undefined;
  const planLine = me?.tier
    ? `${me.tier === 'closer' ? 'Closer' : 'Prospector'} — ${tier ? formatCents(tier.price_cents) : ''}/mo`
    : 'No plan';

  async function handleSave() {
    Keyboard.dismiss();
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      await updateAgentProfile(token, {
        name: name.trim(),
        brokerage: brokerage.trim(),
        phone: phone.trim(),
      });
      await refreshMe();
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.sectionLabel}>Plan</Text>
      <View style={styles.planCard}>
        <Text style={styles.planTitle}>{planLine}</Text>
        <Text style={styles.planMeta}>{me?.email}</Text>
        {me?.tier === 'closer' && (
          <Text style={styles.planMeta}>
            {me?.included_traces_remaining ?? 0} free traces left this month
          </Text>
        )}
        {me?.status === 'trialing' && me?.trial_ends_at && (
          <Text style={styles.planMeta}>
            Trial ends {new Date(me.trial_ends_at).toLocaleDateString()}
          </Text>
        )}
        <Text style={styles.planManage}>{config.manage_plan_url_text}</Text>
      </View>

      <Text style={styles.sectionLabel}>Agent profile</Text>
      <Text style={styles.hint}>Used to sign off your AI-drafted outreach emails.</Text>
      <Text style={styles.fieldLabel}>Name</Text>
      <TextInput style={styles.input} placeholder="Jane Smith" value={name} onChangeText={setName} />
      <Text style={styles.fieldLabel}>Brokerage</Text>
      <TextInput
        style={styles.input}
        placeholder="Smith Realty Group"
        value={brokerage}
        onChangeText={setBrokerage}
      />
      <Text style={styles.fieldLabel}>Phone</Text>
      <TextInput
        style={styles.input}
        placeholder="(210) 555-0100"
        keyboardType="phone-pad"
        value={phone}
        onChangeText={setPhone}
      />

      {error && <Text style={styles.errorText}>{error}</Text>}
      {saved && <Text style={styles.savedText}>Profile saved ✓</Text>}

      <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={saving || !name.trim()}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Save profile</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={styles.logoutButton} onPress={logout}>
        <Text style={styles.logoutButtonText}>Log out</Text>
      </TouchableOpacity>

      <Text style={styles.legalText}>
        Terms of Service and Privacy Policy: tapowner.com/terms · tapowner.com/privacy
      </Text>
      {!!config.data_broker_notice && <Text style={styles.legalText}>{config.data_broker_notice}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    padding: 20,
    paddingBottom: 48,
  },
  sectionLabel: {
    marginTop: 16,
    marginBottom: 8,
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  planCard: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 14,
    gap: 3,
  },
  planTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  planMeta: {
    fontSize: 13,
    color: '#6b7280',
  },
  planManage: {
    fontSize: 13,
    color: '#2563eb',
    fontWeight: '600',
    marginTop: 4,
  },
  hint: {
    fontSize: 12,
    color: '#9ca3af',
    marginBottom: 8,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
    marginTop: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 6,
  },
  errorText: {
    color: '#b91c1c',
    marginTop: 8,
    fontSize: 13,
  },
  savedText: {
    color: '#16a34a',
    fontWeight: '600',
    marginTop: 8,
    fontSize: 13,
  },
  saveButton: {
    marginTop: 12,
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  logoutButton: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  logoutButtonText: {
    color: '#b91c1c',
    fontWeight: '600',
  },
  legalText: {
    marginTop: 18,
    fontSize: 11,
    color: '#9ca3af',
    textAlign: 'center',
  },
});
