import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity,
  Modal, FlatList, Animated, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../api/client';
import { getDashboardStats } from '../api/projects';
import { getMyOverview, getStageCards } from '../api/dashboard';
import { useAuth } from '../context/AuthContext';
import { DEMO_STATS } from '../api/demoData';
import { useLang } from '../context/LangContext';
import { t } from '../i18n';
import { extractData } from '../utils/helpers';
import LoadingScreen from '../components/LoadingScreen';
import ErrorMessage from '../components/ErrorMessage';
import ProgressBar from '../components/ProgressBar';

// ─── Helpers ────────────────────────────────────────────────────────────────

function g(obj, ...keys) {
  for (const k of keys) {
    if (obj?.[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return undefined;
}

// ─── Stage colors pool ────────────────────────────────────────────────────

const STAGE_COLORS = [
  '#1565C0', '#0288D1', '#00838F', '#00897B',
  '#2E7D32', '#558B2F', '#6A1B9A', '#AD1457',
];
const COMPLETED_COLOR = '#2E7D32';
const RETURNED_COLOR  = '#C62828';
const UNASSIGNED_COLOR = '#E65100';

function stageColor(index, name = '') {
  const n = (name || '').trim();
  if (n.includes('منته') || n.includes('انته')) return COMPLETED_COLOR;
  if (n.includes('مرتجع') || n.includes('ارتجع')) return RETURNED_COLOR;
  if (n.includes('غير مسند') || n.includes('unassigned')) return UNASSIGNED_COLOR;
  return STAGE_COLORS[index % STAGE_COLORS.length];
}

function stageIcon(name = '') {
  const n = (name || '').trim();
  if (n.includes('مكالم')) return 'call-outline';
  if (n.includes('تحليل')) return 'analytics-outline';
  if (n.includes('بيانات')) return 'server-outline';
  if (n.includes('تنفيذ')) return 'build-outline';
  if (n.includes('محاكاة')) return 'play-circle-outline';
  if (n.includes('تدريب')) return 'school-outline';
  if (n.includes('تجريبي')) return 'flask-outline';
  if (n.includes('فعلي')) return 'checkmark-done-outline';
  if (n.includes('منته') || n.includes('انته')) return 'trophy-outline';
  if (n.includes('مرتجع')) return 'arrow-undo-outline';
  if (n.includes('غير مسند')) return 'person-add-outline';
  return 'layers-outline';
}

// ─── Extract stage array from various response shapes ─────────────────────

function parseStages(raw) {
  if (!raw) return [];
  const d = raw?.data ?? raw;
  if (Array.isArray(d)) return d;
  const keys = ['stages', 'stageCards', 'stage_cards', 'items', 'result'];
  for (const k of keys) {
    if (Array.isArray(d?.[k])) return d[k];
  }
  return [];
}

function parseOverview(raw) {
  if (!raw) return null;
  return raw?.data ?? raw;
}

function stageName(item) {
  return g(item, 'stageName', 'stage_name', 'name', 'stage', 'title', 'label') || '';
}
function stageCount(item) {
  return g(item, 'count', 'systemCount', 'system_count', 'total', 'totalCount') ?? 0;
}
function stageWeight(item) {
  return g(item, 'weight', 'weightPercent', 'weight_percent', 'percentage') ?? null;
}
function stageSystems(item) {
  const arr = g(item, 'systems', 'items', 'projectSystems', 'project_systems', 'scopes') ?? [];
  return Array.isArray(arr) ? arr : [];
}

function systemClient(s) {
  return g(s, 'clientName', 'client_name', 'accountName', 'account_name', 'customerName', 'customer_name') || '';
}
function systemName(s) {
  return g(s, 'systemName', 'system_name', 'scopeName', 'scope_name', 'projectName', 'project_name', 'title', 'name') || '';
}
function systemImplementer(s) {
  return g(s, 'implementerName', 'implementer_name', 'userName', 'user_name', 'assigneeName') || '';
}
function systemCompletion(s) {
  const v = g(s, 'completionPct', 'completion_pct', 'completionPercent', 'completion', 'progress', 'progressPercent');
  if (v == null) return null;
  return typeof v === 'number' ? v : parseFloat(v) || null;
}

// ─── Workload ────────────────────────────────────────────────────────────

const WORKLOAD_MAP = {
  LOW:    { label: 'حمل منخفض',  color: '#2E7D32', bg: '#E8F5E9', icon: 'leaf-outline' },
  NORMAL: { label: 'حمل طبيعي',  color: '#1565C0', bg: '#E3F2FD', icon: 'checkmark-circle-outline' },
  HIGH:   { label: 'حمل مرتفع',  color: '#E65100', bg: '#FFF3E0', icon: 'warning-outline' },
  OVER:   { label: 'تجاوز الطاقة', color: '#C62828', bg: '#FFEBEE', icon: 'alert-circle-outline' },
};

// ─── Sub-components ─────────────────────────────────────────────────────────

function StatCard({ icon, label, value, color, onPress }) {
  return (
    <TouchableOpacity style={[styles.statCard, { borderLeftColor: color }]} onPress={onPress} activeOpacity={onPress ? 0.7 : 1}>
      <View style={[styles.statIcon, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <View style={styles.statInfo}>
        <Text style={styles.statValue}>{value ?? '—'}</Text>
        <Text style={styles.statLabel}>{label}</Text>
      </View>
    </TouchableOpacity>
  );
}

function KpiCard({ icon, label, value, unit, color }) {
  return (
    <View style={[styles.kpiCard, { borderTopColor: color }]}>
      <View style={[styles.kpiIconWrap, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={[styles.kpiValue, { color }]}>{value ?? '—'}{unit ? <Text style={styles.kpiUnit}> {unit}</Text> : null}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  );
}

function StageCard({ item, index, onPress }) {
  const name  = stageName(item);
  const count = stageCount(item);
  const wt    = stageWeight(item);
  const color = stageColor(index, name);
  const icon  = stageIcon(name);
  return (
    <TouchableOpacity style={[styles.stageCard, { borderTopColor: color }]} onPress={onPress} activeOpacity={0.8}>
      <View style={[styles.stageIconWrap, { backgroundColor: color + '1A' }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Text style={[styles.stageCount, { color }]}>{count}</Text>
      <Text style={styles.stageName} numberOfLines={2}>{name || '—'}</Text>
      {wt != null && (
        <View style={[styles.stageBadge, { backgroundColor: color + '22' }]}>
          <Text style={[styles.stageBadgeText, { color }]}>{wt}%</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

function SystemRow({ item }) {
  const pct  = systemCompletion(item);
  const impl = systemImplementer(item);
  return (
    <View style={styles.sysRow}>
      <View style={styles.sysMain}>
        <Text style={styles.sysClient} numberOfLines={1}>{systemClient(item)}</Text>
        <Text style={styles.sysName} numberOfLines={1}>{systemName(item)}</Text>
        {impl ? <Text style={styles.sysImpl} numberOfLines={1}>👤 {impl}</Text> : null}
      </View>
      {pct != null && (
        <View style={styles.sysPct}>
          <Text style={[styles.sysPctText, { color: pct >= 85 ? '#2E7D32' : pct >= 50 ? '#1565C0' : '#E65100' }]}>
            {Math.round(pct)}%
          </Text>
          <View style={styles.sysPctBar}>
            <View style={[styles.sysPctFill, { width: `${Math.min(100, pct)}%`, backgroundColor: pct >= 85 ? '#2E7D32' : '#1565C0' }]} />
          </View>
        </View>
      )}
    </View>
  );
}

function NearCompletionCard({ item }) {
  const pct = systemCompletion(item);
  return (
    <View style={styles.nearCard}>
      <View style={styles.nearInfo}>
        <Text style={styles.nearClient} numberOfLines={1}>{systemClient(item)}</Text>
        <Text style={styles.nearName} numberOfLines={1}>{systemName(item)}</Text>
      </View>
      <View style={styles.nearPct}>
        <Text style={styles.nearPctText}>{pct != null ? Math.round(pct) + '%' : '—'}</Text>
      </View>
    </View>
  );
}

function VisitRow({ item }) {
  const date    = g(item, 'visitDate', 'visit_date', 'date', 'scheduledDate', 'scheduled_date') || '';
  const client  = g(item, 'clientName', 'client_name', 'accountName', 'account_name') || '';
  const sysname = g(item, 'systemName', 'system_name', 'scopeName', 'scope_name') || '';
  const disp = date ? new Date(date).toLocaleDateString('ar-EG', { weekday: 'short', day: '2-digit', month: 'short' }) : '';
  return (
    <View style={styles.visitRow}>
      <View style={styles.visitDate}>
        <Text style={styles.visitDateText}>{disp}</Text>
      </View>
      <View style={styles.visitInfo}>
        <Text style={styles.visitClient} numberOfLines={1}>{client}</Text>
        {sysname ? <Text style={styles.visitSys} numberOfLines={1}>{sysname}</Text> : null}
      </View>
    </View>
  );
}

function StaleRow({ item }) {
  const days = g(item, 'daysSinceActivity', 'days_since_activity', 'stagnantDays', 'stale_days', 'idleDays') ?? '—';
  return (
    <View style={styles.staleRow}>
      <View style={styles.staleInfo}>
        <Text style={styles.staleClient} numberOfLines={1}>{systemClient(item)}</Text>
        <Text style={styles.staleName} numberOfLines={1}>{systemName(item)}</Text>
      </View>
      <View style={styles.staleDays}>
        <Ionicons name="time-outline" size={14} color="#C62828" />
        <Text style={styles.staleDaysText}>{days} يوم</Text>
      </View>
    </View>
  );
}

// ─── Main screen ────────────────────────────────────────────────────────────

export default function DashboardScreen({ navigation }) {
  const { user, isDemo } = useAuth();
  const { lang } = useLang();

  const [stats, setStats]       = useState(null);
  const [overview, setOverview] = useState(null);
  const [stages, setStages]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const [selectedStage, setSelectedStage] = useState(null);
  const slideAnim = useRef(new Animated.Value(500)).current;

  const openStageModal = (item) => {
    setSelectedStage(item);
    Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
  };
  const closeStageModal = () => {
    Animated.timing(slideAnim, { toValue: 500, duration: 220, useNativeDriver: true }).start(() => setSelectedStage(null));
  };

  const load = useCallback(async () => {
    if (isDemo) {
      setStats(DEMO_STATS);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const [statsRes, overviewRes, stagesRes] = await Promise.allSettled([
        getDashboardStats(),
        getMyOverview(),
        getStageCards(),
      ]);

      if (statsRes.status === 'fulfilled')   setStats(extractData(statsRes.value));
      if (overviewRes.status === 'fulfilled') setOverview(parseOverview(overviewRes.value?.data ?? overviewRes.value));
      if (stagesRes.status === 'fulfilled')  setStages(parseStages(stagesRes.value?.data ?? stagesRes.value));

      // DEBUG — check project fields with pagination
      try {
        const pr = await api.post('/Project/GetAll', { pageNo: 1, pageSize: 5 });
        const list = pr?.data?.data ?? [];
        const first = list[0];
        if (first) {
          Alert.alert('DEBUG project keys', Object.keys(first).join('\n'));
        } else {
          Alert.alert('DEBUG empty', JSON.stringify(pr?.data).slice(0,300));
        }
      } catch(e) {
        Alert.alert('DEBUG error', e?.response?.status + ' ' + e?.message);
      }

      setError(null);
    } catch (e) {
      setError(e?.response?.data?.message || t('networkError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isDemo]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  if (loading) return <LoadingScreen />;
  if (error && !stats && !overview) return <ErrorMessage message={error} onRetry={load} />;

  const greeting = lang === 'ar'
    ? `مرحباً، ${user?.fullName || user?.userName || 'مستخدم'}`
    : `Hello, ${user?.fullName || user?.userName || 'User'}`;

  // ─── Overview field extraction ──────────────────────────────────────────
  const kpiActive    = g(overview, 'activeSystems', 'active_systems', 'activeSystemsCount');
  const kpiAvgComp   = g(overview, 'avgCompletionPercent', 'avg_completion_percent', 'avgCompletion', 'avg_completion');
  const kpiVisits    = g(overview, 'visitsThisWeek', 'visits_this_week', 'weekVisits');
  const kpiTasks     = g(overview, 'openTasksCount', 'open_tasks_count', 'openTasks', 'open_tasks');
  const kpiReturned  = g(overview, 'returnedSystemsCount', 'returned_systems_count', 'returnedSystems');
  const workloadRaw  = g(overview, 'workload', 'workloadLevel', 'workload_level');
  const workloadLevel = typeof workloadRaw === 'object' ? g(workloadRaw, 'level', 'Level', 'status') : workloadRaw;
  const workload     = WORKLOAD_MAP[String(workloadLevel || '').toUpperCase()] || null;

  const nearCompletion = (() => {
    const arr = g(overview, 'nearCompletion', 'near_completion', 'nearCompletionSystems', 'nearCompletionItems');
    return Array.isArray(arr) ? arr : [];
  })();
  const staleSystems = (() => {
    const arr = g(overview, 'staleSystems', 'stale_systems', 'stagnantSystems', 'idleSystems');
    return Array.isArray(arr) ? arr : [];
  })();
  const upcomingVisits = (() => {
    const arr = g(overview, 'upcomingVisits', 'upcoming_visits', 'nextVisits', 'next_visits');
    return Array.isArray(arr) ? arr : [];
  })();

  const hasOverview   = overview !== null;
  const hasStages     = stages.length > 0;

  return (
    <>
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1565C0']} />}
      >
        {/* Greeting */}
        <View style={styles.greetingCard}>
          <View style={styles.greetingLeft}>
            <Text style={styles.greeting}>{greeting}</Text>
            <Text style={styles.greetingSub}>لوحة التنفيذ</Text>
          </View>
          <View style={styles.greetingIcon}>
            <Ionicons name="speedometer-outline" size={32} color="#fff" />
          </View>
        </View>

        {/* ── كروت المراحل ──────────────────────────────────────────── */}
        {hasStages && (
          <>
            <Text style={styles.sectionTitle}>كروت المراحل</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stagesScroll}>
              {stages.map((item, idx) => (
                <StageCard
                  key={idx}
                  item={item}
                  index={idx}
                  onPress={() => openStageModal(item)}
                />
              ))}
            </ScrollView>
          </>
        )}

        {/* ── KPIs من my-overview ────────────────────────────────────── */}
        {hasOverview && (
          <>
            <Text style={styles.sectionTitle}>مؤشراتي</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.kpiScroll}>
              <KpiCard icon="layers-outline"            label="أنظمة نشطة"       value={kpiActive}                    color="#1565C0" />
              <KpiCard icon="stats-chart-outline"       label="متوسط الإنجاز"    value={kpiAvgComp != null ? Math.round(kpiAvgComp) : null} unit="%" color="#2E7D32" />
              <KpiCard icon="car-outline"               label="زيارات الأسبوع"   value={kpiVisits}                    color="#6A1B9A" />
              <KpiCard icon="checkbox-outline"          label="مهام مفتوحة"      value={kpiTasks}                     color="#E65100" />
              {kpiReturned != null && (
                <KpiCard icon="arrow-undo-circle-outline" label="أنظمة مرتجعة" value={kpiReturned} color="#C62828" />
              )}
            </ScrollView>
          </>
        )}

        {/* ── Workload ────────────────────────────────────────────────── */}
        {workload && (
          <View style={[styles.workloadBanner, { backgroundColor: workload.bg }]}>
            <Ionicons name={workload.icon} size={20} color={workload.color} />
            <Text style={[styles.workloadText, { color: workload.color }]}>{workload.label}</Text>
          </View>
        )}

        {/* ── الأقرب للإنجاز (85-99%) ─────────────────────────────────── */}
        {nearCompletion.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>الأقرب للإنجاز</Text>
            <View style={styles.listCard}>
              {nearCompletion.map((item, i) => <NearCompletionCard key={i} item={item} />)}
            </View>
          </>
        )}

        {/* ── زياراتي القادمة ────────────────────────────────────────── */}
        {upcomingVisits.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>زياراتي القادمة</Text>
            <View style={styles.listCard}>
              {upcomingVisits.map((item, i) => <VisitRow key={i} item={item} />)}
            </View>
          </>
        )}

        {/* ── أنظمة راكدة ─────────────────────────────────────────────── */}
        {staleSystems.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>أنظمة راكدة 🔴</Text>
            <View style={styles.listCard}>
              {staleSystems.map((item, i) => <StaleRow key={i} item={item} />)}
            </View>
          </>
        )}

        {/* ── إحصائيات المشاريع (fallback) ────────────────────────────── */}
        {stats && (
          <>
            <Text style={styles.sectionTitle}>إحصائيات المشاريع</Text>
            <View style={styles.statsGrid}>
              <StatCard
                icon="folder-open-outline"
                label={t('totalProjects')}
                value={stats?.totalProjects}
                color="#1565C0"
                onPress={() => navigation.navigate('Projects')}
              />
              <StatCard
                icon="play-circle-outline"
                label={t('activeProjects')}
                value={stats?.activeProjects}
                color="#F57C00"
                onPress={() => navigation.navigate('Projects', { statusId: 1 })}
              />
              <StatCard
                icon="checkmark-circle-outline"
                label={t('completedProjects')}
                value={stats?.completedProjects}
                color="#388E3C"
                onPress={() => navigation.navigate('Projects', { statusId: 3 })}
              />
              <StatCard
                icon="time-outline"
                label={t('pendingApprovals')}
                value={stats?.pendingApprovals}
                color="#9C27B0"
                onPress={() => navigation.navigate('Approvals')}
              />
            </View>
          </>
        )}

        {/* Overall Progress */}
        {stats?.overallProgress !== undefined && (
          <View style={styles.progressCard}>
            <ProgressBar value={stats.overallProgress} color="#1565C0" />
          </View>
        )}

        {/* Recent Projects */}
        {stats?.recentProjects?.length > 0 && (
          <>
            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>{lang === 'ar' ? 'أحدث المشاريع' : 'Recent Projects'}</Text>
              <TouchableOpacity onPress={() => navigation.navigate('Projects')}>
                <Text style={styles.seeAll}>{lang === 'ar' ? 'عرض الكل' : 'See All'}</Text>
              </TouchableOpacity>
            </View>
            {stats.recentProjects.map((p) => (
              <TouchableOpacity
                key={p.id}
                style={styles.recentCard}
                onPress={() => navigation.navigate('ProjectDetail', { projectId: p.id, title: p.title })}
                activeOpacity={0.7}
              >
                <View style={styles.recentLeft}>
                  <Text style={styles.recentTitle} numberOfLines={1}>{p.title}</Text>
                  <Text style={styles.recentSub}>{p.branch?.name || ''}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#bbb" />
              </TouchableOpacity>
            ))}
          </>
        )}
      </ScrollView>

      {/* ── Stage Detail Modal ─────────────────────────────────────────── */}
      <Modal
        visible={selectedStage !== null}
        transparent
        animationType="none"
        onRequestClose={closeStageModal}
      >
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={closeStageModal}>
          <Animated.View style={[styles.modalSheet, { transform: [{ translateY: slideAnim }] }]}>
            <TouchableOpacity activeOpacity={1}>
              <View style={styles.modalHandle} />
              {selectedStage && (() => {
                const name  = stageName(selectedStage);
                const count = stageCount(selectedStage);
                const idx   = stages.indexOf(selectedStage);
                const color = stageColor(idx, name);
                const systems = stageSystems(selectedStage);
                return (
                  <>
                    <View style={[styles.modalHeader, { borderBottomColor: color }]}>
                      <View style={[styles.modalIconWrap, { backgroundColor: color + '1A' }]}>
                        <Ionicons name={stageIcon(name)} size={22} color={color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.modalTitle, { color }]}>{name || 'المرحلة'}</Text>
                        <Text style={styles.modalCount}>{count} {count === 1 ? 'نظام' : 'أنظمة'}</Text>
                      </View>
                      <TouchableOpacity onPress={closeStageModal} style={styles.modalClose}>
                        <Ionicons name="close" size={22} color="#666" />
                      </TouchableOpacity>
                    </View>
                    {systems.length === 0 ? (
                      <View style={styles.modalEmpty}>
                        <Ionicons name="checkmark-circle-outline" size={40} color="#ccc" />
                        <Text style={styles.modalEmptyText}>لا توجد أنظمة محملة</Text>
                        <Text style={styles.modalEmptyHint}>العدد: {count}</Text>
                      </View>
                    ) : (
                      <FlatList
                        data={systems}
                        keyExtractor={(_, i) => i.toString()}
                        renderItem={({ item }) => <SystemRow item={item} />}
                        contentContainerStyle={{ paddingBottom: 24 }}
                        showsVerticalScrollIndicator={false}
                      />
                    )}
                  </>
                );
              })()}
            </TouchableOpacity>
          </Animated.View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F5F7FA' },
  content: { padding: 16, paddingBottom: 40 },

  greetingCard: {
    backgroundColor: '#1565C0', borderRadius: 16, padding: 20, marginBottom: 20,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  greetingLeft: { flex: 1 },
  greeting:    { fontSize: 18, fontWeight: '700', color: '#fff' },
  greetingSub: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  greetingIcon: { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: 8 },

  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1a1a1a', marginBottom: 10, marginTop: 4 },
  sectionRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, marginTop: 4 },
  seeAll:       { color: '#1565C0', fontSize: 13, fontWeight: '600' },

  // ── Stage cards
  stagesScroll: { paddingRight: 16, paddingBottom: 4, gap: 10 },
  stageCard: {
    width: 110, backgroundColor: '#fff', borderRadius: 14, padding: 12,
    borderTopWidth: 4, alignItems: 'center',
    elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6,
    marginBottom: 8,
  },
  stageIconWrap: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
  stageCount:    { fontSize: 28, fontWeight: '800', lineHeight: 32 },
  stageName:     { fontSize: 11, color: '#444', textAlign: 'center', marginTop: 4, lineHeight: 16 },
  stageBadge:    { marginTop: 6, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  stageBadgeText: { fontSize: 10, fontWeight: '700' },

  // ── KPI strip
  kpiScroll: { paddingRight: 16, gap: 10, paddingBottom: 4 },
  kpiCard: {
    width: 100, backgroundColor: '#fff', borderRadius: 12, padding: 12,
    borderTopWidth: 3, alignItems: 'center',
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4,
    marginBottom: 8,
  },
  kpiIconWrap: { width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
  kpiValue:    { fontSize: 22, fontWeight: '800' },
  kpiUnit:     { fontSize: 12, fontWeight: '600' },
  kpiLabel:    { fontSize: 10, color: '#666', textAlign: 'center', marginTop: 2, lineHeight: 14 },

  // ── Workload
  workloadBanner: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 10, padding: 12,
    marginBottom: 16, gap: 8,
    elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3,
  },
  workloadText: { fontSize: 14, fontWeight: '700' },

  // ── List cards (near completion, visits, stale)
  listCard: {
    backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden', marginBottom: 16,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4,
  },
  nearCard:  { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  nearInfo:  { flex: 1 },
  nearClient: { fontSize: 12, color: '#888', marginBottom: 1 },
  nearName:   { fontSize: 14, fontWeight: '600', color: '#222' },
  nearPct:    { marginLeft: 12 },
  nearPctText: { fontSize: 18, fontWeight: '800', color: '#2E7D32' },

  visitRow:   { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  visitDate:  { backgroundColor: '#E3F2FD', borderRadius: 8, padding: 8, marginRight: 12, minWidth: 70, alignItems: 'center' },
  visitDateText: { fontSize: 11, color: '#1565C0', fontWeight: '700', textAlign: 'center' },
  visitInfo:  { flex: 1 },
  visitClient: { fontSize: 14, fontWeight: '600', color: '#222' },
  visitSys:   { fontSize: 12, color: '#666', marginTop: 2 },

  staleRow:   { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  staleInfo:  { flex: 1 },
  staleClient: { fontSize: 12, color: '#888', marginBottom: 1 },
  staleName:  { fontSize: 14, fontWeight: '600', color: '#222' },
  staleDays:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  staleDaysText: { fontSize: 12, color: '#C62828', fontWeight: '700' },

  // ── Classic stat cards
  statsGrid:  { gap: 10, marginBottom: 8 },
  statCard:   {
    backgroundColor: '#fff', borderRadius: 12, padding: 16, flexDirection: 'row',
    alignItems: 'center', borderLeftWidth: 4,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4,
  },
  statIcon:  { width: 44, height: 44, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  statInfo:  { flex: 1 },
  statValue: { fontSize: 24, fontWeight: '800', color: '#1a1a1a' },
  statLabel: { fontSize: 12, color: '#666', marginTop: 2 },

  progressCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 8,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4,
  },
  recentCard: {
    backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 8,
    flexDirection: 'row', alignItems: 'center',
    elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3,
  },
  recentLeft:  { flex: 1 },
  recentTitle: { fontSize: 14, fontWeight: '600', color: '#222' },
  recentSub:   { fontSize: 12, color: '#888', marginTop: 2 },

  // ── Stage detail modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet:   {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: '80%', minHeight: 300,
  },
  modalHandle: {
    width: 40, height: 4, backgroundColor: '#ddd', borderRadius: 2,
    alignSelf: 'center', marginTop: 10, marginBottom: 4,
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12,
    borderBottomWidth: 2, marginBottom: 4,
  },
  modalIconWrap: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  modalTitle:    { fontSize: 18, fontWeight: '800' },
  modalCount:    { fontSize: 13, color: '#666', marginTop: 2 },
  modalClose:    { padding: 6 },

  modalEmpty: { alignItems: 'center', paddingVertical: 32, gap: 8 },
  modalEmptyText: { fontSize: 15, color: '#888', fontWeight: '600' },
  modalEmptyHint: { fontSize: 12, color: '#aaa' },

  // System row inside modal
  sysRow:  { padding: 14, borderBottomWidth: 1, borderBottomColor: '#F0F0F0', flexDirection: 'row', alignItems: 'center' },
  sysMain: { flex: 1 },
  sysClient: { fontSize: 11, color: '#888', marginBottom: 1 },
  sysName:   { fontSize: 14, fontWeight: '700', color: '#1a1a1a' },
  sysImpl:   { fontSize: 11, color: '#1565C0', marginTop: 3 },
  sysPct:    { alignItems: 'flex-end', minWidth: 52 },
  sysPctText: { fontSize: 16, fontWeight: '800', marginBottom: 4 },
  sysPctBar:  { width: 48, height: 4, backgroundColor: '#EEE', borderRadius: 2, overflow: 'hidden' },
  sysPctFill: { height: 4, borderRadius: 2 },
});
