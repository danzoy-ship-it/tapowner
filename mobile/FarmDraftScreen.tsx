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
import { TEMPLATE_PREVIEWS } from './templatePreviews';
import { useApp } from './AppContext';
import type { RootNav, RootStackParamList } from './navigation';

// Farm EMAIL outreach: the SAME templates & tones as individual drafting,
// applied to the whole filtered list. Pick a template (with preview), generate
// one honest-at-scale draft, then open a pre-addressed Mail composer per home,
// one at a time. Physical mail is NOT drafted here (Frederick 2026-07-14): the
// direct-mail path is the CSV export -- the agent designs the piece in their own
// tool / mail house.
export function FarmDraftScreen() {
  const navigation = useNavigation<RootNav>();
  const route = useRoute<RouteProp<RootStackParamList, 'FarmDraft'>>();
  const { criteria, emailGroups } = route.params;
  const { token, config } = useApp();

  const [templateId, setTemplateId] = useState<string>('buyer_neighborhood_match');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [toneId, setToneId] = useState('professional');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [generating, setGenerating] = useState(false);

  async function handleGenerate() {
    setGenerating(true);
    try {
      const { subject, body } = await farmDraft(token, templateId, toneId, criteria);

      const mailAvailable = await MailComposer.isAvailableAsync();
      if (!mailAvailable) {
        Alert.alert(
          'Mail is not set up on this device',
          'Sharing the email text instead — you can paste it into your mail app.'
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

  const buttonLabel = `Generate & open ${emailGroups.length} email${emailGroups.length === 1 ? '' : 's'}`;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.scopeText}>
        Opens your Mail app with one ready-to-send email per owner — the {emailGroups.length} owner
        {emailGroups.length === 1 ? '' : 's'} with an email on file. You review and hit send on each.
        {'\n\n'}For a print / direct-mail campaign, use “Export for a direct-mail campaign” back on
        the list.
      </Text>

      <Text style={styles.sectionLabel}>Message — tap to preview, then pick one</Text>
      {config.draft.templates.map((t) => {
        const expanded = expandedId === t.id;
        const selected = templateId === t.id;
        const preview = TEMPLATE_PREVIEWS[t.id];
        return (
          <View key={t.id} style={[styles.templateCard, selected && styles.templateCardSelected]}>
            <TouchableOpacity
              style={styles.templateHeader}
              onPress={() => setExpandedId(expanded ? null : t.id)}
            >
              <Text style={[styles.templateRowText, selected && styles.templateRowTextSelected]}>
                {selected ? '✓ ' : ''}
                {t.label}
              </Text>
              <Text style={styles.templateChevron}>{expanded ? 'Hide ▲' : 'Preview ▼'}</Text>
            </TouchableOpacity>
            {expanded && (
              <View style={styles.previewBox}>
                {preview && <Text style={styles.previewText}>“{preview}”</Text>}
                <Text style={styles.previewNote}>
                  Example only — your real emails are personalized to each owner.
                </Text>
                <TouchableOpacity
                  style={[styles.selectButton, selected && styles.selectButtonSelected]}
                  onPress={() => {
                    setTemplateId(t.id);
                    setExpandedId(null);
                  }}
                >
                  <Text style={styles.selectButtonText}>
                    {selected ? '✓ Selected' : 'Select this one'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        );
      })}

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
  sectionLabel: {
    marginTop: 16,
    marginBottom: 8,
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  templateCard: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    marginBottom: 6,
    overflow: 'hidden',
  },
  templateCardSelected: {
    borderColor: '#111827',
    backgroundColor: '#f9fafb',
  },
  templateHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  templateChevron: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563eb',
    marginLeft: 8,
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
  previewBox: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    paddingTop: 2,
    gap: 10,
  },
  previewText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#374151',
    fontStyle: 'italic',
  },
  previewNote: {
    fontSize: 11,
    color: '#9ca3af',
  },
  selectButton: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  selectButtonSelected: {
    backgroundColor: '#16a34a',
  },
  selectButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
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
