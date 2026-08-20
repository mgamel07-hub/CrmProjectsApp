import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getTeamWeekSchedule, getTeamMembers, getMyTeamRecord } from '../../api/internal';
import { getUsers } from '../../api/projects';
import { extractList } from '../../utils/helpers';
import { useAuth } from '../../context/AuthContext';

const DAYS_SHORT = ['أحد', 'اثن', 'ثلا', 'أرب', 'خمس', 'جمع', 'سبت'];
const TYPE_COLORS = { visit: '#1565C0', office: '#388E3C', vacation: '#E65100' };
const TYPE_LABELS = { visit: 'زيارة', office: 'مكتب', vacation: 'إجازة' };
const TYPE_SHORT  = { visit: 'ز', office: 'م', vacation: 'إ' };
const TYPE_ICONS  = { visit: 'car-outline', office: 'business-outline', vacation: 'umbrella-outline' };

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

export default function TeamScheduleScreen() {
  const { user } = useAuth();
  const userId = user?.userId != null ? String(user.userId) : String(user?.id ?? '');

  const [weekOffset, setWeekOffset] = useState(0);
  const [days,       setDays]       = useState([]);
  const [users,      setUsers]      = useState([]);
  const [entries,    setEntries]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [myRole,     setMyRole]     = useState('employee'); // 'admin' | 'manager' | 'employee'

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

      let filtered;
      if (role === 'admin') {
        filtered = members;
      } else if (role === 'manager') {
        filtered = teamId ? members.filter(m => m.team_id === teamId) : members;
      } else {
        const self = members.find(m => String(m.crm_user_id) === userId);
        filtered = self ? [self] : [];
      }

      // Fallback: if team_members is empty/inaccessible, load from CRM API
      let userList;
      if (filtered.length === 0 && (role === 'admin' || role === 'manager')) {
        const crmRes = await getUsers().catch(() => null);
        const crmUsers = extractList(crmRes) || [];
        userList = crmUsers.map(u => ({
          id:       u.key ?? u.id,
          fullName: u.value || u.fullName || u.userName || String(u.key ?? u.id),
        }));
      } else {
        userList = filtered.map(m => ({
          id:       m.crm_user_id,
          fullName: m.display_name || String(m.crm_user_id),
        }));
      }

      // Always include the current user in the list (handles bootstrap/not-in-team case)
      if (userId && !userList.some(u => String(u.id) === userId)) {
        userList = [{ id: userId, fullName: user?.fullName || String(userId) }, ...userList];
      }

      // Filter out any entries with invalid IDs to avoid breaking the Supabase query
      userList = userList.filter(u => {
        const s = String(u.id ?? '');
        return s && s !== 'undefined' && s !== 'null';
      });

      if (userList.length) {
        const ids  = userList.map(u => String(u.id));
        const data = await getTeamWeekSchedule(ids, fmt(week[0]), fmt(week[6]));
        setEntries(data);

        // For admin/manager: hide rows with no entries — but only if SOMEONE has entries
        // If nobody has entries this week, show everyone so the grid isn't blank
        const usersWithEntries = role === 'employee'
          ? userList
          : data.length > 0
            ? userList.filter(u => data.some(e => String(e.crm_user_id) === String(u.id)))
            : userList;
        setUsers(usersWithEntries);
      } else {
        setUsers([]);
      }
    } catch (e) {
      Alert.alert('خطأ', e.message || 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }, [weekOffset, userId]);

  useEffect(() => { load(); }, [load]);

  const getEntry = (uid, dateStr) =>
    entries.find(e => String(e.crm_user_id) === String(uid) && e.date === dateStr);

  const weekLabel = () => {
    if (!days.length) return '';
    const s = days[0].toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });
    const e = days[6].toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });
    return `${s} – ${e}`;
  };

  // Summary: count per type this week
  const summary = Object.keys(TYPE_COLORS).reduce((acc, t) => {
    acc[t] = entries.filter(e => e.type === t).length;
    return acc;
  }, {});

  return (
    <View style={styles.root}>
      {/* Week navigator */}
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

      {/* Role badge */}
      {myRole === 'employee' && (
        <View style={styles.roleBanner}>
          <Ionicons name="person-outline" size={13} color="#1565C0" />
          <Text style={styles.roleBannerText}>جدولك الشخصي فقط</Text>
        </View>
      )}
      {myRole === 'manager' && (
        <View style={[styles.roleBanner, { backgroundColor: '#FFF3E0' }]}>
          <Ionicons name="people-outline" size={13} color="#E65100" />
          <Text style={[styles.roleBannerText, { color: '#E65100' }]}>جدول فريقك</Text>
        </View>
      )}

      {/* Summary chips */}
      <View style={styles.summaryRow}>
        {Object.entries(TYPE_COLORS).map(([k, c]) => (
          <View key={k} style={[styles.summaryChip, { borderColor: c + '44', backgroundColor: c + '12' }]}>
            <Ionicons name={TYPE_ICONS[k]} size={13} color={c} />
            <Text style={[styles.summaryChipText, { color: c }]}>{summary[k]}</Text>
            <Text style={[styles.summaryChipLabel, { color: c }]}>{TYPE_LABELS[k]}</Text>
          </View>
        ))}
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        {Object.entries(TYPE_COLORS).map(([k, c]) => (
          <View key={k} style={styles.legendItem}>
            <View style={[styles.legendCell, { backgroundColor: c }]}>
              <Text style={styles.legendCellText}>{TYPE_SHORT[k]}</Text>
            </View>
            <Text style={styles.legendText}>{TYPE_LABELS[k]}</Text>
          </View>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 60 }} color="#1565C0" size="large" />
      ) : users.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="people-outline" size={56} color="#ddd" />
          <Text style={styles.emptyText}>لا يوجد أعضاء في الفريق</Text>
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View>
            {/* Header row */}
            <View style={styles.headerRow}>
              <View style={styles.nameCol}>
                <Text style={styles.headerCell}>الموظف</Text>
              </View>
              {days.map((d, i) => {
                const isToday = fmt(d) === todayStr;
                return (
                  <View key={i} style={[styles.dayCol, isToday && styles.todayCol]}>
                    <Text style={[styles.headerCell, isToday && styles.todayHeaderText]}>
                      {DAYS_SHORT[d.getDay()]}
                    </Text>
                    <Text style={[styles.headerDate, isToday && styles.todayHeaderDate]}>
                      {d.getDate()}
                    </Text>
                  </View>
                );
              })}
            </View>

            {/* User rows */}
            <ScrollView showsVerticalScrollIndicator={false}>
              {users.map((u, ui) => {
                const uid  = u.id;
                const name = u.fullName || String(uid);
                return (
                  <View key={uid != null ? String(uid) : `u-${ui}`} style={[styles.userRow, ui % 2 === 1 && styles.userRowAlt]}>
                    <View style={styles.nameCol}>
                      <View style={styles.avatarWrap}>
                        <Text style={styles.avatarText}>{(name || '?')[0]}</Text>
                      </View>
                      <Text style={styles.userName} numberOfLines={1}>{name}</Text>
                    </View>
                    {days.map((d, di) => {
                      const dateStr = fmt(d);
                      const entry   = getEntry(uid, dateStr);
                      const isToday = dateStr === todayStr;
                      return (
                        <View key={`${ui}-${di}`} style={[styles.dayCol, isToday && styles.todayDayCol]}>
                          {entry ? (
                            <View style={[styles.cell, { backgroundColor: TYPE_COLORS[entry.type] }]}>
                              <Text style={styles.cellText}>{TYPE_SHORT[entry.type]}</Text>
                            </View>
                          ) : (
                            <View style={[styles.emptyCell, isToday && styles.emptyCellToday]} />
                          )}
                        </View>
                      );
                    })}
                  </View>
                );
              })}
            </ScrollView>
          </View>
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

  legend: {
    flexDirection: 'row', gap: 16, paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: '#f8f8f8', borderBottomWidth: 1, borderColor: '#eee',
  },
  legendItem:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendCell:    { width: 22, height: 22, borderRadius: 6, justifyContent: 'center', alignItems: 'center' },
  legendCellText:{ color: '#fff', fontSize: 11, fontWeight: '800' },
  legendText:    { fontSize: 12, color: '#555', fontWeight: '600' },

  headerRow:    { flexDirection: 'row', backgroundColor: '#1565C0', paddingVertical: 10 },
  headerCell:   { color: '#fff', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  headerDate:   { color: 'rgba(255,255,255,0.75)', fontSize: 11, textAlign: 'center', marginTop: 1 },
  todayCol:     { backgroundColor: '#0D47A1' },
  todayHeaderText: { color: '#FFD54F' },
  todayHeaderDate: { color: '#FFD54F' },

  nameCol: { width: 110, paddingHorizontal: 8, justifyContent: 'center', flexDirection: 'row', alignItems: 'center', gap: 6 },
  dayCol:  { width: 54, alignItems: 'center', justifyContent: 'center', paddingVertical: 10 },
  todayDayCol: { backgroundColor: '#E3F2FD' },

  userRow:    { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#f0f0f0', backgroundColor: '#fff' },
  userRowAlt: { backgroundColor: '#FAFAFA' },

  avatarWrap: { width: 28, height: 28, borderRadius: 8, backgroundColor: '#1565C0', justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  userName:   { fontSize: 12, color: '#333', fontWeight: '600', flex: 1 },

  cell:      { width: 38, height: 38, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  cellText:  { color: '#fff', fontSize: 15, fontWeight: '800' },
  emptyCell: { width: 38, height: 38, borderRadius: 10, backgroundColor: '#f0f0f0' },
  emptyCellToday: { backgroundColor: '#BBDEFB' },

  roleBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#E3F2FD', paddingHorizontal: 14, paddingVertical: 7, borderBottomWidth: 1, borderColor: '#BBDEFB' },
  roleBannerText: { fontSize: 12, fontWeight: '700', color: '#1565C0' },
  empty:     { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText: { fontSize: 14, color: '#bbb' },
});
