import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { getClients, createDirectJob } from '../services/api';
import { Button, Input } from './UI';
import { colors, spacing, radius, typography, shadow } from '../utils/theme';

export default function CreateJobModal({ visible, onClose, onJobCreated }) {
  const [jobName, setJobName] = useState('');
  const [summary, setSummary] = useState('');
  const [taskName, setTaskName] = useState('');
  const [siteAddress, setSiteAddress] = useState('');

  // Client mode: 'select' | 'new' | 'none'
  const [clientMode, setClientMode] = useState('select');
  const [clients, setClients] = useState([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState(null);

  // New client form fields
  const [newClient, setNewClient] = useState({
    full_name: '',
    phone: '',
    email: '',
    site_address: '',
  });

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (visible) {
      loadClients();
      setErrorMsg('');
    }
  }, [visible]);

  const loadClients = async () => {
    try {
      setLoadingClients(true);
      const data = await getClients();
      setClients(data || []);
    } catch (err) {
      console.warn('Failed to load clients:', err);
    } finally {
      setLoadingClients(false);
    }
  };

  const resetForm = () => {
    setJobName('');
    setSummary('');
    setTaskName('');
    setSiteAddress('');
    setSelectedClient(null);
    setClientSearch('');
    setClientMode('select');
    setNewClient({ full_name: '', phone: '', email: '', site_address: '' });
    setErrorMsg('');
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSave = async () => {
    if (!jobName.trim()) {
      const msg = 'Job Name is required.';
      setErrorMsg(msg);
      Alert.alert('Required', msg);
      return;
    }

    if (clientMode === 'new' && !newClient.full_name.trim()) {
      const msg = 'Client full name is required when creating a new client.';
      setErrorMsg(msg);
      Alert.alert('Required', msg);
      return;
    }

    setSaving(true);
    setErrorMsg('');
    try {
      const payload = {
        job_name: jobName.trim(),
        summary_explanation: summary.trim() || undefined,
        task_name: taskName.trim() || undefined,
        site_address: siteAddress.trim() || undefined,
      };

      if (clientMode === 'select' && selectedClient) {
        payload.client_id = selectedClient.id;
      } else if (clientMode === 'new') {
        payload.new_client = {
          full_name: newClient.full_name.trim(),
          phone: newClient.phone.trim() || undefined,
          email: newClient.email.trim() || undefined,
          site_address: newClient.site_address.trim() || siteAddress.trim() || undefined,
        };
      }

      const createdJob = await createDirectJob(payload);
      Alert.alert('Success', `Job "${createdJob.job_name}" created and ready for timesheets!`);
      
      resetForm();
      if (onJobCreated) {
        onJobCreated(createdJob);
      }
      onClose();
    } catch (err) {
      const errorText = err.response?.data?.error || err.message || 'Failed to create job.';
      setErrorMsg(errorText);
      Alert.alert('Error', errorText);
    } finally {
      setSaving(false);
    }
  };

  const filteredClients = clients.filter(c =>
    c.full_name.toLowerCase().includes(clientSearch.toLowerCase()) ||
    (c.site_address && c.site_address.toLowerCase().includes(clientSearch.toLowerCase()))
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
      transparent={false}
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.modalTitle}>⚡ Create Direct Job</Text>
            <Text style={styles.modalSubtitle}>Quick job for timesheeting without creating a quote</Text>
          </View>
          <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {errorMsg ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>⚠️  {errorMsg}</Text>
            </View>
          ) : null}

          {/* Job Name */}
          <Input
            label="Job Name *"
            placeholder="e.g. 14 Victoria St - Rewire / Maintenance"
            value={jobName}
            onChangeText={(text) => {
              setJobName(text);
              if (errorMsg) setErrorMsg('');
            }}
            autoFocus
          />

          {/* Client Selection Section */}
          <Text style={styles.sectionLabel}>Client Information</Text>
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[styles.tabBtn, clientMode === 'select' && styles.tabBtnActive]}
              onPress={() => setClientMode('select')}
            >
              <Text style={[styles.tabText, clientMode === 'select' && styles.tabTextActive]}>
                Existing Client
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabBtn, clientMode === 'new' && styles.tabBtnActive]}
              onPress={() => setClientMode('new')}
            >
              <Text style={[styles.tabText, clientMode === 'new' && styles.tabTextActive]}>
                ＋ New Client
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabBtn, clientMode === 'none' && styles.tabBtnActive]}
              onPress={() => setClientMode('none')}
            >
              <Text style={[styles.tabText, clientMode === 'none' && styles.tabTextActive]}>
                No Client
              </Text>
            </TouchableOpacity>
          </View>

          {clientMode === 'select' && (
            <View style={styles.clientBox}>
              {selectedClient ? (
                <View style={styles.selectedClientRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.selectedClientName}>👤 {selectedClient.full_name}</Text>
                    {selectedClient.site_address ? (
                      <Text style={styles.selectedClientSub}>📍 {selectedClient.site_address}</Text>
                    ) : null}
                  </View>
                  <TouchableOpacity
                    style={styles.changeClientBtn}
                    onPress={() => setSelectedClient(null)}
                  >
                    <Text style={styles.changeClientBtnText}>Change</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View>
                  <Input
                    label="Search Clients"
                    placeholder="Search by name or address..."
                    value={clientSearch}
                    onChangeText={setClientSearch}
                    containerStyle={{ marginBottom: spacing.xs }}
                  />
                  {loadingClients ? (
                    <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 10 }} />
                  ) : (
                    <View style={styles.clientList}>
                      {filteredClients.slice(0, 5).map(c => (
                        <TouchableOpacity
                          key={c.id}
                          style={styles.clientItem}
                          onPress={() => {
                            setSelectedClient(c);
                            if (c.site_address && !siteAddress) {
                              setSiteAddress(c.site_address);
                            }
                          }}
                        >
                          <Text style={styles.clientItemName}>{c.full_name}</Text>
                          {c.site_address ? (
                            <Text style={styles.clientItemAddress}>{c.site_address}</Text>
                          ) : null}
                        </TouchableOpacity>
                      ))}
                      {filteredClients.length === 0 && (
                        <Text style={styles.emptyClientText}>
                          {clients.length === 0 ? 'No clients saved yet.' : 'No matching clients.'}
                        </Text>
                      )}
                    </View>
                  )}
                </View>
              )}
            </View>
          )}

          {clientMode === 'new' && (
            <View style={styles.clientBox}>
              <Input
                label="Full Name *"
                placeholder="Client or Business name"
                value={newClient.full_name}
                onChangeText={(v) => setNewClient({ ...newClient, full_name: v })}
              />
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <Input
                    label="Phone"
                    placeholder="021 555 1234"
                    keyboardType="phone-pad"
                    value={newClient.phone}
                    onChangeText={(v) => setNewClient({ ...newClient, phone: v })}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Input
                    label="Email"
                    placeholder="client@email.com"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    value={newClient.email}
                    onChangeText={(v) => setNewClient({ ...newClient, email: v })}
                  />
                </View>
              </View>
              <Input
                label="Site Address"
                placeholder="Job site location"
                value={newClient.site_address}
                onChangeText={(v) => setNewClient({ ...newClient, site_address: v })}
              />
            </View>
          )}

          {clientMode !== 'new' && (
            <Input
              label="Site Address / Location (Optional)"
              placeholder="e.g. 14 Victoria St, Auckland"
              value={siteAddress}
              onChangeText={setSiteAddress}
            />
          )}

          {/* Initial Task */}
          <Input
            label="Initial Task (Optional)"
            placeholder="e.g. Site Inspection / Callout Labour"
            value={taskName}
            onChangeText={setTaskName}
          />

          {/* Scope of Work / Notes */}
          <Input
            label="Job Notes / Description (Optional)"
            placeholder="Details, gate codes, client requests..."
            value={summary}
            onChangeText={setSummary}
            multiline
            style={{ height: 75 }}
            textAlignVertical="top"
          />

          {/* Action Buttons */}
          <View style={styles.actionButtons}>
            <Button
              title="⚡ Create Job & Enable Timesheet"
              onPress={handleSave}
              loading={saving}
              variant="primary"
              style={{ marginBottom: spacing.sm }}
            />
            <Button
              title="Cancel"
              onPress={handleClose}
              variant="outline"
              disabled={saving}
            />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    ...shadow.sm,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
    fontFamily: 'Outfit',
  },
  modalSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  closeBtn: {
    padding: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: '#F3F4F6',
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 16,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: 60,
  },
  errorBanner: {
    backgroundColor: '#FFF5F5',
    borderColor: colors.danger,
    borderWidth: 1.5,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '600',
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#E5E7EB',
    borderRadius: radius.md,
    padding: 3,
    marginBottom: spacing.md,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: radius.sm,
  },
  tabBtnActive: {
    backgroundColor: '#FFFFFF',
    ...shadow.sm,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  clientBox: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  selectedClientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectedClientName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  selectedClientSub: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  changeClientBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  changeClientBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  clientList: {
    maxHeight: 180,
  },
  clientItem: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  clientItemName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  clientItemAddress: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  emptyClientText: {
    textAlign: 'center',
    fontSize: 12,
    color: colors.textSecondary,
    paddingVertical: spacing.sm,
  },
  actionButtons: {
    marginTop: spacing.md,
  },
});
