import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, TextInput, RefreshControl, Alert
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../hooks/useAuth';
import { getQuotes, deleteQuote } from '../services/api';
import { Badge, EmptyState, LoadingScreen } from '../components/UI';
import CreateJobModal from '../components/CreateJobModal';
import { colors, spacing, typography, radius, shadow } from '../utils/theme';

const FILTERS = ['all', 'jobs', 'draft', 'verified', 'sent', 'accepted', 'declined'];

export default function QuotesScreen({ navigation }) {
  const { user } = useAuth();
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [actionMenuVisible, setActionMenuVisible] = useState(false);
  const [showCreateJobModal, setShowCreateJobModal] = useState(false);

  const fetchQuotes = useCallback(async () => {
    try {
      const data = await getQuotes({ status: filter === 'all' ? undefined : filter, search: search || undefined });
      setQuotes(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter, search]);

  useFocusEffect(useCallback(() => { fetchQuotes(); }, [fetchQuotes]));

  const onRefresh = () => { setRefreshing(true); fetchQuotes(); };

  const handleJobCreated = (newJob) => {
    fetchQuotes();
    Alert.alert(
      'Job Created',
      `Direct job "${newJob.job_name}" created successfully!`,
      [
        { text: 'Go to Timesheets', onPress: () => navigation.navigate('Timesheet', { preselectedJobId: newJob.id }) },
        { text: 'Stay Here', style: 'cancel' },
      ]
    );
  };

  const handleDelete = (id, jobName) => {
    Alert.alert('Delete Quote', `Delete "${jobName}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await deleteQuote(id);
        setQuotes(prev => prev.filter(q => q.id !== id));
      }},
    ]);
  };

  const formatCurrency = (v) => `$${(v || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const renderQuote = ({ item }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => navigation.navigate('QuoteDetail', { quoteId: item.id })}
      onLongPress={() => handleDelete(item.id, item.job_name)}
      activeOpacity={0.85}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.jobName} numberOfLines={1}>{item.job_name}</Text>
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
          {item.is_direct_job ? (
            <Badge label="DIRECT JOB" bg="#E0F2FE" text="#0369A1" icon="🛠️" />
          ) : null}
          <Badge status={item.status} />
        </View>
      </View>
      <Text style={styles.clientName}>👤 {item.client_name || 'No client'}</Text>
      {item.site_address && <Text style={styles.address} numberOfLines={1}>📍 {item.site_address}</Text>}
      {user?.is_admin && (
        <Text style={styles.creatorName} numberOfLines={1}>✍️ Created by: {item.creator_name || 'System / Existing'}</Text>
      )}
      {item.status === 'verified' && item.verified_by_name && (
        <Text style={{ color: colors.success, fontSize: 12, fontWeight: '600', marginBottom: spacing.sm }} numberOfLines={1}>
          ✅ Verified by: {item.verified_by_name}
        </Text>
      )}
      <View style={styles.cardFooter}>
        {item.is_direct_job ? (
          <Text style={[styles.total, { color: colors.secondary, fontSize: 15 }]}>🛠️ Direct Job</Text>
        ) : (
          <Text style={styles.total}>{formatCurrency(item.grand_total)}</Text>
        )}
        <Text style={styles.date}>{new Date(item.updated_at).toLocaleDateString('en-AU')}</Text>
      </View>
    </TouchableOpacity>
  );

  if (loading) return <LoadingScreen />;

  return (
    <View style={styles.container}>
      {/* Search */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder={user?.is_admin ? "🔍  Search quotes, users or clients..." : "🔍  Search quotes or clients..."}
          placeholderTextColor={colors.textSecondary}
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={fetchQuotes}
          returnKeyType="search"
        />
      </View>

      {/* Filters */}
      <View style={styles.filterRow}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f}
            onPress={() => setFilter(f)}
            style={[styles.filterChip, filter === f && styles.filterChipActive]}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={quotes}
        keyExtractor={item => item.id}
        renderItem={renderQuote}
        contentContainerStyle={{ padding: spacing.md, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        ListEmptyComponent={
          <EmptyState
            icon="📋"
            title="No quotes yet"
            subtitle={`Tap the + button to create your first quote${filter !== 'all' ? ` with status "${filter}"` : ''}`}
          />
        }
      />

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setActionMenuVisible(true)}
        activeOpacity={0.85}
      >
        <Text style={styles.fabText}>＋</Text>
      </TouchableOpacity>

      {/* Create Choice Action Modal */}
      <Modal
        visible={actionMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setActionMenuVisible(false)}
      >
        <TouchableOpacity
          style={styles.actionModalOverlay}
          activeOpacity={1}
          onPress={() => setActionMenuVisible(false)}
        >
          <View style={styles.actionModalContent}>
            <Text style={styles.actionModalTitle}>What would you like to create?</Text>

            <TouchableOpacity
              style={styles.actionModalOption}
              onPress={() => {
                setActionMenuVisible(false);
                setShowCreateJobModal(true);
              }}
            >
              <Text style={styles.actionOptionEmoji}>⚡</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.actionOptionTitle}>Create Direct Job</Text>
                <Text style={styles.actionOptionSub}>Fast job for immediate timesheeting (no quote needed)</Text>
              </View>
              <Text style={styles.actionArrow}>›</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionModalOption}
              onPress={() => {
                setActionMenuVisible(false);
                navigation.navigate('NewQuote');
              }}
            >
              <Text style={styles.actionOptionEmoji}>📄</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.actionOptionTitle}>Create Quote</Text>
                <Text style={styles.actionOptionSub}>Full 5-step quote wizard with tasks, materials & PDF</Text>
              </View>
              <Text style={styles.actionArrow}>›</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionCancelBtn}
              onPress={() => setActionMenuVisible(false)}
            >
              <Text style={styles.actionCancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Direct Job Creation Modal */}
      <CreateJobModal
        visible={showCreateJobModal}
        onClose={() => setShowCreateJobModal(false)}
        onJobCreated={handleJobCreated}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  searchRow: { padding: spacing.md, paddingBottom: spacing.sm },
  searchInput: {
    backgroundColor: colors.surface, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: 10,
    borderWidth: 1.5, borderColor: colors.border, fontSize: 15, color: colors.text,
  },
  filterRow: { flexDirection: 'row', paddingHorizontal: spacing.md, gap: spacing.xs, marginBottom: spacing.sm, flexWrap: 'wrap' },
  filterChip: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.full,
    backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border,
  },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  filterTextActive: { color: '#fff' },
  card: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, marginBottom: spacing.sm, ...shadow.sm,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  jobName: { ...typography.h3, flex: 1, marginRight: spacing.sm },
  clientName: { color: colors.textSecondary, marginBottom: 2 },
  address: { color: colors.textSecondary, fontSize: 13, marginBottom: spacing.sm },
  creatorName: { color: colors.secondary, fontSize: 12, fontWeight: '600', marginBottom: spacing.sm },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  total: { fontSize: 18, fontWeight: '700', color: colors.primary },
  date: { color: colors.textSecondary, fontSize: 12 },
  fab: {
    position: 'absolute', bottom: 24, right: 24,
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center',
    ...shadow.md,
  },
  fabText: { color: '#fff', fontSize: 28, fontWeight: '300', marginTop: -2 },
  actionModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  actionModalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  actionModalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    marginBottom: spacing.md,
    fontFamily: 'Outfit',
    textAlign: 'center',
  },
  actionModalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  actionOptionEmoji: {
    fontSize: 26,
    marginRight: spacing.md,
  },
  actionOptionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  actionOptionSub: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  actionArrow: {
    fontSize: 22,
    color: colors.textSecondary,
    fontWeight: '600',
    marginLeft: spacing.sm,
  },
  actionCancelBtn: {
    paddingVertical: 14,
    borderRadius: radius.md,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  actionCancelBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textSecondary,
  },
});
