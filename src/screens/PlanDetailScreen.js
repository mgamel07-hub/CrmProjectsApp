import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  getPlanByIdForView, getPlanItems,
  submitPlan, approvePlan, rejectPlan, revertPlanStep,
  deletePlanItem,
} from '../api/projects';
import { t } from '../i18n';
import { useLang } from '../context/LangContext';
import {
  extractData, extractList,
  getPlanStatusLabel, getPlanStatusColor,
  getRequestStatusLabel, getRequestStatusColor,
  formatDate,
} from '../utils/helpers';
import LoadingScreen from '../components/LoadingScreen';
import ErrorMessage from '../components/ErrorMessage';
import StatusBadge from '../components/StatusBadge';
import Card from '../components/Card';

export default function PlanDetailScreen({ navigation, route }) {
  const { planId, title } = route.params;
  const { lang } = useLang();
  const [plan, setPlan] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [planRes, itemsRes] = await Promise.allSettled([
        getPlanByIdForView(planId),
        getPlanItems(planId),
      ]);
      if (planRes.status === 'fulfilled') setPlan(extractData(planRes.value));
      if (itemsRes.status === 'fulfilled') setItems(extractList(itemsRes.value));
      setError(null);
    } catch (e) {
      setError(e?.response?.data?.message || t('networkError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [planId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { navigation.setOptions({ title: title || t('planDetails') }); }, [navigation, title]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const handleSubmit = async () => {
    Alert.alert(
      lang === 'ar' ? 'تأكيد التقديم' : 'Confirm Submit',
      lang === 'ar' ? 'هل تريد تقديم هذه الخطة للموافقة؟' : 'Submit this plan for approval?',
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('submit'), onPress: async () => {
            try {
              await submitPlan(planId);
              load();
            } catch (e) {
              Alert.alert(t('error'), e?.response?.data?.message || t('networkError'));
            }
          },
        },
      ]
    );
  };

  const handleApprove = async () => {
    try {
      await approvePlan(planId);
      load();
    } catch (e) {
      Alert.alert(t('error'), e?.response?.data?.message || t('networkError'));
    }
  };

  const handleRevert = async () => {
    try {
      await revertPlanStep(planId);
      load();
    } catch (e) {
      Alert.alert(t('error'), e?.response?.data?.message || t('networkError'));
    }
  };

  const handleDeleteItem = (item) => {
    Alert.alert(
      lang === 'ar' ? 'حذف البند' : 'Delete Item',
      lang === 'ar' ? `حذف "${item.title}"؟` : `Delete "${item.title}"?`,
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete'), style: 'destructive',
          onPress: async () => {
            try {
              await deletePlanItem(item.id);
              setItems((prev) => prev.filter((i) => i.id !== item.id));
            } catch (e) {
              Alert.alert(t('error'), e?.response?.data?.message || t('networkError'));
            }
          },
        },
      ]
    );
  };

  if (loading) return <LoadingScreen />;
  if (error && !plan) return <ErrorMessage message={error} onRetry={load} />;

  const isDraft = plan?.statusId === 1;
  const isSubmitted = plan?.statusId === 2;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1565C0']} />}
    >
      {/* Plan header */}
      <Card style={styles.headerCard}>
        <View style={styles.headerTop}>
          <Text style={styles.planTitle}>{t('plan')} #{planId}</Text>
          <StatusBadge
            label={getPlanStatusLabel(plan?.statusId)}
            color={getPlanStatusColor(plan?.statusId)}
          />
        </View>
        {plan?.rejectionReason && (
          <View style={styles.rejectionBox}>
            <Ionicons name="alert-circle-outline" size={16} color="#D32F2F" />
            <Text style={styles.rejectionText}>{plan.rejectionReason}</Text>
          </View>
        )}
        {plan?.approvedByUser && (
          <Text style={styles.approvedBy}>
            {lang === 'ar' ? 'اعتمد بواسطة:' : 'Approved by:'} {plan.approvedByUser.fullName}
          </Text>
        )}

        {/* Action buttons */}
        <View style={styles.actions}>
          {isDraft && (
            <TouchableOpacity style={[styles.actionBtn, styles.submitBtn]} onPress={handleSubmit}>
              <Ionicons name="send-outline" size={16} color="#fff" />
              <Text style={styles.actionBtnText}>{t('submit')}</Text>
            </TouchableOpacity>
          )}
          {isSubmitted && (
            <>
              <TouchableOpacity style={[styles.actionBtn, styles.approveBtn]} onPress={handleApprove}>
                <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
                <Text style={styles.actionBtnText}>{t('approve')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.rejectBtn]}
                onPress={() => navigation.navigate('RejectPlan', { planId, onDone: load })}
              >
                <Ionicons name="close-circle-outline" size={16} color="#fff" />
                <Text style={styles.actionBtnText}>{t('reject')}</Text>
              </TouchableOpacity>
            </>
          )}
          {(isDraft || plan?.statusId === 4) && (
            <TouchableOpacity style={[styles.actionBtn, styles.revertBtn]} onPress={handleRevert}>
              <Ionicons name="refresh-outline" size={16} color="#fff" />
              <Text style={styles.actionBtnText}>{t('revert')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </Card>

      {/* Plan Items */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{t('planItems')}</Text>
        {isDraft && (
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => navigation.navigate('CreatePlanItem', { planId, onDone: load })}
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.addBtnText}>{t('newPlanItem')}</Text>
          </TouchableOpacity>
        )}
      </View>

      {items.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="list-outline" size={36} color="#ccc" />
          <Text style={styles.emptyText}>{t('noData')}</Text>
        </View>
      ) : (
        items.map((item) => (
          <Card key={item.id} style={styles.itemCard}>
            <View style={styles.itemHeader}>
              <Text style={styles.itemTitle} numberOfLines={2}>{item.title}</Text>
              {isDraft && (
                <TouchableOpacity onPress={() => handleDeleteItem(item)}>
                  <Ionicons name="trash-outline" size={18} color="#D32F2F" />
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.itemMeta}>
              <View style={styles.metaChip}>
                <Ionicons name="cube-outline" size={13} color="#1565C0" />
                <Text style={styles.metaChipText}>{item.expectedUnits} {t('expectedUnits')}</Text>
              </View>
              {item.scheduledDate && (
                <View style={styles.metaChip}>
                  <Ionicons name="calendar-outline" size={13} color="#F57C00" />
                  <Text style={styles.metaChipText}>{formatDate(item.scheduledDate)}</Text>
                </View>
              )}
            </View>

            {/* Unit requests for this item */}
            {item.allocatedUnitsRequests?.length > 0 && (
              <View style={styles.requests}>
                <Text style={styles.requestsTitle}>{t('unitsRequests')}</Text>
                {item.allocatedUnitsRequests.map((req) => (
                  <View key={req.id} style={styles.requestRow}>
                    <StatusBadge
                      label={getRequestStatusLabel(req.statusId)}
                      color={getRequestStatusColor(req.statusId)}
                    />
                    <Text style={styles.requestUnits}>{req.requestedUnitCount} → {req.approvedUnitCount || '—'}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Add unit request button */}
            <TouchableOpacity
              style={styles.requestBtn}
              onPress={() => navigation.navigate('CreateUnitsRequest', { planItemId: item.id, itemTitle: item.title, onDone: load })}
            >
              <Ionicons name="add-circle-outline" size={16} color="#1565C0" />
              <Text style={styles.requestBtnText}>{t('newUnitsRequest')}</Text>
            </TouchableOpacity>
          </Card>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F5F7FA' },
  content: { padding: 16, paddingBottom: 32 },
  headerCard: { marginBottom: 16 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  planTitle: { fontSize: 18, fontWeight: '700', color: '#1a1a1a' },
  rejectionBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: '#FFF3F3', borderRadius: 8, padding: 10, marginBottom: 10 },
  rejectionText: { flex: 1, fontSize: 13, color: '#D32F2F' },
  approvedBy: { fontSize: 12, color: '#388E3C', marginBottom: 8 },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, gap: 4 },
  actionBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  submitBtn: { backgroundColor: '#1565C0' },
  approveBtn: { backgroundColor: '#388E3C' },
  rejectBtn: { backgroundColor: '#D32F2F' },
  revertBtn: { backgroundColor: '#F57C00' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#1a1a1a' },
  addBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1565C0', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, gap: 4 },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  itemCard: { marginBottom: 10 },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 },
  itemTitle: { fontSize: 14, fontWeight: '600', color: '#222', flex: 1 },
  itemMeta: { flexDirection: 'row', gap: 12, marginBottom: 8, flexWrap: 'wrap' },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F0F4FF', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  metaChipText: { fontSize: 12, color: '#444' },
  requests: { borderTopWidth: 1, borderTopColor: '#F0F0F0', paddingTop: 8, marginTop: 4 },
  requestsTitle: { fontSize: 12, color: '#888', marginBottom: 6 },
  requestRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  requestUnits: { fontSize: 13, color: '#1565C0', fontWeight: '600' },
  requestBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8, borderTopWidth: 1, borderTopColor: '#F0F0F0', paddingTop: 8 },
  requestBtnText: { color: '#1565C0', fontSize: 13, fontWeight: '500' },
  empty: { alignItems: 'center', paddingVertical: 32 },
  emptyText: { color: '#aaa', marginTop: 8 },
});
