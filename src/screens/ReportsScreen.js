/**
 * ReportsScreen — تقارير التنفيذ مباشرةً
 * Tabs: الأنظمة / المراحل / الزيارات
 * Filters: always-visible client + employee chips, period pills
 */
import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, FlatList, StyleSheet, TouchableOpacity,
  TextInput, RefreshControl, ActivityIndicator, Modal, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../api/client';
import { useRole } from '../context/RoleContext';

// ─── Data helpers ─────────────────────────────────────────────────────────────

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
        scopeId:        sc.id,
        systemName:     sc.productName || '',
        clientName:     proj.customerName || '',
        projectId:      proj.id,
        projectTitle:   proj.title || '',
        progressPct:    sc.progressPercent ?? 0,
        isStopped:      proj.stopped ?? false,
        employees:      scopeUsers.length ? scopeUsers : projUsers,
        projectUserIds: projUserIds,
      });
    }
  }

  const stageResults = await Promise.allSettled(
    scopes.map(s => api.get(`/ProjectScopeStage/GetByScope/${s.scopeId}`))
  );

  return scopes.map((scope, i) => {
    const res = stageResults[i];
    if (res.status !== 'fulfilled') {
      return { ...scope, currentStage: null, allStages: [], stageName: '—', sortOrder: 999 };
    }
    const stages = res.value?.data?.data ?? res.value?.data ?? [];
    if (!Array.isArray(stages) || stages.length === 0) {
      return { ...scope, currentStage: null, allStages: [], stageName: '—', sortOrder: 999 };
    }

    const stageUsers = stages.map(s => s.endedByUserName).filter(Boolean);
    const allEmployees = [...new Set([...scope.employees, ...stageUsers])];

    const inProgress = stages.find(st => st.statusId === 2 || st.statusName === 'InProgress');
    const allDone    = stages.every(st => st.statusId === 3 || st.statusName === 'Completed');
    const lastDone   = [...stages].reverse().find(st => st.statusId === 3 || st.statusName === 'Completed');

    let current;
    if (scope.isStopped) {
      current = { stageName: 'مرتجع ⛔', stageSortOrder: 9998 };
    } else if (allDone) {
      current = { stageName: 'منتهي ✅', stageSortOrder: 9997 };
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
      currentStage:   current,
      allStages:      stages,
      stageName:      current?.stageName      || '—',
      sortOrder:      current?.stageSortOrder ?? 99,
      stageWeight:    current?.weightPercent  ?? null,
      employees:      allEmployees,
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
    { key: 'systems', label: 'الأنظمة',  icon: 'layers-outline',     count: systemsCount },
    { key: 'stages',  label: 'المراحل',  icon: 'git-branch-outline',  count: stagesCount  },
    { key: 'visits',  label: 'الزيارات', icon: 'car-outline',         count: visitsCount  },
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
      <View style={s.pctBar}>
        <View style={[s.pctFill, { width: `${Math.min(100, pct)}%`, backgroundColor: color }]} />
      </View>
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
              <Ionicons name="person-outline" size={10} color="#aaa" /> {item.employees.slice(0, 2).join(' · ')}
              {item.employees.length > 2 ? ` +${item.employees.length - 2}` : ''}
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

function VisitRow({ item }) {
  const date   = item.executionDate || item.visitDate || item.date || item.createdOn || '';
  const proj   = item.projectTitle  || item.projectName || '';
  const scope  = item.scopeName     || item.productName || '';
  const user   = item.userName      || item.executedByName || item.createdBy || '';
  const status = item.statusName    || item.status || '';
  const disp   = date ? new Date(date).toLocaleDateString('ar-EG', { weekday: 'short', day: '2-digit', month: 'short' }) : '—';
  return (
    <View style={s.visitRow}>
      <View style={s.visitDate}>
        <Text style={s.visitDateText}>{disp}</Text>
      </View>
      <View style={s.visitInfo}>
        <Text style={s.visitProj}  numberOfLines={1}>{proj}</Text>
        {scope ? <Text style={s.visitScope} numberOfLines={1}>{scope}</Text> : null}
        {user  ? <Text style={s.visitUser}  numberOfLines={1}>👤 {user}</Text>  : null}
      </View>
      {status ? (
        <View style={[s.visitStatus, { backgroundColor: status === 'Completed' ? '#E8F5E9' : '#FFF3E0' }]}>
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
                <Text style={s.detailLabel}>المرحلة الحالية</Text>
                <StageBadge name={item.stageName} sortOrder={item.sortOrder} />
              </View>
              <View style={s.detailRow}>
                <Text style={s.detailLabel}>نسبة الإنجاز</Text>
                <Text style={[s.detailVal, { color }]}>{Math.round(item.progressPct)}%</Text>
              </View>
              <View style={s.detailRow}>
                <Text style={s.detailLabel}>المشروع</Text>
                <Text style={s.detailVal}>{item.projectTitle}</Text>
              </View>
              {item.employees.length > 0 && (
                <View style={s.detailRow}>
                  <Text style={s.detailLabel}>المنفذون</Text>
                  <Text style={s.detailVal}>{item.employees.join('، ')}</Text>
                </View>
              )}
              {item.isStopped && (
                <View style={[s.stoppedBannerModal]}>
                  <Ionicons name="warning-outline" size={16} color="#C62828" />
                  <Text style={{ color: '#C62828', fontWeight: '700', fontSize: 13 }}>هذا المشروع متوقف</Text>
                </View>
              )}
              <Text style={[s.detailLabel, { marginTop: 16, marginBottom: 8 }]}>مسار المراحل</Text>
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

// ─── Chip helpers ─────────────────────────────────────────────────────────────

function FilterChips({ label, items, active, onSelect, color = '#1565C0' }) {
  return (
    <View style={s.filterGroup}>
      <Text style={s.filterGroupLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
        <TouchableOpacity
          style={[s.chip, !active && { backgroundColor: color, borderColor: color }]}
          onPress={() => onSelect(null)}
        >
          <Text style={[s.chipText, !active && { color: '#fff' }]}>الكل</Text>
        </TouchableOpacity>
        {items.map(name => (
          <TouchableOpacity
            key={name}
            style={[s.chip, active === name && { backgroundColor: color, borderColor: color }]}
            onPress={() => onSelect(active === name ? null : name)}
          >
            <Text style={[s.chipText, active === name && { color: '#fff' }]} numberOfLines={1}>{name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
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

  // Filters
  const [search,       setSearch]       = useState('');
  const [clientFilter, setClientFilter] = useState(null);
  const [empFilter,    setEmpFilter]    = useState(null);
  const [stageFilter,  setStageFilter]  = useState(null);
  const [sortDesc,     setSortDesc]     = useState(false);
  const [selectedSystem, setSelectedSystem] = useState(null);

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

  // ── role filter ──────────────────────────────────────────────────────────

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

  // ── filter options ───────────────────────────────────────────────────────

  const uniqueClients   = [...new Set(roleSystems.map(s => s.clientName).filter(Boolean))].sort();
  const uniqueEmployees = [...new Set(roleSystems.flatMap(s => s.employees ?? []).filter(Boolean))].sort();

  // ── filtered systems ─────────────────────────────────────────────────────

  const filteredSystems = roleSystems
    .filter(s => {
      if (stageFilter  && s.stageName  !== stageFilter)              return false;
      if (clientFilter && s.clientName !== clientFilter)              return false;
      if (empFilter    && !(s.employees ?? []).includes(empFilter))   return false;
      if (search) {
        const q = search.toLowerCase();
        if (!(s.clientName || '').toLowerCase().includes(q) &&
            !(s.systemName || '').toLowerCase().includes(q))         return false;
      }
      return true;
    })
    .sort((a, b) => sortDesc ? b.progressPct - a.progressPct : a.progressPct - b.progressPct);

  // ── stage groups ──────────────────────────────────────────────────────────

  const stageGroups = filteredSystems.reduce((acc, s) => {
    const key = s.stageName;
    if (!acc[key]) acc[key] = { name: key, sortOrder: s.sortOrder, count: 0 };
    acc[key].count++;
    return acc;
  }, {});
  const stageCards = Object.values(stageGroups).sort((a, b) => a.sortOrder - b.sortOrder);
  const stageNames = stageCards.map(c => c.name);

  // ── filtered visits ───────────────────────────────────────────────────────

  const filteredVisits = roleVisits.filter(v => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (v.projectTitle || '').toLowerCase().includes(q)
        || (v.scopeName    || '').toLowerCase().includes(q)
        || (v.userName     || '').toLowerCase().includes(q);
  });

  const clearFilters = () => { setClientFilter(null); setEmpFilter(null); setStageFilter(null); setSearch(''); };
  const activeFilters = [clientFilter, empFilter, stageFilter].filter(Boolean).length + (search ? 1 : 0);

  // ─────────────────────────────────────────────────────────────────────────

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

      {/* ── Search + sort ─────────────────────────────────────────────────── */}
      <View style={s.searchRow}>
        <View style={s.searchWrap}>
          <Ionicons name="search-outline" size={15} color="#bbb" />
          <TextInput
            style={s.searchInput}
            placeholder="بحث..."
            placeholderTextColor="#ccc"
            value={search}
            onChangeText={setSearch}
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={15} color="#ccc" />
            </TouchableOpacity>
          ) : null}
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

      {/* ── Filters: always visible ────────────────────────────────────────── */}
      <View style={s.filtersBlock}>
        {/* Client chips */}
        {uniqueClients.length > 0 && (
          <FilterChips
            label="العميل"
            items={uniqueClients}
            active={clientFilter}
            onSelect={setClientFilter}
            color="#E65100"
          />
        )}

        {/* Employee chips */}
        {uniqueEmployees.length > 0 && (
          <FilterChips
            label="الموظف"
            items={uniqueEmployees}
            active={empFilter}
            onSelect={setEmpFilter}
            color="#6A1B9A"
          />
        )}

        {/* Stage chips (only on systems tab) */}
        {tab === 'systems' && stageNames.length > 0 && (
          <FilterChips
            label="المرحلة"
            items={stageNames.map(n => n)}
            active={stageFilter}
            onSelect={setStageFilter}
            color="#1565C0"
          />
        )}
      </View>

      {/* ── SYSTEMS TAB ───────────────────────────────────────────────────── */}
      {tab === 'systems' && (
        <FlatList
          data={filteredSystems}
          keyExtractor={(_, i) => i.toString()}
          renderItem={({ item }) => (
            <SystemCard item={item} onPress={() => setSelectedSystem(item)} />
          )}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={['#1565C0']} />}
          ListEmptyComponent={
            <View style={s.emptyWrap}>
              <Ionicons name="layers-outline" size={48} color="#ddd" />
              <Text style={s.emptyText}>لا توجد أنظمة</Text>
            </View>
          }
          contentContainerStyle={{ padding: 10, paddingBottom: 30 }}
        />
      )}

      {/* ── STAGES TAB ────────────────────────────────────────────────────── */}
      {tab === 'stages' && (
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={['#1565C0']} />}
          contentContainerStyle={{ padding: 10, paddingBottom: 30 }}
        >
          {/* Summary cards */}
          <View style={s.stagesGrid}>
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

          {/* Per-stage system list */}
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

      {/* ── VISITS TAB ────────────────────────────────────────────────────── */}
      {tab === 'visits' && (
        visitsLoading ? (
          <View style={s.center}>
            <ActivityIndicator size="large" color="#1565C0" />
            <Text style={s.loadingText}>جاري تحميل الزيارات...</Text>
          </View>
        ) : (
          <FlatList
            data={filteredVisits}
            keyExtractor={(_, i) => i.toString()}
            renderItem={({ item }) => <VisitRow item={item} />}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={['#1565C0']} />}
            ListHeaderComponent={
              filteredVisits.length > 0 ? (
                <View style={s.visitsHeader}>
                  <Ionicons name="car-outline" size={15} color="#1565C0" />
                  <Text style={s.visitsHeaderText}>{filteredVisits.length} زيارة</Text>
                </View>
              ) : null
            }
            ListEmptyComponent={
              <View style={s.emptyWrap}>
                <Ionicons name="car-outline" size={48} color="#ddd" />
                <Text style={s.emptyText}>لا توجد زيارات مسجلة</Text>
              </View>
            }
            contentContainerStyle={{ padding: 10, paddingBottom: 30 }}
          />
        )
      )}

      <SystemModal item={selectedSystem} onClose={() => setSelectedSystem(null)} />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#F5F7FA' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { color: '#888', fontSize: 14 },

  // Tabs
  tabBar: {
    flexDirection: 'row', backgroundColor: '#fff',
    paddingHorizontal: 8, paddingTop: 8, paddingBottom: 4,
    borderBottomWidth: 1, borderBottomColor: '#EEE',
  },
  tabBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: 8, borderRadius: 8,
  },
  tabBtnActive:  { backgroundColor: '#E3F2FD' },
  tabLabel:      { fontSize: 12, color: '#aaa', fontWeight: '600' },
  tabLabelActive:{ color: '#1565C0', fontWeight: '700' },
  tabCount:      { backgroundColor: '#eee', borderRadius: 10, paddingHorizontal: 5, paddingVertical: 1 },
  tabCountActive:{ backgroundColor: '#BBDEFB' },
  tabCountText:  { fontSize: 10, color: '#888', fontWeight: '700' },

  // Search
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8 },
  searchWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff',
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7,
    elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2,
  },
  searchInput: { flex: 1, fontSize: 13, color: '#333', textAlign: 'right', padding: 0 },
  sortBtn: {
    backgroundColor: '#fff', borderRadius: 10, padding: 8,
    elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2,
  },
  clearBtn: { backgroundColor: '#FFEBEE', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6 },
  clearBtnText: { fontSize: 11, color: '#C62828', fontWeight: '700' },

  // Filters block
  filtersBlock: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F0F0F0', paddingBottom: 6 },
  filterGroup:  { paddingTop: 6 },
  filterGroupLabel: { fontSize: 10, color: '#bbb', fontWeight: '700', paddingHorizontal: 12, marginBottom: 4 },
  chipRow: { paddingHorizontal: 10, gap: 6 },
  chip:    { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 5, backgroundColor: '#f5f5f5', borderWidth: 1, borderColor: '#E8E8E8' },
  chipText:{ fontSize: 11, color: '#555', fontWeight: '600' },

  // System card
  sysCard: {
    backgroundColor: '#fff', borderRadius: 12, marginBottom: 8, padding: 12,
    elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4,
  },
  sysCardTop: { flexDirection: 'row', alignItems: 'flex-start' },
  sysClient: { fontSize: 11, color: '#aaa', marginBottom: 1 },
  sysName:   { fontSize: 14, fontWeight: '700', color: '#1a1a1a' },
  sysEmp:    { fontSize: 10, color: '#bbb', marginTop: 4 },
  sysRight:  { alignItems: 'flex-end', gap: 6, marginLeft: 10 },
  stoppedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#FFEBEE', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginTop: 6, alignSelf: 'flex-start',
  },
  stoppedText: { fontSize: 10, color: '#C62828', fontWeight: '700' },

  badge:     { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1 },
  badgeText: { fontSize: 10, fontWeight: '700' },

  pctWrap:   { alignItems: 'flex-end', minWidth: 48 },
  pctText:   { fontSize: 13, fontWeight: '800' },
  pctBar:    { width: 48, height: 3, backgroundColor: '#EEE', borderRadius: 2, marginTop: 2, overflow: 'hidden' },
  pctFill:   { height: 3, borderRadius: 2 },

  // Stage tab
  stagesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  stageCard: {
    width: '30%', backgroundColor: '#fff', borderRadius: 12, padding: 12,
    borderTopWidth: 3, alignItems: 'center',
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4,
  },
  stageCount: { fontSize: 26, fontWeight: '800' },
  stageLabel: { fontSize: 10, color: '#444', textAlign: 'center', marginTop: 3 },
  stageSection: {
    backgroundColor: '#fff', borderRadius: 12, marginBottom: 10, overflow: 'hidden',
    elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3,
  },
  stageSectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 12, borderLeftWidth: 4, borderBottomWidth: 1, borderBottomColor: '#F5F5F5',
  },
  stageSectionTitle: { fontSize: 13, fontWeight: '700' },
  stageBadgeCount:   { borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  stageItem: {
    flexDirection: 'row', alignItems: 'center', padding: 10,
    borderBottomWidth: 1, borderBottomColor: '#F8F8F8',
  },
  stageItemClient: { fontSize: 10, color: '#aaa' },
  stageItemSys:    { fontSize: 13, fontWeight: '600', color: '#222' },

  // Visits tab
  visitsHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4, paddingBottom: 6,
  },
  visitsHeaderText: { fontSize: 13, color: '#1565C0', fontWeight: '700' },
  visitRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    marginBottom: 6, borderRadius: 12, padding: 12, gap: 10,
    elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3,
  },
  visitDate:     { backgroundColor: '#E3F2FD', borderRadius: 8, padding: 8, minWidth: 68, alignItems: 'center' },
  visitDateText: { fontSize: 11, color: '#1565C0', fontWeight: '700', textAlign: 'center', lineHeight: 16 },
  visitInfo:     { flex: 1 },
  visitProj:     { fontSize: 13, fontWeight: '700', color: '#222' },
  visitScope:    { fontSize: 11, color: '#666', marginTop: 1 },
  visitUser:     { fontSize: 11, color: '#1565C0', marginTop: 2 },
  visitStatus:   { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 4 },

  // Empty
  emptyWrap: { alignItems: 'center', paddingVertical: 60 },
  emptyText: { color: '#ccc', marginTop: 10, fontSize: 14 },

  // Modal
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet:   { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '85%' },
  handle:  { width: 40, height: 4, backgroundColor: '#ddd', borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'flex-start', padding: 16, gap: 10, borderBottomWidth: 2, marginBottom: 4,
  },
  sheetClient: { fontSize: 12, color: '#888' },
  sheetSystem: { fontSize: 18, fontWeight: '800' },
  detailRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  detailLabel: { fontSize: 13, color: '#666', fontWeight: '600' },
  detailVal:   { fontSize: 14, fontWeight: '700', color: '#222', flex: 1, textAlign: 'left', marginLeft: 8 },
  stoppedBannerModal: {
    flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFEBEE',
    borderRadius: 8, padding: 10, marginBottom: 12,
  },
  stageRow:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 10, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  stageDot:     { width: 10, height: 10, borderRadius: 5 },
  stageRowName: { fontSize: 13, fontWeight: '600' },
  stageDate:    { fontSize: 10, color: '#aaa', marginTop: 2 },
  stagePct:     { fontSize: 12, fontWeight: '700', minWidth: 30, textAlign: 'right' },
});
