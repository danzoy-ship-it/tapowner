import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { updateAgentProfile } from './api';
import type { Me } from './auth';

export function SettingsScreen({
  token,
  me,
  notice,
  onClose,
  onSaved,
}: {
  token: string;
  me: Me;
  notice?: string;
  onClose: () => void;
  onSaved: (profile: { name: string; brokerage: string; phone: string }) => void;
}) {
  const existing = (me.agent_profile ?? {}) as { name?: string; brokerage?: string; phone?: string };
  const [name, setName] = useState(existing.name ?? '');
  const [brokerage, setBrokerage] = useState(existing.brokerage ?? '');
  const [phone, setPhone] = useState(existing.phone ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setError(null);
    setSaving(true);
    try {
      const profile = { name: name.trim(), brokerage: brokerage.trim(), phone: phone.trim() };
      await updateAgentProfile(token, profile);
      onSaved(profile);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.overlay}>
      <KeyboardAvoidingView
        style={styles.sheet}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Agent Profile</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.closeText}>Close</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.hint}>
          Used to sign off AI-drafted outreach emails.
        </Text>

        <Text style={styles.label}>Name</Text>
        <TextInput style={styles.input} placeholder="Jane Smith" value={name} onChangeText={setName} />

        <Text style={styles.label}>Brokerage</Text>
        <TextInput
          style={styles.input}
          placeholder="Smith Realty Group"
          value={brokerage}
          onChangeText={setBrokerage}
        />

        <Text style={styles.label}>Phone</Text>
        <TextInput
          style={styles.input}
          placeholder="(210) 555-0100"
          keyboardType="phone-pad"
          value={phone}
          onChangeText={setPhone}
        />

        {error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity style={styles.button} onPress={handleSave} disabled={saving || !name.trim()}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save</Text>}
        </TouchableOpacity>

        <Text style={styles.legalText}>
          Terms of Service and Privacy Policy: tapowner.com/terms · tapowner.com/privacy
        </Text>
        {!!notice && <Text style={styles.legalText}>{notice}</Text>}
      </KeyboardAvoidingView>
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
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  closeText: {
    color: '#2563eb',
    fontWeight: '600',
  },
  hint: {
    color: '#6b7280',
    fontSize: 13,
    marginBottom: 16,
  },
  label: {
    color: '#374151',
    fontWeight: '600',
    marginBottom: 6,
    fontSize: 13,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 14,
  },
  error: {
    color: '#b91c1c',
    marginBottom: 12,
  },
  button: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  legalText: {
    marginTop: 14,
    fontSize: 11,
    color: '#9ca3af',
    textAlign: 'center',
  },
});
