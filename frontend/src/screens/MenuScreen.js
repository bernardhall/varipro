import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../hooks/useAuth';
import { colors, spacing, typography, radius, shadow } from '../utils/theme';

export default function MenuScreen({ navigation }) {
  const { user } = useAuth();

  const menuItems = [
    {
      id: 'clients',
      title: 'Clients',
      emoji: '👥',
      description: 'Manage customers and addresses',
      screen: 'Clients',
      adminOnly: false,
    },
    {
      id: 'users',
      title: 'Team & Staff',
      emoji: '🧑‍💼',
      description: 'Invite and manage team members',
      screen: 'Users',
      adminOnly: true,
    },
    {
      id: 'settings',
      title: 'Settings',
      emoji: '⚙️',
      description: 'App preferences and defaults',
      screen: 'SettingsMain',
      adminOnly: false,
    },
  ];

  const filteredItems = menuItems.filter(item => !item.adminOnly || user?.is_admin);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>More Options</Text>
          <Text style={styles.subtitle}>Manage clients, settings, and team</Text>
        </View>

        <View style={styles.grid}>
          {filteredItems.map(item => (
            <TouchableOpacity
              key={item.id}
              style={styles.card}
              onPress={() => navigation.navigate(item.screen)}
            >
              <Text style={styles.cardEmoji}>{item.emoji}</Text>
              <View style={styles.cardBody}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.cardDesc}>{item.description}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: spacing.md,
  },
  header: {
    marginBottom: spacing.lg,
    paddingVertical: spacing.sm,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
    fontFamily: 'Outfit',
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 4,
  },
  grid: {
    gap: spacing.md,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow,
  },
  cardEmoji: {
    fontSize: 32,
    marginRight: spacing.md,
  },
  cardBody: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 2,
  },
  cardDesc: {
    fontSize: 13,
    color: colors.textSecondary,
  },
});
