import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Alert, Image, FlatList,
  KeyboardAvoidingView, Platform, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { createQuote, updateQuote, createClient, getClients, uploadPhotos, getAccountSettings } from '../services/api';
import { Button, Input, Card, SectionHeader } from '../components/UI';
import { colors, spacing, typography, radius, shadow } from '../utils/theme';

const TOTAL_STEPS = 5;

export default function NewQuoteScreen({ navigation, route }) {
  const { editingQuote } = route.params || {};
  const isEditing = !!editingQuote;

  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [rates, setRates] = useState({ hourly: 75, tax: 0 });

  React.useEffect(() => {
    (async () => {
      try {
        const data = await getAccountSettings();
        setRates({ hourly: data.default_hourly_rate, tax: data.tax_rate });
      } catch {}

      if (isEditing) {
        setJobName(editingQuote.job_name || '');
        setSummary(editingQuote.summary_explanation || '');
        if (editingQuote.client_id) {
          // We usually have client_name in the quote object from GET /quotes/:id
          setSelectedClient({ id: editingQuote.client_id, full_name: editingQuote.client_name });
          setClientSearch(editingQuote.client_name || '');
        }
        if (editingQuote.tasks?.length) {
          setTasks(editingQuote.tasks.map(t => ({ 
            ...t, 
            estimated_hours: (t.estimated_hours || '').toString(),
            price: (t.price || '').toString()
          })));
        }
        if (editingQuote.materials?.length) setMaterials(editingQuote.materials.map(m => ({ ...m, quantity: m.quantity.toString(), unit_cost: m.unit_cost.toString() })));
        if (editingQuote.equipment?.length) setEquipment(editingQuote.equipment.map(e => ({ ...e, duration_days: e.duration_days.toString(), daily_rate: e.daily_rate.toString() })));
        if (editingQuote.sundry?.length) setSundry(editingQuote.sundry.map(s => ({ ...s, flat_amount: s.flat_amount.toString() })));
        if (editingQuote.higher_costs?.length) setHigherCosts(editingQuote.higher_costs.map(h => ({ ...h, amount: h.amount.toString() })));
        if (editingQuote.photos?.length) setPhotos(editingQuote.photos.map(p => ({ uri: `https://varipro-backend.onrender.com${p.image_uri}`, isExisting: true })));
      }
    })();
  }, []);

  // Step 1
  const [jobName, setJobName] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState(null);
  const [clients, setClients] = useState([]);
  const [newClient, setNewClient] = useState({ full_name: '', email: '', phone: '', site_address: '' });
  const [clientMode, setClientMode] = useState('search'); // 'search' | 'new'

  // Step 2
  const [photos, setPhotos] = useState([]);

  // Step 3
  const [summary, setSummary] = useState('');
  const [tasks, setTasks] = useState([{ task_name: '', task_type: 'hourly', estimated_hours: '', price: '' }]);

  // Step 4
  const [activeTab, setActiveTab] = useState('materials');
  const [materials, setMaterials] = useState([{ item_name: '', quantity: '', unit_cost: '' }]);
  const [equipment, setEquipment] = useState([{ item_name: '', duration_days: '', daily_rate: '' }]);
  const [sundry, setSundry] = useState([{ description: '', flat_amount: '' }]);
  const [higherCosts, setHigherCosts] = useState([{ description: '', amount: '' }]);

  const searchClients = async (q) => {
    setClientSearch(q);
    if (q.length > 1) {
      const data = await getClients({ search: q });
      setClients(data);
    } else {
      setClients([]);
    }
  };

  const addPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Allow photo access to attach site photos.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ allowsMultipleSelection: true, mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (!result.canceled) setPhotos(prev => [...prev, ...result.assets.map(a => ({ uri: a.uri, caption: '' }))]);
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Allow camera access to take site photos.'); return; }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (!result.canceled) setPhotos(prev => [...prev, { uri: result.assets[0].uri, caption: '' }]);
  };

  // List helpers
  const addRow = (setter) => setter(prev => [...prev, {}]);
  const removeRow = (setter, idx) => setter(prev => prev.filter((_, i) => i !== idx));
  const updateRow = (setter, idx, key, val) => setter(prev => prev.map((r, i) => i === idx ? { ...r, [key]: val } : r));

  // Totals
  const laborCost = tasks.reduce((s, t) => {
    if (t.task_type === 'set') return s + (parseFloat(t.price) || 0);
    if (t.task_type === 'charge') return s; // Open-ended doesn't add to fixed subtotal
    return s + (parseFloat(t.estimated_hours) || 0) * rates.hourly;
  }, 0);
  const laborHours = tasks.reduce((s, t) => t.task_type === 'hourly' ? s + (parseFloat(t.estimated_hours) || 0) : s, 0);

  const materialsTotal = materials.reduce((s, m) => s + (parseFloat(m.quantity) || 0) * (parseFloat(m.unit_cost) || 0), 0);
  const equipmentTotal = equipment.reduce((s, e) => s + (parseFloat(e.duration_days) || 0) * (parseFloat(e.daily_rate) || 0), 0);
  const sundryTotal = sundry.reduce((s, su) => s + (parseFloat(su.flat_amount) || 0), 0);
  const higherTotal = higherCosts.reduce((s, h) => s + (parseFloat(h.amount) || 0), 0);
  
  const subtotal = laborCost + materialsTotal + equipmentTotal + sundryTotal + higherTotal;
  const taxAmount = subtotal * (rates.tax / 100);
  const grandTotal = subtotal + taxAmount;

  const fmt = (n) => `$${n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const handleSave = async (asDraft = false) => {
    if (!jobName.trim()) { Alert.alert('Missing info', 'Job name is required.'); return; }
    setSaving(true);
    try {
      let client_id = selectedClient?.id;
      if (clientMode === 'new' && newClient.full_name) {
        const c = await createClient({ ...newClient });
        client_id = c.id;
      }

      const payload = {
        job_name: jobName,
        client_id: client_id || undefined,
        status: asDraft ? 'draft' : 'draft',
        summary_explanation: summary,
        tasks: tasks.filter(t => t.task_name).map(t => ({ 
          task_name: t.task_name, 
          task_type: t.task_type,
          estimated_hours: t.task_type === 'hourly' ? parseFloat(t.estimated_hours) || 0 : 0,
          price: t.task_type === 'set' ? parseFloat(t.price) || 0 : 0
        })),
        materials: materials.filter(m => m.item_name).map(m => ({ item_name: m.item_name, quantity: parseFloat(m.quantity) || 1, unit_cost: parseFloat(m.unit_cost) || 0 })),
        equipment: equipment.filter(e => e.item_name).map(e => ({ item_name: e.item_name, duration_days: parseFloat(e.duration_days) || 1, daily_rate: parseFloat(e.daily_rate) || 0 })),
        sundry: sundry.filter(s => s.description).map(s => ({ description: s.description, flat_amount: parseFloat(s.flat_amount) || 0 })),
        higher_costs: higherCosts.filter(h => h.description).map(h => ({ description: h.description, amount: parseFloat(h.amount) || 0 })),
      };

      if (isEditing) {
        await updateQuote(editingQuote.id, payload);
      } else {
        const created = await createQuote(payload);
        if (photos.length > 0) {
          try { await uploadPhotos(created.id, photos.filter(p => !p.isExisting).map(p => p.uri)); } catch {}
        }
      }
      navigation.navigate('Quotes');
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Failed to save quote.');
    } finally {
      setSaving(false);
    }
  };

  // Progress bar
  const ProgressBar = () => (
    <View style={styles.progressContainer}>
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
        <View key={i} style={[styles.progressDot, i < step && styles.progressDotActive]} />
      ))}
    </View>
  );

  const stepTitles = ['Job & Client', 'Site Photos', 'Tasks & Summary', 'Line Items', 'Review & Send'];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => step > 1 ? setStep(step - 1) : navigation.goBack()}>
          <Text style={styles.backBtn}>‹ {step > 1 ? 'Back' : 'Cancel'}</Text>
        </TouchableOpacity>
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.stepTitle}>{isEditing ? 'Edit: ' : ''}{stepTitles[step - 1]}</Text>
          <Text style={styles.stepCount}>Step {step} of {TOTAL_STEPS}</Text>
        </View>
        <View style={{ width: 60 }} />
      </View>
      <ProgressBar />

      <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.md, paddingBottom: 100 }} keyboardShouldPersistTaps="handled">

        {/* ── Step 1: Job & Client ── */}
        {step === 1 && (
          <>
            <Card>
              <SectionHeader title="Job Details" />
              <Input label="Job Name *" placeholder="e.g. Bathroom Renovation" value={jobName} onChangeText={setJobName} />
            </Card>
            <Card>
              <SectionHeader title="Client" />
              <View style={styles.tabRow}>
                {['search', 'new'].map(m => (
                  <TouchableOpacity key={m} onPress={() => setClientMode(m)} style={[styles.tabBtn, clientMode === m && styles.tabBtnActive]}>
                    <Text style={[styles.tabText, clientMode === m && styles.tabTextActive]}>{m === 'search' ? '🔍 Existing' : '➕ New'}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {clientMode === 'search' ? (
                <>
                  <Input placeholder="Search clients…" value={clientSearch} onChangeText={searchClients} />
                  {clients.map(c => (
                    <TouchableOpacity key={c.id} onPress={() => { setSelectedClient(c); setClientSearch(c.full_name); setClients([]); }}
                      style={[styles.clientRow, selectedClient?.id === c.id && styles.clientRowSelected]}>
                      <Text style={{ fontWeight: '600' }}>{c.full_name}</Text>
                      <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{c.site_address}</Text>
                    </TouchableOpacity>
                  ))}
                  {selectedClient && <Text style={{ color: colors.success, fontSize: 13 }}>✅ {selectedClient.full_name} selected</Text>}
                </>
              ) : (
                <>
                  <Input label="Full Name *" value={newClient.full_name} onChangeText={v => setNewClient(p => ({ ...p, full_name: v }))} />
                  <Input label="Site Address *" value={newClient.site_address} onChangeText={v => setNewClient(p => ({ ...p, site_address: v }))} />
                  <Input label="Email" value={newClient.email} onChangeText={v => setNewClient(p => ({ ...p, email: v }))} keyboardType="email-address" autoCapitalize="none" />
                  <Input label="Phone" value={newClient.phone} onChangeText={v => setNewClient(p => ({ ...p, phone: v }))} keyboardType="phone-pad" />
                </>
              )}
            </Card>
          </>
        )}

        {/* ── Step 2: Photos ── */}
        {step === 2 && (
          <Card>
            <SectionHeader title="Site Photos" />
            <Text style={{ color: colors.textSecondary, marginBottom: spacing.md }}>Add photos from the job site for the quote.</Text>
            <View style={styles.photoGrid}>
              {photos.map((p, i) => (
                <View key={i} style={styles.photoThumb}>
                  <Image source={{ uri: p.uri }} style={{ width: '100%', height: '100%', borderRadius: radius.sm }} />
                  <TouchableOpacity style={styles.photoDelete} onPress={() => setPhotos(prev => prev.filter((_, j) => j !== i))}>
                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity style={styles.addPhotoBtn} onPress={addPhoto}>
                <Text style={{ fontSize: 28, color: colors.primary }}>📷</Text>
                <Text style={{ color: colors.primary, fontSize: 12, marginTop: 4 }}>Gallery</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.addPhotoBtn} onPress={takePhoto}>
                <Text style={{ fontSize: 28, color: colors.primary }}>📸</Text>
                <Text style={{ color: colors.primary, fontSize: 12, marginTop: 4 }}>Camera</Text>
              </TouchableOpacity>
            </View>
            {photos.length === 0 && <Text style={{ textAlign: 'center', color: colors.textSecondary, marginTop: spacing.md }}>No photos added yet — or skip this step</Text>}
          </Card>
        )}

        {/* ── Step 3: Tasks & Summary ── */}
        {step === 3 && (
          <>
            <Card>
              <SectionHeader title="Work Summary" />
              <TextInput
                style={[styles.textArea]}
                placeholder="Describe the work to be done (max 500 chars)…"
                placeholderTextColor={colors.textSecondary}
                value={summary}
                onChangeText={t => t.length <= 500 && setSummary(t)}
                multiline
                numberOfLines={4}
              />
              <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: 'right' }}>{summary.length}/500</Text>
            </Card>
            <Card>
              <SectionHeader title="Work Tasks" action="+ Add Task" onAction={() => setTasks(prev => [...prev, { task_type: 'set' }])} />
              {tasks.map((t, i) => (
                <View key={i} style={{ marginBottom: spacing.md, borderBottomWidth: i < tasks.length - 1 ? 1 : 0, borderBottomColor: colors.border, pb: spacing.sm }}>
                  <View style={styles.lineRow}>
                    <TextInput style={[styles.lineInput, { flex: 2 }]} placeholder="Task name" placeholderTextColor={colors.textSecondary} value={t.task_name} onChangeText={v => updateRow(setTasks, i, 'task_name', v)} />
                    <TouchableOpacity onPress={() => removeRow(setTasks, i)} style={styles.deleteBtn}><Text style={{ color: colors.danger }}>✕</Text></TouchableOpacity>
                  </View>
                  <View style={[styles.lineRow, { marginTop: spacing.xs }]}>
                    <View style={{ flexDirection: 'row', backgroundColor: colors.border, borderRadius: radius.xs, padding: 2, flex: 1.5 }}>
                      <TouchableOpacity onPress={() => updateRow(setTasks, i, 'task_type', 'charge')} style={[{ flex: 1, paddingVertical: 4, alignItems: 'center', borderRadius: radius.xs }, t.task_type === 'charge' && { backgroundColor: '#fff' }]}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: t.task_type === 'charge' ? colors.primary : colors.textSecondary }}>Charge/Hour</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => updateRow(setTasks, i, 'task_type', 'set')} style={[{ flex: 1, paddingVertical: 4, alignItems: 'center', borderRadius: radius.xs }, t.task_type === 'set' && { backgroundColor: '#fff' }]}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: t.task_type === 'set' ? colors.primary : colors.textSecondary }}>Set Price</Text>
                      </TouchableOpacity>
                    </View>
                    {t.task_type === 'charge' ? (
                      <TextInput style={[styles.lineInput, { flex: 1 }]} placeholder="Hourly Rate" placeholderTextColor={colors.textSecondary} value={t.hourly_rate} onChangeText={v => updateRow(setTasks, i, 'hourly_rate', v)} keyboardType="decimal-pad" />
                    ) : (
                      <TextInput style={[styles.lineInput, { flex: 1 }]} placeholder="Total Price" placeholderTextColor={colors.textSecondary} value={t.price} onChangeText={v => updateRow(setTasks, i, 'price', v)} keyboardType="decimal-pad" />
                    )}
                  </View>
                </View>
              ))}
              <View style={styles.totalRow}><Text style={{ color: colors.textSecondary }}>Labour ({fmt(rates.hourly)}/hr)</Text><Text style={styles.totalValue}>{fmt(laborCost)}</Text></View>
            </Card>
          </>
        )}

        {/* ── Step 4: Line Items ── */}
        {step === 4 && (
          <Card>
            <View style={styles.tabRow}>
              {[
                { key: 'materials', label: '🧱 Materials' },
                { key: 'equipment', label: '🔩 Equipment' },
                { key: 'sundry', label: '📦 Sundry' },
                { key: 'higher', label: '📋 Other' },
              ].map(t => (
                <TouchableOpacity key={t.key} onPress={() => setActiveTab(t.key)} style={[styles.tabBtn, activeTab === t.key && styles.tabBtnActive]}>
                  <Text style={[styles.tabText, activeTab === t.key && styles.tabTextActive]}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {activeTab === 'materials' && (
              <>
                <SectionHeader title="Materials" action="+ Add" onAction={() => addRow(setMaterials)} />
                {materials.map((m, i) => (
                  <View key={i} style={styles.lineRow}>
                    <TextInput style={[styles.lineInput, { flex: 2 }]} placeholder="Item" placeholderTextColor={colors.textSecondary} value={m.item_name} onChangeText={v => updateRow(setMaterials, i, 'item_name', v)} />
                    <TextInput style={[styles.lineInput, { flex: 0.8 }]} placeholder="Qty" placeholderTextColor={colors.textSecondary} value={m.quantity} onChangeText={v => updateRow(setMaterials, i, 'quantity', v)} keyboardType="decimal-pad" />
                    <TextInput style={[styles.lineInput, { flex: 1 }]} placeholder="$/unit" placeholderTextColor={colors.textSecondary} value={m.unit_cost} onChangeText={v => updateRow(setMaterials, i, 'unit_cost', v)} keyboardType="decimal-pad" />
                    <TouchableOpacity onPress={() => removeRow(setMaterials, i)} style={styles.deleteBtn}><Text style={{ color: colors.danger }}>✕</Text></TouchableOpacity>
                  </View>
                ))}
                <View style={styles.totalRow}><Text style={{ color: colors.textSecondary }}>Materials Total</Text><Text style={styles.totalValue}>{fmt(materialsTotal)}</Text></View>
              </>
            )}

            {activeTab === 'equipment' && (
              <>
                <SectionHeader title="Equipment" action="+ Add" onAction={() => addRow(setEquipment)} />
                {equipment.map((e, i) => (
                  <View key={i} style={styles.lineRow}>
                    <TextInput style={[styles.lineInput, { flex: 2 }]} placeholder="Item" placeholderTextColor={colors.textSecondary} value={e.item_name} onChangeText={v => updateRow(setEquipment, i, 'item_name', v)} />
                    <TextInput style={[styles.lineInput, { flex: 0.8 }]} placeholder="Days" placeholderTextColor={colors.textSecondary} value={e.duration_days} onChangeText={v => updateRow(setEquipment, i, 'duration_days', v)} keyboardType="decimal-pad" />
                    <TextInput style={[styles.lineInput, { flex: 1 }]} placeholder="$/day" placeholderTextColor={colors.textSecondary} value={e.daily_rate} onChangeText={v => updateRow(setEquipment, i, 'daily_rate', v)} keyboardType="decimal-pad" />
                    <TouchableOpacity onPress={() => removeRow(setEquipment, i)} style={styles.deleteBtn}><Text style={{ color: colors.danger }}>✕</Text></TouchableOpacity>
                  </View>
                ))}
                <View style={styles.totalRow}><Text style={{ color: colors.textSecondary }}>Equipment Total</Text><Text style={styles.totalValue}>{fmt(equipmentTotal)}</Text></View>
              </>
            )}

            {activeTab === 'sundry' && (
              <>
                <SectionHeader title="Sundry Items" action="+ Add" onAction={() => addRow(setSundry)} />
                {sundry.map((s, i) => (
                  <View key={i} style={styles.lineRow}>
                    <TextInput style={[styles.lineInput, { flex: 2 }]} placeholder="Description" placeholderTextColor={colors.textSecondary} value={s.description} onChangeText={v => updateRow(setSundry, i, 'description', v)} />
                    <TextInput style={[styles.lineInput, { flex: 1 }]} placeholder="Amount" placeholderTextColor={colors.textSecondary} value={s.flat_amount} onChangeText={v => updateRow(setSundry, i, 'flat_amount', v)} keyboardType="decimal-pad" />
                    <TouchableOpacity onPress={() => removeRow(setSundry, i)} style={styles.deleteBtn}><Text style={{ color: colors.danger }}>✕</Text></TouchableOpacity>
                  </View>
                ))}
                <View style={styles.totalRow}><Text style={{ color: colors.textSecondary }}>Sundry Total</Text><Text style={styles.totalValue}>{fmt(sundryTotal)}</Text></View>
              </>
            )}

            {activeTab === 'higher' && (
              <>
                <SectionHeader title="Higher Costs (Permits, Fees)" action="+ Add" onAction={() => addRow(setHigherCosts)} />
                {higherCosts.map((h, i) => (
                  <View key={i} style={styles.lineRow}>
                    <TextInput style={[styles.lineInput, { flex: 2 }]} placeholder="e.g. Permit fee" placeholderTextColor={colors.textSecondary} value={h.description} onChangeText={v => updateRow(setHigherCosts, i, 'description', v)} />
                    <TextInput style={[styles.lineInput, { flex: 1 }]} placeholder="Amount" placeholderTextColor={colors.textSecondary} value={h.amount} onChangeText={v => updateRow(setHigherCosts, i, 'amount', v)} keyboardType="decimal-pad" />
                    <TouchableOpacity onPress={() => removeRow(setHigherCosts, i)} style={styles.deleteBtn}><Text style={{ color: colors.danger }}>✕</Text></TouchableOpacity>
                  </View>
                ))}
                <View style={styles.totalRow}><Text style={{ color: colors.textSecondary }}>Higher Costs Total</Text><Text style={styles.totalValue}>{fmt(higherTotal)}</Text></View>
              </>
            )}
          </Card>
        )}

        {/* ── Step 5: Review ── */}
        {step === 5 && (
          <>
            <Card>
              <SectionHeader title="Quote Summary" />
              <Text style={typography.h3}>{jobName}</Text>
              {selectedClient && <Text style={{ color: colors.textSecondary }}>👤 {selectedClient.full_name}</Text>}
              {newClient.full_name && <Text style={{ color: colors.textSecondary }}>👤 {newClient.full_name} (new)</Text>}
              <Text style={{ color: colors.textSecondary, marginTop: spacing.xs }}>{photos.length} site photo{photos.length !== 1 ? 's' : ''}</Text>
            </Card>
            <Card>
              <SectionHeader title="Cost Breakdown" />
              {[
                { label: 'Subtotal', val: subtotal },
                { label: `Tax (${rates.tax}%)`, val: taxAmount },
              ].map(r => (
                <View key={r.label} style={styles.summaryRow}>
                  <Text style={{ color: colors.textSecondary }}>{r.label}</Text>
                  <Text style={{ fontWeight: '600' }}>{fmt(r.val)}</Text>
                </View>
              ))}
              <View style={[styles.summaryRow, styles.grandTotalRow]}>
                <Text style={{ fontSize: 18, fontWeight: '700' }}>Grand Total</Text>
                <Text style={{ fontSize: 22, fontWeight: '800', color: colors.primary }}>{fmt(grandTotal)}</Text>
              </View>
            </Card>
            <Button title={isEditing ? '💾 Update Quote' : '✅ Create Quote'} onPress={() => handleSave(false)} loading={saving} variant="secondary" style={{ marginBottom: spacing.sm }} />
            {!isEditing && <Button title="💾 Save as Draft" onPress={() => handleSave(true)} variant="outline" />}
          </>
        )}
      </ScrollView>

      {/* Navigation footer */}
      {step < 5 && (
        <View style={[styles.footer, Platform.OS === 'ios' && { paddingBottom: 40 }]}>
          <Button 
            title={step === TOTAL_STEPS - 1 ? 'Review →' : 'Next →'} 
            onPress={() => setStep(step + 1)} 
            variant="secondary" 
          />
        </View>
      )}
    </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingTop: 52, paddingBottom: spacing.md,
    backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { color: colors.primary, fontSize: 16, fontWeight: '600', width: 60 },
  stepTitle: { fontWeight: '700', fontSize: 16, color: colors.text },
  stepCount: { color: colors.textSecondary, fontSize: 12 },
  progressContainer: { flexDirection: 'row', height: 4, backgroundColor: colors.border },
  progressDot: { flex: 1, height: 4, backgroundColor: colors.border },
  progressDotActive: { backgroundColor: colors.primary },
  tabRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.md },
  tabBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.full, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface },
  tabBtnActive: { borderColor: colors.primary, backgroundColor: '#FFF4F0' },
  tabText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  tabTextActive: { color: colors.primary },
  lineRow: { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.xs, alignItems: 'center' },
  lineInput: { borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 8, fontSize: 14, color: colors.text, backgroundColor: colors.surface },
  deleteBtn: { padding: spacing.xs },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: spacing.sm, marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  totalValue: { fontWeight: '700', color: colors.primary },
  textArea: { borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontSize: 15, color: colors.text, minHeight: 100, textAlignVertical: 'top', backgroundColor: colors.surface },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  photoThumb: { width: 90, height: 90, borderRadius: radius.md, overflow: 'hidden', position: 'relative' },
  photoDelete: { position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 10, width: 20, height: 20, justifyContent: 'center', alignItems: 'center' },
  addPhotoBtn: { width: 90, height: 90, borderRadius: radius.md, borderWidth: 2, borderColor: colors.primary, borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center' },
  clientRow: { padding: spacing.sm, borderRadius: radius.sm, borderWidth: 1.5, borderColor: colors.border, marginBottom: spacing.xs },
  clientRowSelected: { borderColor: colors.success, backgroundColor: '#F0FFF4' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  grandTotalRow: { borderBottomWidth: 0, paddingTop: spacing.md, marginTop: spacing.sm },
  footer: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
});
