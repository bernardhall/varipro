import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Alert, KeyboardAvoidingView, Platform
} from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { useAuth } from '../hooks/useAuth';
import { Button, Input, Card } from '../components/UI';
import { colors, spacing, typography, radius } from '../utils/theme';

export default function RegisterScreen({ navigation }) {
  const { register } = useAuth();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);

  const [accountName, setAccountName] = useState('');
  const [form, setForm] = useState({
    first_name: '', last_name: '', login_name: '',
    email: '', password: '', confirm_password: '', pin: '', confirm_pin: '',
  });
  const [enableBiometric, setEnableBiometric] = useState(false);
  const [errors, setErrors] = useState({});
  const [generatedAccountNumber, setGeneratedAccountNumber] = useState('');

  React.useEffect(() => {
    LocalAuthentication.hasHardwareAsync().then(setBiometricAvailable);
  }, []);

  const set = (key) => (val) => setForm(prev => ({ ...prev, [key]: val }));

  const validateStep1 = () => {
    if (!accountName.trim()) { setErrors({ accountName: 'Account name required' }); return false; }
    setErrors({});
    return true;
  };

  const validateStep2 = () => {
    const e = {};
    if (!form.first_name.trim()) e.first_name = 'Required';
    if (!form.last_name.trim()) e.last_name = 'Required';
    if (!form.login_name.trim()) e.login_name = 'Required';
    if (!/\S+@\S+\.\S+/.test(form.email)) e.email = 'Valid email required';
    if (form.password.length < 8 || !/[a-zA-Z]/.test(form.password) || !/[0-9]/.test(form.password)) e.password = 'Min 8 chars, 1 letter + 1 number';
    if (form.password !== form.confirm_password) e.confirm_password = 'Passwords do not match';
    if (form.pin && (form.pin.length < 4 || form.pin.length > 6)) e.pin = 'PIN must be 4–6 digits';
    if (form.pin !== form.confirm_pin) e.confirm_pin = 'PINs do not match';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleNext = () => {
    if (step === 1 && validateStep1()) setStep(2);
    else if (step === 2 && validateStep2()) setStep(3);
  };

  const handleRegister = async () => {
    setLoading(true);
    try {
      const payload = {
        account_name: accountName,
        user: {
          first_name: form.first_name,
          last_name: form.last_name,
          login_name: form.login_name,
          email: form.email,
          password: form.password,
          pin: form.pin || undefined,
        },
      };
      const data = await register(payload);
      setGeneratedAccountNumber(data.account_number);
      setStep(4);
    } catch (err) {
      const msg = err.response?.data?.error || 'Registration failed. Please try again.';
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  };

  const StepIndicator = () => (
    <View style={styles.steps}>
      {[1, 2, 3].map(s => (
        <View key={s} style={styles.stepRow}>
          <View style={[styles.stepDot, step >= s && styles.stepActive]}>
            <Text style={[styles.stepNum, step >= s && styles.stepNumActive]}>{s}</Text>
          </View>
          {s < 3 && <View style={[styles.stepLine, step > s && styles.stepLineActive]} />}
        </View>
      ))}
    </View>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        {step < 4 && (
          <>
            <Text style={typography.h1}>Create Account</Text>
            <Text style={[typography.body, { color: colors.textSecondary, marginBottom: spacing.xl }]}>
              Set up VariPro for your business
            </Text>
            <StepIndicator />
          </>
        )}

        {/* Step 1: Account Details */}
        {step === 1 && (
          <Card>
            <Text style={[typography.h3, { marginBottom: spacing.md }]}>📋 Business Details</Text>
            <Input
              label="Business / Company Name"
              placeholder="e.g. Precision Electrical Pty Ltd"
              value={accountName}
              onChangeText={setAccountName}
              error={errors.accountName}
              autoCapitalize="words"
            />
            <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: spacing.md }}>
              💡 Your Account Number will be generated automatically after registration.
            </Text>
            <Button title="Next" onPress={handleNext} />
          </Card>
        )}

        {/* Step 2: User Details */}
        {step === 2 && (
          <Card>
            <Text style={[typography.h3, { marginBottom: spacing.md }]}>👤 Your Details</Text>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <Input label="First Name" value={form.first_name} onChangeText={set('first_name')} error={errors.first_name} autoCapitalize="words" />
              </View>
              <View style={{ flex: 1 }}>
                <Input label="Last Name" value={form.last_name} onChangeText={set('last_name')} error={errors.last_name} autoCapitalize="words" />
              </View>
            </View>
            <Input label="Login Name" placeholder="e.g. jsmith_electric" value={form.login_name} onChangeText={set('login_name')} error={errors.login_name} autoCapitalize="none" autoCorrect={false} />
            <Input label="Email Address" placeholder="you@example.com" value={form.email} onChangeText={set('email')} error={errors.email} keyboardType="email-address" autoCapitalize="none" />
            <Input label="Password" placeholder="Min 8 chars, 1 letter + 1 number" value={form.password} onChangeText={set('password')} error={errors.password} secureTextEntry />
            <Input label="Confirm Password" value={form.confirm_password} onChangeText={set('confirm_password')} error={errors.confirm_password} secureTextEntry />
            <Input label="PIN (4–6 digits, optional)" placeholder="For quick login" value={form.pin} onChangeText={set('pin')} error={errors.pin} keyboardType="numeric" secureTextEntry maxLength={6} />
            <Input label="Confirm PIN" value={form.confirm_pin} onChangeText={set('confirm_pin')} error={errors.confirm_pin} keyboardType="numeric" secureTextEntry maxLength={6} />
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Button title="Back" onPress={() => setStep(1)} variant="outline" style={{ flex: 1 }} />
              <Button title="Next" onPress={handleNext} style={{ flex: 1 }} />
            </View>
          </Card>
        )}

        {/* Step 3: Biometric */}
        {step === 3 && (
          <Card>
            <Text style={{ fontSize: 48, textAlign: 'center', marginBottom: spacing.md }}>🔐</Text>
            <Text style={[typography.h3, { textAlign: 'center', marginBottom: spacing.sm }]}>Enable Biometric Login?</Text>
            <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.xl }]}>
              Use Face ID or fingerprint for faster, secure logins.
            </Text>
            {!biometricAvailable && (
              <Text style={{ color: colors.warning, textAlign: 'center', marginBottom: spacing.md, fontSize: 13 }}>
                ⚠️ Biometric hardware not available on this device
              </Text>
            )}
            <Button
              title="✅ Enable Face ID / Fingerprint"
              onPress={() => { setEnableBiometric(true); handleRegister(); }}
              disabled={!biometricAvailable}
              style={{ marginBottom: spacing.sm }}
            />
            <Button title="Not Now – Continue" onPress={handleRegister} variant="outline" loading={loading} />
          </Card>
        )}

        {/* Step 4: Success */}
        {step === 4 && (
          <View style={{ alignItems: 'center', paddingTop: spacing.xxl }}>
            <Text style={{ fontSize: 64, marginBottom: spacing.md }}>🎉</Text>
            <Text style={[typography.h1, { textAlign: 'center', marginBottom: spacing.sm }]}>Account Created!</Text>
            <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.xl }]}>
              Here is your Account Number. Save it — you'll need it to log in.
            </Text>
            <Card style={{ width: '100%', alignItems: 'center' }}>
              <Text style={{ ...typography.label, marginBottom: spacing.xs }}>Your Account Number</Text>
              <Text style={{ fontSize: 28, fontWeight: '800', color: colors.primary, letterSpacing: 2 }}>
                {generatedAccountNumber}
              </Text>
            </Card>
            <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center', marginBottom: spacing.xl }}>
              You are now logged in. Logging you into the app…
            </Text>
          </View>
        )}

        <TouchableOpacity onPress={() => navigation.navigate('Login')} style={{ marginTop: spacing.lg, alignItems: 'center' }}>
          <Text style={{ color: colors.primary }}>Already have an account? <Text style={{ fontWeight: '700' }}>Log in</Text></Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingTop: spacing.xxl },
  steps: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xl },
  stepRow: { flexDirection: 'row', alignItems: 'center' },
  stepDot: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.border, justifyContent: 'center', alignItems: 'center' },
  stepActive: { backgroundColor: colors.primary },
  stepNum: { fontWeight: '700', color: colors.textSecondary },
  stepNumActive: { color: '#fff' },
  stepLine: { width: 40, height: 2, backgroundColor: colors.border },
  stepLineActive: { backgroundColor: colors.primary },
});
