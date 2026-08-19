/**
 * ReportsScreen — تقارير التنفيذ
 * Tabs: الأنظمة / المراحل / الزيارات
 * Visits: period filter + detail modal + group by client/system
 */
import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, SectionList, FlatList, StyleSheet, TouchableOpacity,
  TextInput, RefreshControl, ActivityIndicator, Modal, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../api/client';
import { useRole } from '../context/RoleContext';

// ─── Data loaders ─────────────────────────────────────────────────────────────

async function loadAllSystemsWithStages() {
  const projRes = await api.post('/Project/GetAll', { pageNo: 1, pageSize: 200 });
  const projects = projRes?.data?.data ?? [];
  const scopes = [];
  for (const proj of projects) {
    const projUsers = (proj.projectUsers ?? []).map(u =>
      u.fullName || u.FullName || u.userName || u.UserName || u.name || ''
    ).filter(Boolean);
    const projUserIds = (proj.projectUsers ?? []).map(u => {
      const v = u?.key ?? u?.Key ?? u?.userId ?? u?.UserId ?? u?.user_id ?? u?.id ?? u?.Id ?? null;
      return v != null ? String(v) : '';
    }).filter(Boolean);
    for (const sc of proj.scopes ?? []) {
      const scopeUsers = (sc.users ?? []).map(u =>
        u.fullName || u.FullName || u.userName || u.UserName || u.name || ''
      ).filter(Boolean);
      scopes.push({
        scopeId: sc.id, systemName: sc.productName || '',
        clientName: proj.customerName || '', projectId: proj.id,
        projectTitle: proj.title || '', progressPct: sc.progressPercent ?? 0,
        isStopped: proj.stopped ?? false,
        employees: scopeUsers.length ? scopeUsers : projUsers,
        projectUserIds: projUserIds,
      });
    }
  }
  const stageResults = await Promise.allSettled(
    scopes.map(s => api.get(`/ProjectScopeStage/GetByScope/${s.scopeId}`))
  );
  return scopes.map((scope, i) => {
    const res = stageResults[i];
    if (res.status !== 'fulfilled') return { ...scope, currentStage: null, allStages: [], stageName: '—', sortOrder: 999 };
    const stages = res.value?.data?.data ?? res.value?.data ?? [];
    if (!Array.isArray(stages) || stages.length === 0) return { ...scope, currentStage: null, allStages: [], stageName: '—', sortOrder: 999 };
    const stageUsers = stages.map(s => s.endedByUserName).filter(Boolean);
    const allEmployees = [...new Set([...scope.employees, ...stageUsers])];
    const inProgress = stages.find(st => st.statusId === 2 || st.statusName === 'InProgress');
    const allDone    = stages.every(st => st.statusId === 3 || st.statusName === 'Completed');
    const lastDone   = [...stages].reverse().find(st => st.statusId === 3 || st.statusName === 'Completed');
    let current;
    if (scope.isStopped)    current = { stageName: 'مرتجع ⛔', stageSortOrder: 9998 };
    else if (allDone)       current = { stageName: 'منتهي ✅',  stageSortOrder: 9997 };
    else if (inProgress)    current = inProgress;
    else if (lastDone) { const ni = stages.findIndex(s => s.id === lastDone.id) + 1; current = stages[ni] || lastDone; }
    else                    current = stages[0];
    return { ...scope, currentStage: current, allStages: stages, stageName: current?.stageName || '—', sortOrder: current?.stageSortOrder ?? 99, stageWeight: current?.weightPercent ?? null, employees: allEmployees };
  });
}

async function loadVisits(projectIds) {
  if (!projectIds.length) return [];
  const results = await Promise.allSettled(projectIds.map(id => api.get(`/PlanExecution/GetByFilter?projectId=${id}`)));
  const all = [];
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    const list = r.value?.data?.data ?? r.value?.data ?? [];
    if (Array.isArray(list)) all.push(...list);
  }
  return all;
}

// ─── Visit helpers ────────────────────────────────────────────────────────────

function visitDate(v) {
  return v.executionDate || v.visitDate || v.date || v.createdOn || '';
}

function filterByPeriod(visits, period) {
  if (!period) return visits;
  const now   = new Date();
  const today = now.toISOString().split('T')[0];
  let from, to = today;
  if (period === 'week') {
    const d = new Date(now); d.setDate(d.getDate() - 7);
    from = d.toISOString().split('T')[0];
  } else if (period === 'month') {
    from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  } else if (period === 'quarter') {
    const qm = Math.floor(now.getMonth() / 3) * 3;
    from = `${now.getFullYear()}-${String(qm + 1).padStart(2, '0')}-01`;
  } else if (period === 'year') {
    from = `${now.getFullYear()}-01-01`;
  }
  return visits.filter(v => {
    const d = visitDate(v).slice(0, 10);
    if (!d) return true;
    if (from && d < from) return false;
    if (to   && d > to)   return false;
    return true;
  });
}

function groupVisits(visits, by) {
  // by = 'client' | 'system'
  const map = {};
  for (const v of visits) {
    const key = by === 'client'
      ? (v.projectTitle || v.projectName || '—')
      : (v.scopeName || v.productName || '—');
    if (!map[key]) map[key] = { title: key, data: [], count: 0 };
    map[key].data.push(v);
    map[key].count++;
  }
  return Object.values(map).sort((a, b) => b.count - a.count);
}

