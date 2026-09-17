import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getTeamWeekSchedule, getTeamMembers, getMyTeamRecord, getTeamTasks } from '../../api/internal';
import { useAuth } from '../../context/AuthContext';

const DAYS_SHORT   = ['أحد', 'اثن', 'ثلا', 'أرب', 'خمس', 'جمع', 'سبت'];
const DAYS_AR_FULL = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const TYPE_COLORS = { visit: '#1565C0', office: '#388E3C', vacation: '#E65100' };
const TYPE_LABELS = { visit: 'زيارة', office: 'مكتب', vacation: 'إجازة' };
const TYPE_SHORT  = { visit: 'ز', office: 'م', vacation: 'إ' };
const TYPE_ICONS  = { visit: 'car-outline', office: 'business-outline', vacation: 'umbrella-outline' };

const NAME_COL = 150;
const DAY_COL  = 54;
const GRID_W   = NAME_COL + DAY_COL * 7;

function getWeekDates(offset = 0) {
  const now = new Date();
  const sunday = new Date(now);
  sunday.setDate(now.getDate() - now.getDay() + offset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    return d;
  });
}

function fmt(date) { return date.toISOString().split('T')[0]; }

const todayStr = new Date().toISOString().split('T')[0];

export default function TeamScheduleScreen({ route }) {
  const { user } = useAuth();
  const authUserId = user?.userId != null ? String(user.userId) : String(user?.id ?? '');
  const userId = route?.params?.userId || authUserId;

  const [activeTab,   setActiveTab]   = useState('schedule'); // 'schedule' | 'office'
  const [weekOffset,  setWeekOffset]  = useState(0);
  const [days,        setDays]        = useState([]);
  const [users,       setUsers]       = useState([]);     // schedule tab — team-filtered
  const [allUsers,    setAllUsers]    = useState([]);     // office tab — all teams (for managers)
  const [entries,     setEntries]     = useState([]);
  const [tasks,       setTasks]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [myRole,      setMyRole]      = useState('employee');
  const [detailModal, setDetailModal] = useState(null); // { entry, name } | null

  const toRow = useCallback((m) => ({
    id:       m.crm_user_id,
    fullName: m.display_name || String(m.crm_user_id),
    teamId:   m.team_id || 'noTeam',
    teamName: m.teams?.name || (m.team_id ? `فريق ${m.team_id}` : 'بدون فريق'),
  }), []);

  const load = useCallback(async () => {
    setLoading(true);
    const week = getWeekDates(weekOffset);
    setDays(week);
    try {
      const [members, myRec] = await Promise.all([
        getTeamMembers(),
        userId ? getMyTeamRecord(userId) : Promise.resolve(null),
      ]);
      const role   = myRec?.role || 'admin';
      const teamId = myRec?.team_id;
      setMyRole(role);

      // Schedule tab: managers see own team only, admins see all
      let schedFiltered;
      if (role === 'admin') {
        schedFiltered = members;
      } else if (role === 'manager') {
        schedFiltered = teamId ? members.filter(m => m.team_id === teamId) : members;
      } else {
        const self = members.find(m => String(m.crm_user_id) === userId);
        schedFiltered = self ? [self] : [];
      }

      // Office tab: managers and admins see ALL teams
      const officeFiltered = (role === 'employee')
        ? schedFiltered
        : members;

      let userList    = schedFiltered.map(toRow);
      let allUserList = officeFiltered.map(toRow);

      if (userId && !userList.some(u => String(u.id) === userId)) {
        const selfRow = { id: userId, fullName: user?.fullName || userId, teamId: 'noTeam', teamName: 'بدون فريق' };
        userList    = [selfRow, ...userList];
        allUserList = [selfRow, ...allUserList];
      }

      // Load entries for the union of both lists
      const allIds = [...new Set([
        ...userList.map(u => String(u.id)),
        ...allUserList.map(u => String(u.id)),
      ])];

      if (allIds.length) {
        const [rawData, taskData] = await Promise.all([
          getTeamWeekSchedule(allIds, fmt(week[0]), fmt(week[6])),
          getTeamTasks(allIds),
        ]);
        const data = role === 'employee'
          ? rawData
          : rawData.filter(e => !e.status || e.status === 'approved');
        setEntries(data);
        setTasks(taskData || []);

        // Schedule tab: hide rows with no entries this week
        const visible = role === 'employee'
          ? userList
          : data.length > 0
            ? userList.filter(u => data.some(e => String(e.crm_user_id) === String(u.id)))
            : userList;
        setUsers(visible);
        setAllUsers(allUserList);
      } else {
        setUsers([]);
        setAllUsers([]);
      }
    } catch (e) {
      Alert.alert('خطأ', e.message || 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }, [weekOffset, userId, toRow]);

  useEffect(() => { load(); }, [load]);

  const getEntry = (uid, dateStr) =>
    entries.find(e => String(e.crm_user_id) === String(uid) && e.date === dateStr);

  const weekLabel = () => {
    if (!days.length) return '';
    const s = days[0].toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });
    const e = days[6].toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });
    return `${s} – ${e}`;
  };

  // Summary counts
  const summary = Object.keys(TYPE_COLORS).reduce((acc, t) => {
    acc[t] = entries.filter(e => e.type === t).length;
    return acc;
  }, {});

  // Group users by team for the grid
  const teamGroups = [];
  const seenTeams  = {};
  users.forEach(u => {
    if (!seenTeams[u.teamId]) {
      seenTeams[u.teamId] = teamGroups.length;
      teamGroups.push({ teamId: u.teamId, teamName: u.teamName, users: [] });
    }
    teamGroups[seenTeams[u.teamId]].users.push(u);
  });

  // Office today list (Tab 2) — grouped by team
  const officeToday = allUsers.filter(u => getEntry(u.id, todayStr)?.type === 'office');
  const officeTodayByTeam = [];
  const seenOT = {};
  officeToday.forEach(u => {
    if (!seenOT[u.teamId]) {
      seenOT[u.teamId] = officeTodayByTeam.length;
      officeTodayByTeam.push({ teamId: u.teamId, teamName: u.teamName, users: [] });
    }
    officeTodayByTeam[seenOT[u.teamId]].users.push(u);
  });

  const dm = detailModal;

  return (
    <View style={styles.root}>

      {/* Detail modal */}
      <Modal visible={!!dm} transparent animationType="fade" onRequestClose={() => setDetailModal(null)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setDetailModal(null)}>
          <View style={styles.modalCard} onStartShouldSetResponder={() => true}>
            {dm && (
              <>
                <View style={[styles.modalTypeBar, { backgroundColor: TYPE_COLORS[dm.entry.type] }]}>
                  <Ionicons name={TYPE_ICONS[dm.entry.type]} size={20} color="#fff" />
                  <Text style={styles.modalTypeText}>{TYPE_LABELS[dm.entry.type]}</Text>
                </View>
                <View style={styles.modalBody}>
                  <View style={styles.modalRow}>
                    <Ionicons name="person-outline" size={16} color="#555" />
                    <Text style={styles.modalLabel}>الموظف</Text>
                    <Text style={styles.modalValue}>{dm.name}</Text>
                  </View>
                  <View style={styles.modalRow}>
                    <Ionicons name="calendar-outline" size={16} color="#555" />
                    <Text style={styles.modalLabel}>التاريخ</Text>
                    <Text style={styles.modalValue}>{DAYS_AR_FULL[new Date(dm.entry.date).getDay()]} {dm.entry.date}</Text>
                  </View>
                  {dm.entry.type === 'visit' && (
                    <View style={styles.modalRow}>
                      <Ionicons name="location-outline" size={16} color="#1565C0" />
                      <Text style={styles.modalLabel}>الموقع</Text>
                      <Text style={[styles.modalValue, { color: '#1565C0', fontWeight: '700' }]}>{dm.entry.client_name || '—'}</Text>
                    </View>
                  )}
                  {dm.entry.type === 'vacation' && dm.entry.vacation_type && (
                    <View style={styles.modalRow}>
                      <Ionicons name="information-circle-outline" size={16} color="#E65100" />
                      <Text style={styles.modalLabel}>نوع الإجازة</Text>
                      <Text style={styles.modalValue}>{dm.entry.vacation_type}</Text>
                    </View>
                  )}
                  {dm.entry.notes ? (
                    <View style={styles.modalRow}>
                      <Ionicons name="document-text-outline" size={16} color="#555" />
                      <Text style={styles.modalLabel}>ملاحظات</Text>
                      <Text style={styles.modalValue}>{dm.entry.notes}</Text>
                    </View>
                  ) : null}
                  {/* Office tasks for this employee on this day */}
                  {dm.entry.type === 'office' && (() => {
                    const dayTasks = tasks.filter(t =>
                      t.task_type === 'office' &&
                      String(t.assigned_to) === String(dm.entry.crm_user_id) &&
                      String(t.task_date || '').slice(0, 10) === String(dm.entry.date).slice(0, 10)
                    );
                    if (!dayTasks.length) return null;
                    return (
                      <View style={styles.officeTasks}>
                        <View style={styles.officeTasksHeader}>
                          <Ionicons name="checkmark-done-outline" size={14} color="#388E3C" />
                          <Text style={styles.officeTasksTitle}>ما تم إنجازه</Text>
                        </View>
                        {dayTasks.map(t => (
                          <View key={t.id} style={styles.officeTaskItem}>
                            {t.description
                              ? t.description.split('\n').filter(Boolean).map((line, i) => (
                                  <Text key={i} style={styles.officeTaskLine}>{line}</Text>
                                ))
                              : <Text style={styles.officeTaskLine}>{t.title}</Text>
                            }
                          </View>
                        ))}
                      </View>
                    );
                  })()}
                </View>
                <TouchableOpacity style={styles.modalClose} onPress={() => setDetailModal(null)}>
                  <Text style={styles.modalCloseText}>إغلاق</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Week navigator — only for schedule tab */}
      {activeTab === 'schedule' && (
        <View style={styles.nav}>
          <TouchableOpacity onPress={() => setWeekOffset(w => w - 1)} style={styles.navBtn}>
            <Ionicons name="chevron-back" size={26} color="#1565C0" />
          </TouchableOpacity>
          <View style={{ alignItems: 'center' }}>
            <Text style={styles.navLabel}>{weekLabel()}</Text>
            {weekOffset === 0 && <Text style={styles.navSub}>الأسبوع الحالي</Text>}
          </View>
          <TouchableOpacity onPress={() => setWeekOffset(w => w + 1)} style={styles.navBtn}>
            <Ionicons name="chevron-forward" size={26} color="#1565C0" />
          </TouchableOpacity>
        </View>
      )}

      {/* Tab bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'schedule' && styles.tabBtnActive]}
          onPress={() => setActiveTab('schedule')}
        >
          <Ionicons name="grid-outline" size={15} color={activeTab === 'schedule' ? '#1565C0' : '#888'} />
          <Text style={[styles.tabText, activeTab === 'schedule' && styles.tabTextActive]}>الجدول الأسبوعي</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'office' && styles.tabBtnActive]}
          onPress={() => setActiveTab('office')}
        >
          <Ionicons name="business-outline" size={15} color={activeTab === 'office' ? '#388E3C' : '#888'} />
          <Text style={[styles.tabText, activeTab === 'office' && styles.tabTextActive, activeTab === 'office' && { color: '#388E3C' }]}>
            في المكتب اليوم
            {!loading && officeToday.length > 0 && (
              <Text style={styles.tabBadge}> ({officeToday.length})</Text>
            )}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Summary chips — only for schedule tab */}
      {activeTab === 'schedule' && (
        <View style={styles.summaryRow}>
          {Object.entries(TYPE_COLORS).map(([k, c]) => (
            <View key={k} style={[styles.summaryChip, { borderColor: c + '44', backgroundColor: c + '12' }]}>
              <Ionicons name={TYPE_ICONS[k]} size={13} color={c} />
              <Text style={[styles.summaryChipText, { color: c }]}>{summary[k]}</Text>
              <Text style={[styles.summaryChipLabel, { color: c }]}>{TYPE_LABELS[k]}</Text>
            </View>
          ))}
        </View>
      )}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 60 }} color="#1565C0" size="large" />
      ) : activeTab === 'schedule' ? (
        /* ── TAB 1: Weekly Grid grouped by team ── */
        users.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="people-outline" size={56} color="#ddd" />
            <Text style={styles.emptyText}>لا يوجد أعضاء في الفريق</Text>
          </View>
        ) : (
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ minWidth: GRID_W }}>

                {/* Day-header row */}
                <View style={styles.headerRow}>
                  <View style={[styles.nameCol, { width: NAME_COL }]}>
                    <Text style={styles.headerCell}>الموظف</Text>
                  </View>
                  {days.map((d, i) => {
                    const isToday = fmt(d) === todayStr;
                    return (
                      <View key={i} style={[styles.dayCol, { width: DAY_COL }, isToday && styles.todayCol]}>
                        <Text style={[styles.headerCell, isToday && styles.todayHeaderText]}>{DAYS_SHORT[d.getDay()]}</Text>
                        <Text style={[styles.headerDate,  isToday && styles.todayHeaderDate]}>{d.getDate()}</Text>
                      </View>
                    );
                  })}
                </View>

                {/* Team groups */}
                {teamGroups.map(group => (
                  <View key={group.teamId}>
                    {/* Team header */}
                    <View style={[styles.teamHeaderRow, { width: GRID_W }]}>
                      <Ionicons name="people-outline" size={13} color="#1565C0" />
                      <Text style={styles.teamHeaderText}>{group.teamName}</Text>
                      <Text style={styles.teamHeaderCount}>({group.users.length})</Text>
                    </View>

                    {/* Member rows */}
                    {group.users.map((u, ui) => {
                      const name = u.fullName;
                      return (
                        <View key={String(u.id)} style={[styles.userRow, ui % 2 === 1 && styles.userRowAlt]}>
                          <View style={[styles.nameCol, { width: NAME_COL }]}>
                            <View style={styles.avatarWrap}>
                              <Text style={styles.avatarText}>{(name || '?')[0]}</Text>
                            </View>
                            <Text style={styles.userName} numberOfLines={2}>{name}</Text>
                          </View>
                          {days.map((d, di) => {
                            const dateStr = fmt(d);
                            const entry   = getEntry(u.id, dateStr);
                            const isToday = dateStr === todayStr;
                            return (
                              <View key={di} style={[styles.dayCol, { width: DAY_COL }, isToday && styles.todayDayCol]}>
                                {entry ? (
                                  <TouchableOpacity
                                    onPress={() => setDetailModal({ entry, name })}
                                    activeOpacity={0.75}
                                  >
                                    <View style={[styles.cell, { backgroundColor: TYPE_COLORS[entry.type] }]}>
                                      <Text style={styles.cellText}>{TYPE_SHORT[entry.type]}</Text>
                                    </View>
                                  </TouchableOpacity>
                                ) : (
                                  <View style={[styles.emptyCell, isToday && styles.emptyCellToday]} />
                                )}
                              </View>
                            );
                          })}
                        </View>
                      );
                    })}
                  </View>
                ))}
              </View>
            </ScrollView>
          </ScrollView>
        )
      ) : (
        /* ── TAB 2: In Office Today ── */
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, gap: 12 }}>
          <Text style={styles.officeDateLabel}>
            {DAYS_AR_FULL[new Date().getDay()]} — {todayStr}
          </Text>

          {officeToday.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="business-outline" size={56} color="#ddd" />
              <Text style={styles.emptyText}>لا يوجد موظفون في المكتب اليوم</Text>
            </View>
          ) : (
            officeTodayByTeam.map(group => (
              <View key={group.teamId} style={styles.officeTeamBlock}>
                <View style={styles.officeTeamHeader}>
                  <Ionicons name="people-outline" size={14} color="#1565C0" />
                  <Text style={styles.officeTeamName}>{group.teamName}</Text>
                  <Text style={styles.officeTeamCount}>{group.users.length} موظف</Text>
                </View>
                {group.users.map(u => (
                  <View key={String(u.id)} style={styles.officeCard}>
                    <View style={styles.officeAvatar}>
                      <Text style={styles.officeAvatarText}>{(u.fullName || '?')[0]}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.officeEmpName}>{u.fullName}</Text>
                      <View style={styles.officeTypePill}>
                        <Ionicons name="business-outline" size={11} color="#fff" />
                        <Text style={styles.officeTypeText}>مكتب</Text>
                      </View>
                    </View>
                    <Ionicons name="checkmark-circle" size={22} color="#388E3C" />
                  </View>
                ))}
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F5F7FA' },

  nav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#eee',
  },
  navBtn:  { padding: 6 },
  navLabel:{ fontSize: 17, fontWeight: '800', color: '#1a1a1a' },
  navSub:  { fontSize: 11, color: '#1565C0', marginTop: 1 },

  tabBar: {
    flexDirection: 'row', backgroundColor: '#fff',
    borderBottomWidth: 2, borderBottomColor: '#eee',
  },
  tabBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 11, borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabBtnActive: { borderBottomColor: '#1565C0' },
  tabText:      { fontSize: 13, fontWeight: '600', color: '#888' },
  tabTextActive:{ color: '#1565C0' },
  tabBadge:     { fontWeight: '800' },

  summaryRow: {
    flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#eee',
  },
  summaryChip: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 6,
  },
  summaryChipText:  { fontSize: 16, fontWeight: '800' },
  summaryChipLabel: { fontSize: 10, fontWeight: '600' },

  headerRow: { flexDirection: 'row', backgroundColor: '#1565C0', paddingVertical: 10 },
  headerCell:{ color: '#fff', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  headerDate:{ color: 'rgba(255,255,255,0.75)', fontSize: 11, textAlign: 'center', marginTop: 1 },
  todayCol:  { backgroundColor: '#0D47A1' },
  todayHeaderText: { color: '#FFD54F' },
  todayHeaderDate: { color: '#FFD54F' },

  teamHeaderRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#E3F2FD', paddingHorizontal: 12, paddingVertical: 7,
    borderBottomWidth: 1, borderColor: '#BBDEFB',
  },
  teamHeaderText:  { fontSize: 13, fontWeight: '800', color: '#1565C0', flex: 1 },
  teamHeaderCount: { fontSize: 12, color: '#1565C0', fontWeight: '600' },

  nameCol: { paddingHorizontal: 8, justifyContent: 'center', flexDirection: 'row', alignItems: 'center', gap: 6 },
  dayCol:  { alignItems: 'center', justifyContent: 'center', paddingVertical: 10 },
  todayDayCol: { backgroundColor: '#E3F2FD' },

  userRow:    { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#f0f0f0', backgroundColor: '#fff' },
  userRowAlt: { backgroundColor: '#FAFAFA' },

  avatarWrap: { width: 28, height: 28, borderRadius: 8, backgroundColor: '#1565C0', justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  avatarText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  userName:   { fontSize: 12, color: '#333', fontWeight: '600', flex: 1 },

  cell:      { width: 38, height: 38, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  cellText:  { color: '#fff', fontSize: 15, fontWeight: '800' },
  emptyCell: { width: 38, height: 38, borderRadius: 10, backgroundColor: '#f0f0f0' },
  emptyCellToday: { backgroundColor: '#BBDEFB' },

  empty:     { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 80 },
  emptyText: { fontSize: 14, color: '#bbb' },

  officeDateLabel: { fontSize: 14, fontWeight: '700', color: '#555', textAlign: 'center', marginBottom: 4 },

  officeTeamBlock: {
    backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden',
    elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
  officeTeamHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#E3F2FD', paddingHorizontal: 14, paddingVertical: 10,
  },
  officeTeamName:  { flex: 1, fontSize: 14, fontWeight: '800', color: '#1565C0' },
  officeTeamCount: { fontSize: 12, color: '#1565C0', fontWeight: '600' },

  officeCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#f5f5f5',
  },
  officeAvatar: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: '#388E3C',
    justifyContent: 'center', alignItems: 'center',
  },
  officeAvatarText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  officeEmpName:    { fontSize: 14, fontWeight: '700', color: '#1a1a1a', marginBottom: 3 },
  officeTypePill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#388E3C', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  officeTypeText: { color: '#fff', fontSize: 10, fontWeight: '700' },

  // Detail modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalCard: {
    backgroundColor: '#fff', borderRadius: 16, width: '100%', maxWidth: 380, overflow: 'hidden',
    elevation: 8, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
  },
  modalTypeBar:  { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingVertical: 14 },
  modalTypeText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  modalBody:     { padding: 20, gap: 14 },
  modalRow:      { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  modalLabel:    { fontSize: 13, color: '#888', width: 80, flexShrink: 0 },
  modalValue:    { fontSize: 14, color: '#1a1a1a', fontWeight: '600', flex: 1, textAlign: 'right' },
  modalClose:    { marginHorizontal: 20, marginBottom: 16, backgroundColor: '#F5F5F5', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  modalCloseText:{ fontSize: 14, fontWeight: '700', color: '#555' },

  officeTasks:      { marginHorizontal: 16, marginBottom: 12, backgroundColor: '#F1F8E9', borderRadius: 10, padding: 12 },
  officeTasksHeader:{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  officeTasksTitle: { fontSize: 13, fontWeight: '700', color: '#2E7D32' },
  officeTaskItem:   { marginBottom: 4 },
  officeTaskLine:   { fontSize: 13, color: '#333', lineHeight: 20 },
});
