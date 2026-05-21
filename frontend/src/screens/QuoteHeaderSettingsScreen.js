import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert, Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../hooks/useAuth';
import { Card, Button, SectionHeader, LoadingScreen } from '../components/UI';
import { colors, spacing, typography, radius } from '../utils/theme';
import { BASE_URL } from '../services/api';

export default function QuoteHeaderSettingsScreen({ navigation }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoUri, setLogoUri] = useState(null);
  
  const [formData, setFormData] = useState({
    business_name: '',
    tax_reg_number: '',
    address: '',
    email: '',
    phone: '',
    web_page: ''
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const token = user?.token; // Need token for direct fetch
      const res = await fetch(`${BASE_URL}/api/account/settings`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to load settings');
      const data = await res.json();
      
      setFormData({
        business_name: data.business_name || user?.account_name || '',
        tax_reg_number: data.tax_reg_number || '',
        address: data.address || '',
        email: data.email || '',
        phone: data.phone || '',
        web_page: data.web_page || ''
      });
      if (data.logo_uri) {
        setLogoUri(`${BASE_URL}${data.logo_uri}`);
      }
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePickLogo = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      return Alert.alert('Permission needed', 'Please allow access to your photos to upload a logo.');
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1], // Square logo is common, or free aspect
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      uploadLogo(result.assets[0].uri);
    }
  };

  const uploadLogo = async (uri) => {
    try {
      setSaving(true);
      const filename = uri.split('/').pop();
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `image/${match[1]}` : `image`;

      const formData = new FormData();
      formData.append('logo', { uri, name: filename, type });

      const res = await fetch(`${BASE_URL}/api/account/settings/logo`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${user?.token}`,
          // No Content-Type header; fetch handles it with FormData
        },
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to upload logo');
      }

      const data = await res.json();
      setLogoUri(`${BASE_URL}${data.uri}`);
      Alert.alert('Success', 'Logo uploaded successfully!');
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const res = await fetch(`${BASE_URL}/api/account/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user?.token}`
        },
        body: JSON.stringify(formData)
      });
      if (!res.ok) throw new Error('Failed to save settings');
      
      Alert.alert('Success', 'Quote header details saved successfully', [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingScreen />;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.md, paddingBottom: 60 }}>
      <Card>
        <SectionHeader title="Account Logo" />
        <Text style={{ color: colors.textSecondary, marginBottom: spacing.md, fontSize: 13 }}>
          This logo will be displayed on the top of quotes and invoices.
        </Text>
        <View style={styles.logoContainer}>
          <TouchableOpacity style={styles.logoPlaceholder} onPress={handlePickLogo}>
            {logoUri ? (
              <Image source={{ uri: logoUri }} style={styles.logoImage} resizeMode="contain" />
            ) : (
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 24, marginBottom: 8 }}>📷</Text>
                <Text style={{ color: colors.primary, fontWeight: '600' }}>Tap to upload logo</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </Card>

      <Card>
        <SectionHeader title="Business Contact Details" />
        
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Business Name</Text>
          <TextInput
            style={styles.input}
            value={formData.business_name}
            onChangeText={(t) => setFormData({ ...formData, business_name: t })}
            placeholder="Enter business name"
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Tax Registration Number (e.g. GST/ABN/VAT)</Text>
          <TextInput
            style={styles.input}
            value={formData.tax_reg_number}
            onChangeText={(t) => setFormData({ ...formData, tax_reg_number: t })}
            placeholder="Enter tax number"
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Mailing / Physical Address</Text>
          <TextInput
            style={[styles.input, { height: 80 }]}
            value={formData.address}
            onChangeText={(t) => setFormData({ ...formData, address: t })}
            placeholder="123 Example Street&#10;City, Country"
            placeholderTextColor={colors.textSecondary}
            multiline
            textAlignVertical="top"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Email Address</Text>
          <TextInput
            style={styles.input}
            value={formData.email}
            onChangeText={(t) => setFormData({ ...formData, email: t })}
            placeholder="contact@yourbusiness.com"
            placeholderTextColor={colors.textSecondary}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Phone Number</Text>
          <TextInput
            style={styles.input}
            value={formData.phone}
            onChangeText={(t) => setFormData({ ...formData, phone: t })}
            placeholder="(555) 123-4567"
            placeholderTextColor={colors.textSecondary}
            keyboardType="phone-pad"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Web Page</Text>
          <TextInput
            style={styles.input}
            value={formData.web_page}
            onChangeText={(t) => setFormData({ ...formData, web_page: t })}
            placeholder="https://www.yourbusiness.com"
            placeholderTextColor={colors.textSecondary}
            keyboardType="url"
            autoCapitalize="none"
          />
        </View>

      </Card>

      <Button
        title={saving ? "Saving..." : "Save Details"}
        onPress={handleSave}
        disabled={saving}
        style={{ marginTop: spacing.md }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  logoContainer: { alignItems: 'center', marginVertical: spacing.md },
  logoPlaceholder: {
    width: 140,
    height: 140,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceHover,
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden'
  },
  logoImage: { width: '100%', height: '100%' },
  inputGroup: { marginBottom: spacing.md },
  label: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 4 },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm,
    padding: spacing.md, fontSize: 16, backgroundColor: '#fff',
    color: colors.text
  }
});
