import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import {
  getProcessStatics, getTasksStatics,
  getPlanItemsSummary, getPlanItemsTotals,
  getMyPerformanceProcess, getMyPerformanceTasks,
  getTeamPerformanceProcess, getTeamPerformanceTasks,
  getProjectDashboardStats,
  getSmartUserSummary, getSmartPlanItemsSummary,
} from '../api/reports';
import ProgressBar from '../components/ProgressBar';

// ─── helpers ────────────────────────────────────────────────────────────────

function num(v) { return typeof v === 'number' ? v : (Number(v) || 0); }

function safe(res) {
  if (!res) return null;
  const d = res?.data;
  if (!d) return null;
  if (d.data && !Array.isArray(d.data)) return d.data;
  if (!Array.isArray(d)) return d;
  return null;
}

function safeList(res) {
  if (!res) return [];
  const d = res?.data;
  if (!d) return [];
  if (Array.isArray(d)) return d;
  if (Array.isArray(d.data)) return d.data;
  if (Array.isArray(d.items)) return d.items;
  return [];
}

function getPeriodDates(period) {
  const now   = new Date();
  const today = now.toISOString().split('T')[0];
  if (period === 'week') {
    const d = new Date(now); d.setDate(d.getDate() - 7);
    return { from: d.toISOString().split('T')[0], to: today };
  }
  if (period === 'month') {
    return { from: `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`, to: today };
  }
  const qm = Math.floor(now.getMonth() / 3) * 3;
  return { from: `${now.getFullYear()}-${String(qm+1).padStart(2,'0')}-01`, to: today };
}

// ─── sub-components ─────────────────────────────────────────────────────────

