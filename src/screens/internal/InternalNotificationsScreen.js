import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, RefreshControl, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getMyNotifications, markNotificationRead, markAllNotificationsRead } from '../../api/internal';

const TYPE_ICONS = {
  task_assigned: 'clipboard-outline',
  task_done: 'checkmark-circle-outline',
  schedule: 'calendar-outline',
};

export default function InternalNotificationsScreen({ route }) {
  const { userId } = route.params;
  const [notifs, setNotifs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await getMyNotifications(userId);
      setNotifs(data);
    } catch (e) {
      Alert.alert('خطأ', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const markRead = async (id) => {
    await markNotificationRead(id).catch(() => {});
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  };

  const markAll = async () => {
    await markAllNotificationsRead(userId).catch(() => {});
    setNotifs(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={[styles.card, !item.is_read && styles.unreadCard]}
      onPress={() => markRead(item.id)}
      activeOpacity={0.8}
    >
      <View style={[styles.iconWrap, { backgroundColor: item.is_read ? '#f0f0f0' : '#E8EEF8' }]}>
        <Ionicons name={TYPE_ICONS[item.type] || 'notifications-outline'} size={20} color={item.is_read ? '#aaa' : '#1565C0'} />
      </View>
      <View style={styles.body}>
        <Text style={[styles.message, !item.is_read && styles.unreadMsg]}>{item.message}</Text>
        <Text style={styles.time}>
          {new Date(item.created_at).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
      {!item.is_read && <View style={styles.dot} />}
    </TouchableOpacity>
  );

  const unreadCount = notifs.filter(n => !n.is_read).length;

  return (
    <View style={styles.root}>
      {unreadCount > 0 && (
        <TouchableOpacity style={styles.markAllBtn} onPress={markAll}>
          <Ionicons name="checkmark-done" size={16} color="#1565C0" />
          <Text style={styles.markAllText}>تعليم الكل كمقروء ({unreadCount})</Text>
        </TouchableOpacity>
      )}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color="#1565C0" size="large" />
      ) : (
        <FlatList
          data={notifs}
          keyExtractor={i => i.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={['#1565C0']} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="notifications-off-outline" size={48} color="#ccc" />
              <Text style={styles.emptyText}>لا توجد إشعارات</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F5F7FA' },
  markAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#eee' },
  markAllText: { fontSize: 13, color: '#1565C0', fontWeight: '600' },
  list: { padding: 12, paddingBottom: 32, gap: 8 },
  card: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 14,
    elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3,
  },
  unreadCard: { borderRightWidth: 3, borderRightColor: '#1565C0' },
  iconWrap: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  body: { flex: 1 },
  message: { fontSize: 13, color: '#888', lineHeight: 18 },
  unreadMsg: { color: '#1a1a1a', fontWeight: '600' },
  time: { fontSize: 11, color: '#bbb', marginTop: 3 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#1565C0', marginLeft: 8 },
  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyText: { color: '#aaa', marginTop: 10, fontSize: 14 },
});
