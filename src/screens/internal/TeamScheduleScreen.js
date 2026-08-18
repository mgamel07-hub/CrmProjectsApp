import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getTeamWeekSchedule } from '../../api/internal';
import { getUsers } from '../../api/projects';
import { extractList } from '../../utils/helpers';

const DAYS_SHORT = ['أحد', 'اثن', 'ثلا', 'أرب', 'خمس', 'جمع', 'سبت'];
const TYPE_COLORS = { visit: '#1565C0', office: '#388E3C', vacation: '#E65100' };
const TYPE_SHORT = { visit: 'ز', office: 'م', vacation: 'إ' };

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

export default function TeamScheduleScreen({ route }) {
  const { userId } = route.params;
  const [weekOffset, setWeekOffset] = useState(0);
  const [days, setDays] = useState([]);
  const [users, setUsers] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const week = getWeekDates(weekOffset);
    setDays(week);
    try {
      const userRes = await getUsers().catch(() => null);
      const userList = userRes ? (extractList(userRes) || []) : [];
      setUsers(userList);
      if (userList.length) {
        const ids = userList.map(u => String(u.id || u.userId));
        const data = await getTeamWeekSchedule(ids, fmt(week[0]), fmt(week[6]));
        setEntries(data);
      }
    } catch (e) {
      Alert.alert('خطأ', e.message);
    } finally {
      setLoading(false);
    }
  }, [weekOffset]);

  useEffect(() => { load(); }, [load]);

  const getEntry = (userId, dateStr) =>
    entries.find(e => String(e.crm_user_id) === String(userId) && e.date === dateStr);

  const weekLabel = () => {
    if (!days.length) return '';
    const s = days[0].toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });
    const e = days[6].toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });
    return `${s} – ${e}`;
  };

  return (
    <View style={styles.root}>
      {/* Week nav */}
      <View style={styles.nav}>
        <TouchableOpacity onPress={() => setWeekOffset(w => w - 1)} style={styles.navBtn}>
          <Ionicons name="chevron-back" size={22} color="#1565C0" />
        </TouchableOpacity>
        <Text style={styles.navLabel}>{weekLabel()}</Text>
        <TouchableOpacity onPress={() => setWeekOffset(w => w + 1)} style={styles.navBtn}>
          <Ionicons name="chevron-forward" size={22} color="#1565C0" />
        </TouchableOpacity>
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        {Object.entries(TYPE_COLORS).map(([k, c]) => (
          <View key={k} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: c }]} />
            <Text style={styles.legendText}>{k === 'visit' ? 'زيارة' : k === 'office' ? 'مكتب' : 'إجازة'}</Text>
          </View>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color="#1565C0" size="large" />
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View>
            {/* Header row */}
            <View style={styles.headerRow}>
              <View style={styles.nameCol}><Text style={styles.headerCell}>الموظف</Text></View>
              {days.map((d, i) => (
                <View key={i} style={styles.dayCol}>
                  <Text style={styles.headerCell}>{DAYS_SHORT[d.getDay()]}</Text>
                  <Text style={styles.headerDate}>{d.getDate()}</Text>
                </View>
              ))}
            </View>

            {/* User rows */}
            <ScrollView style={styles.rows}>
              {users.map((u, ui) => {
                const uid = u.id || u.userId;
                const name = u.fullName || u.name || String(uid);
                return (
                  <View key={uid != null ? String(uid) : `user-${ui}`} style={styles.userRow}>
                    <View style={styles.nameCol}>
                      <Text style={styles.userName} numberOfLines={1}>{name}</Text>
                    </View>
                    {days.map((d, di) => {
                      const dateStr = fmt(d);
                      const entry = getEntry(uid, dateStr);
                      return (
                        <View key={`${ui}-${di}`} style={styles.dayCol}>
                          {entry ? (
                            <View style={[styles.cell, { backgroundColor: TYPE_COLORS[entry.type] }]}>
                              <Text style={styles.cellText}>{TYPE_SHORT[entry.type]}</Text>
                            </View>
                          ) : (
                            <View style={styles.emptyCell} />
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
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#eee' },
  navBtn: { padding: 4 },
  navLabel: { fontSize: 15, fontWeight: '700', color: '#1a1a1a' },
  legend: { flexDirection: 'row', gap: 16, padding: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#eee' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 11, color: '#555' },
  headerRow: { flexDirection: 'row', backgroundColor: '#1565C0', paddingVertical: 8 },
  headerCell: { color: '#fff', fontSize: 11, fontWeight: '700', textAlign: 'center' },
  headerDate: { color: 'rgba(255,255,255,0.7)', fontSize: 10, textAlign: 'center' },
  nameCol: { width: 90, paddingHorizontal: 8, justifyContent: 'center' },
  dayCol: { width: 46, alignItems: 'center', justifyContent: 'center' },
  rows: { maxHeight: 500 },
  userRow: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#f0f0f0', backgroundColor: '#fff', paddingVertical: 8 },
  userName: { fontSize: 11, color: '#333', fontWeight: '600' },
  cell: { width: 32, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  cellText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  emptyCell: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#f5f5f5' },
});
