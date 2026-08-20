import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, ScrollView, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getTeamMembers, getTeamTasks, getTeamWeekSchedule, getMyTeamRecord, getTeams } from '../../api/internal';
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
  const now  = new Date();
  const d    = new Date(dateStr);
  const diff = Math.floor((now - d) / 1000);
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

function PickerModal({ visible, onClose, items, value, onSelect, title }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.sheet}>
          <View style={s.sheetHeader}>
            <Text style={s.sheetTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color="#888" /></TouchableOpacity>
          </View>
          <ScrollView>
            <TouchableOpacity
              style={[s.pickerRow, !value && s.pickerRowActive]}
              onPress={() => { onSelect(null); onClose(); }}
            >
              <Text style={[s.pickerText, !value && s.pickerTextActive]}>الكل</Text>
              {!value && <Ionicons name="checkmark" size={18} color="#1565C0" />}
            </TouchableOpacity>
            {items.map(it => (
              <TouchableOpacity
                key={it.id}
                style={[s.pickerRow, value === it.id && s.pickerRowActive]}
                onPress={() => { onSelect(it.id); onClose(); }}
              >
                <Text style={[s.pickerText, value === it.id && s.pickerTextActive]}>{it.name}</Text>
                {value === it.id && <Ionicons name="checkmark" size={18} color="#1565C0" />}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export default function ActivityFeedScreen() {
  const { user } = useAuth();
  const userId = user?.userId != null ? String(user.userId) : String(user?.id ?? '');

  const [allFeed,    setAllFeed]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [days,       setDays]       = useState(7);

  // Members & teams for filter
  const [allMembers, setAllMembers] = useState([]); // { id, name, team_id }
  const [teams,      setTeams]      = useState([]); // { id, name }
  const [myRole,     setMyRole]     = useState('employee');

  // Active filters
  const [selTeam,   setSelTeam]   = useState(null);
  const [selMember, setSelMember] = useState(null);
  const [showTeamPicker,   setShowTeamPicker]   = useState(false);
  const [showMemberPicker, setShowMemberPicker] = useState(false);

  const load = useCallback(async () => {
    try {
      const [members, myRec, teamsData] = await Promise.all([
        getTeamMembers(),
        userId ? getMyTeamRecord(userId) : Promise.resolve(null),
        getTeams().catch(() => []),
      ]);
      const role   = myRec?.role || 'admin';
      const teamId = myRec?.team_id;
      setMyRole(role);
      setTeams(teamsData.map(t => ({ id: t.id, name: t.name })));

      let filtered;
      if (role === 'admin') {
        filtered = members;
      } else if (role === 'manager') {
        filtered = teamId ? members.filter(m => m.team_id === teamId) : members;
      } else {
        const self = members.find(m => String(m.crm_user_id) === userId);
        filtered = self ? [self] : [];
      }

      setAllMembers(filtered.map(m => ({
        id:      String(m.crm_user_id),
        name:    m.display_name || String(m.crm_user_id),
        team_id: m.team_id,
      })));

      const nameMap = {};
      filtered.forEach(m => { nameMap[String(m.crm_user_id)] = m.display_name || String(m.crm_user_id); });
      const ids = filtered.map(m => String(m.crm_user_id));
      if (!ids.length) { setAllFeed([]); return; }

      const now     = new Date();
      const from    = new Date(now); from.setDate(now.getDate() - days);
      const fromStr = from.toISOString().split('T')[0];
      const toStr   = now.toISOString().split('T')[0];

      const [tasks, schedules] = await Promise.all([
        getTeamTasks(ids),
        getTeamWeekSchedule(ids, fromStr, toStr),
      ]);

      const events = [];
      for (const t of tasks) {
        if (t.status !== 'done' || !t.done_at) continue;
        if (t.done_at.slice(0, 10) < fromStr) continue;
        events.push({
          type:   'task',
          date:   t.done_at,
          action: `أغلق مهمة: ${t.title}`,
          actor:  nameMap[String(t.assigned_to)] || String(t.assigned_to),
          actorId: String(t.assigned_to),
          note:   t.completion_notes || '',
          _sort:  t.done_at,
        });
      }
      for (const se of schedules) {
        const m = TYPE_META[se.type];
        if (!m) continue;
        events.push({
          type:   se.type,
          date:   se.date,
          action: m.label,
          actor:  nameMap[String(se.crm_user_id)] || String(se.crm_user_id),
          actorId: String(se.crm_user_id),
          note:   '',
          _sort:  se.date,
        });
      }
      events.sort((a, b) => b._sort.localeCompare(a._sort));
      setAllFeed(events);
    } catch {
      // silent
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [days, userId]);

  useEffect(() => { load(); }, [load]);

  // Members filtered by selected team (for the member picker)
  const membersForTeam = useMemo(() =>
    selTeam ? allMembers.filter(m => m.team_id === selTeam) : allMembers,
  [allMembers, selTeam]);

  // IDs visible after team filter
  const visibleIds = useMemo(() => new Set(membersForTeam.map(m => m.id)), [membersForTeam]);

  // Feed filtered by team + member
  const feed = useMemo(() => {
    let f = allFeed;
    if (selTeam)   f = f.filter(e => visibleIds.has(e.actorId));
    if (selMember) f = f.filter(e => e.actorId === selMember);
    return f;
  }, [allFeed, selTeam, selMember, visibleIds]);

  const typeCounts = feed.reduce((acc, e) => { acc[e.type] = (acc[e.type] || 0) + 1; return acc; }, {});

  const selectedTeamName   = teams.find(t => t.id === selTeam)?.name;
  const selectedMemberName = allMembers.find(m => m.id === selMember)?.name;

  const isFiltered = selTeam || selMember;

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

      {/* Filter bar — visible for admin/manager */}
      {myRole !== 'employee' && (
        <View style={s.filterBar}>
          <TouchableOpacity
            style={[s.filterBtn, selTeam && s.filterBtnActive]}
            onPress={() => setShowTeamPicker(true)}
          >
            <Ionicons name="layers-outline" size={14} color={selTeam ? '#1565C0' : '#888'} />
            <Text style={[s.filterBtnText, selTeam && s.filterBtnTextActive]} numberOfLines={1}>
              {selectedTeamName || 'كل الفرق'}
            </Text>
            <Ionicons name="chevron-down" size={12} color={selTeam ? '#1565C0' : '#aaa'} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.filterBtn, selMember && s.filterBtnActive]}
            onPress={() => setShowMemberPicker(true)}
          >
            <Ionicons name="person-outline" size={14} color={selMember ? '#1565C0' : '#888'} />
            <Text style={[s.filterBtnText, selMember && s.filterBtnTextActive]} numberOfLines={1}>
              {selectedMemberName || 'كل الموظفين'}
            </Text>
            <Ionicons name="chevron-down" size={12} color={selMember ? '#1565C0' : '#aaa'} />
          </TouchableOpacity>

          {isFiltered && (
            <TouchableOpacity
              style={s.clearBtn}
              onPress={() => { setSelTeam(null); setSelMember(null); }}
            >
              <Ionicons name="close-circle" size={18} color="#D32F2F" />
            </TouchableOpacity>
          )}
        </View>
      )}

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
              <Text style={s.emptySub}>
                {isFiltered ? 'لا توجد نتائج للفلتر المحدد' : 'لم يُسجَّل أي نشاط في هذه الفترة'}
              </Text>
            </View>
          }
        />
      )}

      <PickerModal
        visible={showTeamPicker}
        onClose={() => setShowTeamPicker(false)}
        items={teams}
        value={selTeam}
        onSelect={(id) => { setSelTeam(id); setSelMember(null); }}
        title="اختر الفريق"
      />
      <PickerModal
        visible={showMemberPicker}
        onClose={() => setShowMemberPicker(false)}
        items={membersForTeam}
        value={selMember}
        onSelect={setSelMember}
        title="اختر الموظف"
      />
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

  filterBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#eee',
  },
  filterBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
    backgroundColor: '#f5f5f5', borderWidth: 1, borderColor: '#e0e0e0',
  },
  filterBtnActive: { backgroundColor: '#E3F2FD', borderColor: '#1565C0' },
  filterBtnText: { flex: 1, fontSize: 12, color: '#888', fontWeight: '600' },
  filterBtnTextActive: { color: '#1565C0' },
  clearBtn: { padding: 4 },

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
  emptySub: { fontSize: 12, color: '#ddd', marginTop: 4, textAlign: 'center' },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '70%' },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderColor: '#eee' },
  sheetTitle: { fontSize: 15, fontWeight: '800', color: '#1a1a1a' },
  pickerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderColor: '#f5f5f5' },
  pickerRowActive: { backgroundColor: '#E3F2FD' },
  pickerText: { fontSize: 14, color: '#333', fontWeight: '600' },
  pickerTextActive: { color: '#1565C0' },
});
