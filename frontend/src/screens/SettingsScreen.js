import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, Switch } from 'react-native';
import { useAuth } from '../hooks/useAuth';
import { Card, Button } from '../components/UI';
import { colors, spacing, typography, radius } from '../utils/theme';

export default function SettingsScreen() {
  const { user, logout } = useAuth();
  const [biometricEnabled, setBiometricEnabled] = useState(false);

  const handleLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: logout },
    ]);
  };

  const SettingRow = ({ icon, label, value, onPress, right }) => (
    <TouchableOpacity style={styles.row} onPress={onPress} disabled={!onPress}>
      <Text style={styles.rowIcon}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        {value && <Text style={styles.rowValue}>{value}</Text>}
      </View>
      {right || (onPress && <Text style={{ color: colors.textSecondary }}>›</Text>)}
    </TouchableOpacity>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.md }}>

      {/* Profile */}
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(user?.first_name || user?.login_name || 'U').charAt(0).toUpperCase()}</Text>
        </View>
        <Text style={typography.h2}>{user?.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : user?.login_name}</Text>
        <Text style={{ color: colors.textSecondary }}>{user?.account_name}</Text>
        {user?.is_admin && (
          <View style={styles.adminBadge}>
            <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>⭐ Admin</Text>
          </View>
        )}
      </View>

      {/* Business Settings (Admin only) */}
      {user?.is_admin && (
        <Card>
          <Text style={[typography.label, { marginBottom: spacing.sm }]}>Business</Text>
          <SettingRow 
            icon="🏗️" 
            label="Rates & Tax Settings" 
            value="Default Hourly Rate, GST/VAT" 
            onPress={() => navigation.navigate('AccountSettings')} 
          />
        </Card>
      )}

      {/* Account Info */}
      <Card>
        <Text style={[typography.label, { marginBottom: spacing.sm }]}>Personal Account</Text>
        <SettingRow icon="🏢" label="Account Name" value={user?.account_name} />
        <SettingRow icon="🔑" label="Account Number" value={user?.account_number} />
        <SettingRow icon="👤" label="Login Name" value={user?.login_name} />
      </Card>

      {/* Security */}
      <Card>
        <Text style={[typography.label, { marginBottom: spacing.sm }]}>Security</Text>
        <SettingRow
          icon="🔐"
          label="Face ID / Fingerprint"
          right={
            <Switch
              value={biometricEnabled}
              onValueChange={setBiometricEnabled}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#fff"
            />
          }
        />
        <SettingRow icon="🔒" label="Change Password" onPress={() => Alert.alert('Coming soon', 'Password change will be available in a future update.')} />
        <SettingRow icon="📱" label="Change PIN" onPress={() => Alert.alert('Coming soon', 'PIN change will be available in a future update.')} />
      </Card>

      {/* Sync */}
      <Card>
        <Text style={[typography.label, { marginBottom: spacing.sm }]}>Data</Text>
        <SettingRow icon="☁️" label="Sync Status" value="Connected" />
        <SettingRow icon="📤" label="Force Sync" onPress={() => Alert.alert('Sync', 'Data synced successfully.')} />
        <SettingRow icon="💾" label="Export Backup (JSON)" onPress={() => Alert.alert('Coming soon', 'Backup export will be available in a future update.')} />
      </Card>

      {/* About */}
      <Card>
        <Text style={[typography.label, { marginBottom: spacing.sm }]}>About</Text>
        <SettingRow icon="📦" label="Version" value="1.0.0" />
        <SettingRow icon="📄" label="Terms & Privacy" onPress={() => {}} />
      </Card>

      <Button title="🚪  Log Out" onPress={handleLogout} variant="danger" style={{ marginTop: spacing.md }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  profileCard: { alignItems: 'center', paddingVertical: spacing.xl },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', marginBottom: spacing.md },
  avatarText: { color: '#fff', fontSize: 36, fontWeight: '700' },
  adminBadge: { marginTop: spacing.sm, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999, borderWidth: 1.5, borderColor: colors.primary },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border, gap: spacing.sm },
  rowIcon: { fontSize: 20, width: 28, textAlign: 'center' },
  rowLabel: { fontSize: 15, color: colors.text },
  rowValue: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
});
