import React from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ActivityIndicator, StyleSheet
} from 'react-native';
import { colors, spacing, radius, typography, shadow } from '../utils/theme';

// ── Button ────────────────────────────────────────────────────────────────
export function Button({ title, onPress, variant = 'primary', loading, disabled, style }) {
  const styles = buttonStyles;
  const bgColor = variant === 'primary' ? colors.primary
    : variant === 'danger' ? colors.danger
    : variant === 'outline' ? 'transparent'
    : '#EDF2F7';

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      style={[styles.base, { backgroundColor: bgColor, opacity: (disabled || loading) ? 0.6 : 1 }, style]}
      activeOpacity={0.8}
    >
      {loading
        ? <ActivityIndicator color={variant === 'outline' ? colors.primary : '#fff'} />
        : <Text style={[styles.text, { color: variant === 'outline' ? colors.primary : variant === 'secondary' ? colors.text : '#fff' }]}>{title}</Text>
      }
    </TouchableOpacity>
  );
}

const buttonStyles = StyleSheet.create({
  base: { paddingVertical: 14, paddingHorizontal: spacing.lg, borderRadius: radius.md, alignItems: 'center', borderWidth: 1.5, borderColor: 'transparent' },
  text: { fontSize: 15, fontWeight: '600' },
});

// ── Input ─────────────────────────────────────────────────────────────────
export function Input({ label, error, style, containerStyle, ...props }) {
  return (
    <View style={[{ marginBottom: spacing.md }, containerStyle]}>
      {label && <Text style={inputStyles.label}>{label}</Text>}
      <TextInput
        style={[inputStyles.input, error && inputStyles.inputError, style]}
        placeholderTextColor={colors.textSecondary}
        {...props}
      />
      {error && <Text style={inputStyles.error}>{error}</Text>}
    </View>
  );
}

const inputStyles = StyleSheet.create({
  label: { ...typography.label, marginBottom: spacing.xs },
  input: {
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: 12,
    fontSize: 15, color: colors.text, backgroundColor: colors.surface,
  },
  inputError: { borderColor: colors.danger },
  error: { color: colors.danger, fontSize: 12, marginTop: 4 },
});

// ── Card ──────────────────────────────────────────────────────────────────
export function Card({ children, style }) {
  return (
    <View style={[cardStyles.card, style]}>
      {children}
    </View>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, marginBottom: spacing.md,
    ...shadow.sm,
  },
});

// ── Badge ─────────────────────────────────────────────────────────────────
export function Badge({ status }) {
  const colorMap = {
    draft: { bg: '#EDF2F7', text: colors.textSecondary },
    sent: { bg: '#EBF8FF', text: colors.info },
    accepted: { bg: '#F0FFF4', text: colors.success },
    declined: { bg: '#FFF5F5', text: colors.danger },
  };
  const c = colorMap[status] || colorMap.draft;
  return (
    <View style={{ backgroundColor: c.bg, borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 3 }}>
      <Text style={{ color: c.text, fontSize: 12, fontWeight: '600', textTransform: 'capitalize' }}>{status}</Text>
    </View>
  );
}

// ── SectionHeader ─────────────────────────────────────────────────────────
export function SectionHeader({ title, action, onAction }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
      <Text style={typography.h3}>{title}</Text>
      {action && <TouchableOpacity onPress={onAction}><Text style={{ color: colors.primary, fontWeight: '600' }}>{action}</Text></TouchableOpacity>}
    </View>
  );
}

// ── LineItemRow ───────────────────────────────────────────────────────────
export function LineItemRow({ label, value }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <Text style={{ color: colors.textSecondary, flex: 1 }}>{label}</Text>
      <Text style={{ fontWeight: '600', color: colors.text }}>{value}</Text>
    </View>
  );
}

// ── LoadingScreen ─────────────────────────────────────────────────────────
export function LoadingScreen() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

// ── EmptyState ────────────────────────────────────────────────────────────
export function EmptyState({ icon, title, subtitle }) {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl }}>
      <Text style={{ fontSize: 48, marginBottom: spacing.md }}>{icon}</Text>
      <Text style={[typography.h3, { textAlign: 'center', marginBottom: spacing.sm }]}>{title}</Text>
      {subtitle && <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center' }]}>{subtitle}</Text>}
    </View>
  );
}
