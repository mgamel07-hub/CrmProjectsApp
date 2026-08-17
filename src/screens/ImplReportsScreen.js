import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, FlatList, StyleSheet, TouchableOpacity,
  TextInput, RefreshControl, ActivityIndicator, Modal, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../api/client';

// ─── Shared data fetcher (projects + stages) ─────────────────────────────────

async function loadAllSystemsWithStages() {
  const projRes = await api.post('/Project/GetAll', { pageNo: 1, pageSize: 200 });
  const projects = projRes?.data?.data ?? [];

  const scopes = [];
  for (const proj of projects) {
    // Extract user names from projectUsers array (try several field shapes)
    const projUsers = (proj.projectUsers ?? []).map(u =>
      u.fullName || u.FullName || u.userName || u.UserName || u.name || ''
    ).filter(Boolean);

    for (const sc of proj.scopes ?? []) {
      // Scope-level users (sometimes populated)
      const scopeUsers = (sc.users ?? []).map(u =>
        u.fullName || u.FullName || u.userName || u.UserName || u.name || ''
      ).filter(Boolean);

      scopes.push({
        scopeId:      sc.id,
        systemName:   sc.productName || '',
        clientName:   proj.customerName || '',
        projectId:    proj.id,
        projectTitle: proj.title || '',
        progressPct:  sc.progressPercent ?? 0,
        isStopped:    proj.stopped ?? false,
        employees:    scopeUsers.length ? scopeUsers : projUsers,
      });
    }
  }

  const stageResults = await Promise.allSettled(
    scopes.map(s => api.get(`/ProjectScopeStage/GetByScope/${s.scopeId}`))
  );

  return scopes.map((scope, i) => {
    const res = stageResults[i];
    if (res.status !== 'fulfilled') {
      return { ...scope, currentStage: null, allStages: [], stageName: '—', sortOrder: 999, employees: scope.employees };
    }
    const stages = res.value?.data?.data ?? res.value?.data ?? [];
    if (!Array.isArray(stages) || stages.length === 0) {
      return { ...scope, currentStage: null, allStages: [], stageName: '—', sortOrder: 999, employees: scope.employees };
    }

    // Also collect implementers from stage endedByUserName
    const stageUsers = stages.map(s => s.endedByUserName).filter(Boolean);
    const allEmployees = [...new Set([...scope.employees, ...stageUsers])];
    const inProgress = stages.find(st => st.statusId === 2 || st.statusName === 'InProgress');
    const allDone    = stages.every(st => st.statusId === 3 || st.statusName === 'Completed');
    const lastDone   = [...stages].reverse().find(st => st.statusId === 3 || st.statusName === 'Completed');

    let current;
    if (scope.isStopped) {
      current = { stageName: 'مرتجع ⛔', stageSortOrder: 9998, weightPercent: null };
    } else if (allDone) {
      current = { stageName: 'منتهي ✅', stageSortOrder: 9997, weightPercent: null };
    } else if (inProgress) {
      current = inProgress;
    } else if (lastDone) {
      const ni = stages.findIndex(s => s.id === lastDone.id) + 1;
      current = stages[ni] || lastDone;
    } else {
      current = stages[0];
    }

    return {
      ...scope,
      currentStage: current,
      allStages:    stages,
      stageName:    current?.stageName        || '—',
      sortOrder:    current?.stageSortOrder   ?? 99,
      stageWeight:  current?.weightPercent    ?? null,
      employees:    allEmployees,
    };
  });
}

async function loadVisits(projectIds) {
  if (!projectIds.length) return [];
  const results = await Promise.allSettled(
    projectIds.map(id => api.get(`/PlanExecution/GetByFilter?projectId=${id}`))
  );
  const all = [];
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    const list = r.value?.data?.data ?? r.value?.data ?? [];
    if (Array.isArray(list)) all.push(...list);
  }
  return all;
}

// ─── Colors ──────────────────────────────────────────────────────────────────

const PALETTE = ['#1565C0','#0288D1','#00838F','#00897B','#2E7D32','#558B2F','#6A1B9A','#AD1457'];
function stageColor(sortOrder, name = '') {
  const n = (name || '').toLowerCase();
  if (n.includes('منته') || n.includes('✅')) return '#2E7D32';
  if (n.includes('مرتجع') || n.includes('⛔'))  return '#C62828';
  return PALETTE[(sortOrder - 1) % PALETTE.length];
}

// ─── Date filter helpers ──────────────────────────────────────────────────────

const THIS_YEAR = new Date().getFullYear();

