import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, Image
} from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { useAuth } from '../hooks/useAuth';
import storage from '../utils/storage';
import { getAccountName } from '../services/api';
import { Button, Input, Card } from '../components/UI';
import { colors, spacing, typography, radius } from '../utils/theme';

export default function LoginScreen({ navigation }) {
  const { login } = useAuth();
  const [loading, setLoading] = useState(false);
  const [authMethod, setAuthMethod] = useState('password');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');
  const [loginName, setLoginName] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [errors, setErrors] = useState({});
  const [loginError, setLoginError] = useState('');

  // Load last used account number on mount
  useEffect(() => {
    (async () => {
      try {
        const saved = await storage.getItemAsync('last_account_number');
        if (saved) {
          setAccountNumber(saved);
        }
      } catch (err) {
        console.warn('Failed to load saved account number', err);
      }
    })();
  }, []);

  // Fetch Account Name when Account Number is entered
  useEffect(() => {
    if (accountNumber.length >= 9) { // e.g. TRDE-KKBV is 9 chars
      const fetchName = async () => {
        try {
          const data = await getAccountName(accountNumber.trim().toUpperCase());
          setAccountName(data.account_name);
        } catch (err) {
          setAccountName('Account not found');
        }
      };
      fetchName();
    } else {
      setAccountName('');
    }
  }, [accountNumber]);

  const handleBiometric = async () => {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Log in to VariPro',
      cancelLabel: 'Cancel',
    });
    if (result.success) {
      setLoginError('Full biometric login requires server-side token setup. Use password or PIN for now.');
    }
  };

  const validate = () => {
    const e = {};
    if (!accountNumber.trim()) e.accountNumber = 'Account Number required';
    if (!loginName.trim()) e.loginName = 'Login name required';
    if (authMethod === 'password' && !password) e.password = 'Password required';
    if (authMethod === 'pin' && !pin) e.pin = 'PIN required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleLogin = async () => {
    setLoginError('');
    if (!validate()) return;
    setLoading(true);
    try {
      const cleanAccountNumber = accountNumber.trim().toUpperCase();
      await login({
        account_number: cleanAccountNumber,
        login_name: loginName.trim(),
        ...(authMethod === 'password' ? { password } : {}),
        ...(authMethod === 'pin' ? { pin } : {}),
      });
      // Save for next time
      await storage.setItemAsync('last_account_number', cleanAccountNumber);
    } catch (err) {
      console.log('[DEBUG] Login error:', err);
      if (!err.response) {
        setLoginError('Cannot connect to server. Please check your internet or API configuration.');
      } else {
        const msg = err.response.data?.error || 'Login failed. Please check your credentials.';
        setLoginError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        <View style={styles.logoArea}>
          <Image 
            source={require('../../assets/VariProImages/VariProLogoWhite.png')} 
            style={styles.logoImage} 
            resizeMode="contain"
          />
          <Text style={styles.tagline}>Professional quotes on-site</Text>
        </View>

        <Card>
          <Input
            label="Account Number"
            placeholder="e.g. ELEC-7G92"
            value={accountNumber}
            onChangeText={setAccountNumber}
            error={errors.accountNumber}
            autoCapitalize="characters"
            autoCorrect={false}
          />
          <Input
            label="Account Name"
            value={accountName}
            editable={false}
            style={{ backgroundColor: '#F1F4F9', color: colors.textSecondary }}
            placeholder="Enter Account Number to see name"
          />
          <Input
            label="Login Name"
            placeholder="Your login name"
            value={loginName}
            onChangeText={setLoginName}
            error={errors.loginName}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={[typography.label, { marginBottom: spacing.sm }]}>Login Method</Text>
          <View style={styles.methodRow}>
            {[
              { key: 'password', label: '🔑 Password' },
              { key: 'pin', label: '🔢 PIN' },
              { key: 'biometric', label: '👤 Face ID' },
            ].map(m => (
              <TouchableOpacity
                key={m.key}
                onPress={() => { setAuthMethod(m.key); setLoginError(''); }}
                style={[styles.methodBtn, authMethod === m.key && styles.methodBtnActive]}
              >
                <Text style={[styles.methodText, authMethod === m.key && styles.methodTextActive]}>{m.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {authMethod === 'password' && (
            <Input
              label="Password"
              placeholder="Your password"
              value={password}
              onChangeText={setPassword}
              error={errors.password}
              secureTextEntry
            />
          )}

          {authMethod === 'pin' && (
            <Input
              label="PIN"
              placeholder="4-6 digit PIN"
              value={pin}
              onChangeText={setPin}
              error={errors.pin}
              keyboardType="numeric"
              secureTextEntry
              maxLength={6}
            />
          )}

          {authMethod === 'biometric' && (
            <TouchableOpacity style={styles.biometricBtn} onPress={handleBiometric}>
              <Text style={{ fontSize: 48 }}>👤</Text>
              <Text style={{ color: colors.primary, fontWeight: '600', marginTop: spacing.sm }}>
                Tap to use Face ID / Fingerprint
              </Text>
            </TouchableOpacity>
          )}

          {loginError ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>⚠️  {loginError}</Text>
            </View>
          ) : null}

          <Button title="Log In" onPress={handleLogin} loading={loading} style={{ marginTop: spacing.sm }} />

          <TouchableOpacity style={{ marginTop: spacing.md, alignItems: 'center' }}>
            <Text style={{ color: colors.primary }}>Forgot password?</Text>
          </TouchableOpacity>
        </Card>

        <TouchableOpacity onPress={() => navigation.navigate('Register')} style={{ marginTop: spacing.lg, alignItems: 'center' }}>
          <Text style={{ color: colors.textSecondary }}>No account? <Text style={{ color: colors.primary, fontWeight: '700' }}>Create one</Text></Text>
        </TouchableOpacity>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingTop: 60 },
  logoArea: { alignItems: 'center', marginBottom: spacing.xl },
  logoImage: { width: '100%', height: 300, maxWidth: 600 },
  tagline: { color: colors.textSecondary, marginTop: -20, fontWeight: '500' },
  methodRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  methodBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 8,
    borderWidth: 1.5, borderColor: colors.border,
    alignItems: 'center', backgroundColor: colors.surface,
  },
  methodBtnActive: { borderColor: colors.primary, backgroundColor: '#EAEEF4' },
  methodText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  methodTextActive: { color: colors.primary },
  biometricBtn: {
    alignItems: 'center', paddingVertical: spacing.xl,
    borderWidth: 1.5, borderColor: colors.border, borderRadius: 12, marginBottom: spacing.md,
  },
  errorBanner: {
    backgroundColor: '#FFF5F5', borderWidth: 1.5, borderColor: colors.danger,
    borderRadius: radius.md, padding: spacing.sm, marginBottom: spacing.sm,
  },
  errorText: { color: colors.danger, fontSize: 14, fontWeight: '500' },
});