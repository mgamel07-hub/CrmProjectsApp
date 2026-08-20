import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useLang } from '../../context/LangContext';
import { getMyTasks, getUnreadCount, getMyTeamRecord } from '../../api/internal';
import { useInternalNotif } from '../../context/InternalNotifContext';
import { getUsers } from '../../api/projects';
import { extractList } from '../../utils/helpers';

export default function TeamHomeScreen({ navigation }) {
  const { user } = useAuth();
  const { lang } = useLang();
  const [pendingTasks, setPendingTasks] = useState(0);
  const [unread, setUnread] = useState(0);
  const [allUsers, setAllUsers] = useState([]);
  const [myRole,   setMyRole]   = useState('employee'); // 'admin'|'manager'|'employee'
  const { unreadInt } = useInternalNotif() || {};

  const userId = user?.userId != null ? String(user.userId) : String(user?.id ?? '');
  const totalUnread = (unread || 0) + (unreadInt || 0);

  useEffect(() => {
    if (!userId) return;
    getMyTasks(userId).then(tasks => setPendingTasks(tasks.filter(t => t.status === 'pending').length)).catch(() => {});
    getUnreadCount(userId).then(setUnread).catch(() => {});
    getUsers().then(res => setAllUsers(extractList(res) || [])).catch(() => {});
    getMyTeamRecord(userId).then(rec => { if (rec?.role) setMyRole(rec.role); }).catch(() => {});
  }, [userId]);

  const allCards = [
    {
      title: 'داشبورد إنجازاتي',
      subtitle: 'ملخص نشاطك ومهامك وأدائك',
      icon: 'stats-chart-outline',
      color: '#1565C0',
      roles: ['admin', 'manager', 'employee'],
      onPress: () => navigation.navigate('MyDashboard'),
    },
    {
      title: 'نشاطي اليومي',
      subtitle: 'سجّل زياراتك وبلاغاتك ومذاكرتك',
      icon: 'clipboard-outline',
      color: '#00695C',
      roles: ['admin', 'manager', 'employee'],
      onPress: () => navigation.navigate('DailyLog'),
    },
    {
      title: 'مهامي',
      subtitle: pendingTasks > 0 ? `${pendingTasks} مهمة معلقة` : 'لا توجد مهام معلقة',
      icon: 'checkmark-done-outline',
      color: pendingTasks > 0 ? '#E65100' : '#388E3C',
      badge: pendingTasks > 0 ? pendingTasks : null,
      roles: ['admin', 'manager', 'employee'],
      onPress: () => navigation.navigate('MyTasks', { userId }),
    },
    {
      title: 'متابعة المهام',
      subtitle: 'إسناد ومتابعة مهام الفريق',
      icon: 'people-outline',
      color: '#6A1B9A',
      roles: ['admin', 'manager'],
      onPress: () => navigation.navigate('ManageTasks', { userId, allUsers }),
    },
    {
      title: 'جدولي الأسبوعي',
      subtitle: 'خطط أسبوعك وسجّل جدول الزيارات',
      icon: 'calendar-outline',
      color: '#0288D1',
      roles: ['admin', 'manager', 'employee'],
      onPress: () => navigation.navigate('WeeklySchedule', { userId }),
    },
    {
      title: 'جدول الفريق',
      subtitle: myRole === 'employee' ? 'جدولك الأسبوعي' : 'جدول الفريق للأسبوع',
      icon: 'grid-outline',
      color: '#00838F',
      roles: ['admin', 'manager', 'employee'],
      onPress: () => navigation.navigate('TeamSchedule', { userId, allUsers }),
    },
    {
      title: 'سجل النشاط',
      subtitle: myRole === 'employee' ? 'نشاطك المنجز' : 'مهام منجزة • زيارات • جداول الفريق',
      icon: 'pulse-outline',
      color: '#5E35B1',
      roles: ['admin', 'manager', 'employee'],
      onPress: () => navigation.navigate('ActivityFeed'),
    },
    {
      title: 'إعداد الفريق',
      subtitle: 'أسماء الأعضاء • الأدوار • الصلاحيات',
      icon: 'settings-outline',
      color: '#37474F',
      roles: ['admin', 'manager'],
      onPress: () => navigation.navigate('TeamSetup'),
    },
  ];

  const cards = allCards.filter(c => c.roles.includes(myRole));

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.greeting}>
        <Text style={styles.greetingText}>أهلاً، {user?.fullName || 'مستخدم'}</Text>
        {totalUnread > 0 && (
          <TouchableOpacity style={styles.notifBadge} onPress={() => navigation.navigate('InternalNotifications', { userId })}>
            <Ionicons name="notifications" size={18} color="#fff" />
            <Text style={styles.notifCount}>{totalUnread}</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.grid}>
        {cards.map((card, i) => (
          <TouchableOpacity key={i} style={[styles.card, { borderTopColor: card.color }]} onPress={card.onPress} activeOpacity={0.8}>
            <View style={[styles.iconWrap, { backgroundColor: card.color + '18' }]}>
              <Ionicons name={card.icon} size={26} color={card.color} />
            </View>
            {card.badge != null && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{card.badge}</Text>
              </View>
            )}
            <Text style={styles.cardTitle}>{card.title}</Text>
            <Text style={styles.cardSub}>{card.subtitle}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F5F7FA' },
  content: { padding: 16, paddingBottom: 40 },
  greeting: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  greetingText: { fontSize: 18, fontWeight: '800', color: '#1a1a1a' },
  notifBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#D32F2F', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, gap: 4 },
  notifCount: { color: '#fff', fontSize: 13, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: {
    width: '47%', backgroundColor: '#fff', borderRadius: 14, padding: 16,
    borderTopWidth: 3, position: 'relative',
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4,
  },
  iconWrap: { width: 48, height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  badge: {
    position: 'absolute', top: 10, left: 10,
    backgroundColor: '#D32F2F', borderRadius: 10,
    minWidth: 20, height: 20, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#1a1a1a', marginBottom: 4 },
  cardSub: { fontSize: 12, color: '#888', lineHeight: 16 },
});
