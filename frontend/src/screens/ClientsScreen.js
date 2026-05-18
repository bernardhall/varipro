import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput, Alert, Modal, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getClients, createClient, deleteClient, updateClient } from '../services/api';
import { Button, Input, EmptyState, LoadingScreen } from '../components/UI';
import { colors, spacing, typography, radius, shadow } from '../utils/theme';

export default function ClientsScreen() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', site_address: '' });
  const [saving, setSaving] = useState(false);

  const fetchClients = useCallback(async () => {
    try {
      const data = await getClients({ search: search || undefined });
      setClients(data);
    } catch {}
    finally { setLoading(false); }
  }, [search]);

  useFocusEffect(useCallback(() => { fetchClients(); }, [fetchClients]));

  const set = (key) => (val) => setForm(p => ({ ...p, [key]: val }));

  const handleAddPress = () => {
    setEditingClient(null);
    setForm({ full_name: '', email: '', phone: '', site_address: '' });
    setShowModal(true);
  };

  const handleEditPress = (client) => {
    setEditingClient(client);
    setForm({
      full_name: client.full_name || '',
      email: client.email || '',
      phone: client.phone || '',
      site_address: client.site_address || ''
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.full_name || !form.site_address) { 
      Alert.alert('Required', 'Name and site address are required.'); 
      return; 
    }
    setSaving(true);
    try {
      if (editingClient) {
        await updateClient(editingClient.id, form);
        Alert.alert('Success', 'Client updated successfully');
      } else {
        await createClient(form);
        Alert.alert('Success', 'Client created successfully');
      }
      setShowModal(false);
      setEditingClient(null);
      setForm({ full_name: '', email: '', phone: '', site_address: '' });
      fetchClients();
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Failed to save client.');
    } finally { setSaving(false); }
  };

  const handleDelete = (id, name) => {
    Alert.alert('Delete Client', `Delete ${name}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await deleteClient(id);
          setClients(prev => prev.filter(c => c.id !== id));
        } catch (err) {
          Alert.alert('Error', err.response?.data?.error || 'Failed to delete client.');
        }
      }},
    ]);
  };

  if (loading) return <LoadingScreen />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ padding: spacing.md, paddingBottom: spacing.sm }}>
        <TextInput
          style={styles.search}
          placeholder="🔍  Search clients…"
          placeholderTextColor={colors.textSecondary}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
          onSubmitEditing={fetchClients}
        />
      </View>

      <FlatList
        data={clients}
        keyExtractor={item => item.id}
        contentContainerStyle={{ padding: spacing.md, paddingBottom: 100 }}
        ListHeaderComponent={
          clients.length > 0 ? (
            <Text style={[typography.caption, { marginBottom: spacing.md, color: colors.textSecondary }]}>
              {clients.length} client{clients.length !== 1 ? 's' : ''} · Tap to edit · Long-press to remove
            </Text>
          ) : null
        }
        ListEmptyComponent={<EmptyState icon="👤" title="No clients yet" subtitle="Tap + to add your first client" />}
        renderItem={({ item }) => (
          <TouchableOpacity 
            style={styles.card} 
            onPress={() => handleEditPress(item)}
            onLongPress={() => handleDelete(item.id, item.full_name)} 
            activeOpacity={0.85}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{item.full_name.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[typography.h3, { marginBottom: 2 }]}>{item.full_name}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>📍 {item.site_address}</Text>
              {item.phone && <Text style={{ color: colors.textSecondary, fontSize: 13 }}>📞 {item.phone}</Text>}
              {item.email && <Text style={{ color: colors.textSecondary, fontSize: 13 }}>✉️ {item.email}</Text>}
            </View>
          </TouchableOpacity>
        )}
      />

      <TouchableOpacity style={styles.fab} onPress={handleAddPress}>
        <Text style={styles.fabText}>＋</Text>
      </TouchableOpacity>

      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet">
        <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.xl }} keyboardShouldPersistTaps="handled">
          <Text style={[typography.h2, { marginBottom: spacing.xl }]}>{editingClient ? 'Edit Client' : 'New Client'}</Text>
          <Input label="Full Name *" value={form.full_name} onChangeText={set('full_name')} autoCapitalize="words" />
          <Input label="Site Address *" value={form.site_address} onChangeText={set('site_address')} />
          <Input label="Email" value={form.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" />
          <Input label="Phone" value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" />
          <Button title={editingClient ? "Save Changes" : "Save Client"} onPress={handleSave} loading={saving} style={{ marginBottom: spacing.sm }} />
          <Button title="Cancel" onPress={() => { setShowModal(false); setEditingClient(null); }} variant="outline" />
        </ScrollView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  search: { backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10, borderWidth: 1.5, borderColor: colors.border, fontSize: 15, color: colors.text },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.md, ...shadow.sm },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#fff', fontSize: 20, fontWeight: '700' },
  fab: { position: 'absolute', bottom: 24, right: 24, width: 60, height: 60, borderRadius: 30, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', ...shadow.md },
  fabText: { color: '#fff', fontSize: 28, fontWeight: '300', marginTop: -2 },
});
