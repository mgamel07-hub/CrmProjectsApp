import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl, Alert,
  Modal, FlatList, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  getPlanByIdForView, getPlanItems,
  submitPlan, approvePlan, rejectPlan, revertPlanStep,
  deletePlanItem, getAvailableStageDefItems, createPlanItemFromCatalog,
} from '../api/projects';
import { t } from '../i18n';
import { useLang } from '../context/LangContext';
import { useRole } from '../context/RoleContext';
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
import { scheduleItemReminders } from '../utils/notifications';

export default function PlanDetailScreen({ navigation, route }) {
  const { planId, title } = route.params;
  const { lang } = useLang();
  const { myRole } = useRole();
  const canApprove = myRole === 'admin' || myRole === 'manager';
  const [plan, setPlan] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  // Catalog modal
  const [catalogModal, setCatalogModal] = useState(false);
  const [catalogItems, setCatalogItems] = useState([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [addingCatalog, setAddingCatalog] = useState(false);

  const load = useCallback(async () => {
    try {
      const [planRes, itemsRes] = await Promise.allSettled([
        getPlanByIdForView(planId),
        getPlanItems(planId),
      ]);
      const planData = planRes.status === 'fulfilled' ? extractData(planRes.value) : null;
      const itemData = itemsRes.status === 'fulfilled' ? extractList(itemsRes.value) : [];
      if (planData) setPlan(planData);
      if (itemData) {
        setItems(itemData);
        scheduleItemReminders(itemData, planData?.name || title || '').catch(() => {});
      }
      setError(null);
    } catch (e) {
      setError(e?.response?.data?.message || t('networkError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [planId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    navigation.setOptions({
      title: title || t('planDetails'),
      headerRight: () => (
        <TouchableOpacity
          onPress={() => navigation.navigate('PlanPrint', {
            planId,
            projectId: plan?.projectId || route.params?.projectId,
            clientName:  plan?.projectName  || route.params?.clientName  || '',
            scopeName:   plan?.scopeName    || route.params?.scopeName    || '',
            stageName:   plan?.stageName    || route.params?.stageName    || '',
            planTitle:   plan?.name         || title || '',
          })}
          style={{ marginLeft: 14 }}
        >
          <Ionicons name="print-outline" size={22} color="#fff" />
        </TouchableOpacity>
      ),
    });
  }, [navigation, title, plan]);

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

  const openCatalog = async () => {
    setCatalogModal(true);
    setSelectedIds([]);
    setLoadingCatalog(true);
    try {
      const res = await getAvailableStageDefItems(planId);
      const { extractList: el, extractData: ed } = await import('../utils/helpers').then(m => ({ extractList: m.extractList, extractData: m.extractData }));
      setCatalogItems(el(res) || ed(res) || []);
    } catch { setCatalogItems([]); }
    finally { setLoadingCatalog(false); }
  };

  const toggleItem = (id) =>
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]);

  const handleAddFromCatalog = async () => {
    if (selectedIds.length === 0) return;
    setAddingCatalog(true);
    try {
      for (const stageDefItemId of selectedIds) {
        await createPlanItemFromCatalog({ projectPlanId: planId, stageDefItemId });
      }
      setCatalogModal(false);
      load();
    } catch (e) {
      Alert.alert(t('error'), e?.response?.data?.message || t('networkError'));
    } finally { setAddingCatalog(false); }
  };

  if (loading) return <LoadingScreen />;
  if (error && !plan) return <ErrorMessage message={error} onRetry={load} />;

  const statusName = String(plan?.statusName || '').toLowerCase();
  const isDraft = plan?.canEditPlan ?? (plan?.statusId === 1 || statusName === 'draft');
  const isSubmitted = plan?.canApprovePlan || plan?.canRejectPlan ||
    (plan?.statusId === 2 || statusName === 'submitted');

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
          {canApprove && (plan?.canApprovePlan || isSubmitted) && (
            <TouchableOpacity style={[styles.actionBtn, styles.approveBtn]} onPress={handleApprove}>
              <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
              <Text style={styles.actionBtnText}>{t('approve')}</Text>
            </TouchableOpacity>
          )}
          {canApprove && (plan?.canRejectPlan || isSubmitted) && (
            <TouchableOpacity
              style={[styles.actionBtn, styles.rejectBtn]}
              onPress={() => {
                Alert.alert(
                  lang === 'ar' ? 'سبب الرفض' : 'Rejection Reason',
                  lang === 'ar' ? 'هل تريد رفض هذه الخطة؟' : 'Reject this plan?',
                  [
                    { text: t('cancel'), style: 'cancel' },
                    {
                      text: t('reject'), style: 'destructive',
                      onPress: async () => {
                        try {
                          await rejectPlan(planId, {});
                          load();
                        } catch (e) {
                          Alert.alert(t('error'), e?.response?.data?.message || t('networkError'));
                        }
                      },
                    },
                  ]
                );
              }}
            >
              <Ionicons name="close-circle-outline" size={16} color="#fff" />
              <Text style={styles.actionBtnText}>{t('reject')}</Text>
            </TouchableOpacity>
          )}
          {(isDraft || plan?.statusId === 4 || statusName === 'rejected') && (
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
          <View style={styles.addBtns}>
            <TouchableOpacity style={styles.catalogBtn} onPress={openCatalog}>
              <Ionicons name="list-outline" size={15} color="#1565C0" />
              <Text style={styles.catalogBtnText}>{lang === 'ar' ? 'من الكتالوج' : 'From Catalog'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => navigation.navigate('CreatePlanItem', { planId, onDone: load })}
            >
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={styles.addBtnText}>{lang === 'ar' ? 'يدوي' : 'Manual'}</Text>
            </TouchableOpacity>
          </View>
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
      {/* Catalog Modal */}
      <Modal visible={catalogModal} transparent animationType="slide" onRequestClose={() => setCatalogModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{lang === 'ar' ? 'اختر البنود' : 'Select Items'}</Text>
              <TouchableOpacity onPress={() => setCatalogModal(false)}>
                <Ionicons name="close" size={22} color="#444" />
              </TouchableOpacity>
            </View>

            {loadingCatalog ? (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <ActivityIndicator color="#1565C0" />
              </View>
            ) : catalogItems.length === 0 ? (
              <Text style={styles.emptyText}>{lang === 'ar' ? 'لا توجد بنود متاحة' : 'No items available'}</Text>
            ) : (
              <>
                {/* Select All */}
                <TouchableOpacity
                  style={styles.selectAllRow}
                  onPress={() =>
                    setSelectedIds(
                      selectedIds.length === catalogItems.length
                        ? []
                        : catalogItems.map((i) => i.id ?? i.stageDefItemId)
                    )
                  }
                >
                  <Ionicons
                    name={selectedIds.length === catalogItems.length ? 'checkbox' : 'square-outline'}
                    size={20}
                    color="#1565C0"
                  />
                  <Text style={styles.selectAllText}>{lang === 'ar' ? 'تحديد الكل' : 'Select All'}</Text>
                </TouchableOpacity>

                <FlatList
                  data={catalogItems}
                  keyExtractor={(i, idx) => String(i.id ?? i.stageDefItemId ?? idx)}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item }) => {
                    const itemId = item.id ?? item.stageDefItemId;
                    const checked = selectedIds.includes(itemId);
                    return (
                      <TouchableOpacity style={styles.catalogItem} onPress={() => toggleItem(itemId)}>
                        <Ionicons
                          name={checked ? 'checkbox' : 'square-outline'}
                          size={20}
                          color={checked ? '#1565C0' : '#bbb'}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.catalogItemTitle}>{item.title || item.name || item.nameAr || `Item #${itemId}`}</Text>
                          {item.description && (
                            <Text style={styles.catalogItemDesc} numberOfLines={1}>{item.description}</Text>
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  }}
                  style={{ maxHeight: 340 }}
                />

                <View style={styles.modalFooter}>
                  <Text style={styles.selectedCount}>
                    {selectedIds.length} {lang === 'ar' ? 'محدد' : 'selected'}
                  </Text>
                  <TouchableOpacity
                    style={[styles.addBtn, { opacity: selectedIds.length === 0 ? 0.5 : 1 }]}
                    onPress={handleAddFromCatalog}
                    disabled={selectedIds.length === 0 || addingCatalog}
                  >
                    {addingCatalog
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <><Ionicons name="checkmark" size={16} color="#fff" /><Text style={styles.addBtnText}>{lang === 'ar' ? 'إضافة' : 'Add'}</Text></>
                    }
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
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
  emptyText: { color: '#aaa', marginTop: 8, textAlign: 'center', padding: 16 },
  addBtns: { flexDirection: 'row', gap: 8 },
  catalogBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1.5, borderColor: '#1565C0', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  catalogBtnText: { color: '#1565C0', fontSize: 12, fontWeight: '600' },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: '80%' },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#1a1a1a' },
  selectAllRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
    backgroundColor: '#F8F9FF',
  },
  selectAllText: { fontSize: 14, fontWeight: '600', color: '#1565C0' },
  catalogItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#F5F5F5',
  },
  catalogItemTitle: { fontSize: 14, color: '#222', fontWeight: '500' },
  catalogItemDesc: { fontSize: 12, color: '#888', marginTop: 2 },
  modalFooter: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderTopWidth: 1, borderTopColor: '#F0F0F0',
  },
  selectedCount: { fontSize: 13, color: '#666', fontWeight: '500' },
});
