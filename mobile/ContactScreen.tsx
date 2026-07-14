import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import * as Contacts from 'expo-contacts';
import { File, Paths } from 'expo-file-system';
import { saveProperty, traceParcel, trackEvent, type TraceResponse } from './api';
import { useApp } from './AppContext';
import type { RootNav, RootStackParamList } from './navigation';

function buildVCard(ownerName: string | null, address: string | null, trace: TraceResponse): string {
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${ownerName ?? 'Property Owner'}`];
  if (address) lines.push(`ADR;TYPE=home:;;${address};;;;`);
  for (const phone of trace.phones) {
    lines.push(`TEL;TYPE=${phone.type === 'Mobile' ? 'CELL' : 'HOME'}:${phone.number}`);
  }
  for (const email of trace.emails) {
    lines.push(`EMAIL:${email.email}`);
  }
  lines.push('END:VCARD');
  return lines.join('\r\n');
}

export function ContactScreen() {
  const navigation = useNavigation<RootNav>();
  const route = useRoute<RouteProp<RootStackParamList, 'Contact'>>();
  const { parcelId, address, ownerName } = route.params;
  const { token, features, showUpgrade } = useApp();

  const [trace, setTrace] = useState<TraceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAllPhones, setShowAllPhones] = useState(false);

  const [saveNote, setSaveNote] = useState('');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [contactsSaved, setContactsSaved] = useState(false);
  const [contactsError, setContactsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    traceParcel(token, parcelId)
      .then((result) => {
        if (!cancelled) setTrace(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Trace failed');
      });
    return () => {
      cancelled = true;
    };
  }, [token, parcelId]);

  async function handleSaveToPipeline() {
    if (!features.crm) return showUpgrade();
    Keyboard.dismiss();
    setSaveState('saving');
    setSaveError(null);
    try {
      await saveProperty(token, parcelId, saveNote.trim() || undefined);
      setSaveState('saved');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
      setSaveState('error');
    }
  }

  async function handleSaveToContacts() {
    if (!features.crm) return showUpgrade();
    if (!trace?.matched) return;
    setContactsError(null);
    try {
      const name = ownerName ?? 'Property Owner';
      await Contacts.presentFormAsync(
        null,
        {
          contactType: Contacts.ContactTypes.Person,
          name,
          firstName: name,
          company: [address, saveNote.trim()].filter(Boolean).join(' — '),
          phoneNumbers: trace.phones.map((p) => ({ label: p.type || 'mobile', number: p.number })),
          emails: trace.emails.map((e) => ({ label: 'home', email: e.email })),
        },
        { isNew: true }
      );
      setContactsSaved(true);
      trackEvent(token, 'contact_saved', { parcel_id: parcelId });
    } catch (err) {
      setContactsError(err instanceof Error ? err.message : 'Failed to save contact');
    }
  }

  async function handleShareContact() {
    if (!trace?.matched) return;
    const vcard = buildVCard(ownerName, address, trace);
    const safeName = (ownerName ?? 'contact').replace(/[^a-z0-9]+/gi, '_');
    const file = new File(Paths.cache, `${safeName}.vcf`);
    file.create({ overwrite: true });
    file.write(vcard);
    await Share.share({ url: file.uri });
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      <Text style={styles.address}>{address ?? 'Address unavailable'}</Text>
      {ownerName && <Text style={styles.owner}>{ownerName}</Text>}

      {!trace && !error && (
        <View style={styles.loadingRow}>
          <ActivityIndicator />
          <Text style={styles.loadingText}>Getting contact info…</Text>
        </View>
      )}

      {error && <Text style={styles.errorText}>{error}</Text>}

      {trace && !trace.matched && (
        <Text style={styles.noMatchText}>
          {trace.message ?? 'No verified contact found — you were not charged.'}
        </Text>
      )}

      {trace?.matched && (
        <>
          {trace.freeReview && (
            <Text style={styles.freeReviewText}>Already unlocked — no charge</Text>
          )}

          <Text style={styles.sectionLabel}>Phone numbers</Text>
          {(showAllPhones ? trace.phones : trace.phones.slice(0, 2)).map((phone) => (
            <View key={phone.number} style={styles.contactRow}>
              <Text style={styles.contactValue}>{phone.number}</Text>
              <View style={styles.badgeRow}>
                <Text style={styles.contactMeta}>{phone.type}</Text>
                {phone.reachable && (
                  <View style={[styles.badge, styles.badgeVerified]}>
                    <Text style={styles.badgeText}>Verified</Text>
                  </View>
                )}
                {phone.dnc && (
                  <View style={[styles.badge, styles.badgeDnc]}>
                    <Text style={styles.badgeText}>DNC</Text>
                  </View>
                )}
                {phone.tcpa && (
                  <View style={[styles.badge, styles.badgeTcpa]}>
                    <Text style={styles.badgeText}>TCPA risk</Text>
                  </View>
                )}
              </View>
            </View>
          ))}
          {trace.phones.length > 2 && (
            <TouchableOpacity onPress={() => setShowAllPhones(!showAllPhones)}>
              <Text style={styles.showMoreText}>
                {showAllPhones ? 'Show fewer numbers' : `Show ${trace.phones.length - 2} more numbers`}
              </Text>
            </TouchableOpacity>
          )}

          {trace.emails.length > 0 && <Text style={styles.sectionLabel}>Emails</Text>}
          {trace.emails.map((email) => (
            <View key={email.email} style={styles.contactRow}>
              <Text style={styles.contactValue}>{email.email}</Text>
            </View>
          ))}

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() =>
              features.draft_email
                ? navigation.navigate('DraftEmail', {
                    parcelId,
                    emails: trace.emails.map((e) => e.email),
                  })
                : showUpgrade()
            }
          >
            <Text style={styles.primaryButtonText}>Draft Email</Text>
          </TouchableOpacity>

          <Text style={styles.sectionLabel}>Save</Text>
          {saveState !== 'saved' && (
            <TextInput
              style={styles.noteInput}
              placeholder="Add a note (optional)"
              value={saveNote}
              onChangeText={setSaveNote}
            />
          )}
          {saveState !== 'saved' ? (
            <TouchableOpacity
              style={styles.saveButton}
              onPress={handleSaveToPipeline}
              disabled={saveState === 'saving'}
            >
              {saveState === 'saving' ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveButtonText}>Save to CRM</Text>
              )}
            </TouchableOpacity>
          ) : (
            <Text style={styles.savedText}>Saved to CRM ✓</Text>
          )}
          {saveState === 'error' && <Text style={styles.errorText}>{saveError}</Text>}

          <View style={styles.secondaryRow}>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={handleSaveToContacts}
            >
              <Text style={styles.secondaryButtonText}>
                {contactsSaved ? 'In Contacts ✓' : 'Save to Contacts'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={handleShareContact}>
              <Text style={styles.secondaryButtonText}>Share Contact</Text>
            </TouchableOpacity>
          </View>
          {contactsError && <Text style={styles.errorText}>{contactsError}</Text>}
        </>
      )}
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
  address: {
    fontSize: 18,
    fontWeight: '700',
  },
  owner: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 2,
    marginBottom: 8,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  loadingText: {
    color: '#6b7280',
  },
  errorText: {
    color: '#b91c1c',
    marginTop: 10,
    fontSize: 13,
  },
  noMatchText: {
    color: '#6b7280',
    marginTop: 16,
  },
  freeReviewText: {
    fontSize: 12,
    color: '#16a34a',
    fontWeight: '600',
    marginTop: 8,
  },
  sectionLabel: {
    marginTop: 18,
    marginBottom: 6,
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  contactRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  contactValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  contactMeta: {
    fontSize: 12,
    color: '#6b7280',
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 3,
    alignItems: 'center',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  badgeVerified: {
    backgroundColor: '#dcfce7',
  },
  badgeDnc: {
    backgroundColor: '#fee2e2',
  },
  badgeTcpa: {
    backgroundColor: '#fef3c7',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#374151',
  },
  showMoreText: {
    color: '#2563eb',
    fontWeight: '600',
    fontSize: 13,
    paddingVertical: 8,
  },
  primaryButton: {
    marginTop: 20,
    backgroundColor: '#111827',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  noteInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 8,
  },
  saveButton: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  savedText: {
    color: '#16a34a',
    fontWeight: '600',
    paddingVertical: 8,
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  secondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#374151',
    fontWeight: '600',
    fontSize: 13,
  },
});
