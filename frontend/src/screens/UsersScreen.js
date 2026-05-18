import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, Modal, ScrollView, Switch } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../hooks/useAuth';
import { getUsers, createUser, deleteUser, updateUser } from '../services/api';
import { Button, Input, EmptyState, LoadingScreen } from '../components/UI';
import { colors, spacing, typography, radius, shadow } from '../utils/theme';

export default function UsersScreen() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [form, setForm] = useState({ first_name: '', last_name: '', login_name: '', email: '', password: '', pin: '', is_admin: false });

  const fetchUsers = useCallback(async () => {
    try { setUsers(await getUsers()); }
    catch (err) { Alert.alert('Error', 'Could not load users. Admin access required.'); }
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { fetchUsers(); }, [fetchUsers]));

  const set = (key) => (val) => setForm(p => ({ ...p, [key]: val }));

  const handleAddPress = () => {
    setEditingUser(null);
    setForm({ first_name: '', last_name: '', login_name: '', email: '', password: '', pin: '', is_admin: false });
    setShowModal(true);
  };

  const handleEditPress = (user) => {
    setEditingUser(user);
    setForm({
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      login_name: user.login_name || '',
      email: user.email || '',
      password: '',
      pin: '',
      is_admin: !!user.is_admin
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.first_name || !form.last_name || !form.login_name || !form.email) {
      Alert.alert('Required', 'First name, last name, login name, and email are required.');
      return;
    }
    if (!editingUser && !form.password) {
      Alert.alert('Required', 'Password is required to add a new team member.');
      return;
    }
    setSaving(true);
    try {
      if (editingUser) {
        await updateUser(editingUser.user_id, form);
        Alert.alert('Success', 'Team member updated successfully');
      } else {
        await createUser(form);
        Alert.alert('Success', 'Team member added successfully');
      }
      setShowModal(false);
      setEditingUser(null);
      setForm({ first_name: '', last_name: '', login_name: '', email: '', password: '', pin: '', is_admin: false });
      fetchUsers();
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Failed to save team member.');
    } finally { setSaving(false); }
  };

  const handleDelete = (id, name) => {
    if (id === currentUser?.user_id) {
      Alert.alert('Action Blocked', 'You cannot delete yourself.');
      return;
    }
    Alert.alert('Remove User', `Remove ${name} from this account?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try { await deleteUser(id); setUsers(prev => prev.filter(u => u.user_id !== id)); }
        catch (err) { Alert.alert('Error', err.response?.data?.error || 'Failed to remove user.'); }
      }},
    ]);
  };

  const isEditingSelf = editingUser?.user_id === currentUser?.user_id;

  if (loading) return <LoadingScreen />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        data={users}
        keyExtractor={item => item.user_id}
        contentContainerStyle={{ padding: spacing.md, paddingBottom: 100 }}
        ListHeaderComponent={
          <Text style={[typography.caption, { marginBottom: spacing.md, color: colors.textSecondary }]}>
            {users.length} user{users.length !== 1 ? 's' : ''} in this account · Tap to edit · Long-press to remove
          </Text>
        }
        ListEmptyComponent={<EmptyState icon="👥" title="No users" subtitle="Add team members to this account" />}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => handleEditPress(item)}
            onLongPress={() => handleDelete(item.user_id, `${item.first_name} ${item.last_name}`)}
            activeOpacity={0.85}
          >
            <View style={[styles.avatar, { backgroundColor: item.is_admin ? colors.primary : colors.secondary }]}>
              <Text style={styles.avatarText}>{item.first_name.charAt(0)}{item.last_name.charAt(0)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Text style={typography.h3}>{item.first_name} {item.last_name}</Text>
                {item.is_admin ? (
                  <View style={styles.adminBadge}><Text style={{ color: colors.primary, fontSize: 11, fontWeight: '700' }}>ADMIN</Text></View>
                ) : null}
              </View>
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>@{item.login_name}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{item.email}</Text>
              {item.last_login && <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }}>Last login: {new Date(item.last_login).toLocaleDateString('en-AU')}</Text>}
            </View>
          </TouchableOpacity>
        )}
      />

      <TouchableOpacity style={styles.fab} onPress={handleAddPress}>
        <Text style={styles.fabText}>＋</Text>
      </TouchableOpacity>

      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet">
        <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.xl }} keyboardShouldPersistTaps="handled">
          <Text style={[typography.h2, { marginBottom: spacing.xl }]}>{editingUser ? 'Edit Team Member' : 'Add Team Member'}</Text>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <View style={{ flex: 1 }}><Input label="First Name *" value={form.first_name} onChangeText={set('first_name')} autoCapitalize="words" /></View>
            <View style={{ flex: 1 }}><Input label="Last Name *" value={form.last_name} onChangeText={set('last_name')} autoCapitalize="words" /></View>
          </View>
          <Input label="Login Name *" value={form.login_name} onChangeText={set('login_name')} autoCapitalize="none" autoCorrect={false} />
          <Input label="Email *" value={form.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" />
          <Input 
            label={editingUser ? "New Password (optional)" : "Password *"} 
            placeholder={editingUser ? "Leave blank to keep current" : ""}
            placeholderTextColor={colors.textSecondary}
            value={form.password} 
            onChangeText={set('password')} 
            secureTextEntry 
          />
          <Input 
            label={editingUser ? "New PIN (optional)" : "PIN (optional)"} 
            placeholder={editingUser ? "Leave blank to keep current" : ""}
            placeholderTextColor={colors.textSecondary}
            value={form.pin} 
            onChangeText={set('pin')} 
            keyboardType="numeric" 
            secureTextEntry 
            maxLength={6} 
          />
          <View style={[styles.switchRow, isEditingSelf && { opacity: 0.6 }]}>
            <View style={{ flex: 1, paddingRight: spacing.sm }}>
              <Text style={{ fontSize: 15, color: colors.text }}>Grant Admin Access</Text>
              {isEditingSelf && <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2 }}>You cannot demote yourself</Text>}
            </View>
            <Switch 
              value={form.is_admin} 
              onValueChange={set('is_admin')} 
              disabled={isEditingSelf}
              trackColor={{ false: colors.border, true: colors.primary }} 
              thumbColor="#fff" 
            />
          </View>
          <Button title={editingUser ? "Save Changes" : "Add User"} onPress={handleSave} loading={saving} style={{ marginBottom: spacing.sm }} />
          <Button title="Cancel" onPress={() => { setShowModal(false); setEditingUser(null); }} variant="outline" />
        </ScrollView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.md, ...shadow.sm },
  avatar: { width: 52, height: 52, borderRadius: 26, justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  adminBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, borderWidth: 1.5, borderColor: colors.primary },
  fab: { position: 'absolute', bottom: 24, right: 24, width: 60, height: 60, borderRadius: 30, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', ...shadow.md },
  fabText: { color: '#fff', fontSize: 28, fontWeight: '300', marginTop: -2 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, marginBottom: spacing.md },
});
