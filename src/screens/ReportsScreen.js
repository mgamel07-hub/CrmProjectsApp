import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import {
  getMyPerformanceProcess, getMyPerformanceTasks,
  getPlanItemsSummary, getPlanItemsTotals,
  getTeamPerformanceProcess, getTeamPerformanceTasks,
  getProjectDashboardStats,
} from '../api/reports';
import { extractData, extractList } from '../utils/helpers';
import ProgressBar from '../components/ProgressBar';

// ─── helpers ────────────────────────────────────────────────────────────────

function num(v) { return typeof v === 'number' ? v : (Number(v) || 0); }

function getPeriodDates(period) {
  const now   = new Date();
  const today = now.toISOString().split('T')[0];
  if (period === 'week') {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return { from: d.toISOString().split('T')[0], to: today };
  }
  if (period === 'month') {
    return { from: `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`, to: today };
  }
  // quarter
  const q  = Math.floor(now.getMonth() / 3);
  const qm = q * 3;
  return { from: `${now.getFullYear()}-${String(qm+1).padStart(2,'0')}-01`, to: today };
}

// ─── sub-components ─────────────────────────────────────────────────────────

function StatRow({ icon, label, value, color = '#1565C0', sub }) {
  return (
    <View style={styles.statRow}>
      <View style={[styles.statIcon, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <View style={styles.statInfo}>
        <Text style={styles.statLabel}>{label}</Text>
        {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
      </View>
      <Text style={[styles.statValue, { color }]}>{value ?? '—'}</Text>
    </View>
  );
}

function SectionCard({ title, icon, children, color = '#1565C0' }) {
  return (
    <View style={styles.card}>
      <View style={[styles.cardHeader, { borderLeftColor: color }]}>
        <Ionicons name={icon} size={18} color={color} />
        <Text style={[styles.cardTitle, { color }]}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function PeriodFilter({ value, onChange, lang }) {
  const opts = [
    { key: 'week',    label: lang === 'ar' ? 'الأسبوع' : 'Week'    },
    { key: 'month',   label: lang === 'ar' ? 'الشهر'   : 'Month'   },
    { key: 'quarter', label: lang === 'ar' ? 'الربع'   : 'Quarter' },
  ];
  return (
    <View style={styles.periodRow}>
      {opts.map((o) => (
        <TouchableOpacity
          key={o.key}
          style={[styles.periodBtn, value === o.key && styles.periodBtnActive]}
          onPress={() => onChange(o.key)}
        >
          <Text style={[styles.periodText, value === o.key && styles.periodTextActive]}>
            {o.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function TeamUserRow({ item }) {
  const name     = item.fullName || item.FullName || item.userName || item.name || '—';
  const done     = num(item.doneCount  || item.completedCount || item.done);
  const total    = num(item.totalCount || item.total);
  const pct      = total > 0 ? Math.round((done / total) * 100) : num(item.percentage || item.progress);
  return (
    <View style={styles.teamRow}>
      <View style={styles.teamAvatar}>
        <Text style={styles.teamAvatarText}>{name[0]?.toUpperCase() || '?'}</Text>
      </View>
      <View style={styles.teamInfo}>
        <Text style={styles.teamName} numberOfLines={1}>{name}</Text>
        <ProgressBar value={pct} color="#1565C0" height={5} />
      </View>
      <Text style={styles.teamPct}>{pct}%</Text>
    </View>
  );
}

// ─── main screen ────────────────────────────────────────────────────────────

export default function ReportsScreen() {
  const { profile } = useAuth();
  const { lang }    = useLang();

  const isManager = profile?.isAdmin || profile?.isManager ||
    ['manager','admin','مدير','مشرف'].some(r =>
      (profile?.roleName || '').toLowerCase().includes(r)
    );

  const [period,      setPeriod]      = useState('month');
  const [refreshing,  setRefreshing]  = useState(false);
  const [loading,     setLoading]     = useState(true);

  const [myProcess,   setMyProcess]   = useState(null);
  const [myTasks,     setMyTasks]     = useState(null);
  const [planSummary, setPlanSummary] = useState(null);
  const [planTotals,  setPlanTotals]  = useState(null);
  const [projStats,   setProjStats]   = useState(null);
  const [teamProc,    setTeamProc]    = useState([]);
  const [teamTasks,   setTeamTasks]   = useState([]);

  const load = useCallback(async () => {
    const { from, to } = getPeriodDates(period);
    const params = { dateFrom: from, dateTo: to, fromDate: from, toDate: to,
                     startDate: from, endDate: to, from, to };

    const calls = [
      getMyPerformanceProcess(params).catch(() => null),
      getMyPerformanceTasks(params).catch(() => null),
      getPlanItemsSummary(params).catch(() => null),
      getPlanItemsTotals(params).catch(() => null),
      getProjectDashboardStats().catch(() => null),
    ];
    if (isManager) {
      calls.push(getTeamPerformanceProcess(params).catch(() => null));
      calls.push(getTeamPerformanceTasks(params).catch(() => null));
    }

    const results = await Promise.all(calls);
    setMyProcess  (extractData(results[0]));
    setMyTasks    (extractData(results[1]));
    setPlanSummary(extractData(results[2]));
    setPlanTotals (extractData(results[3]));
    setProjStats  (extractData(results[4]));
    if (isManager) {
      setTeamProc (extractList(results[5]) || []);
      setTeamTasks(extractList(results[6]) || []);
    }

    setLoading(false);
    setRefreshing(false);
  }, [period, isManager]);

  useEffect(() => { setLoading(true); load(); }, [period]);

  const onRefresh = () => { setRefreshing(true); load(); };

  // Normalise my-performance object (handles various field name styles)
  const p = myProcess || {};
  const t = myTasks   || {};
  const s = planSummary || {};
  const tot = planTotals || {};
  const ps  = projStats  || {};

  const myDone      = num(p.doneCount    || p.completedCount || p.done    || p.completed);
  const myPending   = num(p.pendingCount || p.inProgressCount|| p.pending || p.inProgress);
  const myTotal     = num(p.totalCount   || p.total)         || (myDone + myPending);
  const myPct       = myTotal > 0 ? Math.round((myDone/myTotal)*100) : num(p.percentage||p.progress||p.pct);

  const taskDone    = num(t.doneCount    || t.completedCount || t.done);
  const taskPending = num(t.pendingCount || t.inProgressCount|| t.pending);
  const taskTotal   = num(t.totalCount   || t.total)         || (taskDone + taskPending);
  const taskPct     = taskTotal > 0 ? Math.round((taskDone/taskTotal)*100) : num(t.percentage||t.pct);

  const planDone    = num(s.doneCount    || s.completedItems || tot.doneCount   || tot.completed);
  const planPending = num(s.pendingCount || s.pendingItems   || tot.pendingCount || tot.pending);
  const planTotal   = num(s.totalCount   || s.totalItems     || tot.totalCount  || tot.total) || (planDone + planPending);
  const planPct     = planTotal > 0 ? Math.round((planDone/planTotal)*100) : num(s.percentage||s.pct||tot.pct);

  if (loading && !refreshing) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1565C0" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1565C0']} />}
    >
      {/* Period filter */}
      <PeriodFilter value={period} onChange={setPeriod} lang={lang} />

      {/* ── Project stats (from existing dashboard) ── */}
      {ps && (ps.totalProjects || ps.activeProjects) ? (
        <SectionCard
          title={lang === 'ar' ? 'إحصائيات المشاريع' : 'Project Stats'}
          icon="folder-open-outline"
          color="#1565C0"
        >
          <StatRow icon="folder-outline"          label={lang==='ar'?'إجمالي المشاريع':'Total Projects'}    value={ps.totalProjects}     color="#1565C0" />
          <StatRow icon="play-circle-outline"     label={lang==='ar'?'المشاريع النشطة':'Active Projects'}   value={ps.activeProjects}    color="#F57C00" />
          <StatRow icon="checkmark-circle-outline"label={lang==='ar'?'المشاريع المنتهية':'Completed'}       value={ps.completedProjects} color="#388E3C" />
          <StatRow icon="time-outline"            label={lang==='ar'?'انتظار الموافقة':'Pending Approvals'} value={ps.pendingApprovals}  color="#9C27B0" />
          {ps.overallProgress !== undefined && (
            <View style={styles.progressWrap}>
              <Text style={styles.progressLabel}>{lang==='ar'?'التقدم العام':'Overall Progress'}</Text>
              <ProgressBar value={num(ps.overallProgress)} color="#1565C0" />
            </View>
          )}
        </SectionCard>
      ) : null}

      {/* ── My process performance ── */}
      <SectionCard
        title={lang === 'ar' ? 'أدائي — المعالجات' : 'My Performance — Processes'}
        icon="bar-chart-outline"
        color="#1565C0"
      >
        {myTotal > 0 || myPct > 0 ? (
          <>
            <StatRow icon="checkmark-done-outline" label={lang==='ar'?'منجز':'Completed'} value={myDone}    color="#388E3C" />
            <StatRow icon="hourglass-outline"      label={lang==='ar'?'قيد التنفيذ':'In Progress'} value={myPending} color="#F57C00" />
            <StatRow icon="list-outline"           label={lang==='ar'?'الإجمالي':'Total'}     value={myTotal}   color="#607D8B" />
            <View style={styles.progressWrap}>
              <Text style={styles.progressLabel}>{myPct}%</Text>
              <ProgressBar value={myPct} color="#1565C0" />
            </View>
          </>
        ) : (
          <Text style={styles.noData}>{lang==='ar'?'لا توجد بيانات للفترة المحددة':'No data for this period'}</Text>
        )}
      </SectionCard>

      {/* ── My tasks performance ── */}
      <SectionCard
        title={lang === 'ar' ? 'أدائي — المهام' : 'My Performance — Tasks'}
        icon="checkbox-outline"
        color="#9C27B0"
      >
        {taskTotal > 0 || taskPct > 0 ? (
          <>
            <StatRow icon="checkmark-done-outline" label={lang==='ar'?'منجز':'Completed'} value={taskDone}    color="#388E3C" />
            <StatRow icon="hourglass-outline"      label={lang==='ar'?'قيد التنفيذ':'Pending'}     value={taskPending} color="#F57C00" />
            <StatRow icon="list-outline"           label={lang==='ar'?'الإجمالي':'Total'}     value={taskTotal}   color="#607D8B" />
            <View style={styles.progressWrap}>
              <Text style={styles.progressLabel}>{taskPct}%</Text>
              <ProgressBar value={taskPct} color="#9C27B0" />
            </View>
          </>
        ) : (
          <Text style={styles.noData}>{lang==='ar'?'لا توجد بيانات للفترة المحددة':'No data for this period'}</Text>
        )}
      </SectionCard>

      {/* ── Plan items summary ── */}
      <SectionCard
        title={lang === 'ar' ? 'بنود الخطط' : 'Plan Items'}
        icon="document-text-outline"
        color="#F57C00"
      >
        {planTotal > 0 || planPct > 0 ? (
          <>
            <StatRow icon="checkmark-done-outline" label={lang==='ar'?'منجز':'Done'}    value={planDone}    color="#388E3C" />
            <StatRow icon="hourglass-outline"      label={lang==='ar'?'معلق':'Pending'} value={planPending} color="#F57C00" />
            <StatRow icon="list-outline"           label={lang==='ar'?'الإجمالي':'Total'} value={planTotal} color="#607D8B" />
            <View style={styles.progressWrap}>
              <Text style={styles.progressLabel}>{planPct}%</Text>
              <ProgressBar value={planPct} color="#F57C00" />
            </View>
          </>
        ) : (
          <Text style={styles.noData}>{lang==='ar'?'لا توجد بيانات للفترة المحددة':'No data for this period'}</Text>
        )}
      </SectionCard>

      {/* ── Manager: team performance ── */}
      {isManager && (
        <>
          <SectionCard
            title={lang === 'ar' ? 'أداء الفريق — معالجات' : 'Team Performance — Processes'}
            icon="people-outline"
            color="#388E3C"
          >
            {teamProc.length > 0 ? (
              teamProc.map((item, i) => <TeamUserRow key={i} item={item} />)
            ) : (
              <Text style={styles.noData}>{lang==='ar'?'لا توجد بيانات':'No data'}</Text>
            )}
          </SectionCard>

          <SectionCard
            title={lang === 'ar' ? 'أداء الفريق — مهام' : 'Team Performance — Tasks'}
            icon="people-circle-outline"
            color="#D32F2F"
          >
            {teamTasks.length > 0 ? (
              teamTasks.map((item, i) => <TeamUserRow key={i} item={item} />)
            ) : (
              <Text style={styles.noData}>{lang==='ar'?'لا توجد بيانات':'No data'}</Text>
            )}
          </SectionCard>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: '#F5F7FA' },
  content: { padding: 12, paddingBottom: 32 },
  center:  { flex: 1, justifyContent: 'center', alignItems: 'center' },

  periodRow: {
    flexDirection: 'row', gap: 8, marginBottom: 14,
    backgroundColor: '#fff', borderRadius: 12, padding: 6,
    elevation: 1, shadowColor: '#000', shadowOffset: { width:0,height:1 }, shadowOpacity: 0.05, shadowRadius: 3,
  },
  periodBtn: {
    flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center',
  },
  periodBtnActive: { backgroundColor: '#1565C0' },
  periodText:      { fontSize: 13, color: '#666', fontWeight: '600' },
  periodTextActive:{ color: '#fff', fontWeight: '700' },

  card: {
    backgroundColor: '#fff', borderRadius: 14, marginBottom: 14, overflow: 'hidden',
    elevation: 2, shadowColor: '#000', shadowOffset: { width:0,height:1 }, shadowOpacity: 0.07, shadowRadius: 4,
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 12,
    borderLeftWidth: 4, borderBottomWidth: 1, borderBottomColor: '#F5F5F5',
  },
  cardTitle: { fontSize: 14, fontWeight: '700' },

  statRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 11,
    borderBottomWidth: 1, borderBottomColor: '#F8F8F8',
  },
  statIcon: { width: 36, height: 36, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  statInfo: { flex: 1 },
  statLabel:{ fontSize: 13, color: '#555', fontWeight: '500' },
  statSub:  { fontSize: 11, color: '#aaa', marginTop: 1 },
  statValue:{ fontSize: 20, fontWeight: '800' },

  progressWrap:  { paddingHorizontal: 16, paddingVertical: 12 },
  progressLabel: { fontSize: 13, color: '#666', fontWeight: '600', marginBottom: 6 },

  noData: { padding: 20, textAlign: 'center', color: '#aaa', fontSize: 13 },

  teamRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#F8F8F8',
  },
  teamAvatar: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: '#1565C0',
    justifyContent: 'center', alignItems: 'center',
  },
  teamAvatarText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  teamInfo:  { flex: 1, gap: 4 },
  teamName:  { fontSize: 13, fontWeight: '600', color: '#222' },
  teamPct:   { fontSize: 13, fontWeight: '700', color: '#1565C0', minWidth: 36, textAlign: 'right' },
});
