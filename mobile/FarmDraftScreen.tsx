import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as MailComposer from 'expo-mail-composer';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { farmDraft } from './api';
import { useApp } from './AppContext';
import type { RootNav, RootStackParamList } from './navigation';

// Farm outreach: the SAME templates & tones as individual drafting, applied to
// the whole filtered list. Email vs letter is picked HERE (Frederick's
// 2026-07-14 note: a standalone "Draft letter only" action read as noise —
// outreach type belongs with the template/tone choices). One letter generates,
// then either the share sheet (letter -- postcards/mail merge) or one
// pre-addressed Mail composer per home, sent one by one (email).
export function FarmDraftScreen() {
  const navigation = useNavigation<RootNav>();
  const route = useRoute<RouteProp<RootStackParamList, 'FarmDraft'>>();
  const { mode, criteria, emailGroups } = route.params;
  const { token, config } = useApp();

  const [outreach, setOutreach] = useState<'email' | 'letter'>(
    mode === 'letter' || emailGroups.length === 0 ? 'letter' : 'email'
  );
  const [templateId, setTemplateId] = useState<string>('buyer_neighborhood_match');
  const [toneId, setToneId] = useState('professional');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [generating, setGenerating] = useState(false);

  async function handleGenerate() {
    setGenerating(true);
    try {
      const { subject, body } = await farmDraft(token, templateId, toneId, criteria);

      if (outreach === 'letter') {
        await Share.share({ message: `Subject: ${subject}\n\n${body}` });
        navigation.goBack();
        return;
      }

      const mailAvailable = await MailComposer.isAvailableAsync();
      if (!mailAvailable) {
        Alert.alert(
          'Mail is not set up on this device',
          'Sharing the letter instead — grab the addresses from the CSV export.'
        );
        await Share.share({ message: `Subject: ${subject}\n\n${body}` });
        navigation.goBack();
        return;
      }

      setProgress({ done: 0, total: emailGroups.length });
      for (let i = 0; i < emailGroups.length; i++) {
        await MailComposer.composeAsync({ recipients: emailGroups[i], subject, body });
        setProgress({ done: i + 1, total: emailGroups.length });
        if (Platform.OS === 'ios' && i < emailGroups.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 800));
        }
      }
      navigation.goBack();
    } catch (err) {
      Alert.alert('Draft failed', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setGenerating(false);
      setProgress(null);
    }
  }

  const buttonLabel =
    outreach === 'email'
      ? `Generate & open ${emailGroups.length} email${emailGroups.length === 1 ? '' : 's'}`
      : 'Generate letter';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionLabel}>Outreach</Text>
      <View style={styles.chipRow}>
        <TouchableOpacity
          style={[
            styles.chip,
            outreach === 'email' && styles.chipSelected,
            emailGroups.length === 0 && styles.chipDisabled,
          ]}
          disabled={emailGroups.length === 0}
          onPress={() => setOutreach('email')}
        >
          <Text style={[styles.chipText, outreach === 'email' && styles.chipTextSelected]}>
            ✉️ Emails{emailGroups.length > 0 ? ` (${emailGroups.length})` : ''}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.chip, outreach === 'letter' && styles.chipSelected]}
          onPress={() => setOutreach('letter')}
        >
          <Text style={[styles.chipText, outreach === 'letter' && styles.chipTextSelected]}>
            📄 Letter
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.scopeText}>
        {outreach === 'email'
          ? `One email per home — ${emailGroups.length} on your filtered list. You review and send each.`
          : 'One letter for your whole filtered list — share it into notes, print, or a mail-merge tool.'}
      </Text>

      <Text style={styles.sectionLabel}>Template</Text>
      {config.draft.templates.map((t) => (
        <TouchableOpacity
          key={t.id}
          style={[styles.templateRow, templateId === t.id && styles.templateRowSelected]}
          onPress={() => setTemplateId(t.id)}
        >
          <Text style={[styles.templateRowText, templateId === t.id && styles.templateRowTextSelected]}>
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
            <Text style={[styles.chipText, toneId === t.id && styles.chipTextSelected]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={[styles.generateButton, (generating || progress !== null) && styles.generateButtonDisabled]}
        onPress={handleGenerate}
        disabled={generating || progress !== null}
      >
        {progress ? (
          <Text style={styles.generateButtonText}>
            Emailing {progress.done}/{progress.total}…
          </Text>
        ) : generating ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.generateButtonText}>{buttonLabel}</Text>
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
  scopeText: {
    marginTop: 12,
    fontSize: 13,
    color: '#6b7280',
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
    padding: 12,
    lineHeight: 18,
  },
  chipDisabled: {
    opacity: 0.4,
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
