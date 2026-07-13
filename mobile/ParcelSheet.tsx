import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as MailComposer from 'expo-mail-composer';
import * as Contacts from 'expo-contacts';
import { File, Paths } from 'expo-file-system';
import {
  draftEmail,
  formatCents,
  saveProperty,
  traceParcel,
  type AppConfig,
  type ParcelDetail,
  type TraceResponse,
} from './api';

function buildVCard(detail: ParcelDetail, trace: TraceResponse): string {
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${detail.owner_name ?? 'Property Owner'}`];
  if (detail.situs_address) {
    lines.push(`ADR;TYPE=home:;;${detail.situs_address};;;;`);
  }
  for (const phone of trace.phones) {
    lines.push(`TEL;TYPE=${phone.type === 'Mobile' ? 'CELL' : 'HOME'}:${phone.number}`);
  }
  for (const email of trace.emails) {
    lines.push(`EMAIL:${email.email}`);
  }
  lines.push('END:VCARD');
  return lines.join('\r\n');
}

function formatNumber(value: string | number | null): string | null {
  if (value === null) return null;
  const n = typeof value === 'string' ? parseFloat(value) : value;
  if (!Number.isFinite(n)) return null;
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function formatCurrency(value: string | null): string | null {
  const n = formatNumber(value);
  return n === null ? null : `$${n}`;
}

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function bedsBathsLine(detail: ParcelDetail): string | null {
  const parts: string[] = [];
  if (detail.bedrooms !== null) parts.push(`${detail.bedrooms} bed`);
  const baths = [detail.baths_full ?? 0, (detail.baths_half ?? 0) * 0.5].reduce((a, b) => a + b, 0);
  if (detail.baths_full !== null || detail.baths_half !== null) parts.push(`${baths} bath`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

function lastSaleLine(detail: ParcelDetail): string | null {
  const price = formatCurrency(detail.last_sale_price);
  const date = formatDate(detail.last_sale_date);
  if (!price && !date) return null;
  if (price && date) return `Sold ${price} on ${date}`;
  return price ? `Sold ${price}` : `Sold ${date}`;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

type TraceState = 'idle' | 'loading' | 'done' | 'error';
type DraftState = 'idle' | 'picking' | 'generating' | 'error';
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function ParcelSheet({
  loading,
  detail,
  token,
  config,
  features,
  onUpgradeNeeded,
  onClose,
}: {
  loading: boolean;
  detail: ParcelDetail | null;
  token: string | null;
  config: AppConfig;
  features: { draft_email: boolean; crm: boolean };
  onUpgradeNeeded: () => void;
  onClose: () => void;
}) {
  const [traceState, setTraceState] = useState<TraceState>('idle');
  const [traceResult, setTraceResult] = useState<TraceResponse | null>(null);
  const [traceError, setTraceError] = useState<string | null>(null);

  const [draftState, setDraftState] = useState<DraftState>('idle');
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [toneId, setToneId] = useState<string>('professional');
  const [draftError, setDraftError] = useState<string | null>(null);
  const [recipients, setRecipients] = useState<string[]>([]);

  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveNote, setSaveNote] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [contactsSaved, setContactsSaved] = useState(false);
  const [contactsError, setContactsError] = useState<string | null>(null);
  const [showAllPhones, setShowAllPhones] = useState(false);

  useEffect(() => {
    setTraceState('idle');
    setTraceResult(null);
    setTraceError(null);
    setDraftState('idle');
    setTemplateId(null);
    setToneId('professional');
    setDraftError(null);
    setRecipients([]);
    setSaveState('idle');
    setSaveNote('');
    setSaveError(null);
    setContactsSaved(false);
    setContactsError(null);
    setShowAllPhones(false);
  }, [detail?.id]);

  async function handleTracePress() {
    if (!token || !detail) return;
    setTraceState('loading');
    setTraceError(null);
    try {
      const result = await traceParcel(token, detail.id);
      setTraceResult(result);
      // Default recipient: the first traced email; user can toggle in the
      // draft flow when the owner has several.
      setRecipients(result.matched && result.emails[0] ? [result.emails[0].email] : []);
      setTraceState('done');
    } catch (err) {
      setTraceError(err instanceof Error ? err.message : 'Trace failed');
      setTraceState('error');
    }
  }

  function toggleRecipient(email: string) {
    setRecipients((prev) =>
      prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email]
    );
  }

  async function handleGenerateDraft() {
    if (!token || !detail || !templateId) return;
    setDraftState('generating');
    setDraftError(null);
    try {
      const { subject, body } = await draftEmail(token, detail.id, templateId, toneId);
      const available = await MailComposer.isAvailableAsync();
      if (!available) {
        setDraftError('Mail is not set up on this device.');
        setDraftState('error');
        return;
      }
      await MailComposer.composeAsync({
        recipients: recipients.length > 0 ? recipients : undefined,
        subject,
        body,
      });
      setDraftState('idle');
      setTemplateId(null);
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : 'Draft failed');
      setDraftState('error');
    }
  }

  async function handleSaveProperty() {
    if (!token || !detail) return;
    Keyboard.dismiss();
    setSaveState('saving');
    setSaveError(null);
    try {
      await saveProperty(token, detail.id, saveNote.trim() || undefined);
      setSaveState('saved');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
      setSaveState('error');
    }
  }

  async function handleSaveToContacts() {
    if (!detail || !traceResult?.matched) return;
    setContactsError(null);
    try {
      // Native "New Contact" form, prefilled -- the user reviews and taps Done
      // themselves, so no blanket contacts permission (and none of iOS 18's
      // "share all your contacts?" prompt) is ever needed.
      const ownerName = detail.owner_name ?? 'Property Owner';
      await Contacts.presentFormAsync(
        null,
        {
          contactType: Contacts.ContactTypes.Person,
          name: ownerName,
          firstName: ownerName,
          company: [detail.situs_address, saveNote.trim()].filter(Boolean).join(' — '),
          phoneNumbers: traceResult.phones.map((p) => ({
            label: p.type || 'mobile',
            number: p.number,
          })),
          emails: traceResult.emails.map((e) => ({ label: 'home', email: e.email })),
        },
        { isNew: true }
      );
      setContactsSaved(true);
    } catch (err) {
      setContactsError(err instanceof Error ? err.message : 'Failed to save contact');
    }
  }

  async function handleExportVCard() {
    if (!detail || !traceResult?.matched) return;
    const vcard = buildVCard(detail, traceResult);
    const safeName = (detail.owner_name ?? 'contact').replace(/[^a-z0-9]+/gi, '_');
    const file = new File(Paths.cache, `${safeName}.vcf`);
    file.create({ overwrite: true });
    file.write(vcard);
    await Share.share({ url: file.uri });
  }

  return (
    <View style={styles.sheet}>
      <View style={styles.handle} />
      <TouchableOpacity style={styles.closeButton} onPress={onClose}>
        <Text style={styles.closeButtonText}>✕</Text>
      </TouchableOpacity>

      {loading && (
        <View style={styles.loadingRow}>
          <ActivityIndicator />
          <Text style={styles.loadingText}>Looking up owner…</Text>
        </View>
      )}

      {!loading && !detail && (
        <Text style={styles.notFoundText}>No parcel data at this location.</Text>
      )}

      {!loading && detail && (
        <>
          <Text style={styles.address}>{detail.situs_address ?? 'Address unavailable'}</Text>

          <View style={styles.badgeRow}>
            {detail.is_absentee && (
              <View style={[styles.badge, styles.badgeAbsentee]}>
                <Text style={styles.badgeText}>Absentee owner</Text>
              </View>
            )}
            {detail.has_pool && (
              <View style={[styles.badge, styles.badgePool]}>
                <Text style={styles.badgeText}>Pool</Text>
              </View>
            )}
          </View>

          {detail.is_protected ? (
            <Text style={styles.protectedText}>
              Protected record (Texas Tax Code §25.025)
            </Text>
          ) : (
            <>
              {detail.owner_name && <Row label="Owner" value={detail.owner_name} />}
              {detail.mailing_address && (
                <Row label="Mailing address" value={detail.mailing_address} />
              )}
            </>
          )}

          {detail.year_built !== null && (
            <Row label="Year built" value={String(detail.year_built)} />
          )}
          {formatNumber(detail.living_area_sqft) && (
            <Row label="Living area" value={`${formatNumber(detail.living_area_sqft)} sqft`} />
          )}
          {bedsBathsLine(detail) && <Row label="Beds / baths" value={bedsBathsLine(detail)!} />}
          {formatNumber(detail.lot_size_sqft) && (
            <Row label="Lot size" value={`${formatNumber(detail.lot_size_sqft)} sqft`} />
          )}
          {lastSaleLine(detail) && <Row label="Last sale" value={lastSaleLine(detail)!} />}
          {formatCurrency(detail.assessed_total_value) && (
            <Row label="Assessed value" value={formatCurrency(detail.assessed_total_value)!} />
          )}

          {traceState !== 'done' && (
            <TouchableOpacity
              style={styles.ctaButton}
              onPress={handleTracePress}
              disabled={traceState === 'loading' || !token}
            >
              {traceState === 'loading' ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.ctaButtonText}>
                  Get Contact Info — {formatCents(config.trace_price_cents)}
                </Text>
              )}
            </TouchableOpacity>
          )}

          {traceState === 'error' && (
            <Text style={styles.traceErrorText}>{traceError}</Text>
          )}

          {traceState === 'done' && traceResult && !traceResult.matched && (
            <Text style={styles.traceErrorText}>
              {traceResult.message ?? 'No verified contact found.'}
            </Text>
          )}

          {traceState === 'done' && traceResult?.matched && (
            <View style={styles.traceResults}>
              {traceResult.freeReview && (
                <Text style={styles.freeReviewText}>Already unlocked — no charge</Text>
              )}
              {(showAllPhones ? traceResult.phones : traceResult.phones.slice(0, 2)).map((phone) => (
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
              {traceResult.phones.length > 2 && (
                <TouchableOpacity onPress={() => setShowAllPhones(!showAllPhones)}>
                  <Text style={styles.showMoreText}>
                    {showAllPhones
                      ? 'Show fewer numbers'
                      : `Show ${traceResult.phones.length - 2} more numbers`}
                  </Text>
                </TouchableOpacity>
              )}
              {traceResult.emails.map((email) => (
                <View key={email.email} style={styles.contactRow}>
                  <Text style={styles.contactValue}>{email.email}</Text>
                </View>
              ))}

              {draftState === 'idle' && (
                <TouchableOpacity
                  style={styles.draftButton}
                  onPress={() => (features.draft_email ? setDraftState('picking') : onUpgradeNeeded())}
                >
                  <Text style={styles.draftButtonText}>Draft Email</Text>
                </TouchableOpacity>
              )}

              {features.draft_email && (draftState === 'picking' || draftState === 'generating' || draftState === 'error') && (
                <View style={styles.draftPicker}>
                  <Text style={styles.label}>Template</Text>
                  <View style={styles.pickerRow}>
                    {config.draft.templates.map((t) => (
                      <TouchableOpacity
                        key={t.id}
                        style={[styles.pickerChip, templateId === t.id && styles.pickerChipSelected]}
                        onPress={() => setTemplateId(t.id)}
                      >
                        <Text
                          style={[
                            styles.pickerChipText,
                            templateId === t.id && styles.pickerChipTextSelected,
                          ]}
                        >
                          {t.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.label}>Tone</Text>
                  <View style={styles.pickerRow}>
                    {config.draft.tones.map((t) => (
                      <TouchableOpacity
                        key={t.id}
                        style={[styles.pickerChip, toneId === t.id && styles.pickerChipSelected]}
                        onPress={() => setToneId(t.id)}
                      >
                        <Text
                          style={[styles.pickerChipText, toneId === t.id && styles.pickerChipTextSelected]}
                        >
                          {t.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {traceResult.emails.length > 1 && (
                    <>
                      <Text style={styles.label}>Send to</Text>
                      <View style={styles.pickerRow}>
                        {traceResult.emails.map((e) => (
                          <TouchableOpacity
                            key={e.email}
                            style={[
                              styles.pickerChip,
                              recipients.includes(e.email) && styles.pickerChipSelected,
                            ]}
                            onPress={() => toggleRecipient(e.email)}
                          >
                            <Text
                              style={[
                                styles.pickerChipText,
                                recipients.includes(e.email) && styles.pickerChipTextSelected,
                              ]}
                            >
                              {e.email}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </>
                  )}

                  {draftError && <Text style={styles.traceErrorText}>{draftError}</Text>}

                  <TouchableOpacity
                    style={styles.draftButton}
                    onPress={handleGenerateDraft}
                    disabled={!templateId || draftState === 'generating'}
                  >
                    {draftState === 'generating' ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.draftButtonText}>Generate</Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}

              <View style={styles.saveSection}>
                {saveState !== 'saved' && (
                  <TextInput
                    style={styles.noteInput}
                    placeholder="Add a note (optional)"
                    value={saveNote}
                    onChangeText={setSaveNote}
                  />
                )}

                {saveState !== 'saved' && (
                  <TouchableOpacity
                    style={styles.saveButton}
                    onPress={() => (features.crm ? handleSaveProperty() : onUpgradeNeeded())}
                    disabled={saveState === 'saving'}
                  >
                    {saveState === 'saving' ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.saveButtonText}>Save Property</Text>
                    )}
                  </TouchableOpacity>
                )}
                {saveState === 'saved' && <Text style={styles.savedText}>Saved ✓</Text>}
                {saveState === 'error' && <Text style={styles.traceErrorText}>{saveError}</Text>}

                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => (features.crm ? handleSaveToContacts() : onUpgradeNeeded())}
                  disabled={contactsSaved}
                >
                  <Text style={styles.secondaryButtonText}>
                    {contactsSaved ? 'Added to Contacts ✓' : 'Save to Contacts'}
                  </Text>
                </TouchableOpacity>
                {contactsError && <Text style={styles.traceErrorText}>{contactsError}</Text>}

                <TouchableOpacity style={styles.secondaryButton} onPress={handleExportVCard}>
                  <Text style={styles.secondaryButtonText}>Share Contact</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#d1d5db',
    marginBottom: 8,
  },
  closeButton: {
    position: 'absolute',
    top: 12,
    right: 16,
    padding: 4,
  },
  closeButtonText: {
    fontSize: 18,
    color: '#6b7280',
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
  notFoundText: {
    paddingVertical: 24,
    color: '#6b7280',
  },
  address: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 8,
    paddingRight: 24,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  badgeAbsentee: {
    backgroundColor: '#fef3c7',
  },
  badgePool: {
    backgroundColor: '#dbeafe',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  protectedText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#b91c1c',
    marginVertical: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  rowLabel: {
    color: '#6b7280',
  },
  rowValue: {
    fontWeight: '500',
    flexShrink: 1,
    textAlign: 'right',
  },
  ctaButton: {
    marginTop: 16,
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  ctaButtonText: {
    fontWeight: '600',
    color: '#fff',
  },
  traceErrorText: {
    marginTop: 16,
    color: '#b91c1c',
    fontSize: 13,
  },
  traceResults: {
    marginTop: 16,
    gap: 8,
  },
  freeReviewText: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 4,
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
  badgeDnc: {
    backgroundColor: '#fee2e2',
  },
  badgeTcpa: {
    backgroundColor: '#fef3c7',
  },
  badgeVerified: {
    backgroundColor: '#dcfce7',
  },
  showMoreText: {
    color: '#2563eb',
    fontWeight: '600',
    fontSize: 13,
    paddingVertical: 6,
  },
  draftButton: {
    marginTop: 12,
    backgroundColor: '#111827',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  draftButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  draftPicker: {
    marginTop: 12,
  },
  label: {
    color: '#374151',
    fontWeight: '600',
    marginBottom: 6,
    fontSize: 13,
  },
  pickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  pickerChip: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  pickerChipSelected: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  pickerChipText: {
    fontSize: 12,
    color: '#374151',
  },
  pickerChipTextSelected: {
    color: '#fff',
  },
  saveSection: {
    marginTop: 16,
    gap: 8,
  },
  noteInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
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
    textAlign: 'center',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#374151',
    fontWeight: '600',
  },
});
