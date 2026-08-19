import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { getMyWeekStats, getMyDailyLogs, getMyTasks, getUnreadCount } from '../../api/internal';

const GREETING = () => {
  const h = new Date().getHours();
  if (h < 12) return 'صباح الخير';
  if (h < 17) return 'مساء الخير';
  return 'مساء النور';
};

const LOG_TYPES = {
  visit:   { label: 'زيارة',   icon: 'car-outline',        color: '#1565C0' },
  issue:   { label: 'بلاغ',    icon: 'warning-outline',     color: '#C62828' },
  study:   { label: 'مذاكرة',  icon: 'book-outline',        color: '#6A1B9A' },
  meeting: { label: 'اجتماع',  icon: 'people-outline',      color: '#00695C' },
  other:   { label: 'أخرى',    icon: 'ellipsis-horizontal-outline', color: '#607D8B' },
};

function StatBox({ value, label, color = '#1565C0', bg = '#E3F2FD', icon }) {
  return (
    <View style={[styles.statBox, { backgroundColor: bg, borderColor: color + '33' }]}>
      <Ionicons name={icon} size={18} color={color} />
      <Text style={[styles.statNum, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function MyDashboardScreen({ navigation }) {
  const { user } = useAuth();
  const userId = user?.userId != null ? String(user.userId) : String(user?.id ?? '');
  const name   = user?.fullName || 'موظف';

  const [stats,     setStats]     = useState(null);
  const [todayLogs, setTodayLogs] = useState([]);
  const [tasks,     setTasks]     = useState([]);
  const [unread,    setUnread]    = useState(0);
  const [loading,   setLoading]   = useState(true);
  const [refreshing,setRefreshing]= useState(false);

  const today = new Date().toISOString().split('T')[0];

  const load = useCallback(async () => {
    try {
      const [weekStats, tLogs, myTasks, notifCount] = await Promise.all([
        getMyWeekStats(userId),
        getMyDailyLogs(userId, today),
        getMyTasks(userId),
        getUnreadCount(userId),
      ]);
      setStats(weekStats);
      setTodayLogs(tLogs);
      setTasks(myTasks);
      setUnread(notifCount);
    } catch (e) {
      /* silent */
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId, today]);

  useEffect(() => { load(); }, [load]);

  const todayStr = new Date().toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' });

  const pendingTasks = tasks.filter(t => t.status === 'pending');
  const doneTasks    = tasks.filter(t => t.status === 'done');
  const overdueTasks = pendingTasks.filter(t => t.due_date && t.due_date < today);
  const highPrio     = pendingTasks.filter(t => t.priority === 'high');

  const weekLogs   = stats?.logs  || [];
  const weekVisits = weekLogs.filter(l => l.type === 'visit').length;
  const weekIssues = weekLogs.filter(l => l.type === 'issue').length;
  const weekDone   = (stats?.tasks || []).filter(t => t.status === 'done' && t.done_at && t.done_at >= stats.fromDate + 'T00:00:00').length;

  const todayLogCount = todayLogs.length;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={['#1565C0']} />}>

      {/* Welcome card */}
      <View style={styles.welcomeCard}>
        <View style={styles.welcomeLeft}>
          <Text style={styles.greeting}>{GREETING()} 👋</Text>
          <Text style={styles.userName}>{name}</Text>
          <Text style={styles.dateLabel}>{todayStr}</Text>
        </View>
        <View style={styles.welcomeRight}>
          {unread > 0 && (
            <TouchableOpacity style={styles.notifBtn} onPress={() => navigation.navigate('InternalNotifications', { userId })}>
              <Ionicons name="notifications" size={20} color="#fff" />
              <View style={styles.notifDot}><Text style={styles.notifDotText}>{unread}</Text></View>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color="#1565C0" size="large" />
      ) : (
        <>
          {/* Alerts */}
          {overdueTasks.length > 0 && (
            <TouchableOpacity style={styles.alertBanner} onPress={() => navigation.navigate('MyTasks', { userId })}>
              <Ionicons name="alert-circle" size={16} color="#C62828" />
              <Text style={styles.alertText}>{overdueTasks.length} مهمة متأخرة — اضغط للعرض</Text>
              <Ionicons name="chevron-back" size={14} color="#C62828" />
            </TouchableOpacity>
          )}
          {highPrio.length > 0 && (
            <View style={styles.warnBanner}>
              <Ionicons name="flame-outline" size={16} color="#E65100" />
              <Text style={styles.warnText}>{highPrio.length} مهمة عالية الأولوية معلقة</Text>
            </View>
          )}

          {/* Today summary */}
          <View style={styles.sectionHeader}>
            <Ionicons name="today-outline" size={16} color="#1565C0" />
            <Text style={styles.sectionTitle}>اليوم</Text>
          </View>
          <View style={styles.statsRow}>
            <StatBox value={pendingTasks.length} label="مهام معلقة"   color="#E65100" bg="#FFF3E0" icon="time-outline" />
            <StatBox value={doneTasks.length}    label="مهام منجزة"   color="#388E3C" bg="#E8F5E9" icon="checkmark-circle-outline" />
            <StatBox value={todayLogCount}       label="نشاط اليوم"   color="#1565C0" bg="#E3F2FD" icon="clipboard-outline" />
          </View>

          {/* Today's log preview */}
          <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('DailyLog')}>
            <View style={styles.cardHeader}>
              <Ionicons name="clipboard-outline" size={16} color="#1565C0" />
              <Text style={styles.cardTitle}>سجل اليوم</Text>
              <Text style={styles.cardMore}>عرض الكل ←</Text>
            </View>
            {todayLogs.length === 0 ? (
              <Text style={styles.cardEmpty}>لم تسجّل أي نشاط اليوم بعد</Text>
            ) : (
              todayLogs.slice(0, 3).map(log => {
                const t = LOG_TYPES[log.type] || LOG_TYPES.other;
                return (
                  <View key={log.id} style={styles.logRow}>
                    <View style={[styles.logDot, { backgroundColor: t.color }]} />
                    <Text style={[styles.logType, { color: t.color }]}>{t.label}</Text>
                    {log.client_name ? <Text style={styles.logClient}>· {log.client_name}</Text> : null}
                    <Text style={styles.logDetails} numberOfLines={1}>{log.details}</Text>
                  </View>
                );
              })
            )}
          </TouchableOpacity>

          {/* This week */}
          <View style={styles.sectionHeader}>
            <Ionicons name="calendar-outline" size={16} color="#6A1B9A" />
            <Text style={[styles.sectionTitle, { color: '#6A1B9A' }]}>هذا الأسبوع</Text>
          </View>
          <View style={styles.statsRow}>
            <StatBox value={weekVisits} label="زيارات"    color="#1565C0" bg="#E3F2FD" icon="car-outline" />
            <StatBox value={weekIssues} label="بلاغات"    color="#C62828" bg="#FFEBEE" icon="warning-outline" />
            <StatBox value={weekDone}   label="مهام منجزة" color="#388E3C" bg="#E8F5E9" icon="checkmark-done-outline" />
          </View>

          {/* Pending tasks preview */}
          {pendingTasks.length > 0 && (
            <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('MyTasks', { userId })}>
              <View style={styles.cardHeader}>
                <Ionicons name="time-outline" size={16} color="#E65100" />
                <Text style={[styles.cardTitle, { color: '#E65100' }]}>مهامي المعلقة</Text>
                <Text style={styles.cardMore}>عرض الكل ←</Text>
              </View>
              {pendingTasks.slice(0, 3).map(task => (
                <View key={task.id} style={styles.taskRow}>
                  <View style={[styles.taskPrioDot, {
                    backgroundColor: task.priority === 'high' ? '#C62828' : task.priority === 'low' ? '#388E3C' : '#1565C0'
                  }]} />
                  <Text style={styles.taskTitle} numberOfLines={1}>{task.title}</Text>
                  {task.due_date && (
                    <Text style={[styles.taskDue, task.due_date < today && { color: '#C62828' }]}>{task.due_date}</Text>
                  )}
                </View>
              ))}
            </TouchableOpacity>
          )}

          {/* Quick actions */}
          <View style={styles.sectionHeader}>
            <Ionicons name="flash-outline" size={16} color="#00695C" />
            <Text style={[styles.sectionTitle, { color: '#00695C' }]}>إجراء سريع</Text>
          </View>
          <View style={styles.quickRow}>
            <TouchableOpacity style={[styles.quickBtn, { backgroundColor: '#E3F2FD' }]} onPress={() => navigation.navigate('DailyLog')}>
              <Ionicons name="clipboard-outline" size={22} color="#1565C0" />
              <Text style={[styles.quickLabel, { color: '#1565C0' }]}>سجّل نشاطك</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.quickBtn, { backgroundColor: '#E8F5E9' }]} onPress={() => navigation.navigate('MyTasks', { userId })}>
              <Ionicons name="checkmark-done-outline" size={22} color="#388E3C" />
              <Text style={[styles.quickLabel, { color: '#388E3C' }]}>مهامي</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.quickBtn, { backgroundColor: '#F3E5F5' }]} onPress={() => navigation.navigate('WeeklySchedule', { userId })}>
              <Ionicons name="calendar-outline" size={22} color="#6A1B9A" />
              <Text style={[styles.quickLabel, { color: '#6A1B9A' }]}>جدولي</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: '#F5F7FA' },
  content: { padding: 14, paddingBottom: 40, gap: 12 },

  welcomeCard: {
    backgroundColor: '#1565C0', borderRadius: 18, padding: 20,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
  },
  welcomeLeft:  { flex: 1 },
  greeting:     { fontSize: 14, color: 'rgba(255,255,255,0.8)', marginBottom: 2 },
  userName:     { fontSize: 22, fontWeight: '800', color: '#fff', marginBottom: 4 },
  dateLabel:    { fontSize: 12, color: 'rgba(255,255,255,0.7)' },
  welcomeRight: { alignItems: 'flex-end' },
  notifBtn:     { position: 'relative', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 12, padding: 10 },
  notifDot:     { position: 'absolute', top: 6, left: 6, backgroundColor: '#FF5252', borderRadius: 8, minWidth: 16, height: 16, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 3 },
  notifDotText: { color: '#fff', fontSize: 9, fontWeight: '800' },

  alertBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFEBEE', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#FFCDD2' },
  alertText:   { flex: 1, fontSize: 13, fontWeight: '700', color: '#C62828' },
  warnBanner:  { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFF3E0', borderRadius: 12, padding: 12 },
  warnText:    { fontSize: 13, fontWeight: '700', color: '#E65100' },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  sectionTitle:  { fontSize: 14, fontWeight: '800', color: '#1565C0' },

  statsRow: { flexDirection: 'row', gap: 10 },
  statBox:  { flex: 1, alignItems: 'center', borderRadius: 14, padding: 14, borderWidth: 1, gap: 4 },
  statNum:  { fontSize: 24, fontWeight: '800' },
  statLabel:{ fontSize: 10, color: '#888', textAlign: 'center' },

  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 14,
    elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  cardTitle:  { flex: 1, fontSize: 14, fontWeight: '700', color: '#1a1a1a' },
  cardMore:   { fontSize: 11, color: '#1565C0', fontWeight: '600' },
  cardEmpty:  { fontSize: 13, color: '#bbb', textAlign: 'center', paddingVertical: 8 },

  logRow:    { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5, borderTopWidth: 1, borderTopColor: '#f5f5f5' },
  logDot:    { width: 8, height: 8, borderRadius: 4 },
  logType:   { fontSize: 11, fontWeight: '700', minWidth: 40 },
  logClient: { fontSize: 11, color: '#888' },
  logDetails:{ flex: 1, fontSize: 12, color: '#555' },

  taskRow:      { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#f5f5f5' },
  taskPrioDot:  { width: 8, height: 8, borderRadius: 4 },
  taskTitle:    { flex: 1, fontSize: 13, color: '#222', fontWeight: '600' },
  taskDue:      { fontSize: 11, color: '#aaa' },

  quickRow: { flexDirection: 'row', gap: 10 },
  quickBtn: { flex: 1, alignItems: 'center', borderRadius: 14, padding: 14, gap: 6 },
  quickLabel:{ fontSize: 12, fontWeight: '700', textAlign: 'center' },
});
