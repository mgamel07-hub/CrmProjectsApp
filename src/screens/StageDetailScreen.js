import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getPlansByScope, updateStageStatus, finishStageWorkflow } from '../api/projects';
import { t } from '../i18n';
import { useLang } from '../context/LangContext';
import { extractList, getPlanStatusLabel, getPlanStatusColor, formatDate } from '../utils/helpers';
import LoadingScreen from '../components/LoadingScreen';
import ErrorMessage from '../components/ErrorMessage';
import StatusBadge from '../components/StatusBadge';
import Card from '../components/Card';

export default function StageDetailScreen({ navigation, route }) {
  const { stageId, title, scopeId } = route.params;
  const { lang } = useLang();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await getPlansByScope({ projectScopeStageId: stageId, pageNumber: 1, pageSize: 50 });
      setPlans(extractList(res));
      setError(null);
    } catch (e) {
      setError(e?.response?.data?.message || t('networkError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [stageId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    navigation.setOptions({
      title: title || t('stageDetails'),
      headerRight: () => (
        <TouchableOpacity
          style={{ marginRight: 16 }}
          onPress={() => navigation.navigate('CreatePlan', { stageId })}
        >
          <Ionicons name="add-circle" size={28} color="#1565C0" />
        </TouchableOpacity>
      ),
    });
  }, [navigation, title, stageId]);

  const onRefresh = () => { setRefreshing(true); load(); };

  if (loading) return <LoadingScreen />;
  if (error && !plans.length) return <ErrorMessage message={error} onRetry={load} />;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1565C0']} />}
    >
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{t('plans')}</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => navigation.navigate('CreatePlan', { stageId })}
        >
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.addBtnText}>{t('newPlan')}</Text>
        </TouchableOpacity>
      </View>

      {plans.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="document-outline" size={48} color="#ccc" />
          <Text style={styles.emptyText}>{t('noData')}</Text>
          <TouchableOpacity
            style={styles.createBtn}
            onPress={() => navigation.navigate('CreatePlan', { stageId })}
          >
            <Text style={styles.createBtnText}>{t('newPlan')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        plans.map((plan, index) => (
          <Card
            key={plan.id}
            onPress={() => navigation.navigate('PlanDetail', { planId: plan.id, title: `${t('plan')} #${plan.id}` })}
            style={styles.planCard}
          >
            <View style={styles.planHeader}>
              <View style={styles.planNum}>
                <Text style={styles.planNumText}>{index + 1}</Text>
              </View>
              <View style={styles.planInfo}>
                <Text style={styles.planTitle}>{t('plan')} #{plan.id}</Text>
                <StatusBadge
                  label={getPlanStatusLabel(plan.statusId)}
                  color={getPlanStatusColor(plan.statusId)}
                />
              </View>
              <Ionicons name="chevron-forward" size={20} color="#bbb" />
            </View>

            {plan.items?.length > 0 && (
              <Text style={styles.itemCount}>
                {plan.items.length} {lang === 'ar' ? 'بند' : 'items'}
              </Text>
            )}

            <View style={styles.planActions}>
              {(plan.statusId === 1 || plan.canEditPlan) && (
                <TouchableOpacity
                  style={[styles.actionBtn, styles.submitBtn]}
                  onPress={async () => {
                    try {
                      await require('../api/projects').submitPlan(plan.id);
                      load();
                    } catch (e) {
                      const d = e?.response?.data;
                      const msg = d?.message || d?.title || (typeof d === 'string' ? d : null) || e?.message || t('networkError');
                      const status = e?.response?.status;
                      Alert.alert(t('error'), status ? `(HTTP ${status}) ${msg}` : msg);
                    }
                  }}
                >
                  <Ionicons name="send-outline" size={14} color="#fff" />
                  <Text style={styles.actionBtnText}>{t('submit')}</Text>
                </TouchableOpacity>
              )}
              {(plan.statusId === 2 || plan.canApprovePlan || plan.canRejectPlan) && (
                <>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.approveBtn]}
                    onPress={async () => {
                      try {
                        await require('../api/projects').approvePlan(plan.id);
                        load();
                      } catch (e) {
                        const d = e?.response?.data;
                        const msg = d?.message || d?.title || (typeof d === 'string' ? d : null) || e?.message || t('networkError');
                        const status = e?.response?.status;
                        Alert.alert(t('error'), status ? `(HTTP ${status}) ${msg}` : msg);
                      }
                    }}
                  >
                    <Ionicons name="checkmark-outline" size={14} color="#fff" />
                    <Text style={styles.actionBtnText}>{t('approve')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.rejectBtn]}
                    onPress={() => {
                      Alert.alert(
                        lang === 'ar' ? 'رفض الخطة' : 'Reject Plan',
                        lang === 'ar' ? 'هل تريد رفض هذه الخطة؟' : 'Reject this plan?',
                        [
                          { text: t('cancel'), style: 'cancel' },
                          {
                            text: t('reject'), style: 'destructive',
                            onPress: async () => {
                              try {
                                await require('../api/projects').rejectPlan(plan.id, {});
                                load();
                              } catch (e) {
                                const d = e?.response?.data;
                                const msg = d?.message || d?.title || (typeof d === 'string' ? d : null) || e?.message || t('networkError');
                                const status = e?.response?.status;
                                Alert.alert(t('error'), status ? `(HTTP ${status}) ${msg}` : msg);
                              }
                            },
                          },
                        ]
                      );
                    }}
                  >
                    <Ionicons name="close-outline" size={14} color="#fff" />
                    <Text style={styles.actionBtnText}>{t('reject')}</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </Card>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F5F7FA' },
  content: { padding: 16, paddingBottom: 32 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1a1a1a' },
  addBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1565C0', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, gap: 4 },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  planCard: { marginBottom: 12 },
  planHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  planNum: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: '#E8EEF8',
    justifyContent: 'center', alignItems: 'center',
  },
  planNumText: { fontSize: 14, fontWeight: '700', color: '#1565C0' },
  planInfo: { flex: 1, gap: 4 },
  planTitle: { fontSize: 14, fontWeight: '600', color: '#222' },
  itemCount: { fontSize: 12, color: '#888', marginBottom: 10 },
  planActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, gap: 4 },
  actionBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  submitBtn: { backgroundColor: '#1565C0' },
  approveBtn: { backgroundColor: '#388E3C' },
  rejectBtn: { backgroundColor: '#D32F2F' },
  empty: { alignItems: 'center', paddingVertical: 48 },
  emptyText: { color: '#aaa', marginTop: 10, fontSize: 14 },
  createBtn: { marginTop: 16, backgroundColor: '#1565C0', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8 },
  createBtnText: { color: '#fff', fontWeight: '600' },
});
