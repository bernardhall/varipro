import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, Image } from 'react-native';
import { getQuote, updateQuote } from '../services/api';
import { Badge, Card, LoadingScreen, SectionHeader, LineItemRow } from '../components/UI';
import { colors, spacing, typography, radius } from '../utils/theme';

const STATUSES = ['draft', 'sent', 'accepted', 'declined'];

export default function QuoteDetailScreen({ route, navigation }) {
  const { quoteId } = route.params;
  const [quote, setQuote] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getQuote(quoteId).then(setQuote).catch(console.error).finally(() => setLoading(false));
  }, [quoteId]);

  const BASE_URL = 'https://varipro-backend.onrender.com';

  const changeStatus = async (status) => {
    await updateQuote(quoteId, { status });
    setQuote(prev => ({ ...prev, status }));
  };

  const handleStatusChange = () => {
    Alert.alert('Update Status', 'Set quote status:', STATUSES.map(s => ({
      text: s.charAt(0).toUpperCase() + s.slice(1),
      onPress: () => changeStatus(s),
    })).concat([{ text: 'Cancel', style: 'cancel' }]));
  };

  const fmt = (n) => `$${(n || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (loading) return <LoadingScreen />;
  if (!quote) return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><Text>Quote not found</Text></View>;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.md, paddingBottom: 60 }}>
      {/* Header */}
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <Text style={typography.h2}>{quote.job_name}</Text>
            {quote.client_name && <Text style={{ color: colors.textSecondary }}>👤 {quote.client_name}</Text>}
          </View>
          <TouchableOpacity onPress={handleStatusChange}>
            <Badge status={quote.status} />
          </TouchableOpacity>
        </View>
        <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: spacing.sm }}>
          Created {new Date(quote.created_at).toLocaleDateString('en-AU')} · Updated {new Date(quote.updated_at).toLocaleDateString('en-AU')}
        </Text>
      </Card>

      {/* Grand Total */}
      <Card style={{ backgroundColor: colors.primary }}>
        <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '600' }}>GRAND TOTAL</Text>
        <Text style={{ color: '#fff', fontSize: 36, fontWeight: '800' }}>{fmt(quote.grand_total)}</Text>
      </Card>

      {/* Summary */}
      {quote.summary_explanation && (
        <Card>
          <SectionHeader title="Work Summary" />
          <Text style={{ color: colors.text, lineHeight: 22 }}>{quote.summary_explanation}</Text>
        </Card>
      )}

      {/* Cost Breakdown */}
      <Card>
        <SectionHeader title="Cost Breakdown" />
        {(() => {
          const laborCost = quote.tasks?.reduce((s, t) => {
            if (t.task_type === 'set') return s + (t.price || 0);
            if (t.task_type === 'charge') return s;
            return s + (t.estimated_hours || 0) * (t.hourly_rate || 75);
          }, 0) || 0;
          const subtotal = laborCost + (quote.total_material_cost || 0) + (quote.total_equipment_cost || 0) + (quote.total_sundry_cost || 0) + (quote.total_higher_cost || 0);
          
          return (
            <>
              <LineItemRow label="Labour" value={fmt(laborCost)} />
              <LineItemRow label="Materials" value={fmt(quote.total_material_cost)} />
              <LineItemRow label="Equipment" value={fmt(quote.total_equipment_cost)} />
              <LineItemRow label="Sundry" value={fmt(quote.total_sundry_cost)} />
              <LineItemRow label="Other Costs" value={fmt(quote.total_higher_cost)} />
              <View style={{ borderTopWidth: 1, borderTopColor: colors.border, marginTop: spacing.xs, paddingTop: spacing.xs }}>
                <LineItemRow label="Subtotal" value={fmt(subtotal)} />
                <LineItemRow label="Tax" value={fmt(quote.tax_amount)} />
              </View>
            </>
          );
        })()}
      </Card>

      {/* Tasks */}
      {quote.tasks?.length > 0 && (
        <Card>
          <SectionHeader title="Work Tasks" />
          {quote.tasks.map(t => (
            <View key={t.id} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '500' }}>{t.task_name}</Text>
                <Text style={{ fontSize: 11, color: colors.textSecondary }}>{t.task_type === 'set' ? 'Set Price' : (t.task_type === 'charge' ? 'Hourly Rate' : `Hourly (${t.estimated_hours}h)`)}</Text>
              </View>
              <Text style={{ fontWeight: '600' }}>{t.task_type === 'charge' ? `${fmt(t.hourly_rate)}/hr` : fmt(t.task_type === 'set' ? t.price : t.estimated_hours * t.hourly_rate)}</Text>
            </View>
          ))}
        </Card>
      )}

      {/* Materials */}
      {quote.materials?.length > 0 && (
        <Card>
          <SectionHeader title="Materials" />
          {quote.materials.map(m => (
            <View key={m.id} style={styles.row}>
              <Text style={{ flex: 1 }}>{m.item_name}</Text>
              <Text style={{ color: colors.textSecondary }}>{m.quantity} × ${m.unit_cost}</Text>
              <Text style={{ fontWeight: '600', marginLeft: spacing.sm }}>{fmt(m.total)}</Text>
            </View>
          ))}
        </Card>
      )}

      {/* Equipment */}
      {quote.equipment?.length > 0 && (
        <Card>
          <SectionHeader title="Equipment" />
          {quote.equipment.map(e => (
            <View key={e.id} style={styles.row}>
              <Text style={{ flex: 1 }}>{e.item_name}</Text>
              <Text style={{ color: colors.textSecondary }}>{e.duration_days}d × ${e.daily_rate}/d</Text>
              <Text style={{ fontWeight: '600', marginLeft: spacing.sm }}>{fmt(e.total)}</Text>
            </View>
          ))}
        </Card>
      )}

      {/* Higher Costs */}
      {quote.higher_costs?.length > 0 && (
        <Card>
          <SectionHeader title="Higher Costs / Permits" />
          {quote.higher_costs.map(h => (
            <View key={h.id} style={styles.row}>
              <Text style={{ flex: 1 }}>{h.description}</Text>
              <Text style={{ fontWeight: '600' }}>{fmt(h.amount)}</Text>
            </View>
          ))}
        </Card>
      )}

      {/* Photos */}
      {quote.photos?.length > 0 && (
        <Card>
          <SectionHeader title={`Site Photos (${quote.photos.length})`} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {quote.photos.map(p => (
              <View key={p.id} style={{ marginRight: spacing.sm }}>
                <Image source={{ uri: `${BASE_URL}${p.image_uri}` }} style={{ width: 120, height: 120, borderRadius: radius.md }} />
                {p.caption && <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 4, maxWidth: 120 }}>{p.caption}</Text>}
              </View>
            ))}
          </ScrollView>
        </Card>
      )}

      <TouchableOpacity
        style={styles.editBtn}
        onPress={() => navigation.navigate('NewQuote', { editingQuote: quote })}
      >
        <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 16 }}>✏️  Edit Quote</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  row: { flexDirection: 'row', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: colors.border, alignItems: 'center' },
  editBtn: {
    alignItems: 'center', paddingVertical: spacing.md, borderRadius: radius.md,
    borderWidth: 1.5, borderColor: colors.primary, marginTop: spacing.sm,
  },
});
