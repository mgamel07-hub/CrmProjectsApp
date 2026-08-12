import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNotifications } from '../context/NotificationsContext';

export default function NotificationBell({ navigation, color = '#fff' }) {
  const { unreadCount } = useNotifications();

  return (
    <TouchableOpacity
      style={styles.wrap}
      onPress={() => navigation.navigate('Notifications')}
      activeOpacity={0.7}
    >
      <Ionicons name={unreadCount > 0 ? 'notifications' : 'notifications-outline'} size={24} color={color} />
      {unreadCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: { marginRight: 16, position: 'relative' },
  badge: {
    position: 'absolute', top: -4, right: -6,
    backgroundColor: '#D32F2F', borderRadius: 8,
    minWidth: 16, height: 16, justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
});
