import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity,
  Modal, FlatList, Animated, ActivityIndicator,
} from 'react-native';
import Svg, { Path, Text as SvgText } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import api from '../api/client';
import { getDashboardStats } from '../api/projects';
import { useAuth } from '../context/AuthContext';
import { useRole, projectMatchesRole } from '../context/RoleContext';
import { DEMO_STATS } from '../api/demoData';
import { useLang } from '../context/LangContext';
import { t } from '../i18n';
import { extractData } from '../utils/helpers';
import LoadingScreen from '../components/LoadingScreen';
import ErrorMessage from '../components/ErrorMessage';
import ProgressBar from '../components/ProgressBar';

// ─── Stage card colors ────────────────────────────────────────────────────────

const STAGE_PALETTE = [
  '#1565C0', '#0288D1', '#00838F', '#00897B',
  '#2E7D32', '#558B2F', '#6A1B9A', '#AD1457',
];
const COMPLETED_COLOR  = '#2E7D32';
const RETURNED_COLOR   = '#C62828';
const UNASSIGNED_COLOR = '#E65100';

function cardColor(sortOrder, name = '') {
  const n = (name || '').toLowerCase();
  if (n.includes('منته') || n.includes('انته') || n.includes('final')) return COMPLETED_COLOR;
  if (n.includes('مرتجع') || n.includes('returned')) return RETURNED_COLOR;
  if (n.includes('غير مسند') || n.includes('unassigned')) return UNASSIGNED_COLOR;
  return STAGE_PALETTE[(sortOrder - 1) % STAGE_PALETTE.length];
}

function cardIcon(name = '') {
  const n = (name || '').toLowerCase();
  if (n.includes('مكالم') || n.includes('call'))        return 'call-outline';
  if (n.includes('تحليل') || n.includes('analys'))      return 'analytics-outline';
  if (n.includes('بيانات') || n.includes('data'))       return 'server-outline';
  if (n.includes('تنفيذ') || n.includes('impl'))        return 'build-outline';
  if (n.includes('محاكاة') || n.includes('simul'))      return 'play-circle-outline';
  if (n.includes('تدريب') || n.includes('train'))       return 'school-outline';
  if (n.includes('تجريبي') || n.includes('pilot'))      return 'flask-outline';
  if (n.includes('فعلي') || n.includes('live'))         return 'checkmark-done-outline';
  if (n.includes('منته') || n.includes('انته'))         return 'trophy-outline';
  if (n.includes('مرتجع') || n.includes('return'))      return 'arrow-undo-outline';
  if (n.includes('غير مسند') || n.includes('unassign')) return 'person-add-outline';
  return 'layers-outline';
}

// ─── Build stage cards from projects data ────────────────────────────────────

