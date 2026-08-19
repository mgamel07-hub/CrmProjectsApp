import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getTeamWeekSchedule, getTeamMembers } from '../../api/internal';
import { useRole } from '../../context/RoleContext';

const DAYS_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const DAYS_SHORT = ['أحد', 'اثن', 'ثلا', 'أرب', 'خمس', 'جمع', 'سبت'];

const TYPE_META = {
  visit:    { label: 'زيارة',  color: '#1565C0', bg: '#E3F2FD', icon: 'car-outline' },
  office:   { label: 'مكتب',   color: '#2E7D32', bg: '#E8F5E9', icon: 'business-outline' },
  vacation: { label: 'إجازة',  color: '#E65100', bg: '#FFF3E0', icon: 'sunny-outline' },
};

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

function isToday(date) {
  return fmt(date) === fmt(new Date());
}

// Avatar initials
function Avatar({ name, size = 28 }) {
  const initials = (name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <View style={[avatarStyle.wrap, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[avatarStyle.text, { fontSize: size * 0.38 }]}>{initials}</Text>
    </View>
  );
}
const avatarStyle = StyleSheet.create({
  wrap: { backgroundColor: '#1565C0', justifyContent: 'center', alignItems: 'center' },
  text: { color: '#fff', fontWeight: '800' },
});

export default function TeamScheduleScreen() {
  const { visibleCrmIds } = useRole();
  const [weekOffset, setWeekOffset]   = useState(0);
  const [days, setDays]               = useState([]);
  const [users, setUsers]             = useState([]);
  const [entries, setEntries]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [selectedDay, setSelectedDay] = useState(null); // fmt string of focused day

  const load = useCallback(async () => {
    setLoading(true);
    const week = getWeekDates(weekOffset);
    setDays(week);
    // Default selected day = today if in this week, else first day
    const todayStr = fmt(new Date());
    const todayInWeek = week.find(d => fmt(d) === todayStr);
    setSelectedDay(fmt(todayInWeek || week[0]));
    try {
      const members = await getTeamMembers();
      // Only filter if visibleCrmIds has actual entries (empty array ≠ null)
      const filtered = visibleCrmIds && visibleCrmIds.length > 0
        ? members.filter(m => visibleCrmIds.includes(String(m.crm_user_id)))
        : members;
      const userList = filtered.map(m => ({
        id: String(m.crm_user_id),
        fullName: m.display_name || String(m.crm_user_id),
      }));
      setUsers(userList);
      if (userList.length) {
        const ids = userList.map(u => u.id);
        const data = await getTeamWeekSchedule(ids, fmt(week[0]), fmt(week[6]));
        setEntries(data);
      }
    } catch (e) {
      Alert.alert('خطأ', e.message || 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }, [weekOffset, visibleCrmIds]);

  useEffect(() => { load(); }, [load]);

  const getEntry = (uid, dateStr) =>
    entries.find(e => String(e.crm_user_id) === String(uid) && e.date === dateStr);

  const weekLabel = () => {
    if (!days.length) return '';
    const s = days[0].toLocaleDateString('ar-EG', { day: 'numeric', month: 'long' });
    const e = days[6].toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' });
    return `${s} – ${e}`;
  };

  // Stats for the selected day
  const selectedEntries = entries.filter(e => e.date === selectedDay);
  const typeCounts = selectedEntries.reduce((acc, e) => {
    acc[e.type] = (acc[e.type] || 0) + 1;
    return acc;
  }, {});

  return (
    <View style={s.root}>
      {/* ── Week navigator ─────────────────────────────────────────── */}
      <View style={s.nav}>
        <TouchableOpacity onPress={() => setWeekOffset(w => w - 1)} style={s.navBtn}>
          <Ionicons name="chevron-forward" size={22} color="#1565C0" />
        </TouchableOpacity>
        <View style={{ alignItems: 'center' }}>
          <Text style={s.navLabel}>{weekLabel()}</Text>
          {weekOffset !== 0 && (
            <TouchableOpacity onPress={() => setWeekOffset(0)}>
              <Text style={s.todayLink}>العودة للأسبوع الحالي</Text>
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity onPress={() => setWeekOffset(w => w + 1)} style={s.navBtn}>
          <Ionicons name="chevron-back" size={22} color="#1565C0" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 60 }} color="#1565C0" size="large" />
      ) : (
        <>
          {/* ── Day picker (calendar header) ───────────────────────── */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            style={s.dayPicker} contentContainerStyle={s.dayPickerContent}>
            {days.map((d, i) => {
              const dateStr = fmt(d);
              const today   = isToday(d);
              const active  = selectedDay === dateStr;
              const dayEntries = entries.filter(e => e.date === dateStr);
              const hasDots = dayEntries.length > 0;
              return (
                <TouchableOpacity
                  key={i}
                  style={[s.dayBtn, active && s.dayBtnActive, today && !active && s.dayBtnToday]}
                  onPress={() => setSelectedDay(dateStr)}
                  activeOpacity={0.7}
                >
                  <Text style={[s.dayName, active && s.dayTextActive]}>{DAYS_SHORT[d.getDay()]}</Text>
                  <Text style={[s.dayNum, active && s.dayTextActive, today && !active && { color: '#1565C0', fontWeight: '800' }]}>
                    {d.getDate()}
                  </Text>
                  {/* Dot indicators per type */}
                  <View style={s.dotRow}>
                    {Object.keys(TYPE_META).map(type => {
                      const count = dayEntries.filter(e => e.type === type).length;
                      if (!count) return null;
                      return (
                        <View key={type} style={[s.dot, { backgroundColor: active ? 'rgba(255,255,255,0.8)' : TYPE_META[type].color }]} />
                      );
                    })}
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* ── Selected day label + stats ──────────────────────────── */}
          {selectedDay && (
            <View style={s.dayHeader}>
              <Text style={s.dayHeaderTitle}>
                {DAYS_AR[days.find(d => fmt(d) === selectedDay)?.getDay() ?? 0]}{' '}
                {days.find(d => fmt(d) === selectedDay)?.toLocaleDateString('ar-EG', { day: 'numeric', month: 'long' })}
                {isToday(days.find(d => fmt(d) === selectedDay) || new Date()) && (
                  <Text style={s.todayBadge}> · اليوم</Text>
                )}
              </Text>
              <View style={s.statRow}>
                {Object.entries(typeCounts).map(([type, count]) => {
                  const m = TYPE_META[type] || {};
                  return (
                    <View key={type} style={[s.statChip, { backgroundColor: m.bg }]}>
                      <Ionicons name={m.icon} size={12} color={m.color} />
                      <Text style={[s.statChipText, { color: m.color }]}>{count} {m.label}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {/* ── Team member cards for selected day ─────────────────── */}
          <ScrollView style={s.memberList} contentContainerStyle={s.memberListContent} showsVerticalScrollIndicator={false}>
            {users.length === 0 ? (
              <View style={s.empty}>
                <Ionicons name="people-outline" size={52} color="#ddd" />
                <Text style={s.emptyTitle}>لا يوجد أعضاء</Text>
                <Text style={s.emptySub}>أضف أعضاء الفريق من شاشة "إعداد الفريق"</Text>
              </View>
            ) : (
              users.map(u => {
                const entry = getEntry(u.id, selectedDay);
                const meta  = entry ? (TYPE_META[entry.type] || {}) : null;
                return (
                  <View key={u.id} style={[s.memberCard, entry && { borderLeftColor: meta?.color, borderLeftWidth: 4 }]}>
                    <Avatar name={u.fullName} size={42} />
                    <View style={s.memberInfo}>
                      <Text style={s.memberName}>{u.fullName}</Text>
                      {entry ? (
                        <View style={[s.typePill, { backgroundColor: meta.bg }]}>
                          <Ionicons name={meta.icon} size={13} color={meta.color} />
                          <Text style={[s.typePillText, { color: meta.color }]}>{meta.label}</Text>
                        </View>
                      ) : (
                        <Text style={s.memberNoEntry}>لم يسجل جدوله بعد</Text>
                      )}
                    </View>
                    {entry && (
                      <View style={[s.entryBadge, { backgroundColor: meta.bg }]}>
                        <Ionicons name={meta.icon} size={20} color={meta.color} />
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </ScrollView>

          {/* ── Legend ─────────────────────────────────────────────── */}
          <View style={s.legend}>
            {Object.entries(TYPE_META).map(([k, m]) => (
              <View key={k} style={s.legendItem}>
                <View style={[s.legendDot, { backgroundColor: m.color }]} />
                <Text style={s.legendText}>{m.label}</Text>
              </View>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F5F7FA' },

  // Nav
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#eee' },
  navBtn: { padding: 6 },
  navLabel: { fontSize: 14, fontWeight: '700', color: '#1a1a1a', textAlign: 'center' },
  todayLink: { fontSize: 11, color: '#1565C0', marginTop: 2, fontWeight: '600' },

  // Day picker
  dayPicker: { backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#eee', maxHeight: 90 },
  dayPickerContent: { paddingHorizontal: 8, paddingVertical: 10, gap: 6 },
  dayBtn: { width: 52, alignItems: 'center', paddingVertical: 8, borderRadius: 14, backgroundColor: '#F5F7FA' },
  dayBtnActive: { backgroundColor: '#1565C0' },
  dayBtnToday: { backgroundColor: '#E3F2FD', borderWidth: 1.5, borderColor: '#1565C0' },
  dayName: { fontSize: 11, color: '#888', fontWeight: '600', marginBottom: 2 },
  dayNum:  { fontSize: 18, fontWeight: '700', color: '#333' },
  dayTextActive: { color: '#fff' },
  dotRow: { flexDirection: 'row', gap: 3, marginTop: 4, minHeight: 6 },
  dot: { width: 5, height: 5, borderRadius: 3 },

  // Day header
  dayHeader: { backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderColor: '#eee' },
  dayHeaderTitle: { fontSize: 15, fontWeight: '800', color: '#1a1a1a' },
  todayBadge: { color: '#1565C0', fontWeight: '700' },
  statRow: { flexDirection: 'row', gap: 8, marginTop: 6, flexWrap: 'wrap' },
  statChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statChipText: { fontSize: 11, fontWeight: '700' },

  // Member list
  memberList: { flex: 1 },
  memberListContent: { padding: 12, gap: 8, paddingBottom: 24 },
  memberCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: 14, padding: 14, gap: 12,
    elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3,
    borderLeftWidth: 0, borderLeftColor: 'transparent',
  },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 14, fontWeight: '700', color: '#1a1a1a', marginBottom: 4 },
  memberNoEntry: { fontSize: 12, color: '#ccc', fontStyle: 'italic' },
  typePill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, alignSelf: 'flex-start' },
  typePillText: { fontSize: 12, fontWeight: '700' },
  entryBadge: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },

  // Empty
  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: '#ccc', marginTop: 12 },
  emptySub: { fontSize: 12, color: '#ddd', marginTop: 4, textAlign: 'center' },

  // Legend
  legend: { flexDirection: 'row', justifyContent: 'center', gap: 20, padding: 12, backgroundColor: '#fff', borderTopWidth: 1, borderColor: '#eee' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 11, color: '#666', fontWeight: '600' },
});
