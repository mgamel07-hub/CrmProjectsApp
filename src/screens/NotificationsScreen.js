import React, { useEffect } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNotifications } from '../context/NotificationsContext';
import { useLang } from '../context/LangContext';
import { formatDate } from '../utils/helpers';

function NotifItem({ item, onPress }) {
  const isRead = item.isRead || item.IsRead;
  const title   = item.title   || item.Title   || item.subject  || '';
  const message = item.message || item.Message || item.body     || item.description || '';
  const date    = item.createdAt || item.CreatedAt || item.date || '';
  const type    = item.type    || item.Type    || 'info';

  const iconMap = {
    project: 'folder-outline',
    plan:    'document-text-outline',
    scope:   'layers-outline',
    stage:   'checkmark-circle-outline',
    approval:'shield-checkmark-outline',
    info:    'information-circle-outline',
  };
  const colorMap = {
    project: '#1565C0',
    plan:    '#F57C00',
    scope:   '#388E3C',
    stage:   '#9C27B0',
    approval:'#D32F2F',
    info:    '#607D8B',
  };
  const key   = Object.keys(iconMap).find((k) => type?.toLowerCase().includes(k)) || 'info';
  const icon  = iconMap[key];
  const color = colorMap[key];

  return (
    <TouchableOpacity
      style={[styles.item, !isRead && styles.itemUnread]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.iconWrap, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <View style={styles.itemBody}>
        <View style={styles.itemHeader}>
          <Text style={[styles.itemTitle, !isRead && styles.itemTitleBold]} numberOfLines={1}>
            {title || message}
          </Text>
          {!isRead && <View style={styles.dot} />}
        </View>
        {message && title ? (
          <Text style={styles.itemMessage} numberOfLines={2}>{message}</Text>
        ) : null}
        {date ? <Text style={styles.itemDate}>{formatDate(date)}</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

export default function NotificationsScreen() {
  const { notifications, unreadCount, loading, load, markAsRead, markAllRead } = useNotifications();
  const { lang } = useLang();

  useEffect(() => { load(); }, []);

  return (
    <View style={styles.root}>
      {/* Header actions */}
      {unreadCount > 0 && (
        <TouchableOpacity style={styles.markAllBtn} onPress={markAllRead}>
          <Ionicons name="checkmark-done-outline" size={16} color="#1565C0" />
          <Text style={styles.markAllText}>
            {lang === 'ar' ? 'تعليم الكل كمقروء' : 'Mark all as read'}
          </Text>
        </TouchableOpacity>
      )}

      <FlatList
        data={notifications}
        keyExtractor={(item, i) => String(item.id || item.Id || i)}
        renderItem={({ item }) => (
          <NotifItem
            item={item}
            onPress={() => markAsRead(item.id || item.Id)}
          />
        )}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={load} colors={['#1565C0']} />
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Ionicons name="notifications-off-outline" size={52} color="#ccc" />
              <Text style={styles.emptyText}>
                {lang === 'ar' ? 'لا توجد إشعارات' : 'No notifications'}
              </Text>
            </View>
          ) : (
            <View style={styles.empty}>
              <ActivityIndicator color="#1565C0" />
            </View>
          )
        }
        contentContainerStyle={notifications.length === 0 ? styles.emptyContainer : styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F5F7FA' },
  markAllBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#EEE',
    backgroundColor: '#fff',
  },
  markAllText: { fontSize: 13, color: '#1565C0', fontWeight: '600' },
  list: { paddingVertical: 8 },
  emptyContainer: { flex: 1 },
  item: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: '#fff', marginHorizontal: 12, marginVertical: 4,
    borderRadius: 12, padding: 14,
    elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 3,
  },
  itemUnread: { backgroundColor: '#EEF4FF', borderLeftWidth: 3, borderLeftColor: '#1565C0' },
  iconWrap: { width: 40, height: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  itemBody: { flex: 1 },
  itemHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 },
  itemTitle: { fontSize: 14, color: '#333', flex: 1 },
  itemTitleBold: { fontWeight: '700', color: '#111' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#1565C0', marginLeft: 6 },
  itemMessage: { fontSize: 12, color: '#666', lineHeight: 18 },
  itemDate: { fontSize: 11, color: '#aaa', marginTop: 5 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 100 },
  emptyText: { color: '#aaa', marginTop: 12, fontSize: 15 },
});
