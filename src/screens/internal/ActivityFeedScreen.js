/**
 * ActivityFeedScreen — سجل النشاط
 * Unified timeline of: completed tasks + schedule entries
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getTeamMembers, getTeamTasks, getTeamWeekSchedule, getMyTeamRecord } from '../../api/internal';
import { useAuth } from '../../context/AuthContext';

const TYPE_META = {
  visit:    { icon: 'car-outline',      color: '#1565C0', bg: '#E3F2FD', label: 'زيارة' },
  office:   { icon: 'business-outline', color: '#2E7D32', bg: '#E8F5E9', label: 'في المكتب' },
  vacation: { icon: 'sunny-outline',    color: '#E65100', bg: '#FFF3E0', label: 'إجازة' },
  task:     { icon: 'checkmark-circle', color: '#388E3C', bg: '#E8F5E9', label: 'مهمة منجزة' },
};

const PERIODS = [
  { key: 1,  label: 'اليوم' },
  { key: 7,  label: 'الأسبوع' },
  { key: 30, label: 'الشهر' },
];

function relativeTime(dateStr) {
  if (!dateStr) return '';
  const now   = new Date();
  const d     = new Date(dateStr);
  const diff  = Math.floor((now - d) / 1000);
  if (diff < 60)     return 'الآن';
  if (diff < 3600)   return `منذ ${Math.floor(diff / 60)} د`;
  if (diff < 86400)  return `منذ ${Math.floor(diff / 3600)} س`;
  if (diff < 172800) return 'أمس';
  return d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });
}

function FeedCard({ item }) {
  const m = TYPE_META[item.type] || TYPE_META.task;
  return (
    <View style={[s.card, { borderRightColor: m.color, borderRightWidth: 3 }]}>
      <View style={[s.iconWrap, { backgroundColor: m.bg }]}>
        <Ionicons name={m.icon} size={18} color={m.color} />
      </View>
      <View style={s.body}>
        <Text style={s.action}>{item.action}</Text>
        <Text style={s.name} numberOfLines={1}>{item.actor}</Text>
        {item.note ? <Text style={s.note} numberOfLines={2}>{item.note}</Text> : null}
      </View>
      <Text style={s.time}>{relativeTime(item.date)}</Text>
    </View>
  );
}

export default function ActivityFeedScreen() {
  const { user } = useAuth();
  const userId = user?.userId != null ? String(user.userId) : String(user?.id ?? '');

  const [feed,      setFeed]      = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [refreshing,setRefreshing]= useState(false);
  const [days,      setDays]      = useState(7);

  const load = useCallback(async () => {
    try {
      const [members, myRec] = await Promise.all([
        getTeamMembers(),
        userId ? getMyTeamRecord(userId) : Promise.resolve(null),
      ]);
      const role   = myRec?.role || 'admin';
      const teamId = myRec?.team_id;

      let filtered;
      if (role === 'admin') {
        filtered = members;
      } else if (role === 'manager' && teamId) {
        filtered = members.filter(m => m.team_id === teamId);
      } else {
        // employee: only self
        const self = members.find(m => String(m.crm_user_id) === userId);
        filtered = self ? [self] : [];
      }

      const nameMap = {};
      filtered.forEach(m => { nameMap[String(m.crm_user_id)] = m.display_name || String(m.crm_user_id); });
      const ids = filtered.map(m => String(m.crm_user_id));
      if (!ids.length) { setFeed([]); return; }

      // Date range
      const now   = new Date();
      const from  = new Date(now); from.setDate(now.getDate() - days);
      const fromStr = from.toISOString().split('T')[0];
      const toStr   = now.toISOString().split('T')[0];

      // Load in parallel
      const [tasks, schedules] = await Promise.all([
        getTeamTasks(ids),
        getTeamWeekSchedule(ids, fromStr, toStr),
      ]);

      const events = [];

      // Completed tasks in range
      for (const t of tasks) {
        if (t.status !== 'done' || !t.done_at) continue;
        if (t.done_at.slice(0, 10) < fromStr) continue;
        events.push({
          type:   'task',
          date:   t.done_at,
          action: `أغلق مهمة: ${t.title}`,
          actor:  nameMap[String(t.assigned_to)] || String(t.assigned_to),
          note:   t.completion_notes || '',
          _sort:  t.done_at,
        });
      }

      // Schedule entries in range
      for (const se of schedules) {
        const m = TYPE_META[se.type];
        if (!m) continue;
        events.push({
          type:   se.type,
          date:   se.date,
          action: m.label,
          actor:  nameMap[String(se.crm_user_id)] || String(se.crm_user_id),
          note:   '',
          _sort:  se.date,
        });
      }

      events.sort((a, b) => b._sort.localeCompare(a._sort));
      setFeed(events);
    } catch (e) {
      console.warn('ActivityFeed error:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [days, userId]);

  useEffect(() => { load(); }, [load]);

  const typeCounts = feed.reduce((acc, e) => { acc[e.type] = (acc[e.type] || 0) + 1; return acc; }, {});

  return (
    <View style={s.root}>
      {/* Period selector */}
      <View style={s.periodBar}>
        {PERIODS.map(p => (
          <TouchableOpacity
            key={p.key}
            style={[s.pill, days === p.key && s.pillActive]}
            onPress={() => setDays(p.key)}
          >
            <Text style={[s.pillText, days === p.key && s.pillTextActive]}>{p.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Stats row */}
      <View style={s.statsRow}>
        {Object.entries(typeCounts).map(([type, count]) => {
          const m = TYPE_META[type] || {};
          return (
            <View key={type} style={[s.statChip, { backgroundColor: m.bg }]}>
              <Ionicons name={m.icon} size={12} color={m.color} />
              <Text style={[s.statChipText, { color: m.color }]}>{count} {m.label}</Text>
            </View>
          );
        })}
        {!Object.keys(typeCounts).length && !loading && (
          <Text style={s.noStatsText}>لا يوجد نشاط</Text>
        )}
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 60 }} size="large" color="#1565C0" />
      ) : (
        <FlatList
          data={feed}
          keyExtractor={(_, i) => i.toString()}
          renderItem={({ item }) => <FeedCard item={item} />}
          contentContainerStyle={s.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={['#1565C0']} />}
          ListEmptyComponent={
            <View style={s.empty}>
              <Ionicons name="pulse-outline" size={52} color="#ddd" />
              <Text style={s.emptyTitle}>لا يوجد نشاط</Text>
              <Text style={s.emptySub}>لم يُسجَّل أي نشاط في هذه الفترة</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F5F7FA' },

  periodBar: { flexDirection: 'row', justifyContent: 'center', gap: 8, padding: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#eee' },
  pill: { paddingHorizontal: 18, paddingVertical: 7, borderRadius: 20, backgroundColor: '#f0f0f0', borderWidth: 1, borderColor: '#e0e0e0' },
  pillActive: { backgroundColor: '#1565C0', borderColor: '#1565C0' },
  pillText: { fontSize: 13, color: '#666', fontWeight: '600' },
  pillTextActive: { color: '#fff' },

  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#f0f0f0' },
  statChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statChipText: { fontSize: 11, fontWeight: '700' },
  noStatsText: { fontSize: 12, color: '#ccc', fontStyle: 'italic' },

  list: { padding: 12, paddingBottom: 32, gap: 8 },
  card: {
    flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#fff',
    borderRadius: 12, padding: 12, gap: 10,
    elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3,
  },
  iconWrap: { width: 38, height: 38, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  body: { flex: 1 },
  action: { fontSize: 13, fontWeight: '700', color: '#1a1a1a', lineHeight: 18 },
  name: { fontSize: 11, color: '#888', marginTop: 2 },
  note: { fontSize: 11, color: '#388E3C', backgroundColor: '#E8F5E9', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, marginTop: 4, lineHeight: 16 },
  time: { fontSize: 10, color: '#bbb', fontWeight: '600', flexShrink: 0 },

  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: '#ccc', marginTop: 12 },
  emptySub: { fontSize: 12, color: '#ddd', marginTop: 4 },
});
