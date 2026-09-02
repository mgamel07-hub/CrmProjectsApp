import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, RefreshControl, Alert,
  ActivityIndicator, TextInput, Modal, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  getUnitsRequests, approveUnitsRequest, rejectUnitsRequest,
  getPendingPlans, approvePlan, rejectPlan, submitPlan, getPlanByIdForView,
} from '../api/projects';
import {
  getTeamMembers, getMyTeamRecord, createNotification,
  getPendingScheduleEntries, approveScheduleEntry, rejectScheduleEntry,
  getPendingModifications, approveModificationRequest, rejectModificationRequest,
} from '../api/internal';
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

const TYPE_LABELS = { visit: 'زيارة عميل', office: 'مكتب', vacation: 'إجازة' };
const TYPE_COLORS = { visit: '#1565C0', office: '#388E3C', vacation: '#E65100' };
const DAYS_AR = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];

// ── Unit Requests Section ────────────────────────────────────────────────────

function InputModal({ visible, title, placeholder, defaultValue, onConfirm, onCancel }) {
  const [val, setVal] = useState(defaultValue || '');
  React.useEffect(() => { if (visible) setVal(defaultValue || ''); }, [visible, defaultValue]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 }}>
        <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 20, gap: 12 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: '#1a1a1a', textAlign: 'right' }}>{title}</Text>
          <TextInput
            value={val}
            onChangeText={setVal}
            placeholder={placeholder}
            style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, fontSize: 14, textAlign: 'right' }}
            keyboardType="default"
            autoFocus
          />
          <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'flex-end' }}>
            <TouchableOpacity onPress={onCancel} style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: '#f0f0f0' }}>
              <Text style={{ color: '#555', fontWeight: '600' }}>إلغاء</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onConfirm(val)} style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: '#1565C0' }}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>تأكيد</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function UnitsTab({ lang, isDemo }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('pending');
  const [inputModal, setInputModal] = useState({ visible: false, title: '', placeholder: '', defaultValue: '', onConfirm: null });

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
    setInputModal({
      visible: true,
      title: lang === 'ar' ? 'عدد الوحدات المعتمدة' : 'Approved Units',
      placeholder: lang === 'ar' ? 'أدخل العدد' : 'Enter count',
      defaultValue: String(req.requestedUnitCount),
      onConfirm: async (count) => {
        setInputModal(m => ({ ...m, visible: false }));
        if (!count) return;
        try {
          await approveUnitsRequest(req.id, { approvedUnitCount: Number(count) });
          load();
        } catch (e) {
          Alert.alert(t('error'), e?.response?.data?.message || t('networkError'));
        }
      },
    });
  };

  const handleReject = (req) => {
    setInputModal({
      visible: true,
      title: lang === 'ar' ? 'سبب الرفض' : 'Rejection Reason',
      placeholder: lang === 'ar' ? 'أدخل سبب الرفض' : 'Enter reason',
      defaultValue: '',
      onConfirm: async (reason) => {
        setInputModal(m => ({ ...m, visible: false }));
        if (!reason) return;
        try {
          await rejectUnitsRequest(req.id, { reason });
          load();
        } catch (e) {
          Alert.alert(t('error'), e?.response?.data?.message || t('networkError'));
        }
      },
    });
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
      <InputModal
        visible={inputModal.visible}
        title={inputModal.title}
        placeholder={inputModal.placeholder}
        defaultValue={inputModal.defaultValue}
        onConfirm={inputModal.onConfirm || (() => {})}
        onCancel={() => setInputModal(m => ({ ...m, visible: false }))}
      />
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
      // Load both draft (1) and submitted (2) plans
      const [res1, res2] = await Promise.allSettled([
        getPendingPlans({ statusId: 1, pageNumber: 1, pageSize: 100 }),
        getPendingPlans({ statusId: 2, pageNumber: 1, pageSize: 100 }),
      ]);
      const list1 = res1.status === 'fulfilled' ? (extractList(res1.value) || extractData(res1.value) || []) : [];
      const list2 = res2.status === 'fulfilled' ? (extractList(res2.value) || extractData(res2.value) || []) : [];
      setPlans([...list2, ...list1]); // submitted first, then drafts
      setError(null);
    } catch (e) {
      const status = e?.response?.status;
      if (status === 404 || status === 405) {
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

  // Send Supabase notification to plan creator (implementer)
  const notifyImplementer = async (plan, approved) => {
    try {
      let creatorId = plan.createdByUserId ?? plan.userId ?? plan.createdBy?.userId
        ?? plan.createdBy?.id ?? plan.implementorId ?? plan.implementor?.id ?? null;
      // If not in summary, fetch full plan details
      if (!creatorId) {
        try {
          const full = await getPlanByIdForView(plan.id);
          const fp = full?.data?.data ?? full?.data;
          creatorId = fp?.createdByUserId ?? fp?.userId ?? fp?.createdBy?.userId
            ?? fp?.createdBy?.id ?? fp?.implementorId ?? fp?.implementor?.id ?? null;
        } catch (_) {}
      }
      if (!creatorId) return;
      await createNotification({
        to_user_id: String(creatorId),
        type: 'approval',
        message: approved
          ? `✓ تم اعتماد خطتك: ${plan.stageName || 'خطة #' + plan.id}`
          : `✗ تم رفض خطتك: ${plan.stageName || 'خطة #' + plan.id} — راجع التفاصيل`,
        is_read: false,
      });
    } catch (_) {}
  };

  const handleApprove = async (plan) => {
    setActionLoading(`approve-${plan.id}`);
    try {
      // If still draft (statusId=1), submit first then approve
      if ((plan.statusId ?? plan.status) === 1) {
        await submitPlan(plan.id);
      }
      await approvePlan(plan.id);
      await notifyImplementer(plan, true);
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
              await notifyImplementer(plan, false);
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

// ── Schedule Entry Approval Tab ───────────────────────────────────────────────

function ScheduleApprovalTab({ userId }) {
  const [entries, setEntries]   = useState([]);
  const [nameMap, setNameMap]   = useState({});
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [acting, setActing]     = useState(null);

  const load = useCallback(async () => {
    try {
      const [members, myRec] = await Promise.all([getTeamMembers(), getMyTeamRecord(userId)]);
      const role = myRec?.role || 'admin';
      let team = role === 'manager'
        ? members.filter(m => m.team_id === myRec.team_id)
        : members;
      const empIds = team.filter(m => m.role === 'employee').map(m => String(m.crm_user_id));
      const nm = {};
      team.forEach(m => { nm[String(m.crm_user_id)] = m.display_name || String(m.crm_user_id); });
      setNameMap(nm);
      setEntries(await getPendingScheduleEntries(empIds));
    } catch (e) { Alert.alert('خطأ', e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const handleApprove = async (entry) => {
    setActing(entry.id + '-approve');
    try { await approveScheduleEntry(entry.id); load(); }
    catch (e) { Alert.alert('خطأ', e.message); }
    finally { setActing(null); }
  };

  const handleReject = (entry) => {
    Alert.prompt('سبب الرفض', 'اكتب سبب الرفض للموظف', async (reason) => {
      if (!reason) return;
      setActing(entry.id + '-reject');
      try { await rejectScheduleEntry(entry.id, reason); load(); }
      catch (e) { Alert.alert('خطأ', e.message); }
      finally { setActing(null); }
    }, 'plain-text');
  };

  if (loading) return <LoadingScreen />;
  return (
    <FlatList
      data={entries}
      keyExtractor={i => i.id}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={['#1565C0']} />}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Ionicons name="calendar-outline" size={48} color="#ccc" />
          <Text style={styles.emptyText}>لا توجد خطط بانتظار الاعتماد</Text>
        </View>
      }
      renderItem={({ item }) => {
        const dayName = DAYS_AR[new Date(item.date).getDay()];
        const emp = nameMap[String(item.crm_user_id)] || item.crm_user_id;
        return (
          <Card style={styles.reqCard}>
            <View style={styles.reqHeader}>
              <View style={styles.reqLeft}>
                <Text style={styles.reqTitle}>{emp}</Text>
                <Text style={styles.reqSub}>{dayName} {item.date}</Text>
              </View>
              <View style={[styles.typePill, { backgroundColor: TYPE_COLORS[item.type] }]}>
                <Text style={styles.typePillText}>{TYPE_LABELS[item.type]}</Text>
              </View>
            </View>
            {item.client_name ? (
              <View style={styles.detailRow}>
                <Ionicons name="location-outline" size={13} color="#888" />
                <Text style={styles.detailText}>{item.client_name}</Text>
              </View>
            ) : null}
            {item.vacation_type ? (
              <Text style={styles.detailText}>نوع الإجازة: {item.vacation_type}</Text>
            ) : null}
            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.approveBtn]}
                onPress={() => handleApprove(item)}
                disabled={!!acting}
              >
                {acting === item.id + '-approve'
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <><Ionicons name="checkmark-outline" size={15} color="#fff" /><Text style={styles.actionText}>اعتماد</Text></>
                }
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.rejectBtn]}
                onPress={() => handleReject(item)}
                disabled={!!acting}
              >
                {acting === item.id + '-reject'
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <><Ionicons name="close-outline" size={15} color="#fff" /><Text style={styles.actionText}>رفض</Text></>
                }
              </TouchableOpacity>
            </View>
          </Card>
        );
      }}
    />
  );
}

// ── Schedule Modification Tab ─────────────────────────────────────────────────

function ScheduleModTab({ userId }) {
  const [mods, setMods]         = useState([]);
  const [nameMap, setNameMap]   = useState({});
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [acting, setActing]     = useState(null);

  const load = useCallback(async () => {
    try {
      const [members, myRec] = await Promise.all([getTeamMembers(), getMyTeamRecord(userId)]);
      const role = myRec?.role || 'admin';
      let team = role === 'manager'
        ? members.filter(m => m.team_id === myRec.team_id)
        : members;
      const empIds = team.filter(m => m.role === 'employee').map(m => String(m.crm_user_id));
      const nm = {};
      team.forEach(m => { nm[String(m.crm_user_id)] = m.display_name || String(m.crm_user_id); });
      setNameMap(nm);
      setMods(await getPendingModifications(empIds));
    } catch (e) { Alert.alert('خطأ', e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const handleApprove = async (mod) => {
    setActing(mod.id + '-approve');
    try { await approveModificationRequest(mod); load(); }
    catch (e) { Alert.alert('خطأ', e.message); }
    finally { setActing(null); }
  };

  const handleReject = (mod) => {
    Alert.prompt('سبب الرفض', '', async (reason) => {
      if (!reason) return;
      setActing(mod.id + '-reject');
      try { await rejectModificationRequest(mod.id, reason); load(); }
      catch (e) { Alert.alert('خطأ', e.message); }
      finally { setActing(null); }
    }, 'plain-text');
  };

  if (loading) return <LoadingScreen />;
  return (
    <FlatList
      data={mods}
      keyExtractor={i => i.id}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={['#1565C0']} />}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Ionicons name="create-outline" size={48} color="#ccc" />
          <Text style={styles.emptyText}>لا توجد طلبات تعديل</Text>
        </View>
      }
      renderItem={({ item }) => {
        const dayName = DAYS_AR[new Date(item.date).getDay()];
        const emp = item.employee_name || nameMap[String(item.crm_user_id)] || item.crm_user_id;
        return (
          <Card style={styles.reqCard}>
            <View style={styles.reqHeader}>
              <View style={styles.reqLeft}>
                <Text style={styles.reqTitle}>{emp}</Text>
                <Text style={styles.reqSub}>{dayName} {item.date}</Text>
              </View>
              <View style={[styles.typePill, { backgroundColor: TYPE_COLORS[item.type] }]}>
                <Text style={styles.typePillText}>{TYPE_LABELS[item.type]}</Text>
              </View>
            </View>
            {item.client_name ? (
              <View style={styles.detailRow}>
                <Ionicons name="location-outline" size={13} color="#888" />
                <Text style={styles.detailText}>{item.client_name}</Text>
              </View>
            ) : null}
            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.approveBtn]}
                onPress={() => handleApprove(item)}
                disabled={!!acting}
              >
                {acting === item.id + '-approve'
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <><Ionicons name="checkmark-outline" size={15} color="#fff" /><Text style={styles.actionText}>اعتماد التعديل</Text></>
                }
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.rejectBtn]}
                onPress={() => handleReject(item)}
                disabled={!!acting}
              >
                {acting === item.id + '-reject'
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <><Ionicons name="close-outline" size={15} color="#fff" /><Text style={styles.actionText}>رفض</Text></>
                }
              </TouchableOpacity>
            </View>
          </Card>
        );
      }}
    />
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function ApprovalsScreen({ navigation }) {
  const { lang } = useLang();
  const { isDemo, user } = useAuth();
  const userId = user?.userId != null ? String(user.userId) : String(user?.id ?? '');
  const [activeTab, setActiveTab] = useState('schedule');

  const tabs = [
    { key: 'schedule',     label: 'اعتماد الخطة',    icon: 'calendar-outline' },
    { key: 'schedule_mod', label: 'تعديل الخطة',     icon: 'create-outline' },
    { key: 'plans',        label: lang === 'ar' ? 'الخطط' : 'Plans', icon: 'document-text-outline' },
    { key: 'units',        label: lang === 'ar' ? 'الوحدات' : 'Units', icon: 'cube-outline' },
  ];

  return (
    <View style={styles.root}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll} contentContainerStyle={styles.tabsRow}>
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
      </ScrollView>

      {activeTab === 'schedule'     && <ScheduleApprovalTab userId={userId} />}
      {activeTab === 'schedule_mod' && <ScheduleModTab userId={userId} />}
      {activeTab === 'plans'        && <PlansTab lang={lang} navigation={navigation} />}
      {activeTab === 'units'        && <UnitsTab lang={lang} isDemo={isDemo} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F5F7FA' },
  tabsScroll: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E8EEF8', flexGrow: 0 },
  tabsRow: { flexDirection: 'row', paddingHorizontal: 4 },
  tabBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, paddingHorizontal: 14, gap: 5,
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabBtnActive: { borderBottomColor: '#1565C0' },
  tabBtnText: { fontSize: 13, color: '#888', fontWeight: '500' },
  tabBtnTextActive: { color: '#1565C0', fontWeight: '700' },
  typePill: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  typePillText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  detailText: { fontSize: 12, color: '#666' },
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
