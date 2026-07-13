import { useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import * as MailComposer from 'expo-mail-composer';
import { draftEmail } from './api';
import { useApp } from './AppContext';
import type { RootNav, RootStackParamList } from './navigation';

export function DraftEmailScreen() {
  const navigation = useNavigation<RootNav>();
  const route = useRoute<RouteProp<RootStackParamList, 'DraftEmail'>>();
  const { parcelId, emails } = route.params;
  const { token, config } = useApp();

  const [templateId, setTemplateId] = useState<string | null>(null);
  const [toneId, setToneId] = useState('professional');
  const [recipients, setRecipients] = useState<string[]>(emails.length > 0 ? [emails[0]] : []);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleRecipient(email: string) {
    setRecipients((prev) =>
      prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email]
    );
  }

  async function handleGenerate() {
    if (!templateId) return;
    setGenerating(true);
    setError(null);
    try {
      const { subject, body } = await draftEmail(token, parcelId, templateId, toneId);
      const available = await MailComposer.isAvailableAsync();
      if (!available) {
        setError('Mail is not set up on this device.');
        setGenerating(false);
        return;
      }
      // One composer per recipient: each email is reviewed and sent
      // individually, never one message addressed to everyone.
      const sendTo = recipients.length > 0 ? recipients : [undefined];
      for (const recipient of sendTo) {
        await MailComposer.composeAsync({
          recipients: recipient ? [recipient] : undefined,
          subject,
          body,
        });
      }
      navigation.goBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Draft failed');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionLabel}>Template</Text>
      {config.draft.templates.map((t) => (
        <TouchableOpacity
          key={t.id}
          style={[styles.templateRow, templateId === t.id && styles.templateRowSelected]}
          onPress={() => setTemplateId(t.id)}
        >
          <Text
            style={[styles.templateRowText, templateId === t.id && styles.templateRowTextSelected]}
          >
            {t.label}
          </Text>
          {templateId === t.id && <Text style={styles.templateCheck}>✓</Text>}
        </TouchableOpacity>
      ))}

      <Text style={styles.sectionLabel}>Tone</Text>
      <View style={styles.chipRow}>
        {config.draft.tones.map((t) => (
          <TouchableOpacity
            key={t.id}
            style={[styles.chip, toneId === t.id && styles.chipSelected]}
            onPress={() => setToneId(t.id)}
          >
            <Text style={[styles.chipText, toneId === t.id && styles.chipTextSelected]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {emails.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>
            Send to{emails.length > 1 ? ' — each gets their own email' : ''}
          </Text>
          {emails.map((email) => (
            <TouchableOpacity
              key={email}
              style={[styles.templateRow, recipients.includes(email) && styles.templateRowSelected]}
              onPress={() => toggleRecipient(email)}
            >
              <Text
                style={[
                  styles.templateRowText,
                  recipients.includes(email) && styles.templateRowTextSelected,
                ]}
              >
                {email}
              </Text>
              {recipients.includes(email) && <Text style={styles.templateCheck}>✓</Text>}
            </TouchableOpacity>
          ))}
        </>
      )}

      {error && <Text style={styles.errorText}>{error}</Text>}

      <TouchableOpacity
        style={[styles.generateButton, (!templateId || generating) && styles.generateButtonDisabled]}
        onPress={handleGenerate}
        disabled={!templateId || generating}
      >
        {generating ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.generateButtonText}>
            {recipients.length > 1
              ? `Generate ${recipients.length} separate emails`
              : 'Generate & open Mail'}
          </Text>
        )}
      </TouchableOpacity>
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
    paddingBottom: 40,
  },
  sectionLabel: {
    marginTop: 16,
    marginBottom: 8,
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  templateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 6,
  },
  templateRowSelected: {
    borderColor: '#111827',
    backgroundColor: '#f9fafb',
  },
  templateRowText: {
    fontSize: 14,
    color: '#374151',
    flexShrink: 1,
  },
  templateRowTextSelected: {
    fontWeight: '600',
    color: '#111827',
  },
  templateCheck: {
    fontWeight: '700',
    color: '#111827',
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  chipSelected: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  chipText: {
    fontSize: 13,
    color: '#374151',
  },
  chipTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  errorText: {
    color: '#b91c1c',
    marginTop: 12,
    fontSize: 13,
  },
  generateButton: {
    marginTop: 24,
    backgroundColor: '#111827',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  generateButtonDisabled: {
    opacity: 0.4,
  },
  generateButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
});