function StatRow({ icon, label, value, color = '#1565C0' }) {
  return (
    <View style={styles.statRow}>
      <View style={[styles.statIcon, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Text style={styles.statLabel}>{label}</Text>
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
  const name  = item.fullName || item.FullName || item.userName || item.name || '—';
  const done  = num(item.doneCount || item.completedCount || item.done);
  const total = num(item.totalCount || item.total);
  const pct   = total > 0
    ? Math.round((done / total) * 100)
    : num(item.percentage || item.progress || item.pct);
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

export default function ReportsScreen({ navigation }) {
  const { profile } = useAuth();
  const { lang }    = useLang();

  const isManager = profile?.isAdmin || profile?.isManager ||
    ['manager','admin','مدير','مشرف'].some(r =>
      (profile?.roleName || '').toLowerCase().includes(r)
    );

  const [period,     setPeriod]     = useState('month');
  const [refreshing, setRefreshing] = useState(false);
  const [loading,    setLoading]    = useState(true);

  const [procStatics,  setProcStatics]  = useState(null);
  const [taskStatics,  setTaskStatics]  = useState(null);
  const [planSummary,  setPlanSummary]  = useState(null);
  const [planTotals,   setPlanTotals]   = useState(null);
  const [myProc,       setMyProc]       = useState(null);
  const [myTasks,      setMyTasks]      = useState(null);
  const [projStats,    setProjStats]    = useState(null);
  const [teamProc,     setTeamProc]     = useState([]);
  const [teamTasks,    setTeamTasks]    = useState([]);
  const [smartSummary, setSmartSummary] = useState(null);

  const load = useCallback(async () => {
    const { from, to } = getPeriodDates(period);
    const body = { dateFrom: from, dateTo: to, fromDate: from, toDate: to };

    const calls = [
      getProcessStatics().catch(() => null),           // 0 GET
      getTasksStatics().catch(() => null),             // 1 GET
      getPlanItemsSummary().catch(() => null),         // 2 GET
      getPlanItemsTotals().catch(() => null),          // 3 GET
      getMyPerformanceProcess(body).catch(() => null), // 4 POST
      getMyPerformanceTasks(body).catch(() => null),   // 5 POST
      getProjectDashboardStats().catch(() => null),    // 6 GET
      getSmartUserSummary().catch(() => null),         // 7 GET
      getSmartPlanItemsSummary().catch(() => null),    // 8 GET
    ];
    if (isManager) {
      calls.push(getTeamPerformanceProcess(body).catch(() => null)); // 9
      calls.push(getTeamPerformanceTasks(body).catch(() => null));   // 10
    }

    const r = await Promise.all(calls);
    setProcStatics (safe(r[0]));
    setTaskStatics (safe(r[1]));
    setPlanSummary (safe(r[2]));
    setPlanTotals  (safe(r[3]));
    setMyProc      (safe(r[4]));
    setMyTasks     (safe(r[5]));
    setProjStats   (safe(r[6]));
    setSmartSummary(safe(r[7]) || safe(r[8]));
    if (isManager) {
      setTeamProc (safeList(r[9]));
      setTeamTasks(safeList(r[10]));
    }

    setLoading(false);
    setRefreshing(false);
  }, [period, isManager]);

  useEffect(() => { setLoading(true); load(); }, [period]);

  const onRefresh = () => { setRefreshing(true); load(); };

  // ── derived numbers ──────────────────────────────────────────────────────
  const ps = procStatics || {};
  const ts = taskStatics || {};
  const pl = planSummary || planTotals || {};
  const pd = projStats   || {};
  const mp = myProc      || {};
  const mt = myTasks     || {};
  const ss = smartSummary || {};

  function pctOf(done, total) {
    return num(total) > 0 ? Math.round((num(done) / num(total)) * 100) : 0;
  }

  const mpDone    = num(mp.doneCount    || mp.completedCount || mp.done);
  const mpPending = num(mp.pendingCount || mp.inProgressCount|| mp.pending);
  const mpTotal   = num(mp.totalCount   || mp.total) || (mpDone + mpPending);
  const mpPct     = mpTotal > 0 ? pctOf(mpDone, mpTotal) : num(mp.percentage || mp.pct);

  const mtDone    = num(mt.doneCount    || mt.completedCount || mt.done);
  const mtPending = num(mt.pendingCount || mt.inProgressCount|| mt.pending);
  const mtTotal   = num(mt.totalCount   || mt.total) || (mtDone + mtPending);
  const mtPct     = mtTotal > 0 ? pctOf(mtDone, mtTotal) : num(mt.percentage || mt.pct);

  const plDone    = num(pl.doneCount || pl.completedItems || pl.completed);
  const plPending = num(pl.pendingCount || pl.pendingItems || pl.pending);
  const plTotal   = num(pl.totalCount || pl.totalItems || pl.total) || (plDone + plPending);
  const plPct     = plTotal > 0 ? pctOf(plDone, plTotal) : num(pl.percentage || pl.pct);

  if (loading && !refreshing) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1565C0" />
        <Text style={styles.loadingText}>
          {lang === 'ar' ? 'جاري تحميل التقارير...' : 'Loading reports...'}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1565C0']} />}
    >
      {/* ── تقارير التنفيذ entry ─────────────────────────────────── */}
      <TouchableOpacity
        style={styles.implEntry}
        onPress={() => navigation.navigate('ImplReports')}
        activeOpacity={0.8}
      >
        <View style={styles.implEntryLeft}>
          <Ionicons name="git-branch-outline" size={22} color="#fff" />
          <View>
            <Text style={styles.implEntryTitle}>تقارير التنفيذ</Text>
            <Text style={styles.implEntrySub}>الأنظمة · المراحل · الزيارات</Text>
          </View>
        </View>
        <Ionicons name="chevron-back" size={20} color="rgba(255,255,255,0.7)" />
      </TouchableOpacity>

      <PeriodFilter value={period} onChange={setPeriod} lang={lang} />

      {/* ── Project overview ─────────────────────────────────────────── */}
      {(pd.totalProjects != null || pd.activeProjects != null) && (
        <SectionCard
          title={lang === 'ar' ? 'إحصائيات المشاريع' : 'Project Overview'}
          icon="folder-open-outline"
          color="#1565C0"
        >
          <StatRow icon="folder-outline"           label={lang==='ar'?'إجمالي المشاريع':'Total'}     value={pd.totalProjects}     color="#1565C0" />
          <StatRow icon="play-circle-outline"      label={lang==='ar'?'نشطة':'Active'}               value={pd.activeProjects}    color="#F57C00" />
          <StatRow icon="checkmark-circle-outline" label={lang==='ar'?'مكتملة':'Completed'}          value={pd.completedProjects} color="#388E3C" />
          <StatRow icon="time-outline"             label={lang==='ar'?'بانتظار الموافقة':'Pending'}  value={pd.pendingApprovals}  color="#9C27B0" />
          {pd.overallProgress != null && (
            <View style={styles.progressWrap}>
              <Text style={styles.progressLabel}>{lang==='ar'?'التقدم العام':'Overall'} — {num(pd.overallProgress)}%</Text>
              <ProgressBar value={num(pd.overallProgress)} color="#1565C0" />
            </View>
          )}
        </SectionCard>
      )}

      {/* ── Global process statics (no period) ───────────────────────── */}
      {(ps.totalCount != null || ps.total != null) && (
        <SectionCard
          title={lang === 'ar' ? 'المعالجات' : 'Processes'}
          icon="bar-chart-outline"
          color="#1565C0"
        >
          <StatRow icon="list-outline"           label={lang==='ar'?'الإجمالي':'Total'}        value={ps.totalCount ?? ps.total}    color="#607D8B" />
          <StatRow icon="checkmark-done-outline" label={lang==='ar'?'منجزة':'Done'}            value={ps.doneCount  ?? ps.done}     color="#388E3C" />
          <StatRow icon="hourglass-outline"      label={lang==='ar'?'قيد التنفيذ':'In Progress'} value={ps.pendingCount ?? ps.pending} color="#F57C00" />
        </SectionCard>
      )}

      {/* ── Global task statics (no period) ──────────────────────────── */}
      {(ts.totalCount != null || ts.total != null) && (
        <SectionCard
          title={lang === 'ar' ? 'المهام' : 'Tasks'}
          icon="checkbox-outline"
          color="#9C27B0"
        >
          <StatRow icon="list-outline"           label={lang==='ar'?'الإجمالي':'Total'}        value={ts.totalCount ?? ts.total}    color="#607D8B" />
          <StatRow icon="checkmark-done-outline" label={lang==='ar'?'منجزة':'Done'}            value={ts.doneCount  ?? ts.done}     color="#388E3C" />
          <StatRow icon="hourglass-outline"      label={lang==='ar'?'قيد التنفيذ':'In Progress'} value={ts.pendingCount ?? ts.pending} color="#F57C00" />
        </SectionCard>
      )}

      {/* ── My process performance (period) ──────────────────────────── */}
      <SectionCard
        title={lang === 'ar' ? 'أدائي — المعالجات' : 'My Performance — Processes'}
        icon="person-circle-outline"
        color="#1565C0"
      >
        {(mpTotal > 0 || mpPct > 0) ? (
          <>
            <StatRow icon="checkmark-done-outline" label={lang==='ar'?'منجزة':'Completed'}        value={mpDone}    color="#388E3C" />
            <StatRow icon="hourglass-outline"      label={lang==='ar'?'قيد التنفيذ':'In Progress'} value={mpPending} color="#F57C00" />
            <StatRow icon="list-outline"           label={lang==='ar'?'الإجمالي':'Total'}         value={mpTotal}   color="#607D8B" />
            <View style={styles.progressWrap}>
              <Text style={styles.progressLabel}>{mpPct}%</Text>
              <ProgressBar value={mpPct} color="#1565C0" />
            </View>
          </>
        ) : (
          <Text style={styles.noData}>{lang==='ar'?'لا توجد بيانات للفترة المحددة':'No data for this period'}</Text>
        )}
      </SectionCard>

      {/* ── My task performance (period) ──────────────────────────────── */}
      <SectionCard
        title={lang === 'ar' ? 'أدائي — المهام' : 'My Performance — Tasks'}
        icon="checkbox-outline"
        color="#9C27B0"
      >
        {(mtTotal > 0 || mtPct > 0) ? (
          <>
            <StatRow icon="checkmark-done-outline" label={lang==='ar'?'منجزة':'Completed'}   value={mtDone}    color="#388E3C" />
            <StatRow icon="hourglass-outline"      label={lang==='ar'?'معلقة':'Pending'}      value={mtPending} color="#F57C00" />
            <StatRow icon="list-outline"           label={lang==='ar'?'الإجمالي':'Total'}    value={mtTotal}   color="#607D8B" />
            <View style={styles.progressWrap}>
              <Text style={styles.progressLabel}>{mtPct}%</Text>
              <ProgressBar value={mtPct} color="#9C27B0" />
            </View>
          </>
        ) : (
          <Text style={styles.noData}>{lang==='ar'?'لا توجد بيانات للفترة المحددة':'No data for this period'}</Text>
        )}
      </SectionCard>

      {/* ── Plan items ────────────────────────────────────────────────── */}
      <SectionCard
        title={lang === 'ar' ? 'بنود الخطط' : 'Plan Items'}
        icon="document-text-outline"
        color="#F57C00"
      >
        {(plTotal > 0 || plPct > 0) ? (
          <>
            <StatRow icon="checkmark-done-outline" label={lang==='ar'?'منجزة':'Done'}      value={plDone}    color="#388E3C" />
            <StatRow icon="hourglass-outline"      label={lang==='ar'?'معلقة':'Pending'}   value={plPending} color="#F57C00" />
            <StatRow icon="list-outline"           label={lang==='ar'?'الإجمالي':'Total'}  value={plTotal}   color="#607D8B" />
            <View style={styles.progressWrap}>
              <Text style={styles.progressLabel}>{plPct}%</Text>
              <ProgressBar value={plPct} color="#F57C00" />
            </View>
          </>
        ) : (
          <Text style={styles.noData}>{lang==='ar'?'لا توجد بيانات':'No data'}</Text>
        )}
      </SectionCard>

      {/* ── Smart summary (bonus data if available) ───────────────────── */}
      {ss && Object.keys(ss).length > 0 && (
        <SectionCard
          title={lang === 'ar' ? 'ملخص النشاط' : 'Activity Summary'}
          icon="analytics-outline"
          color="#00796B"
        >
          {Object.entries(ss)
            .filter(([, v]) => typeof v === 'number')
            .map(([k, v]) => (
              <StatRow key={k} icon="stats-chart-outline" label={k} value={v} color="#00796B" />
            ))}
        </SectionCard>
      )}

      {/* ── Manager: team performance ────────────────────────────────── */}
      {isManager && (
        <>
          <SectionCard
            title={lang === 'ar' ? 'أداء الفريق — معالجات' : 'Team — Processes'}
            icon="people-outline"
            color="#388E3C"
          >
            {teamProc.length > 0
              ? teamProc.map((item, i) => <TeamUserRow key={i} item={item} />)
              : <Text style={styles.noData}>{lang==='ar'?'لا توجد بيانات':'No data'}</Text>}
          </SectionCard>

          <SectionCard
            title={lang === 'ar' ? 'أداء الفريق — مهام' : 'Team — Tasks'}
            icon="people-circle-outline"
            color="#D32F2F"
          >
            {teamTasks.length > 0
              ? teamTasks.map((item, i) => <TeamUserRow key={i} item={item} />)
              : <Text style={styles.noData}>{lang==='ar'?'لا توجد بيانات':'No data'}</Text>}
          </SectionCard>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root:        { flex: 1, backgroundColor: '#F5F7FA' },
  content:     { padding: 12, paddingBottom: 32 },
  center:      { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { color: '#666', fontSize: 14 },

  implEntry: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#1565C0', borderRadius: 14, padding: 16, marginBottom: 14,
    elevation: 3, shadowColor: '#000', shadowOffset:{width:0,height:2}, shadowOpacity:0.12, shadowRadius:5,
  },
  implEntryLeft:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
  implEntryTitle: { fontSize: 16, fontWeight: '800', color: '#fff' },
  implEntrySub:   { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 1 },

  periodRow: {
    flexDirection: 'row', gap: 8, marginBottom: 14,
    backgroundColor: '#fff', borderRadius: 12, padding: 6,
    elevation: 1, shadowColor: '#000', shadowOffset: {width:0,height:1}, shadowOpacity: 0.05, shadowRadius: 3,
  },
  periodBtn:       { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  periodBtnActive: { backgroundColor: '#1565C0' },
  periodText:      { fontSize: 13, color: '#666', fontWeight: '600' },
  periodTextActive:{ color: '#fff', fontWeight: '700' },

  card: {
    backgroundColor: '#fff', borderRadius: 14, marginBottom: 14, overflow: 'hidden',
    elevation: 2, shadowColor: '#000', shadowOffset: {width:0,height:1}, shadowOpacity: 0.07, shadowRadius: 4,
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
  statIcon:  { width: 36, height: 36, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  statLabel: { flex: 1, fontSize: 13, color: '#555', fontWeight: '500' },
  statValue: { fontSize: 20, fontWeight: '800' },

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