// ─── Colors ───────────────────────────────────────────────────────────────────

const PALETTE = ['#1565C0','#0288D1','#00838F','#00897B','#2E7D32','#558B2F','#6A1B9A','#AD1457'];
function stageColor(sortOrder, name = '') {
  const n = (name || '').toLowerCase();
  if (n.includes('منته') || n.includes('✅')) return '#2E7D32';
  if (n.includes('مرتجع') || n.includes('⛔'))  return '#C62828';
  return PALETTE[(sortOrder - 1) % PALETTE.length];
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TabBar({ tab, setTab, systemsCount, stagesCount, visitsCount }) {
  const tabs = [
    { key: 'systems', label: 'الأنظمة',  icon: 'layers-outline',    count: systemsCount },
    { key: 'stages',  label: 'المراحل',  icon: 'git-branch-outline', count: stagesCount  },
    { key: 'visits',  label: 'الزيارات', icon: 'car-outline',        count: visitsCount  },
  ];
  return (
    <View style={s.tabBar}>
      {tabs.map(t => {
        const active = tab === t.key;
        return (
          <TouchableOpacity key={t.key} style={[s.tabBtn, active && s.tabBtnActive]} onPress={() => setTab(t.key)}>
            <Ionicons name={t.icon} size={15} color={active ? '#1565C0' : '#aaa'} />
            <Text style={[s.tabLabel, active && s.tabLabelActive]}>{t.label}</Text>
            {t.count > 0 && (
              <View style={[s.tabCount, active && s.tabCountActive]}>
                <Text style={[s.tabCountText, active && { color: '#1565C0' }]}>{t.count}</Text>
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function StageBadge({ name, sortOrder }) {
  const color = stageColor(sortOrder, name);
  const short = (name || '').replace(/ (Call|✅|⛔)$/i, '').trim().slice(0, 16);
  return (
    <View style={[s.badge, { backgroundColor: color + '18', borderColor: color + '44' }]}>
      <Text style={[s.badgeText, { color }]}>{short}</Text>
    </View>
  );
}

function ProgressMini({ pct }) {
  const color = pct >= 85 ? '#2E7D32' : pct >= 50 ? '#1565C0' : '#E65100';
  return (
    <View style={s.pctWrap}>
      <Text style={[s.pctText, { color }]}>{Math.round(pct)}%</Text>
      <View style={s.pctBar}><View style={[s.pctFill, { width: `${Math.min(100, pct)}%`, backgroundColor: color }]} /></View>
    </View>
  );
}

function SystemCard({ item, onPress }) {
  return (
    <TouchableOpacity style={s.sysCard} onPress={onPress} activeOpacity={0.75}>
      <View style={s.sysCardTop}>
        <View style={{ flex: 1 }}>
          <Text style={s.sysClient} numberOfLines={1}>{item.clientName}</Text>
          <Text style={s.sysName}   numberOfLines={1}>{item.systemName}</Text>
          {item.employees.length > 0 && (
            <Text style={s.sysEmp} numberOfLines={1}>
              👤 {item.employees.slice(0, 2).join(' · ')}{item.employees.length > 2 ? ` +${item.employees.length - 2}` : ''}
            </Text>
          )}
        </View>
        <View style={s.sysRight}>
          <StageBadge name={item.stageName} sortOrder={item.sortOrder} />
          <ProgressMini pct={item.progressPct} />
        </View>
      </View>
      {item.isStopped && (
        <View style={s.stoppedBanner}>
          <Ionicons name="warning-outline" size={12} color="#C62828" />
          <Text style={s.stoppedText}>متوقف</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

function StageCard({ name, count, sortOrder, onPress }) {
  const color = stageColor(sortOrder, name);
  const short = (name || '').replace(/ (Call|✅|⛔)$/i, '').trim();
  return (
    <TouchableOpacity style={[s.stageCard, { borderTopColor: color }]} onPress={onPress} activeOpacity={0.8}>
      <Text style={[s.stageCount, { color }]}>{count}</Text>
      <Text style={s.stageLabel} numberOfLines={2}>{short}</Text>
    </TouchableOpacity>
  );
}

function VisitRow({ item, onPress }) {
  const date   = visitDate(item);
  const proj   = item.projectTitle  || item.projectName || '';
  const scope  = item.scopeName     || item.productName || '';
  const user   = item.userName      || item.executedByName || item.createdBy || '';
  const status = item.statusName    || item.status || '';
  const disp   = date ? new Date(date).toLocaleDateString('ar-EG', { weekday: 'short', day: '2-digit', month: 'short' }) : '—';
  const isDone = status === 'Completed' || status === 'منجز';
  return (
    <TouchableOpacity style={s.visitRow} onPress={onPress} activeOpacity={0.75}>
      <View style={s.visitDate}>
        <Text style={s.visitDateText}>{disp}</Text>
      </View>
      <View style={s.visitInfo}>
        <Text style={s.visitProj}  numberOfLines={1}>{proj}</Text>
        {scope ? <Text style={s.visitScope} numberOfLines={1}>{scope}</Text> : null}
        {user  ? <Text style={s.visitUser}  numberOfLines={1}>👤 {user}</Text>  : null}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        {status ? (
          <View style={[s.visitStatus, { backgroundColor: isDone ? '#E8F5E9' : '#FFF3E0' }]}>
            <Text style={{ fontSize: 10, color: isDone ? '#2E7D32' : '#E65100', fontWeight: '700' }}>
              {isDone ? 'منجز' : (status || 'جارٍ')}
            </Text>
          </View>
        ) : null}
        <Ionicons name="chevron-back" size={14} color="#ddd" />
      </View>
    </TouchableOpacity>
  );
}

// ─── Visit detail modal ───────────────────────────────────────────────────────

function VisitModal({ item, onClose }) {
  const slideAnim = useRef(new Animated.Value(700)).current;
  useEffect(() => {
    if (item) Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
  }, [item]);
  const close = () => {
    Animated.timing(slideAnim, { toValue: 700, duration: 200, useNativeDriver: true }).start(onClose);
  };
  if (!item) return null;

  const date   = visitDate(item);
  const proj   = item.projectTitle   || item.projectName  || '—';
  const scope  = item.scopeName      || item.productName  || '—';
  const user   = item.userName       || item.executedByName || item.createdBy || '—';
  const status = item.statusName     || item.status       || '—';
  const notes  = item.notes          || item.description  || item.comment    || '';
  const plan   = item.planName       || item.plan         || '';
  const phone  = item.phoneNumber    || item.phone        || '';
  const isDone = status === 'Completed' || status === 'منجز';
  const dateDisp = date ? new Date(date).toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '—';

  const Row = ({ icon, label, value, color }) => {
    if (!value || value === '—') return null;
    return (
      <View style={s.detailRow}>
        <View style={[s.detailIcon, { backgroundColor: (color || '#1565C0') + '18' }]}>
          <Ionicons name={icon} size={16} color={color || '#1565C0'} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.detailLabel}>{label}</Text>
          <Text style={s.detailVal}>{value}</Text>
        </View>
      </View>
    );
  };

  return (
    <Modal visible transparent animationType="none" onRequestClose={close}>
      <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={close}>
        <Animated.View style={[s.sheet, { transform: [{ translateY: slideAnim }] }]}>
          <TouchableOpacity activeOpacity={1}>
            <View style={s.handle} />
            {/* Header */}
            <View style={s.visitModalHeader}>
              <View style={[s.visitStatusPill, { backgroundColor: isDone ? '#E8F5E9' : '#FFF3E0' }]}>
                <Ionicons name={isDone ? 'checkmark-circle' : 'time'} size={14} color={isDone ? '#2E7D32' : '#E65100'} />
                <Text style={[s.visitStatusPillText, { color: isDone ? '#2E7D32' : '#E65100' }]}>
                  {isDone ? 'منجزة' : 'جارية'}
                </Text>
              </View>
              <TouchableOpacity onPress={close} style={{ padding: 4 }}>
                <Ionicons name="close" size={22} color="#888" />
              </TouchableOpacity>
            </View>
            <Text style={s.visitModalTitle}>{proj}</Text>
            {scope !== '—' && <Text style={s.visitModalScope}>{scope}</Text>}

            <ScrollView contentContainerStyle={s.visitModalBody} showsVerticalScrollIndicator={false}>
              <Row icon="calendar-outline"      label="تاريخ الزيارة"    value={dateDisp}  color="#1565C0" />
              <Row icon="person-outline"         label="المنفذ"           value={user}      color="#6A1B9A" />
              <Row icon="layers-outline"         label="النظام"           value={scope}     color="#0288D1" />
              <Row icon="briefcase-outline"      label="المشروع"          value={proj}      color="#00897B" />
              <Row icon="call-outline"           label="رقم الهاتف"       value={phone}     color="#388E3C" />
              <Row icon="document-text-outline"  label="الخطة"            value={plan}      color="#F57C00" />
              <Row icon="checkmark-circle-outline" label="الحالة"         value={isDone ? 'منجزة' : status} color={isDone ? '#2E7D32' : '#E65100'} />
              {notes ? (
                <View style={s.notesBlock}>
                  <Text style={s.notesLabel}>ملاحظات</Text>
                  <Text style={s.notesText}>{notes}</Text>
                </View>
              ) : null}
            </ScrollView>
          </TouchableOpacity>
        </Animated.View>
      </TouchableOpacity>
    </Modal>
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
      <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={close}>
        <Animated.View style={[s.sheet, { transform: [{ translateY: slideAnim }] }]}>
          <TouchableOpacity activeOpacity={1}>
            <View style={s.handle} />
            <View style={[s.sheetHeader, { borderBottomColor: color }]}>
              <View style={{ flex: 1 }}>
                <Text style={s.sheetClient}>{item.clientName}</Text>
                <Text style={[s.sheetSystem, { color }]}>{item.systemName}</Text>
              </View>
              <TouchableOpacity onPress={close}><Ionicons name="close" size={22} color="#666" /></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16 }}>
              <View style={s.detailRow}>
                <View style={[s.detailIcon, { backgroundColor: color + '18' }]}><Ionicons name="git-branch-outline" size={16} color={color} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.detailLabel}>المرحلة الحالية</Text>
                  <StageBadge name={item.stageName} sortOrder={item.sortOrder} />
                </View>
              </View>
              <View style={s.detailRow}>
                <View style={[s.detailIcon, { backgroundColor: color + '18' }]}><Ionicons name="stats-chart-outline" size={16} color={color} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.detailLabel}>نسبة الإنجاز</Text>
                  <Text style={[s.detailVal, { color }]}>{Math.round(item.progressPct)}%</Text>
                </View>
              </View>
              {item.employees.length > 0 && (
                <View style={s.detailRow}>
                  <View style={[s.detailIcon, { backgroundColor: '#6A1B9A18' }]}><Ionicons name="people-outline" size={16} color="#6A1B9A" /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.detailLabel}>المنفذون</Text>
                    <Text style={s.detailVal}>{item.employees.join('، ')}</Text>
                  </View>
                </View>
              )}
              {item.isStopped && (
                <View style={s.stoppedBannerModal}>
                  <Ionicons name="warning-outline" size={16} color="#C62828" />
                  <Text style={{ color: '#C62828', fontWeight: '700', fontSize: 13 }}>هذا المشروع متوقف</Text>
                </View>
              )}
              <Text style={[s.detailLabel, { marginTop: 16, marginBottom: 8, color: '#888' }]}>مسار المراحل</Text>
              {item.allStages.map(stage => {
                const done   = stage.statusId === 3 || stage.statusName === 'Completed';
                const active = stage.statusId === 2 || stage.statusName === 'InProgress';
                const sc     = done ? '#2E7D32' : active ? color : '#ccc';
                return (
                  <View key={stage.id} style={s.stageRow}>
                    <View style={[s.stageDot, { backgroundColor: sc }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[s.stageRowName, { color: active ? color : done ? '#2E7D32' : '#999' }]}>
                        {(stage.stageName || '').replace(/ Call$/i, '')}
                      </Text>
                      {stage.startedOn && (
                        <Text style={s.stageDate}>
                          {new Date(stage.startedOn).toLocaleDateString('ar-EG')}
                          {stage.endedOn ? ` ← ${new Date(stage.endedOn).toLocaleDateString('ar-EG')}` : ''}
                        </Text>
                      )}
                    </View>
                    <Text style={[s.stagePct, { color: sc }]}>{stage.weightPercent ?? ''}%</Text>
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

// ─── Filter chips ─────────────────────────────────────────────────────────────

function FilterChips({ label, items, active, onSelect, color = '#1565C0' }) {
  return (
    <View style={s.filterGroup}>
      <Text style={s.filterGroupLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
        <TouchableOpacity style={[s.chip, !active && { backgroundColor: color, borderColor: color }]} onPress={() => onSelect(null)}>
          <Text style={[s.chipText, !active && { color: '#fff' }]}>الكل</Text>
        </TouchableOpacity>
        {items.map(name => (
          <TouchableOpacity key={name} style={[s.chip, active === name && { backgroundColor: color, borderColor: color }]}
            onPress={() => onSelect(active === name ? null : name)}>
            <Text style={[s.chipText, active === name && { color: '#fff' }]} numberOfLines={1}>{name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

// ─── Visit period pills ───────────────────────────────────────────────────────

function VisitPeriodBar({ period, onSelect }) {
  const opts = [
    { key: null,      label: 'الكل' },
    { key: 'week',    label: 'هذا الأسبوع' },
    { key: 'month',   label: 'هذا الشهر' },
    { key: 'quarter', label: 'هذا الربع' },
    { key: 'year',    label: 'هذه السنة' },
  ];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.periodBar} contentContainerStyle={s.periodBarContent}>
      {opts.map(o => (
        <TouchableOpacity key={String(o.key)} style={[s.periodPill, period === o.key && s.periodPillActive]} onPress={() => onSelect(o.key)}>
          <Text style={[s.periodPillText, period === o.key && s.periodPillTextActive]}>{o.label}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

// ─── Visit view toggle ────────────────────────────────────────────────────────

function VisitViewToggle({ mode, onSelect, counts }) {
  const opts = [
    { key: 'list',   label: 'قائمة',    icon: 'list-outline' },
    { key: 'client', label: 'بالعميل',  icon: 'business-outline' },
    { key: 'system', label: 'بالنظام',  icon: 'layers-outline' },
  ];
  return (
    <View style={s.viewToggle}>
      {opts.map(o => {
        const active = mode === o.key;
        return (
          <TouchableOpacity key={o.key} style={[s.viewToggleBtn, active && s.viewToggleBtnActive]} onPress={() => onSelect(o.key)}>
            <Ionicons name={o.icon} size={13} color={active ? '#1565C0' : '#999'} />
            <Text style={[s.viewToggleText, active && s.viewToggleTextActive]}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── Grouped visit section ────────────────────────────────────────────────────

function GroupedVisitSection({ section, onPress }) {
  const [expanded, setExpanded] = useState(true);
  return (
    <View style={s.groupSection}>
      <TouchableOpacity style={s.groupHeader} onPress={() => setExpanded(e => !e)} activeOpacity={0.7}>
        <Text style={s.groupTitle} numberOfLines={1}>{section.title}</Text>
        <View style={s.groupMeta}>
          <View style={s.groupCountBadge}>
            <Text style={s.groupCountText}>{section.count} زيارة</Text>
          </View>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color="#999" />
        </View>
      </TouchableOpacity>
      {expanded && section.data.map((item, i) => (
        <VisitRow key={i} item={item} onPress={() => onPress(item)} />
      ))}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ReportsScreen() {
  const { visibleCrmIds, visibleNames } = useRole();

  const [tab,          setTab]          = useState('systems');
  const [systems,      setSystems]      = useState([]);
  const [visits,       setVisits]       = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [visitsLoading, setVisitsLoading] = useState(false);
  const [refreshing,   setRefreshing]   = useState(false);

  // Systems + Stages filters
  const [search,       setSearch]       = useState('');
  const [clientFilter, setClientFilter] = useState(null);
  const [empFilter,    setEmpFilter]    = useState(null);
  const [stageFilter,  setStageFilter]  = useState(null);
  const [sortDesc,     setSortDesc]     = useState(false);
  const [selectedSystem, setSelectedSystem] = useState(null);

  // Visits filters + state
  const [visitPeriod,   setVisitPeriod]   = useState(null);
  const [visitViewMode, setVisitViewMode] = useState('list');   // 'list' | 'client' | 'system'
  const [visitSearch,   setVisitSearch]   = useState('');
  const [selectedVisit, setSelectedVisit] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await loadAllSystemsWithStages();
      setSystems(data);
      const projectIds = [...new Set(data.map(s => s.projectId))].filter(Boolean);
      setVisitsLoading(true);
      loadVisits(projectIds).then(v => setVisits(v)).finally(() => setVisitsLoading(false));
    } catch (e) {
      console.warn('ReportsScreen load error:', e?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── role filter ─────────────────────────────────────────────────────────

  const roleSystems = visibleCrmIds === null
    ? systems
    : systems.filter(s => (s.projectUserIds ?? []).some(id => visibleCrmIds.includes(id)));

  const roleVisits = visibleCrmIds === null
    ? visits
    : visits.filter(v => {
        const vid = String(v.userId || v.UserId || v.executedById || '');
        if (vid && visibleCrmIds.includes(vid)) return true;
        if (visibleNames) {
          const name = v.userName || v.executedByName || v.createdBy || '';
          return visibleNames.some(n => name && name.includes(n));
        }
        return true;
      });

  // ── systems filter options ───────────────────────────────────────────────

  const uniqueClients   = [...new Set(roleSystems.map(s => s.clientName).filter(Boolean))].sort();
  const uniqueEmployees = [...new Set(roleSystems.flatMap(s => s.employees ?? []).filter(Boolean))].sort();

  const filteredSystems = roleSystems
    .filter(s => {
      if (stageFilter  && s.stageName  !== stageFilter)            return false;
      if (clientFilter && s.clientName !== clientFilter)            return false;
      if (empFilter    && !(s.employees ?? []).includes(empFilter)) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!(s.clientName || '').toLowerCase().includes(q) &&
            !(s.systemName || '').toLowerCase().includes(q))       return false;
      }
      return true;
    })
    .sort((a, b) => sortDesc ? b.progressPct - a.progressPct : a.progressPct - b.progressPct);

  const stageGroups = filteredSystems.reduce((acc, s) => {
    const key = s.stageName;
    if (!acc[key]) acc[key] = { name: key, sortOrder: s.sortOrder, count: 0 };
    acc[key].count++;
    return acc;
  }, {});
  const stageCards = Object.values(stageGroups).sort((a, b) => a.sortOrder - b.sortOrder);
  const stageNames = stageCards.map(c => c.name);

  // ── visits filter pipeline ───────────────────────────────────────────────

  const periodFiltered = filterByPeriod(roleVisits, visitPeriod);

  const filteredVisits = periodFiltered.filter(v => {
    if (!visitSearch) return true;
    const q = visitSearch.toLowerCase();
    return (v.projectTitle || '').toLowerCase().includes(q)
        || (v.scopeName    || '').toLowerCase().includes(q)
        || (v.userName     || '').toLowerCase().includes(q);
  });

  const groupedVisits = groupVisits(filteredVisits, visitViewMode === 'client' ? 'client' : 'system');

  // ── misc ─────────────────────────────────────────────────────────────────

  const clearFilters = () => { setClientFilter(null); setEmpFilter(null); setStageFilter(null); setSearch(''); };
  const activeFilters = [clientFilter, empFilter, stageFilter].filter(Boolean).length + (search ? 1 : 0);
  const onRefresh = () => { setRefreshing(true); load(); };

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color="#1565C0" />
        <Text style={s.loadingText}>جاري تحميل البيانات...</Text>
      </View>
    );
  }

  return (
    <View style={s.root}>
      {/* ── Tabs ──────────────────────────────────────────────────────────── */}
      <TabBar
        tab={tab} setTab={setTab}
        systemsCount={filteredSystems.length}
        stagesCount={stageCards.length}
        visitsCount={filteredVisits.length}
      />

      {/* ════════════ SYSTEMS & STAGES: search + filters ════════════════════ */}
      {tab !== 'visits' && (
        <>
          <View style={s.searchRow}>
            <View style={s.searchWrap}>
              <Ionicons name="search-outline" size={15} color="#bbb" />
              <TextInput style={s.searchInput} placeholder="بحث..." placeholderTextColor="#ccc" value={search} onChangeText={setSearch} />
              {search ? <TouchableOpacity onPress={() => setSearch('')}><Ionicons name="close-circle" size={15} color="#ccc" /></TouchableOpacity> : null}
            </View>
            <TouchableOpacity style={s.sortBtn} onPress={() => setSortDesc(p => !p)}>
              <Ionicons name={sortDesc ? 'arrow-down-outline' : 'arrow-up-outline'} size={16} color="#1565C0" />
            </TouchableOpacity>
            {activeFilters > 0 && (
              <TouchableOpacity style={s.clearBtn} onPress={clearFilters}>
                <Text style={s.clearBtnText}>مسح ({activeFilters})</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={s.filtersBlock}>
            {uniqueClients.length > 0 && <FilterChips label="العميل" items={uniqueClients} active={clientFilter} onSelect={setClientFilter} color="#E65100" />}
            {uniqueEmployees.length > 0 && <FilterChips label="الموظف" items={uniqueEmployees} active={empFilter} onSelect={setEmpFilter} color="#6A1B9A" />}
            {tab === 'systems' && stageNames.length > 0 && <FilterChips label="المرحلة" items={stageNames} active={stageFilter} onSelect={setStageFilter} color="#1565C0" />}
          </View>
        </>
      )}

      {/* ════════════ SYSTEMS TAB ════════════════════════════════════════════ */}
      {tab === 'systems' && (
        <FlatList
          data={filteredSystems}
          keyExtractor={(_, i) => i.toString()}
          renderItem={({ item }) => <SystemCard item={item} onPress={() => setSelectedSystem(item)} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1565C0']} />}
          ListEmptyComponent={<View style={s.emptyWrap}><Ionicons name="layers-outline" size={48} color="#ddd" /><Text style={s.emptyText}>لا توجد أنظمة</Text></View>}
          contentContainerStyle={{ padding: 10, paddingBottom: 30 }}
        />
      )}

      {/* ════════════ STAGES TAB ═════════════════════════════════════════════ */}
      {tab === 'stages' && (
        <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1565C0']} />} contentContainerStyle={{ padding: 10, paddingBottom: 30 }}>
          <View style={s.stagesGrid}>
            {stageCards.map(card => (
              <StageCard key={card.name} name={card.name} count={card.count} sortOrder={card.sortOrder}
                onPress={() => { setStageFilter(card.name); setTab('systems'); }} />
            ))}
          </View>
          {stageCards.map(card => {
            const items = filteredSystems.filter(sys => sys.stageName === card.name);
            const color = stageColor(card.sortOrder, card.name);
            const short = (card.name || '').replace(/ (Call|✅|⛔)$/i, '').trim();
            return (
              <View key={card.name} style={s.stageSection}>
                <View style={[s.stageSectionHeader, { borderLeftColor: color }]}>
                  <Text style={[s.stageSectionTitle, { color }]}>{short}</Text>
                  <View style={[s.stageBadgeCount, { backgroundColor: color }]}>
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{card.count}</Text>
                  </View>
                </View>
                {items.map((item, i) => (
                  <TouchableOpacity key={i} style={s.stageItem} onPress={() => setSelectedSystem(item)}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.stageItemClient} numberOfLines={1}>{item.clientName}</Text>
                      <Text style={s.stageItemSys}    numberOfLines={1}>{item.systemName}</Text>
                    </View>
                    <ProgressMini pct={item.progressPct} />
                  </TouchableOpacity>
                ))}
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* ════════════ VISITS TAB ═════════════════════════════════════════════ */}
      {tab === 'visits' && (
        <>
          {/* Period filter pills */}
          <VisitPeriodBar period={visitPeriod} onSelect={setVisitPeriod} />

          {/* View mode toggle */}
          <VisitViewToggle mode={visitViewMode} onSelect={setVisitViewMode} />

          {/* Visit search */}
          <View style={[s.searchRow, { marginTop: 0 }]}>
            <View style={s.searchWrap}>
              <Ionicons name="search-outline" size={15} color="#bbb" />
              <TextInput style={s.searchInput} placeholder="بحث في الزيارات..." placeholderTextColor="#ccc" value={visitSearch} onChangeText={setVisitSearch} />
              {visitSearch ? <TouchableOpacity onPress={() => setVisitSearch('')}><Ionicons name="close-circle" size={15} color="#ccc" /></TouchableOpacity> : null}
            </View>
          </View>

          {/* Stats bar */}
          <View style={s.visitStats}>
            <View style={s.visitStatItem}>
              <Text style={s.visitStatNum}>{filteredVisits.length}</Text>
              <Text style={s.visitStatLabel}>إجمالي</Text>
            </View>
            <View style={s.visitStatDivider} />
            <View style={s.visitStatItem}>
              <Text style={[s.visitStatNum, { color: '#388E3C' }]}>
                {filteredVisits.filter(v => (v.statusName || v.status) === 'Completed').length}
              </Text>
              <Text style={s.visitStatLabel}>منجزة</Text>
            </View>
            <View style={s.visitStatDivider} />
            <View style={s.visitStatItem}>
              <Text style={[s.visitStatNum, { color: '#E65100' }]}>
                {filteredVisits.filter(v => {
                  const st = v.statusName || v.status || '';
                  return st && st !== 'Completed';
                }).length}
              </Text>
              <Text style={s.visitStatLabel}>جارية</Text>
            </View>
          </View>

          {visitsLoading ? (
            <View style={s.center}>
              <ActivityIndicator size="large" color="#1565C0" />
              <Text style={s.loadingText}>جاري تحميل الزيارات...</Text>
            </View>
          ) : visitViewMode === 'list' ? (
            <FlatList
              data={filteredVisits}
              keyExtractor={(_, i) => i.toString()}
              renderItem={({ item }) => <VisitRow item={item} onPress={() => setSelectedVisit(item)} />}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1565C0']} />}
              ListEmptyComponent={<View style={s.emptyWrap}><Ionicons name="car-outline" size={48} color="#ddd" /><Text style={s.emptyText}>لا توجد زيارات</Text></View>}
              contentContainerStyle={{ padding: 10, paddingBottom: 30 }}
            />
          ) : (
            <ScrollView
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1565C0']} />}
              contentContainerStyle={{ padding: 10, paddingBottom: 30 }}
            >
              {groupedVisits.length === 0 && (
                <View style={s.emptyWrap}><Ionicons name="car-outline" size={48} color="#ddd" /><Text style={s.emptyText}>لا توجد زيارات</Text></View>
              )}
              {groupedVisits.map((section, i) => (
                <GroupedVisitSection key={i} section={section} onPress={v => setSelectedVisit(v)} />
              ))}
            </ScrollView>
          )}
        </>
      )}

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      <SystemModal item={selectedSystem} onClose={() => setSelectedSystem(null)} />
      <VisitModal  item={selectedVisit}  onClose={() => setSelectedVisit(null)} />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#F5F7FA' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { color: '#888', fontSize: 14 },

  // Tabs
  tabBar: { flexDirection: 'row', backgroundColor: '#fff', paddingHorizontal: 8, paddingTop: 8, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: '#EEE' },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, borderRadius: 8 },
  tabBtnActive: { backgroundColor: '#E3F2FD' },
  tabLabel:     { fontSize: 12, color: '#aaa', fontWeight: '600' },
  tabLabelActive:{ color: '#1565C0', fontWeight: '700' },
  tabCount:     { backgroundColor: '#eee', borderRadius: 10, paddingHorizontal: 5, paddingVertical: 1 },
  tabCountActive:{ backgroundColor: '#BBDEFB' },
  tabCountText: { fontSize: 10, color: '#888', fontWeight: '700' },

  // Search
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8 },
  searchWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 },
  searchInput: { flex: 1, fontSize: 13, color: '#333', textAlign: 'right', padding: 0 },
  sortBtn: { backgroundColor: '#fff', borderRadius: 10, padding: 8, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 },
  clearBtn: { backgroundColor: '#FFEBEE', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6 },
  clearBtnText: { fontSize: 11, color: '#C62828', fontWeight: '700' },

  // Filters block (systems/stages)
  filtersBlock: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F0F0F0', paddingBottom: 6 },
  filterGroup:  { paddingTop: 6 },
  filterGroupLabel: { fontSize: 10, color: '#bbb', fontWeight: '700', paddingHorizontal: 12, marginBottom: 4 },
  chipRow: { paddingHorizontal: 10, gap: 6 },
  chip:    { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 5, backgroundColor: '#f5f5f5', borderWidth: 1, borderColor: '#E8E8E8' },
  chipText:{ fontSize: 11, color: '#555', fontWeight: '600' },

  // Visit period pills
  periodBar:        { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F0F0F0', maxHeight: 46 },
  periodBarContent: { paddingHorizontal: 10, paddingVertical: 8, gap: 6 },
  periodPill:       { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 5, backgroundColor: '#f5f5f5', borderWidth: 1, borderColor: '#E8E8E8' },
  periodPillActive: { backgroundColor: '#1565C0', borderColor: '#1565C0' },
  periodPillText:   { fontSize: 12, color: '#666', fontWeight: '600' },
  periodPillTextActive: { color: '#fff' },

  // Visit view toggle
  viewToggle: { flexDirection: 'row', backgroundColor: '#fff', paddingHorizontal: 10, paddingVertical: 6, gap: 6, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  viewToggleBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 6, borderRadius: 8, backgroundColor: '#f5f5f5' },
  viewToggleBtnActive: { backgroundColor: '#E3F2FD' },
  viewToggleText: { fontSize: 11, color: '#999', fontWeight: '600' },
  viewToggleTextActive: { color: '#1565C0', fontWeight: '700' },

  // Visit stats bar
  visitStats: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F0F0F0', paddingVertical: 8 },
  visitStatItem: { flex: 1, alignItems: 'center' },
  visitStatNum:  { fontSize: 18, fontWeight: '800', color: '#1565C0' },
  visitStatLabel:{ fontSize: 10, color: '#aaa', marginTop: 1 },
  visitStatDivider: { width: 1, backgroundColor: '#eee', marginVertical: 4 },

  // Visit rows
  visitRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', marginBottom: 6, borderRadius: 12, padding: 12, gap: 10, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3 },
  visitDate:     { backgroundColor: '#E3F2FD', borderRadius: 8, padding: 8, minWidth: 68, alignItems: 'center' },
  visitDateText: { fontSize: 11, color: '#1565C0', fontWeight: '700', textAlign: 'center', lineHeight: 16 },
  visitInfo:     { flex: 1 },
  visitProj:     { fontSize: 13, fontWeight: '700', color: '#222' },
  visitScope:    { fontSize: 11, color: '#666', marginTop: 1 },
  visitUser:     { fontSize: 11, color: '#6A1B9A', marginTop: 2 },
  visitStatus:   { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 4 },

  // Grouped view
  groupSection: { backgroundColor: '#fff', borderRadius: 12, marginBottom: 10, overflow: 'hidden', elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3 },
  groupHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  groupTitle:  { fontSize: 14, fontWeight: '700', color: '#1a1a1a', flex: 1 },
  groupMeta:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  groupCountBadge: { backgroundColor: '#1565C0', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  groupCountText:  { fontSize: 11, color: '#fff', fontWeight: '700' },

  // Visit detail modal
  visitModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 4, paddingBottom: 4 },
  visitStatusPill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  visitStatusPillText: { fontSize: 12, fontWeight: '700' },
  visitModalTitle: { fontSize: 17, fontWeight: '800', color: '#1a1a1a', paddingHorizontal: 16, marginBottom: 2 },
  visitModalScope: { fontSize: 13, color: '#888', paddingHorizontal: 16, marginBottom: 8 },
  visitModalBody: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32 },
  notesBlock: { backgroundColor: '#F5F7FA', borderRadius: 10, padding: 12, marginTop: 8 },
  notesLabel: { fontSize: 11, color: '#aaa', fontWeight: '700', marginBottom: 4 },
  notesText:  { fontSize: 13, color: '#444', lineHeight: 20 },

  // Shared detail row style (used in both modals)
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 14 },
  detailIcon:{ width: 32, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  detailLabel:{ fontSize: 11, color: '#aaa', fontWeight: '600', marginBottom: 2 },
  detailVal:  { fontSize: 14, fontWeight: '700', color: '#222' },

  // System card
  sysCard: { backgroundColor: '#fff', borderRadius: 12, marginBottom: 8, padding: 12, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 },
  sysCardTop: { flexDirection: 'row', alignItems: 'flex-start' },
  sysClient:  { fontSize: 11, color: '#aaa', marginBottom: 1 },
  sysName:    { fontSize: 14, fontWeight: '700', color: '#1a1a1a' },
  sysEmp:     { fontSize: 10, color: '#bbb', marginTop: 4 },
  sysRight:   { alignItems: 'flex-end', gap: 6, marginLeft: 10 },
  stoppedBanner: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FFEBEE', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginTop: 6, alignSelf: 'flex-start' },
  stoppedText:{ fontSize: 10, color: '#C62828', fontWeight: '700' },

  badge:     { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1 },
  badgeText: { fontSize: 10, fontWeight: '700' },
  pctWrap:   { alignItems: 'flex-end', minWidth: 48 },
  pctText:   { fontSize: 13, fontWeight: '800' },
  pctBar:    { width: 48, height: 3, backgroundColor: '#EEE', borderRadius: 2, marginTop: 2, overflow: 'hidden' },
  pctFill:   { height: 3, borderRadius: 2 },

  // Stage tab
  stagesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  stageCard: { width: '30%', backgroundColor: '#fff', borderRadius: 12, padding: 12, borderTopWidth: 3, alignItems: 'center', elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 },
  stageCount: { fontSize: 26, fontWeight: '800' },
  stageLabel: { fontSize: 10, color: '#444', textAlign: 'center', marginTop: 3 },
  stageSection: { backgroundColor: '#fff', borderRadius: 12, marginBottom: 10, overflow: 'hidden', elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3 },
  stageSectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderLeftWidth: 4, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  stageSectionTitle: { fontSize: 13, fontWeight: '700' },
  stageBadgeCount:   { borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  stageItem: { flexDirection: 'row', alignItems: 'center', padding: 10, borderBottomWidth: 1, borderBottomColor: '#F8F8F8' },
  stageItemClient: { fontSize: 10, color: '#aaa' },
  stageItemSys:    { fontSize: 13, fontWeight: '600', color: '#222' },

  // System detail modal
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet:   { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '88%' },
  handle:  { width: 40, height: 4, backgroundColor: '#ddd', borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  sheetHeader: { flexDirection: 'row', alignItems: 'flex-start', padding: 16, gap: 10, borderBottomWidth: 2, marginBottom: 4 },
  sheetClient: { fontSize: 12, color: '#888' },
  sheetSystem: { fontSize: 18, fontWeight: '800' },
  stoppedBannerModal: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFEBEE', borderRadius: 8, padding: 10, marginBottom: 12 },
  stageRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 10, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  stageDot:    { width: 10, height: 10, borderRadius: 5 },
  stageRowName:{ fontSize: 13, fontWeight: '600' },
  stageDate:   { fontSize: 10, color: '#aaa', marginTop: 2 },
  stagePct:    { fontSize: 12, fontWeight: '700', minWidth: 30, textAlign: 'right' },

  // Empty
  emptyWrap: { alignItems: 'center', paddingVertical: 60 },
  emptyText: { color: '#ccc', marginTop: 10, fontSize: 14 },
});
