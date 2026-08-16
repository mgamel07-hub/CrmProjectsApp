import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, RefreshControl, Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  getUnitsRequests, approveUnitsRequest, rejectUnitsRequest,
  getPendingPlans, approvePlan, rejectPlan,
} from '../api/projects';
import { t } from '../i18n';
import { useLang } from '../context/LangContext';
import { useAuth } from '../context/AuthContext';
import { DEMO_APPROVALS } from '../api/demoData';
import {
  extractList, extractData,
  getRequestStatusLabel, getRequestStatusColor,
  getPlanStatusLabel, getPlanStatusColor,
  formatDate,
} from '../utils/helpers';
import LoadingScreen from '../components/LoadingScreen';
import ErrorMessage from '../components/ErrorMessage';
import StatusBadge from '../components/StatusBadge';
import Card from '../components/Card';

// ── Unit Requests Section ────────────────────────────────────────────────────

function UnitsTab({ lang, isDemo }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('pending');

  const load = useCallback(async () => {
    if (isDemo) {
      const statusId = filter === 'pending' ? 1 : filter === 'approved' ? 2 : 3;
      setRequests(DEMO_APPROVALS.filter(r => r.statusId === statusId));
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const statusId = filter === 'pending' ? 1 : filter === 'approved' ? 2 : filter === 'rejected' ? 3 : undefined;
      const res = await getUnitsRequests({ statusId, pageNumber: 1, pageSize: 100 });
      setRequests(extractList(res) || []);
      setError(null);
    } catch (e) {
      setError(e?.response?.data?.message || t('networkError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter, isDemo]);

  useEffect(() => { load(); }, [load]);
  const onRefresh = () => { setRefreshing(true); load(); };

  const handleApprove = (req) => {
    Alert.prompt(
      lang === 'ar' ? 'عدد الوحدات المعتمدة' : 'Approved Units',
      lang === 'ar' ? 'أدخل عدد الوحدات المعتمدة' : 'Enter approved unit count',
      async (count) => {
        if (!count) return;
        try {
          await approveUnitsRequest(req.id, { approvedUnitCount: Number(count) });
          load();
        } catch (e) {
          Alert.alert(t('error'), e?.response?.data?.message || t('networkError'));
        }
      },
      'plain-text',
      String(req.requestedUnitCount)
    );
  };

  const handleReject = (req) => {
    Alert.prompt(
      lang === 'ar' ? 'سبب الرفض' : 'Rejection Reason',
      lang === 'ar' ? 'أدخل سبب الرفض' : 'Enter rejection reason',
      async (reason) => {
        if (reason === null) return;
        try {
          await rejectUnitsRequest(req.id, { reason });
          load();
        } catch (e) {
          Alert.alert(t('error'), e?.response?.data?.message || t('networkError'));
        }
      },
      'plain-text'
    );
  };

  const filters = [
    { key: 'pending',  label: lang === 'ar' ? 'معلق'   : 'Pending'  },
    { key: 'approved', label: lang === 'ar' ? 'معتمد'  : 'Approved' },
    { key: 'rejected', label: lang === 'ar' ? 'مرفوض' : 'Rejected' },
    { key: 'all',      label: t('all') },
  ];

  if (loading) return <LoadingScreen />;
  if (error && !requests.length) return <ErrorMessage message={error} onRetry={load} />;

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.chips}>
        {filters.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.chip, filter === f.key && styles.chipActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[styles.chipText, filter === f.key && styles.chipTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={requests}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1565C0']} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="checkmark-done-circle-outline" size={48} color="#ccc" />
            <Text style={styles.emptyText}>{t('noData')}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Card style={styles.reqCard}>
            <View style={styles.reqHeader}>
              <View style={styles.reqLeft}>
                <Text style={styles.reqTitle}>{lang === 'ar' ? 'طلب رقم' : 'Request #'}{item.id}</Text>
                <Text style={styles.reqSub} numberOfLines={1}>{item.projectPlanItem?.title || ''}</Text>
              </View>
              <StatusBadge label={getRequestStatusLabel(item.statusId)} color={getRequestStatusColor(item.statusId)} />
            </View>
            <View style={styles.unitsRow}>
              <View style={styles.unitBox}>
                <Text style={styles.unitLabel}>{lang === 'ar' ? 'مطلوب' : 'Requested'}</Text>
                <Text style={[styles.unitValue, { color: '#F57C00' }]}>{item.requestedUnitCount}</Text>
              </View>
              <Ionicons name="arrow-forward" size={16} color="#ccc" />
              <View style={styles.unitBox}>
                <Text style={styles.unitLabel}>{lang === 'ar' ? 'معتمد' : 'Approved'}</Text>
                <Text style={[styles.unitValue, { color: '#388E3C' }]}>{item.approvedUnitCount || '—'}</Text>
              </View>
            </View>
            {item.reason ? <Text style={styles.reason}>{lang === 'ar' ? 'السبب: ' : 'Reason: '}{item.reason}</Text> : null}
            <Text style={styles.date}>{formatDate(item.requestedOn)}</Text>
            {item.statusId === 1 && (
              <View style={styles.actions}>
                <TouchableOpacity style={[styles.actionBtn, styles.approveBtn]} onPress={() => handleApprove(item)}>
                  <Ionicons name="checkmark-outline" size={15} color="#fff" />
                  <Text style={styles.actionText}>{t('approve')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionBtn, styles.rejectBtn]} onPress={() => handleReject(item)}>
                  <Ionicons name="close-outline" size={15} color="#fff" />
                  <Text style={styles.actionText}>{t('reject')}</Text>
                </TouchableOpacity>
              </View>
            )}
          </Card>
        )}
      />
    </View>
  );
}

// ── Plan Approvals Section ────────────────────────────────────────────────────

function PlansTab({ lang, navigation }) {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);

  const load = useCallback(async () => {
    try {
      // statusId=2 = Submitted (pending approval)
      const res = await getPendingPlans({ statusId: 2, pageNumber: 1, pageSize: 100 });
      const list = extractList(res) || extractData(res) || [];
      setPlans(Array.isArray(list) ? list : []);
      setError(null);
    } catch (e) {
      const status = e?.response?.status;
      if (status === 404 || status === 405) {
        // endpoint doesn't exist — show empty with hint
        setPlans([]);
        setError(null);
      } else {
        setError(e?.response?.data?.message || t('networkError'));
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  const onRefresh = () => { setRefreshing(true); load(); };

  const handleApprove = async (plan) => {
    setActionLoading(`approve-${plan.id}`);
    try {
      await approvePlan(plan.id);
      load();
    } catch (e) {
      Alert.alert(t('error'), e?.response?.data?.message || t('networkError'));
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = (plan) => {
    Alert.alert(
      lang === 'ar' ? 'رفض الخطة' : 'Reject Plan',
      lang === 'ar' ? `رفض الخطة للمرحلة "${plan.stageName || ''}"؟` : `Reject plan for stage "${plan.stageName || ''}"?`,
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('reject'), style: 'destructive',
          onPress: async () => {
            setActionLoading(`reject-${plan.id}`);
            try {
              await rejectPlan(plan.id, {});
              load();
            } catch (e) {
              Alert.alert(t('error'), e?.response?.data?.message || t('networkError'));
            } finally {
              setActionLoading(null);
            }
          },
        },
      ]
    );
  };

  if (loading) return <LoadingScreen />;
  if (error) return <ErrorMessage message={error} onRetry={load} />;

  return (
    <FlatList
      data={plans}
      keyExtractor={(item) => String(item.id)}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1565C0']} />}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Ionicons name="document-text-outline" size={48} color="#ccc" />
          <Text style={styles.emptyText}>
            {lang === 'ar' ? 'لا توجد خطط بانتظار الاعتماد' : 'No plans pending approval'}
          </Text>
          <Text style={[styles.emptyText, { fontSize: 12, marginTop: 8 }]}>
            {lang === 'ar'
              ? 'يمكنك اعتماد الخطط من: المشاريع ← النطاق ← المرحلة ← الخطة'
              : 'You can approve plans from: Projects → Scope → Stage → Plan'}
          </Text>
        </View>
      }
      renderItem={({ item }) => (
        <Card style={styles.reqCard}>
          <View style={styles.reqHeader}>
            <View style={styles.reqLeft}>
              <Text style={styles.reqTitle}>
                {lang === 'ar' ? 'خطة' : 'Plan'} #{item.id}
              </Text>
              {item.stageName ? (
                <Text style={styles.reqSub} numberOfLines={1}>
                  <Ionicons name="git-branch-outline" size={12} color="#888" /> {item.stageName}
                </Text>
              ) : null}
              {(item.projectName || item.scopeName) ? (
                <Text style={[styles.reqSub, { color: '#1565C0' }]} numberOfLines={1}>
                  {item.projectName || item.scopeName || ''}
                </Text>
              ) : null}
            </View>
            <StatusBadge label={getPlanStatusLabel(item.statusId)} color={getPlanStatusColor(item.statusId)} />
          </View>

          {item.itemCount != null && (
            <View style={styles.planMeta}>
              <Ionicons name="list-outline" size={13} color="#888" />
              <Text style={styles.planMetaText}>
                {item.itemCount} {lang === 'ar' ? 'بند' : 'items'}
              </Text>
              {item.expectedUnits != null && (
                <>
                  <Ionicons name="cube-outline" size={13} color="#888" style={{ marginLeft: 10 }} />
                  <Text style={styles.planMetaText}>{item.expectedUnits} {t('expectedUnits')}</Text>
                </>
              )}
            </View>
          )}

          {(item.startDate || item.endDate) && (
            <Text style={styles.date}>
              {item.startDate ? formatDate(item.startDate) : '—'} → {item.endDate ? formatDate(item.endDate) : '—'}
            </Text>
          )}

          <View style={[styles.actions, { marginTop: 10 }]}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.approveBtn, { opacity: actionLoading ? 0.6 : 1 }]}
              onPress={() => handleApprove(item)}
              disabled={!!actionLoading}
            >
              {actionLoading === `approve-${item.id}`
                ? <ActivityIndicator size="small" color="#fff" />
                : <><Ionicons name="checkmark-outline" size={15} color="#fff" /><Text style={styles.actionText}>{t('approve')}</Text></>
              }
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.rejectBtn, { opacity: actionLoading ? 0.6 : 1 }]}
              onPress={() => handleReject(item)}
              disabled={!!actionLoading}
            >
              {actionLoading === `reject-${item.id}`
                ? <ActivityIndicator size="small" color="#fff" />
                : <><Ionicons name="close-outline" size={15} color="#fff" /><Text style={styles.actionText}>{t('reject')}</Text></>
              }
            </TouchableOpacity>
          </View>
        </Card>
      )}
    />
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function ApprovalsScreen({ navigation }) {
  const { lang } = useLang();
  const { isDemo } = useAuth();
  const [activeTab, setActiveTab] = useState('plans');

  const tabs = [
    { key: 'plans', label: lang === 'ar' ? 'الخطط' : 'Plans', icon: 'document-text-outline' },
    { key: 'units', label: lang === 'ar' ? 'طلبات الوحدات' : 'Unit Requests', icon: 'cube-outline' },
  ];

  return (
    <View style={styles.root}>
      <View style={styles.tabsRow}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tabBtn, activeTab === tab.key && styles.tabBtnActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Ionicons name={tab.icon} size={15} color={activeTab === tab.key ? '#1565C0' : '#888'} />
            <Text style={[styles.tabBtnText, activeTab === tab.key && styles.tabBtnTextActive]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {activeTab === 'plans'
        ? <PlansTab lang={lang} navigation={navigation} />
        : <UnitsTab lang={lang} isDemo={isDemo} />
      }
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F5F7FA' },
  tabsRow: {
    flexDirection: 'row', backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#E8EEF8',
  },
  tabBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, gap: 6, borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabBtnActive: { borderBottomColor: '#1565C0' },
  tabBtnText: { fontSize: 13, color: '#888', fontWeight: '500' },
  tabBtnTextActive: { color: '#1565C0', fontWeight: '700' },
  chips: { flexDirection: 'row', padding: 12, paddingBottom: 8, gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: '#E8EEF8' },
  chipActive: { backgroundColor: '#1565C0' },
  chipText: { fontSize: 13, color: '#555', fontWeight: '500' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  list: { padding: 12, paddingTop: 8, paddingBottom: 32 },
  reqCard: { marginBottom: 10 },
  reqHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  reqLeft: { flex: 1, marginRight: 8 },
  reqTitle: { fontSize: 14, fontWeight: '700', color: '#222' },
  reqSub: { fontSize: 12, color: '#888', marginTop: 2 },
  unitsRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  unitBox: { alignItems: 'center' },
  unitLabel: { fontSize: 11, color: '#888' },
  unitValue: { fontSize: 20, fontWeight: '800' },
  planMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  planMetaText: { fontSize: 12, color: '#666' },
  reason: { fontSize: 12, color: '#666', fontStyle: 'italic', marginBottom: 6 },
  date: { fontSize: 11, color: '#aaa', marginBottom: 4 },
  actions: { flexDirection: 'row', gap: 8 },
  actionBtn: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 8, borderRadius: 8, gap: 4 },
  actionText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  approveBtn: { backgroundColor: '#388E3C' },
  rejectBtn: { backgroundColor: '#D32F2F' },
  empty: { alignItems: 'center', paddingVertical: 80 },
  emptyText: { color: '#aaa', marginTop: 10, fontSize: 14, textAlign: 'center' },
});