// returns { cards, computedStats }
async function fetchStageCards(visibleCrmIds) {
  // 1. Fetch all projects (with embedded scopes)
  const projRes = await api.post('/Project/GetAll', { pageNo: 1, pageSize: 200 });
  const allProjects = projRes?.data?.data ?? [];

  // Role filter: non-admins only see their assigned projects (unassigned → hidden)
  const projects = visibleCrmIds
    ? allProjects.filter(p => projectMatchesRole(p, visibleCrmIds))
    : allProjects;

  // Compute stats directly from (role-filtered) projects
  const computedStats = {
    totalProjects:      projects.length,
    activeProjects:     projects.filter(p => p.statusId === 1 && !p.stopped).length,
    completedProjects:  projects.filter(p => p.statusId === 3).length,
    onHoldProjects:     projects.filter(p => p.statusId === 2 || p.stopped).length,
  };

  // 2. Collect all scopes with project user IDs (for client-side role filtering)
  const allScopes = [];
  for (const proj of projects) {
    const projUserIds = (proj.projectUsers ?? []).map(u => {
      const v = u?.key ?? u?.Key ?? u?.userId ?? u?.UserId ?? u?.user_id
             ?? u?.id  ?? u?.Id  ?? u?.ID    ?? u?.accountId ?? null;
      return v != null ? String(v) : '';
    }).filter(Boolean);

    for (const scope of (proj.scopes ?? [])) {
      allScopes.push({
        scopeId:       scope.id,
        systemName:    scope.productName || '',
        clientName:    proj.customerName || '',
        progressPct:   scope.progressPercent ?? 0,
        users:         scope.users ?? [],
        isStopped:     proj.stopped ?? false,
        projectUserIds: projUserIds,
      });
    }
  }

  if (allScopes.length === 0) return { cards: [], computedStats };

  // 3. Parallel-fetch stages for every scope
  const stageResults = await Promise.allSettled(
    allScopes.map(s => api.get(`/ProjectScopeStage/GetByScope/${s.scopeId}`))
  );

  // 4. Determine current stage per scope, group into cards
  const cardMap = {}; // stageName → card object
  const RETURNED_KEY = 'مرتجع ⛔';

  for (let i = 0; i < allScopes.length; i++) {
    const scope = allScopes[i];
    const res   = stageResults[i];

    // ── Special: returned (project stopped) ──
    if (scope.isStopped) {
      if (!cardMap[RETURNED_KEY]) {
        cardMap[RETURNED_KEY] = { stageName: RETURNED_KEY, sortOrder: 9998, weight: null, systems: [] };
      }
      cardMap[RETURNED_KEY].systems.push({
        systemName: scope.systemName, clientName: scope.clientName,
        progressPct: scope.progressPct, implementer: '',
        projectUserIds: scope.projectUserIds,
      });
      continue;
    }

    if (res.status !== 'fulfilled') continue;
    const stages = res.value?.data?.data ?? res.value?.data ?? [];
    if (!Array.isArray(stages) || stages.length === 0) continue;

    const implementer = scope.users?.[0]?.userName || scope.users?.[0]?.fullName || '';

    // Find current stage: InProgress first, then last completed, then first
    const inProgress    = stages.find(st => st.statusId === 2 || st.statusName === 'InProgress');
    const allCompleted  = stages.every(st => st.statusId === 3 || st.statusName === 'Completed');
    const lastCompleted = [...stages].reverse().find(st => st.statusId === 3 || st.statusName === 'Completed');

    let current;
    if (allCompleted) {
      // Scope fully done → منتهي
      const DONE_KEY = 'منتهيون ✅';
      if (!cardMap[DONE_KEY]) {
        cardMap[DONE_KEY] = { stageName: DONE_KEY, sortOrder: 9997, weight: null, systems: [] };
      }
      cardMap[DONE_KEY].systems.push({
        systemName: scope.systemName, clientName: scope.clientName,
        progressPct: scope.progressPct, implementer,
        projectUserIds: scope.projectUserIds,
      });
      continue;
    } else if (inProgress) {
      current = inProgress;
    } else if (lastCompleted) {
      // Next stage after last completed
      const nextIdx = stages.findIndex(st => st.id === lastCompleted.id) + 1;
      current = stages[nextIdx] || lastCompleted;
    } else {
      current = stages[0]; // NotStarted, first stage
    }

    const key = current.stageName || `Stage-${current.stageDefId}`;
    if (!cardMap[key]) {
      cardMap[key] = {
        stageName:  key,
        sortOrder:  current.stageSortOrder ?? 99,
        weight:     current.weightPercent ?? null,
        systems: [],
      };
    }
    cardMap[key].systems.push({
      systemName:     scope.systemName,
      clientName:     scope.clientName,
      progressPct:    scope.progressPct,
      implementer,
      projectUserIds: scope.projectUserIds,
    });
  }

  // 5. Sort by sortOrder and attach count
  const cards = Object.values(cardMap)
    .map(card => ({ ...card, count: card.systems.length }))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return { cards, computedStats };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ icon, label, value, color, onPress }) {
  const isLoading = value === null || value === undefined;
  return (
    <TouchableOpacity style={[styles.statCard, { borderTopColor: color }]} onPress={onPress} activeOpacity={onPress ? 0.7 : 1}>
      <View style={[styles.statIcon, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      {isLoading
        ? <ActivityIndicator size="small" color={color} style={{ marginVertical: 4 }} />
        : <Text style={[styles.statValue, { color }]}>{value}</Text>
      }
      <Text style={styles.statLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Donut chart (project status) ────────────────────────────────────────────
function DonutChart({ cs }) {
  if (!cs) return null;
  const { activeProjects: a = 0, completedProjects: c = 0, onHoldProjects: h = 0 } = cs;
  const total = a + c + h;
  if (total === 0) return null;

  const size = 130;
  const cx = size / 2, cy = size / 2;
  const R = 50, r = 32;
  const toRad = (deg) => (deg * Math.PI) / 180;

  const segs = [
    { value: a, color: '#F57C00', label: 'نشطة' },
    { value: c, color: '#388E3C', label: 'مكتملة' },
    { value: h, color: '#9C27B0', label: 'معلقة' },
  ].filter(s => s.value > 0);

  let startAngle = -90;
  const paths = segs.map(seg => {
    const angle = (seg.value / total) * 360;
    const end   = startAngle + angle;
    const large = angle > 180 ? 1 : 0;
    const c1 = Math.cos(toRad(startAngle)), s1 = Math.sin(toRad(startAngle));
    const c2 = Math.cos(toRad(end)),        s2 = Math.sin(toRad(end));
    const d = [
      `M ${cx + R * c1} ${cy + R * s1}`,
      `A ${R} ${R} 0 ${large} 1 ${cx + R * c2} ${cy + R * s2}`,
      `L ${cx + r * c2} ${cy + r * s2}`,
      `A ${r} ${r} 0 ${large} 0 ${cx + r * c1} ${cy + r * s1}`,
      'Z',
    ].join(' ');
    startAngle = end;
    return { ...seg, d };
  });

  return (
    <View style={styles.donutCard}>
      <Text style={styles.chartTitle}>توزيع المشاريع</Text>
      <View style={styles.donutRow}>
        <Svg width={size} height={size}>
          {paths.map((s, i) => <Path key={i} d={s.d} fill={s.color} />)}
          <SvgText x={cx} y={cy + 5} textAnchor="middle" fontSize="20" fontWeight="bold" fill="#1a1a1a">{total}</SvgText>
          <SvgText x={cx} y={cy + 18} textAnchor="middle" fontSize="9" fill="#888">مشروع</SvgText>
        </Svg>
        <View style={styles.donutLegend}>
          {segs.map((s, i) => (
            <View key={i} style={styles.legendRow}>
              <View style={[styles.legendDot, { backgroundColor: s.color }]} />
              <Text style={styles.legendLabel}>{s.label}</Text>
              <Text style={[styles.legendValue, { color: s.color }]}>{s.value}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

// ─── Top implementers vertical bar chart ─────────────────────────────────────
function ImplementersBar({ stages }) {
  const implMap = {};
  for (const stage of (stages || [])) {
    for (const sys of (stage.systems || [])) {
      const name = (sys.implementer || '').trim();
      if (name) implMap[name] = (implMap[name] || 0) + 1;
    }
  }
  const top = Object.entries(implMap).sort((a, b) => b[1] - a[1]).slice(0, 6);
  if (top.length === 0) return null;

  const maxVal = top[0][1];
  const colors = ['#1565C0', '#0288D1', '#00838F', '#F57C00', '#6A1B9A', '#AD1457'];
  const MAX_H  = 80;

  return (
    <View style={styles.implCard}>
      <Text style={styles.chartTitle}>أفضل المنفذين</Text>
      <View style={styles.implBarsRow}>
        {top.map(([name, count], i) => {
          const barH = Math.max(6, (count / maxVal) * MAX_H);
          const color = colors[i % colors.length];
          const short = name.split(' ').slice(0, 2).join('\n');
          return (
            <View key={name} style={styles.implBarCol}>
              <Text style={[styles.implCountLabel, { color }]}>{count}</Text>
              <View style={styles.implBarTrack}>
                <View style={[styles.implBarFill, { height: barH, backgroundColor: color }]} />
              </View>
              <Text style={styles.implNameLabel} numberOfLines={2}>{short}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function MiniBarChart({ cards }) {
  if (!cards || cards.length === 0) return null;
  const top = cards.slice(0, 6);
  const max = Math.max(...top.map(c => c.count), 1);
  const colors = ['#1565C0','#0288D1','#00838F','#00897B','#2E7D32','#6A1B9A'];
  return (
    <View style={styles.chartWrap}>
      <Text style={styles.chartTitle}>توزيع الأنظمة على المراحل</Text>
      {top.map((c, i) => {
        const pct = (c.count / max) * 100;
        const displayName = (c.stageName || '').replace(/ (Call|✅|⛔|👤)$/i, '').trim();
        return (
          <View key={c.stageName} style={styles.chartRow}>
            <Text style={styles.chartLabel} numberOfLines={1}>{displayName}</Text>
            <View style={styles.chartBarWrap}>
              <View style={[styles.chartBar, { width: `${pct}%`, backgroundColor: colors[i % colors.length] }]} />
            </View>
            <Text style={[styles.chartCount, { color: colors[i % colors.length] }]}>{c.count}</Text>
          </View>
        );
      })}
    </View>
  );
}

function StageCard({ card, index, onPress }) {
  const color = cardColor(card.sortOrder, card.stageName);
  const icon  = cardIcon(card.stageName);
  // Strip trailing emoji/latin from stage name for display
  const displayName = (card.stageName || '').replace(/ (Call|✅|⛔|👤)$/i, '').trim();
  return (
    <TouchableOpacity style={[styles.stageCard, { borderTopColor: color }]} onPress={onPress} activeOpacity={0.8}>
      <View style={[styles.stageIconWrap, { backgroundColor: color + '1A' }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Text style={[styles.stageCount, { color }]}>{card.count}</Text>
      <Text style={styles.stageName} numberOfLines={2}>{displayName}</Text>
      {card.weight != null && (
        <View style={[styles.stageBadge, { backgroundColor: color + '22' }]}>
          <Text style={[styles.stageBadgeText, { color }]}>{card.weight}%</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

function SystemRow({ item }) {
  const pct = item.progressPct ?? null;
  return (
    <View style={styles.sysRow}>
      <View style={styles.sysMain}>
        <Text style={styles.sysClient} numberOfLines={1}>{item.clientName}</Text>
        <Text style={styles.sysName} numberOfLines={1}>{item.systemName}</Text>
        {item.implementer ? <Text style={styles.sysImpl}>👤 {item.implementer}</Text> : null}
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

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function DashboardScreen({ navigation }) {
  const { user, isDemo } = useAuth();
  const { lang } = useLang();
  const { visibleCrmIds } = useRole();

  const [stats, setStats]         = useState(null);
  const [computedStats, setComputedStats] = useState(null);
  const [stages, setStages]       = useState([]);
  const [stagesLoading, setStagesLoading] = useState(false);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCard, setSelectedCard] = useState(null);

  const slideAnim = useRef(new Animated.Value(600)).current;

  const openModal = (card) => {
    setSelectedCard(card);
    Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
  };
  const closeModal = () => {
    Animated.timing(slideAnim, { toValue: 600, duration: 220, useNativeDriver: true }).start(() => setSelectedCard(null));
  };

  const load = useCallback(async () => {
    if (isDemo) {
      setStats(DEMO_STATS);
      setComputedStats({
        totalProjects: DEMO_STATS.totalProjects,
        activeProjects: DEMO_STATS.activeProjects,
        completedProjects: DEMO_STATS.completedProjects,
        onHoldProjects: DEMO_STATS.pendingApprovals,
      });
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      // Load basic stats quickly
      const statsRes = await getDashboardStats();
      setStats(extractData(statsRes));
      setError(null);
    } catch (e) {
      setError(e?.response?.data?.message || t('networkError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }

    // Load stage cards + computed stats in background
    setStagesLoading(true);
    try {
      const { cards, computedStats: cs } = await fetchStageCards(visibleCrmIds);
      setStages(cards);
      setComputedStats(cs);
    } catch (_) {
      // Stage cards are best-effort; don't surface error
    } finally {
      setStagesLoading(false);
    }
  }, [isDemo, visibleCrmIds]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  // Client-side role filter on stage cards
  const visibleStages = visibleCrmIds === null
    ? stages
    : stages.map(card => {
        const filtered = card.systems.filter(s =>
          (s.projectUserIds ?? []).some(id => visibleCrmIds.includes(id))
        );
        return { ...card, systems: filtered, count: filtered.length };
      }).filter(card => card.count > 0);

  if (loading) return <LoadingScreen />;
  if (error && !stats) return <ErrorMessage message={error} onRetry={load} />;

  const greeting = lang === 'ar'
    ? `مرحباً، ${user?.fullName || user?.userName || 'مستخدم'}`
    : `Hello, ${user?.fullName || user?.userName || 'User'}`;

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

        {/* ── إحصائيات المشاريع — 2×2 compact ───────────────────────── */}
        <View style={styles.statsGrid2x2}>
          <StatCard
            icon="folder-open-outline"
            label="إجمالي المشاريع"
            value={computedStats?.totalProjects ?? (stagesLoading ? null : stats?.totalProjects)}
            color="#1565C0"
            onPress={() => navigation.navigate('Projects')}
          />
          <StatCard
            icon="play-circle-outline"
            label="المشاريع النشطة"
            value={computedStats?.activeProjects ?? (stagesLoading ? null : stats?.activeProjects)}
            color="#F57C00"
            onPress={() => navigation.navigate('Projects', { statusId: 1 })}
          />
          <StatCard
            icon="checkmark-circle-outline"
            label="المشاريع المكتملة"
            value={computedStats?.completedProjects ?? (stagesLoading ? null : stats?.completedProjects)}
            color="#388E3C"
            onPress={() => navigation.navigate('Projects', { statusId: 3 })}
          />
          <StatCard
            icon="pause-circle-outline"
            label="المشاريع المعلقة"
            value={computedStats?.onHoldProjects ?? (stagesLoading ? null : stats?.pendingApprovals)}
            color="#9C27B0"
            onPress={() => navigation.navigate('Projects', { statusId: 2 })}
          />
        </View>

        {/* Quick Action Card */}
        <View style={styles.quickCard}>
          <View style={styles.quickCardLeft}>
            <Text style={styles.quickCardDate}>
              {new Date().toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' })}
            </Text>
            <Text style={styles.quickCardSub}>أضف إجراء زيارة مباشرة</Text>
          </View>
          <TouchableOpacity
            style={styles.quickCardBtn}
            onPress={() => navigation.navigate('QuickExecution')}
          >
            <Ionicons name="add-circle" size={20} color="#fff" />
            <Text style={styles.quickCardBtnText}>إجراء سريع</Text>
          </TouchableOpacity>
        </View>

        {/* ── Donut: project status distribution ─────────────────────── */}
        {stagesLoading
          ? null
          : <DonutChart cs={computedStats} />
        }

        {/* ── Bar chart: stage distribution ──────────────────────────── */}
        {stagesLoading ? (
          <View style={styles.chartWrap}>
            <Text style={styles.chartTitle}>توزيع الأنظمة على المراحل</Text>
            <ActivityIndicator color="#1565C0" style={{ marginVertical: 12 }} />
          </View>
        ) : visibleStages.length > 0 ? (
          <MiniBarChart cards={visibleStages} />
        ) : null}

        {/* ── Vertical bar: top implementers ─────────────────────────── */}
        {!stagesLoading && visibleStages.length > 0 && (
          <ImplementersBar stages={visibleStages} />
        )}

        {/* ── كروت المراحل ──────────────────────────────────────────── */}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>كروت المراحل</Text>
          {stagesLoading && <ActivityIndicator size="small" color="#1565C0" />}
        </View>

        {visibleStages.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            nestedScrollEnabled
            contentContainerStyle={styles.stagesScroll}
          >
            {visibleStages.map((card, idx) => (
              <StageCard key={card.stageName} card={card} index={idx} onPress={() => openModal(card)} />
            ))}
          </ScrollView>
        ) : !stagesLoading ? (
          <View style={styles.emptyStages}>
            <Ionicons name="layers-outline" size={28} color="#ccc" />
            <Text style={styles.emptyStagesText}>لا توجد أنظمة حالياً</Text>
          </View>
        ) : null}

        {stats?.overallProgress !== undefined && (
          <View style={styles.progressCard}>
            <ProgressBar value={stats.overallProgress} color="#1565C0" />
          </View>
        )}

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

      {/* ── Stage Detail Modal ────────────────────────────────────────── */}
      <Modal
        visible={selectedCard !== null}
        transparent
        animationType="none"
        onRequestClose={closeModal}
      >
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={closeModal}>
          <Animated.View style={[styles.modalSheet, { transform: [{ translateY: slideAnim }] }]}>
            <TouchableOpacity activeOpacity={1}>
              <View style={styles.modalHandle} />
              {selectedCard && (() => {
                const color = cardColor(selectedCard.sortOrder, selectedCard.stageName);
                const displayName = (selectedCard.stageName || '').replace(/ (Call|✅|⛔|👤)$/i, '').trim();
                return (
                  <>
                    <View style={[styles.modalHeader, { borderBottomColor: color }]}>
                      <View style={[styles.modalIconWrap, { backgroundColor: color + '1A' }]}>
                        <Ionicons name={cardIcon(selectedCard.stageName)} size={22} color={color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.modalTitle, { color }]}>{displayName}</Text>
                        <Text style={styles.modalCount}>{selectedCard.count} {selectedCard.count === 1 ? 'نظام' : 'أنظمة'}</Text>
                      </View>
                      <TouchableOpacity onPress={closeModal} style={styles.modalClose}>
                        <Ionicons name="close" size={22} color="#666" />
                      </TouchableOpacity>
                    </View>
                    <FlatList
                      data={selectedCard.systems}
                      keyExtractor={(_, i) => i.toString()}
                      renderItem={({ item }) => <SystemRow item={item} />}
                      contentContainerStyle={{ paddingBottom: 32 }}
                      showsVerticalScrollIndicator={false}
                      ListEmptyComponent={
                        <View style={styles.modalEmpty}>
                          <Text style={styles.modalEmptyText}>لا توجد أنظمة</Text>
                        </View>
                      }
                    />
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

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: '#F5F7FA' },
  content: { padding: 16, paddingBottom: 40 },

  greetingCard: {
    backgroundColor: '#1565C0', borderRadius: 16, padding: 20, marginBottom: 12,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  greetingLeft:  { flex: 1 },
  greeting:      { fontSize: 18, fontWeight: '700', color: '#fff' },
  greetingSub:   { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  greetingIcon:  { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: 8 },

  quickCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: '#E3F2FD',
    shadowColor: '#1565C0', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  quickCardLeft:    { flex: 1 },
  quickCardDate:    { fontSize: 14, fontWeight: '700', color: '#1565C0', textAlign: 'right' },
  quickCardSub:     { fontSize: 12, color: '#888', marginTop: 2, textAlign: 'right' },
  quickCardBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#1565C0', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
  },
  quickCardBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1a1a1a', marginBottom: 10 },
  sectionRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  seeAll:       { color: '#1565C0', fontSize: 13, fontWeight: '600' },

  stagesScroll: { paddingRight: 16, paddingBottom: 6 },
  stageCard: {
    width: 112, backgroundColor: '#fff', borderRadius: 14, padding: 12,
    borderTopWidth: 4, alignItems: 'center', marginRight: 10,
    elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 6, marginBottom: 8,
  },
  stageIconWrap: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
  stageCount:    { fontSize: 28, fontWeight: '800', lineHeight: 32 },
  stageName:     { fontSize: 11, color: '#444', textAlign: 'center', marginTop: 4, lineHeight: 16 },
  stageBadge:    { marginTop: 6, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  stageBadgeText: { fontSize: 10, fontWeight: '700' },

  emptyStages: { alignItems: 'center', paddingVertical: 20, gap: 6 },
  emptyStagesText: { color: '#aaa', fontSize: 13 },

  statsGrid2x2: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12,
  },
  statCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 12,
    borderTopWidth: 3, alignItems: 'center',
    width: '47%', flexShrink: 1,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 4,
  },
  statIcon:  { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
  statValue: { fontSize: 26, fontWeight: '900', lineHeight: 30 },
  statLabel: { fontSize: 11, color: '#666', marginTop: 3, textAlign: 'center' },

  chartWrap: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 12,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4,
  },
  chartTitle: { fontSize: 13, fontWeight: '700', color: '#333', marginBottom: 12, textAlign: 'right' },
  chartRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  chartLabel: { fontSize: 11, color: '#555', width: 80, textAlign: 'right' },
  chartBarWrap: { flex: 1, height: 10, backgroundColor: '#EEF2FF', borderRadius: 5, overflow: 'hidden' },
  chartBar: { height: 10, borderRadius: 5 },
  chartCount: { fontSize: 12, fontWeight: '700', width: 24, textAlign: 'center' },

  // Donut chart card
  donutCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 12,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4,
  },
  donutRow:   { flexDirection: 'row', alignItems: 'center', gap: 16 },
  donutLegend: { flex: 1, gap: 12 },
  legendRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendDot:  { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { flex: 1, fontSize: 13, color: '#555', textAlign: 'right' },
  legendValue: { fontSize: 15, fontWeight: '800', minWidth: 28, textAlign: 'right' },

  // Implementers vertical bar chart
  implCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 12,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4,
  },
  implBarsRow:    { flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginTop: 10, height: 120 },
  implBarCol:     { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  implCountLabel: { fontSize: 11, fontWeight: '800', marginBottom: 3 },
  implBarTrack:   { width: '100%', alignItems: 'stretch', justifyContent: 'flex-end', flex: 1 },
  implBarFill:    { width: '100%', borderRadius: 5 },
  implNameLabel:  { fontSize: 9, color: '#666', textAlign: 'center', marginTop: 5, lineHeight: 13 },

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

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet:   {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: '80%', minHeight: 280,
  },
  modalHandle:  {
    width: 40, height: 4, backgroundColor: '#ddd', borderRadius: 2,
    alignSelf: 'center', marginTop: 10, marginBottom: 4,
  },
  modalHeader:  {
    flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12,
    borderBottomWidth: 2, marginBottom: 4,
  },
  modalIconWrap: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  modalTitle:    { fontSize: 18, fontWeight: '800' },
  modalCount:    { fontSize: 13, color: '#666', marginTop: 2 },
  modalClose:    { padding: 6 },
  modalEmpty:    { alignItems: 'center', padding: 32 },
  modalEmptyText: { color: '#aaa', fontSize: 14 },

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