function computeDateRange(mode, year, quarter, half, customFrom, customTo) {
  const y = year || THIS_YEAR;
  if (!mode) return { from: null, to: null };
  if (mode === 'year')    return { from: `${y}-01-01`, to: `${y}-12-31` };
  if (mode === 'half') {
    const h = half || 1;
    return h === 1
      ? { from: `${y}-01-01`, to: `${y}-06-30` }
      : { from: `${y}-07-01`, to: `${y}-12-31` };
  }
  if (mode === 'quarter') {
    const q = quarter || 1;
    const sm = (q - 1) * 3 + 1;
    const em = sm + 2;
    const ends = { 3: 31, 6: 30, 9: 30, 12: 31 };
    return {
      from: `${y}-${String(sm).padStart(2,'0')}-01`,
      to:   `${y}-${String(em).padStart(2,'0')}-${ends[em]}`,
    };
  }
  if (mode === 'custom') return { from: customFrom || null, to: customTo || null };
  return { from: null, to: null };
}

function inDateRange(dateStr, from, to) {
  if (!dateStr) return true;
  if (!from && !to) return true;
  const d = dateStr.slice(0, 10);
  if (from && d < from) return false;
  if (to   && d > to)   return false;
  return true;
}

function DateFilterSection({ mode, setMode, year, setYear, quarter, setQuarter, half, setHalf,
                              customFrom, setCustomFrom, customTo, setCustomTo }) {
  const MODES = [
    { key: null,      label: 'الكل' },
    { key: 'quarter', label: 'ربع سنة' },
    { key: 'half',    label: 'نصف سنة' },
    { key: 'year',    label: 'سنة كاملة' },
    { key: 'custom',  label: 'مخصص' },
  ];
  const QUARTERS = [
    { key: 1, label: 'الربع الأول',  sub: 'يناير – مارس' },
    { key: 2, label: 'الربع الثاني', sub: 'أبريل – يونيو' },
    { key: 3, label: 'الربع الثالث', sub: 'يوليو – سبتمبر' },
    { key: 4, label: 'الربع الرابع', sub: 'أكتوبر – ديسمبر' },
  ];
  const HALVES = [
    { key: 1, label: 'النصف الأول', sub: 'يناير – يونيو' },
    { key: 2, label: 'النصف الثاني', sub: 'يوليو – ديسمبر' },
  ];

  return (
    <View style={st.dateSection}>
      {/* Mode row */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.filterRow}>
        {MODES.map(m => (
          <TouchableOpacity key={String(m.key)} style={[st.chip, mode === m.key && st.chipDate]}
            onPress={() => setMode(m.key)}>
            <Text style={[st.chipText, mode === m.key && { color: '#fff' }]}>{m.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Year selector — shown for all non-null, non-custom modes */}
      {mode && mode !== 'custom' && (
        <View style={st.yearRow}>
          <TouchableOpacity onPress={() => setYear(y => (y || THIS_YEAR) - 1)} style={st.yearBtn}>
            <Ionicons name="chevron-forward" size={18} color="#1565C0" />
          </TouchableOpacity>
          <Text style={st.yearText}>{year || THIS_YEAR}</Text>
          <TouchableOpacity onPress={() => setYear(y => (y || THIS_YEAR) + 1)} style={st.yearBtn}>
            <Ionicons name="chevron-back" size={18} color="#1565C0" />
          </TouchableOpacity>
        </View>
      )}

      {/* Quarter chips */}
      {mode === 'quarter' && (
        <View style={st.periodGrid}>
          {QUARTERS.map(q => (
            <TouchableOpacity key={q.key}
              style={[st.periodCard, quarter === q.key && st.periodCardActive]}
              onPress={() => setQuarter(q.key)}>
              <Text style={[st.periodCardTitle, quarter === q.key && { color: '#fff' }]}>{q.label}</Text>
              <Text style={[st.periodCardSub, quarter === q.key && { color: 'rgba(255,255,255,0.8)' }]}>{q.sub}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Half chips */}
      {mode === 'half' && (
        <View style={st.periodGrid}>
          {HALVES.map(h => (
            <TouchableOpacity key={h.key}
              style={[st.periodCard, st.periodCardHalf, half === h.key && st.periodCardActive]}
              onPress={() => setHalf(h.key)}>
              <Text style={[st.periodCardTitle, half === h.key && { color: '#fff' }]}>{h.label}</Text>
              <Text style={[st.periodCardSub, half === h.key && { color: 'rgba(255,255,255,0.8)' }]}>{h.sub}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Custom date inputs */}
      {mode === 'custom' && (
        <View style={st.customRow}>
          <View style={st.customField}>
            <Text style={st.customLabel}>من</Text>
            <TextInput
              style={st.customInput}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#bbb"
              value={customFrom}
              onChangeText={setCustomFrom}
              keyboardType="numeric"
              maxLength={10}
            />
          </View>
          <Ionicons name="arrow-back-outline" size={16} color="#999" />
          <View style={st.customField}>
            <Text style={st.customLabel}>إلى</Text>
            <TextInput
              style={st.customInput}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#bbb"
              value={customTo}
              onChangeText={setCustomTo}
              keyboardType="numeric"
              maxLength={10}
            />
          </View>
        </View>
      )}
    </View>
  );
}

// ─── Tiny components ─────────────────────────────────────────────────────────

function TabBar({ tab, setTab }) {
  const tabs = [
    { key: 'systems', label: 'الأنظمة',  icon: 'layers-outline' },
    { key: 'stages',  label: 'المراحل',  icon: 'git-branch-outline' },
    { key: 'visits',  label: 'الزيارات', icon: 'car-outline' },
  ];
  return (
    <View style={st.tabBar}>
      {tabs.map(t => (
        <TouchableOpacity key={t.key} style={[st.tabBtn, tab === t.key && st.tabBtnActive]} onPress={() => setTab(t.key)}>
          <Ionicons name={t.icon} size={16} color={tab === t.key ? '#1565C0' : '#999'} />
          <Text style={[st.tabLabel, tab === t.key && st.tabLabelActive]}>{t.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function StageBadge({ name, sortOrder }) {
  const color = stageColor(sortOrder, name);
  const short = (name || '').replace(/ (Call|✅|⛔)$/i, '').trim().slice(0, 16);
  return (
    <View style={[st.badge, { backgroundColor: color + '18', borderColor: color + '44' }]}>
      <Text style={[st.badgeText, { color }]}>{short}</Text>
    </View>
  );
}

function ProgressMini({ pct }) {
  const color = pct >= 85 ? '#2E7D32' : pct >= 50 ? '#1565C0' : '#E65100';
  return (
    <View style={st.pctWrap}>
      <Text style={[st.pctText, { color }]}>{Math.round(pct)}%</Text>
      <View style={st.pctBar}><View style={[st.pctFill, { width: `${Math.min(100,pct)}%`, backgroundColor: color }]} /></View>
    </View>
  );
}

function SystemRow({ item, onPress }) {
  return (
    <TouchableOpacity style={st.sysRow} onPress={onPress} activeOpacity={0.7}>
      <View style={st.sysLeft}>
        <Text style={st.sysClient} numberOfLines={1}>{item.clientName}</Text>
        <Text style={st.sysName}   numberOfLines={1}>{item.systemName}</Text>
        {item.isStopped && <Text style={st.stoppedTag}>متوقف</Text>}
      </View>
      <View style={st.sysRight}>
        <StageBadge name={item.stageName} sortOrder={item.sortOrder} />
        <ProgressMini pct={item.progressPct} />
      </View>
    </TouchableOpacity>
  );
}

function StageCard({ name, count, sortOrder, onPress }) {
  const color = stageColor(sortOrder, name);
  const short = (name || '').replace(/ (Call|✅|⛔)$/i, '').trim();
  return (
    <TouchableOpacity style={[st.stageCard, { borderTopColor: color }]} onPress={onPress} activeOpacity={0.8}>
      <Text style={[st.stageCount, { color }]}>{count}</Text>
      <Text style={st.stageLabel} numberOfLines={2}>{short}</Text>
    </TouchableOpacity>
  );
}

function VisitRow({ item }) {
  const date   = item.executionDate || item.visitDate || item.date || item.createdOn || '';
  const proj   = item.projectTitle  || item.projectName || '';
  const scope  = item.scopeName     || item.productName || '';
  const user   = item.userName      || item.executedByName || item.createdBy || '';
  const status = item.statusName    || item.status || '';
  const disp   = date ? new Date(date).toLocaleDateString('ar-EG',{ weekday:'short', day:'2-digit', month:'short' }) : '—';
  return (
    <View style={st.visitRow}>
      <View style={st.visitDate}>
        <Text style={st.visitDateText}>{disp}</Text>
      </View>
      <View style={st.visitInfo}>
        <Text style={st.visitProj} numberOfLines={1}>{proj}</Text>
        {scope ? <Text style={st.visitScope} numberOfLines={1}>{scope}</Text> : null}
        {user  ? <Text style={st.visitUser}  numberOfLines={1}>👤 {user}</Text>  : null}
      </View>
      {status ? (
        <View style={[st.visitStatus, { backgroundColor: status === 'Completed' ? '#E8F5E9' : '#FFF3E0' }]}>
          <Text style={{ fontSize: 10, color: status === 'Completed' ? '#2E7D32' : '#E65100', fontWeight: '700' }}>
            {status === 'Completed' ? 'منجز' : status}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

// ─── System detail modal ──────────────────────────────────────────────────────

function SystemModal({ item, onClose }) {
  const slideAnim = useRef(new Animated.Value(600)).current;
  useEffect(() => {
    if (item) Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
  }, [item]);
  const close = () => {
    Animated.timing(slideAnim, { toValue: 600, duration: 200, useNativeDriver: true }).start(onClose);
  };
  if (!item) return null;
  const color = stageColor(item.sortOrder, item.stageName);
  return (
    <Modal visible transparent animationType="none" onRequestClose={close}>
      <TouchableOpacity style={st.overlay} activeOpacity={1} onPress={close}>
        <Animated.View style={[st.sheet, { transform: [{ translateY: slideAnim }] }]}>
          <TouchableOpacity activeOpacity={1}>
            <View style={st.handle} />
            <View style={[st.sheetHeader, { borderBottomColor: color }]}>
              <View style={{ flex: 1 }}>
                <Text style={st.sheetClient}>{item.clientName}</Text>
                <Text style={[st.sheetSystem, { color }]}>{item.systemName}</Text>
              </View>
              <TouchableOpacity onPress={close}><Ionicons name="close" size={22} color="#666" /></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16 }}>
              <View style={st.detailRow}>
                <Text style={st.detailLabel}>المرحلة الحالية</Text>
                <StageBadge name={item.stageName} sortOrder={item.sortOrder} />
              </View>
              <View style={st.detailRow}>
                <Text style={st.detailLabel}>نسبة الإنجاز</Text>
                <Text style={[st.detailVal, { color }]}>{Math.round(item.progressPct)}%</Text>
              </View>
              <View style={st.detailRow}>
                <Text style={st.detailLabel}>المشروع</Text>
                <Text style={st.detailVal}>{item.projectTitle}</Text>
              </View>
              {item.isStopped && (
                <View style={[st.stoppedBanner]}>
                  <Ionicons name="warning-outline" size={16} color="#C62828" />
                  <Text style={{ color: '#C62828', fontWeight: '700', fontSize: 13 }}>هذا المشروع متوقف</Text>
                </View>
              )}
              <Text style={[st.detailLabel, { marginTop: 16, marginBottom: 8 }]}>مسار المراحل</Text>
              {item.allStages.map(stage => {
                const done    = stage.statusId === 3 || stage.statusName === 'Completed';
                const active  = stage.statusId === 2 || stage.statusName === 'InProgress';
                const sc      = done ? '#2E7D32' : active ? color : '#ccc';
                return (
                  <View key={stage.id} style={st.stageRow}>
                    <View style={[st.stageDot, { backgroundColor: sc }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[st.stageRowName, { color: active ? color : done ? '#2E7D32' : '#999' }]}>
                        {(stage.stageName || '').replace(/ Call$/i, '')}
                      </Text>
                      {stage.startedOn && (
                        <Text style={st.stageDate}>
                          {new Date(stage.startedOn).toLocaleDateString('ar-EG')}
                          {stage.endedOn ? ` ← ${new Date(stage.endedOn).toLocaleDateString('ar-EG')}` : ''}
                        </Text>
                      )}
                    </View>
                    <Text style={[st.stagePct, { color: sc }]}>{stage.weightPercent ?? ''}%</Text>
                  </View>
                );
              })}
            </ScrollView>
          </TouchableOpacity>
        </Animated.View>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ImplReportsScreen() {
  const [tab, setTab]           = useState('systems');
  const [systems, setSystems]   = useState([]);
  const [visits, setVisits]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [visitsLoading, setVisitsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch]           = useState('');
  const [stageFilter, setStageFilter] = useState(null);
  const [clientFilter, setClientFilter] = useState(null);
  const [empFilter, setEmpFilter]     = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [sortDesc, setSortDesc]       = useState(false);
  const [selectedSystem, setSelectedSystem] = useState(null);

  // Date filter states
  const [dateMode,    setDateMode]    = useState(null);
  const [selectedYear, setSelectedYear] = useState(THIS_YEAR);
  const [selectedQuarter, setSelectedQuarter] = useState(1);
  const [selectedHalf, setSelectedHalf] = useState(1);
  const [customFrom, setCustomFrom]   = useState('');
  const [customTo,   setCustomTo]     = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await loadAllSystemsWithStages();
      setSystems(data);

      // Load visits in background
      const projectIds = [...new Set(data.map(s => s.projectId))].filter(Boolean);
      setVisitsLoading(true);
      loadVisits(projectIds).then(v => setVisits(v)).finally(() => setVisitsLoading(false));
    } catch (e) {
      console.warn('ImplReports load error:', e?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  const onRefresh = () => { setRefreshing(true); load(); };

  // ── derived data ──────────────────────────────────────────────────────────

  // Unique clients and employees for filter chips
  const uniqueClients   = [...new Set(systems.map(s => s.clientName).filter(Boolean))].sort();
  const uniqueEmployees = [...new Set(systems.flatMap(s => s.employees ?? []).filter(Boolean))].sort();

  const activeFiltersCount = [stageFilter, clientFilter, empFilter].filter(Boolean).length;

  // Compute date range from mode selection
  const { from: filterFrom, to: filterTo } = computeDateRange(
    dateMode, selectedYear, selectedQuarter, selectedHalf, customFrom, customTo
  );

  const filteredSystems = systems
    .filter(s => {
      if (stageFilter  && s.stageName  !== stageFilter)  return false;
      if (clientFilter && s.clientName !== clientFilter)  return false;
      if (empFilter    && !(s.employees ?? []).includes(empFilter)) return false;
      // Date filter: use currentStage.startedOn or any completed stage's date
      if (filterFrom || filterTo) {
        const dateRef = s.currentStage?.startedOn
          || (s.allStages ?? []).find(st => st.startedOn)?.startedOn;
        if (!inDateRange(dateRef, filterFrom, filterTo)) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        return s.clientName.toLowerCase().includes(q) || s.systemName.toLowerCase().includes(q);
      }
      return true;
    })
    .sort((a, b) => sortDesc ? b.progressPct - a.progressPct : a.progressPct - b.progressPct);

  const clearAllFilters = () => { setStageFilter(null); setClientFilter(null); setEmpFilter(null); };

  // Stage cards: group by stageName
  const stageGroups = systems.reduce((acc, s) => {
    const key = s.stageName;
    if (!acc[key]) acc[key] = { name: key, sortOrder: s.sortOrder, count: 0 };
    acc[key].count++;
    return acc;
  }, {});
  const stageCards = Object.values(stageGroups).sort((a, b) => a.sortOrder - b.sortOrder);

  // Unique stage names for filter
  const stageNames = stageCards.map(c => c.name);

  // Visit filter by scope/project + date
  const filteredVisits = visits.filter(v => {
    if (search) {
      const q = search.toLowerCase();
      const match = (v.projectTitle || '').toLowerCase().includes(q)
                 || (v.scopeName || '').toLowerCase().includes(q)
                 || (v.userName  || '').toLowerCase().includes(q);
      if (!match) return false;
    }
    if (filterFrom || filterTo) {
      const dateRef = v.executionDate || v.visitDate || v.date || v.createdOn;
      if (!inDateRange(dateRef, filterFrom, filterTo)) return false;
    }
    return true;
  });

  // Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={st.center}>
        <ActivityIndicator size="large" color="#1565C0" />
        <Text style={st.loadingText}>جاري تحميل بيانات الأنظمة...</Text>
      </View>
    );
  }

  return (
    <View style={st.root}>
      <TabBar tab={tab} setTab={setTab} />

      {/* ── Date filter ───────────────────────────────────────────── */}
      <DateFilterSection
        mode={dateMode}          setMode={setDateMode}
        year={selectedYear}      setYear={setSelectedYear}
        quarter={selectedQuarter} setQuarter={setSelectedQuarter}
        half={selectedHalf}      setHalf={setSelectedHalf}
        customFrom={customFrom}  setCustomFrom={setCustomFrom}
        customTo={customTo}      setCustomTo={setCustomTo}
      />

      {/* ── Search bar ────────────────────────────────────────────── */}
      <View style={st.searchWrap}>
        <Ionicons name="search-outline" size={16} color="#999" />
        <TextInput
          style={st.searchInput}
          placeholder="بحث باسم العميل أو النظام..."
          placeholderTextColor="#bbb"
          value={search}
          onChangeText={setSearch}
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={16} color="#999" />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* ── SYSTEMS TAB ───────────────────────────────────────────── */}
      {tab === 'systems' && (
        <>
          {/* Filter toggle bar */}
          <View style={st.filterBar}>
            <TouchableOpacity style={st.filterToggle} onPress={() => setShowFilters(p => !p)}>
              <Ionicons name="options-outline" size={16} color={activeFiltersCount ? '#1565C0' : '#666'} />
              <Text style={[st.filterToggleText, activeFiltersCount && { color: '#1565C0' }]}>
                فلاتر{activeFiltersCount ? ` (${activeFiltersCount})` : ''}
              </Text>
              <Ionicons name={showFilters ? 'chevron-up' : 'chevron-down'} size={14} color="#999" />
            </TouchableOpacity>
            {activeFiltersCount > 0 && (
              <TouchableOpacity onPress={clearAllFilters} style={st.clearBtn}>
                <Text style={st.clearBtnText}>مسح الكل</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={st.sortBtn2} onPress={() => setSortDesc(p => !p)}>
              <Ionicons name={sortDesc ? 'arrow-down-outline' : 'arrow-up-outline'} size={14} color="#1565C0" />
              <Text style={st.sortText}>{sortDesc ? 'الأعلى أولاً' : 'الأقل أولاً'}</Text>
            </TouchableOpacity>
          </View>

          {/* Filter panel */}
          {showFilters && (
            <View style={st.filterPanel}>
              {/* المراحل */}
              <Text style={st.filterGroupLabel}>المرحلة</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.filterRow}>
                <TouchableOpacity style={[st.chip, !stageFilter && st.chipActive]} onPress={() => setStageFilter(null)}>
                  <Text style={[st.chipText, !stageFilter && st.chipTextActive]}>الكل</Text>
                </TouchableOpacity>
                {stageNames.map(name => (
                  <TouchableOpacity key={name} style={[st.chip, stageFilter === name && st.chipActive]}
                    onPress={() => setStageFilter(stageFilter === name ? null : name)}>
                    <Text style={[st.chipText, stageFilter === name && st.chipTextActive]}>
                      {(name || '').replace(/ (Call|✅|⛔)$/i,'').trim()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* العملاء */}
              <Text style={st.filterGroupLabel}>العميل</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.filterRow}>
                <TouchableOpacity style={[st.chip, !clientFilter && st.chipActive]} onPress={() => setClientFilter(null)}>
                  <Text style={[st.chipText, !clientFilter && st.chipTextActive]}>الكل</Text>
                </TouchableOpacity>
                {uniqueClients.map(name => (
                  <TouchableOpacity key={name} style={[st.chip, clientFilter === name && { backgroundColor: '#E65100', borderColor: '#E65100' }]}
                    onPress={() => setClientFilter(clientFilter === name ? null : name)}>
                    <Text style={[st.chipText, clientFilter === name && { color: '#fff' }]} numberOfLines={1}>{name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* الموظفين */}
              {uniqueEmployees.length > 0 && (
                <>
                  <Text style={st.filterGroupLabel}>الموظف</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.filterRow}>
                    <TouchableOpacity style={[st.chip, !empFilter && st.chipActive]} onPress={() => setEmpFilter(null)}>
                      <Text style={[st.chipText, !empFilter && st.chipTextActive]}>الكل</Text>
                    </TouchableOpacity>
                    {uniqueEmployees.map(name => (
                      <TouchableOpacity key={name} style={[st.chip, empFilter === name && { backgroundColor: '#6A1B9A', borderColor: '#6A1B9A' }]}
                        onPress={() => setEmpFilter(empFilter === name ? null : name)}>
                        <Text style={[st.chipText, empFilter === name && { color: '#fff' }]}>{name}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </>
              )}
            </View>
          )}

          <FlatList
            data={filteredSystems}
            keyExtractor={(_, i) => i.toString()}
            renderItem={({ item }) => <SystemRow item={item} onPress={() => setSelectedSystem(item)} />}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1565C0']} />}
            ListEmptyComponent={<Text style={st.empty}>لا توجد أنظمة</Text>}
            contentContainerStyle={{ paddingBottom: 20 }}
          />
        </>
      )}

      {/* ── STAGES TAB ────────────────────────────────────────────── */}
      {tab === 'stages' && (
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1565C0']} />}
          contentContainerStyle={st.stagesContent}
        >
          <View style={st.stagesGrid}>
            {stageCards.map(card => (
              <StageCard
                key={card.name}
                name={card.name}
                count={card.count}
                sortOrder={card.sortOrder}
                onPress={() => { setStageFilter(card.name); setTab('systems'); }}
              />
            ))}
          </View>

          {/* Systems under each stage as collapsible list */}
          {stageCards.map(card => {
            const items = systems.filter(s => s.stageName === card.name);
            const color = stageColor(card.sortOrder, card.name);
            const short = (card.name || '').replace(/ (Call|✅|⛔)$/i,'').trim();
            return (
              <View key={card.name} style={st.stageSection}>
                <View style={[st.stageSectionHeader, { borderLeftColor: color }]}>
                  <Text style={[st.stageSectionTitle, { color }]}>{short}</Text>
                  <View style={[st.stageBadgeCount, { backgroundColor: color }]}>
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{card.count}</Text>
                  </View>
                </View>
                {items.map((item, i) => (
                  <TouchableOpacity key={i} style={st.stageItem} onPress={() => setSelectedSystem(item)}>
                    <View style={{ flex: 1 }}>
                      <Text style={st.stageItemClient} numberOfLines={1}>{item.clientName}</Text>
                      <Text style={st.stageItemSys}    numberOfLines={1}>{item.systemName}</Text>
                    </View>
                    <ProgressMini pct={item.progressPct} />
                  </TouchableOpacity>
                ))}
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* ── VISITS TAB ────────────────────────────────────────────── */}
      {tab === 'visits' && (
        visitsLoading ? (
          <View style={st.center}>
            <ActivityIndicator size="large" color="#1565C0" />
            <Text style={st.loadingText}>جاري تحميل الزيارات...</Text>
          </View>
        ) : (
          <FlatList
            data={filteredVisits}
            keyExtractor={(_, i) => i.toString()}
            renderItem={({ item }) => <VisitRow item={item} />}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1565C0']} />}
            ListHeaderComponent={
              <View style={st.visitsHeader}>
                <Ionicons name="car-outline" size={16} color="#1565C0" />
                <Text style={st.visitsHeaderText}>{filteredVisits.length} زيارة</Text>
              </View>
            }
            ListEmptyComponent={<Text style={st.empty}>لا توجد زيارات مسجلة</Text>}
            contentContainerStyle={{ paddingBottom: 20 }}
          />
        )
      )}

      {/* ── System detail modal ───────────────────────────────────── */}
      <SystemModal item={selectedSystem} onClose={() => setSelectedSystem(null)} />
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#F5F7FA' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { color: '#666', fontSize: 14 },
  empty:  { textAlign: 'center', color: '#aaa', padding: 32, fontSize: 14 },

  tabBar: {
    flexDirection: 'row', backgroundColor: '#fff', paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6,
    borderBottomWidth: 1, borderBottomColor: '#EEE',
  },
  tabBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, paddingVertical: 8, borderRadius: 8,
  },
  tabBtnActive: { backgroundColor: '#E3F2FD' },
  tabLabel:     { fontSize: 13, color: '#999', fontWeight: '600' },
  tabLabelActive: { color: '#1565C0', fontWeight: '700' },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    margin: 12, marginBottom: 6, borderRadius: 10, paddingHorizontal: 12,
    paddingVertical: 8, gap: 8,
    elevation: 1, shadowColor: '#000', shadowOffset:{width:0,height:1}, shadowOpacity:0.05, shadowRadius:3,
  },
  searchInput: { flex: 1, fontSize: 14, color: '#222', textAlign: 'right', padding: 0 },

  filterRow:  { paddingHorizontal: 12, paddingVertical: 6, gap: 6 },
  chip:       { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 5, backgroundColor: '#fff', borderWidth: 1, borderColor: '#DDD' },
  chipActive: { backgroundColor: '#1565C0', borderColor: '#1565C0' },
  chipText:   { fontSize: 12, color: '#555', fontWeight: '600' },
  chipTextActive: { color: '#fff' },

  filterBar: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, gap: 8,
  },
  filterToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#fff',
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
    elevation: 1, shadowColor: '#000', shadowOffset:{width:0,height:1}, shadowOpacity:0.05, shadowRadius:2,
  },
  filterToggleText: { fontSize: 13, color: '#666', fontWeight: '600' },
  clearBtn: {
    backgroundColor: '#FFEBEE', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
  },
  clearBtnText: { fontSize: 12, color: '#C62828', fontWeight: '700' },
  sortBtn2: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto' },
  sortText: { fontSize: 12, color: '#1565C0', fontWeight: '600' },

  filterPanel: {
    backgroundColor: '#fff', marginHorizontal: 12, marginBottom: 8, borderRadius: 12, paddingTop: 10, paddingBottom: 6,
    elevation: 2, shadowColor: '#000', shadowOffset:{width:0,height:1}, shadowOpacity:0.07, shadowRadius:4,
  },
  filterGroupLabel: { fontSize: 11, color: '#999', fontWeight: '700', paddingHorizontal: 12, marginBottom: 4, marginTop: 4 },

  sysRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    marginHorizontal: 12, marginBottom: 6, borderRadius: 12, padding: 12,
    elevation: 1, shadowColor: '#000', shadowOffset:{width:0,height:1}, shadowOpacity:0.05, shadowRadius:3,
  },
  sysLeft:    { flex: 1 },
  sysClient:  { fontSize: 11, color: '#888' },
  sysName:    { fontSize: 14, fontWeight: '700', color: '#1a1a1a', marginTop: 1 },
  stoppedTag: { fontSize: 10, color: '#C62828', fontWeight: '700', marginTop: 2 },
  sysRight:   { alignItems: 'flex-end', gap: 6, marginLeft: 8 },

  badge: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1 },
  badgeText: { fontSize: 10, fontWeight: '700' },

  pctWrap:  { alignItems: 'flex-end', minWidth: 48 },
  pctText:  { fontSize: 13, fontWeight: '800' },
  pctBar:   { width: 48, height: 3, backgroundColor: '#EEE', borderRadius: 2, marginTop: 2, overflow: 'hidden' },
  pctFill:  { height: 3, borderRadius: 2 },

  // Stages tab
  stagesContent: { padding: 12, paddingBottom: 24 },
  stagesGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  stageCard: {
    width: '30%', backgroundColor: '#fff', borderRadius: 12, padding: 12,
    borderTopWidth: 3, alignItems: 'center',
    elevation: 2, shadowColor: '#000', shadowOffset:{width:0,height:1}, shadowOpacity:0.06, shadowRadius:4,
  },
  stageCount: { fontSize: 26, fontWeight: '800' },
  stageLabel: { fontSize: 10, color: '#444', textAlign: 'center', marginTop: 3 },

  stageSection: {
    backgroundColor: '#fff', borderRadius: 12, marginBottom: 12, overflow: 'hidden',
    elevation: 1, shadowColor: '#000', shadowOffset:{width:0,height:1}, shadowOpacity:0.05, shadowRadius:3,
  },
  stageSectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 12, borderLeftWidth: 4, borderBottomWidth: 1, borderBottomColor: '#F5F5F5',
  },
  stageSectionTitle: { fontSize: 14, fontWeight: '700' },
  stageBadgeCount:   { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  stageItem: {
    flexDirection: 'row', alignItems: 'center', padding: 10,
    borderBottomWidth: 1, borderBottomColor: '#F8F8F8',
  },
  stageItemClient: { fontSize: 11, color: '#888' },
  stageItemSys:    { fontSize: 13, fontWeight: '600', color: '#222' },

  // Visits tab
  visitsHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingTop: 8, paddingBottom: 4,
  },
  visitsHeaderText: { fontSize: 13, color: '#1565C0', fontWeight: '700' },

  visitRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    marginHorizontal: 12, marginBottom: 6, borderRadius: 12, padding: 12, gap: 10,
    elevation: 1, shadowColor: '#000', shadowOffset:{width:0,height:1}, shadowOpacity:0.05, shadowRadius:3,
  },
  visitDate:     { backgroundColor: '#E3F2FD', borderRadius: 8, padding: 8, minWidth: 68, alignItems: 'center' },
  visitDateText: { fontSize: 11, color: '#1565C0', fontWeight: '700', textAlign: 'center', lineHeight: 16 },
  visitInfo:     { flex: 1 },
  visitProj:     { fontSize: 13, fontWeight: '700', color: '#222' },
  visitScope:    { fontSize: 11, color: '#666', marginTop: 1 },
  visitUser:     { fontSize: 11, color: '#1565C0', marginTop: 2 },
  visitStatus:   { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 4 },

  // System modal
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet:   { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '85%' },
  handle:  { width: 40, height: 4, backgroundColor: '#ddd', borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'flex-start', padding: 16, gap: 10,
    borderBottomWidth: 2, marginBottom: 4,
  },
  sheetClient: { fontSize: 12, color: '#888' },
  sheetSystem: { fontSize: 18, fontWeight: '800' },

  detailRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  detailLabel:{ fontSize: 13, color: '#666', fontWeight: '600' },
  detailVal:  { fontSize: 14, fontWeight: '700', color: '#222' },

  stoppedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFEBEE',
    borderRadius: 8, padding: 10, marginBottom: 12,
  },

  stageRow:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 10, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  stageDot:     { width: 10, height: 10, borderRadius: 5 },
  stageRowName: { fontSize: 13, fontWeight: '600' },
  stageDate:    { fontSize: 10, color: '#aaa', marginTop: 2 },
  stagePct:     { fontSize: 12, fontWeight: '700', minWidth: 30, textAlign: 'right' },

  // Date filter section
  dateSection: {
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#EEE', paddingBottom: 6,
  },
  chipDate: { backgroundColor: '#1565C0', borderColor: '#1565C0' },
  yearRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, paddingVertical: 6,
  },
  yearBtn: { padding: 6 },
  yearText: { fontSize: 16, fontWeight: '800', color: '#1565C0', minWidth: 60, textAlign: 'center' },
  periodGrid: {
    flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, gap: 8, paddingBottom: 8,
  },
  periodCard: {
    width: '46%', backgroundColor: '#F5F7FA', borderRadius: 10, padding: 10,
    borderWidth: 1.5, borderColor: '#DDD', alignItems: 'center',
  },
  periodCardHalf: { width: '46%' },
  periodCardActive: { backgroundColor: '#1565C0', borderColor: '#1565C0' },
  periodCardTitle: { fontSize: 13, fontWeight: '700', color: '#333', textAlign: 'center' },
  periodCardSub:   { fontSize: 10, color: '#888', marginTop: 2, textAlign: 'center' },
  customRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8, paddingBottom: 8,
  },
  customField: { flex: 1 },
  customLabel: { fontSize: 11, color: '#888', marginBottom: 4, fontWeight: '600', textAlign: 'right' },
  customInput: {
    backgroundColor: '#F5F7FA', borderRadius: 8, borderWidth: 1, borderColor: '#DDD',
    paddingHorizontal: 10, paddingVertical: 7, fontSize: 13, color: '#222', textAlign: 'center',
  },
});
