import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert, TextInput } from 'react-native';
import { getAccountSettings, updateAccountSettings } from '../services/api';
import { Card, Button, Input, LoadingScreen } from '../components/UI';
import { colors, spacing, typography, radius } from '../utils/theme';

export default function AccountSettingsScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({ default_hourly_rate: '75', tax_rate: '0' });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const data = await getAccountSettings();
      setSettings({
        default_hourly_rate: data.default_hourly_rate.toString(),
        tax_rate: data.tax_rate.toString()
      });
    } catch (err) {
      Alert.alert('Error', 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateAccountSettings({
        default_hourly_rate: parseFloat(settings.default_hourly_rate) || 0,
        tax_rate: parseFloat(settings.tax_rate) || 0
      });
      Alert.alert('Success', 'Settings updated successfully');
      navigation.goBack();
    } catch (err) {
      Alert.alert('Error', 'Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingScreen />;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.md }}>
      <Text style={[typography.h2, { marginBottom: spacing.md }]}>Business Settings</Text>
      
      <Card>
        <Text style={[typography.label, { marginBottom: spacing.sm }]}>Rates & Pricing</Text>
        <Input
          label="Default Hourly Rate ($)"
          value={settings.default_hourly_rate}
          onChangeText={(v) => setSettings(s => ({ ...s, default_hourly_rate: v }))}
          keyboardType="decimal-pad"
          placeholder="e.g. 75"
        />
        <Text style={styles.helpText}>This rate will be used as the default for new hourly tasks.</Text>
      </Card>

      <Card>
        <Text style={[typography.label, { marginBottom: spacing.sm }]}>Taxation</Text>
        <Input
          label="Tax Rate (%)"
          value={settings.tax_rate}
          onChangeText={(v) => setSettings(s => ({ ...s, tax_rate: v }))}
          keyboardType="decimal-pad"
          placeholder="e.g. 10 for GST/VAT"
        />
        <Text style={styles.helpText}>The percentage applied to the subtotal of all quotes.</Text>
      </Card>

      <Button
        title="💾 Save Settings"
        onPress={handleSave}
        loading={saving}
        style={{ marginTop: spacing.lg }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  helpText: { fontSize: 12, color: colors.textSecondary, marginTop: -spacing.xs, marginBottom: spacing.sm },
});
