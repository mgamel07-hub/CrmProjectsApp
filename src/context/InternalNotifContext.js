/**
 * InternalNotifContext — real-time internal notifications via Supabase
 * + in-app banner + vibration alert
 * Sound note: expo-av is NOT installed → uses Vibration as fallback.
 * For real sound: install expo-av + rebuild APK.
 */
import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, Vibration, AppState,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../api/supabase';
import { useAuth } from './AuthContext';

const InternalNotifContext = createContext(null);

// ── Banner component ──────────────────────────────────────────────────────────

const NOTIF_ICONS = {
  task_assigned: { icon: 'person-add-outline',     color: '#6A1B9A', bg: '#F3E5F5' },
  task_done:     { icon: 'checkmark-circle-outline', color: '#388E3C', bg: '#E8F5E9' },
  approval:      { icon: 'shield-checkmark-outline', color: '#E65100', bg: '#FFF3E0' },
  visit:         { icon: 'car-outline',              color: '#1565C0', bg: '#E3F2FD' },
  project:       { icon: 'folder-open-outline',      color: '#0288D1', bg: '#E1F5FE' },
  general:       { icon: 'notifications-outline',    color: '#607D8B', bg: '#ECEFF1' },
};

function getIconMeta(type) {
  for (const k of Object.keys(NOTIF_ICONS)) {
    if ((type || '').includes(k)) return NOTIF_ICONS[k];
  }
  return NOTIF_ICONS.general;
}

function NotifBanner({ notif, onDismiss }) {
  const anim = useRef(new Animated.Value(-100)).current;
  const meta = getIconMeta(notif?.type);

  useEffect(() => {
    Animated.spring(anim, { toValue: 0, useNativeDriver: true, bounciness: 6 }).start();
    const timer = setTimeout(() => {
      Animated.timing(anim, { toValue: -120, duration: 250, useNativeDriver: true }).start(onDismiss);
    }, 4500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <Animated.View style={[styles.banner, { transform: [{ translateY: anim }] }]}>
      <View style={[styles.bannerIcon, { backgroundColor: meta.bg }]}>
        <Ionicons name={meta.icon} size={20} color={meta.color} />
      </View>
      <View style={styles.bannerBody}>
        <Text style={styles.bannerTitle} numberOfLines={1}>{notif?.message || 'إشعار جديد'}</Text>
        <Text style={styles.bannerTime}>الآن</Text>
      </View>
      <TouchableOpacity onPress={onDismiss} style={styles.bannerClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Ionicons name="close" size={18} color="#aaa" />
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function InternalNotifProvider({ children }) {
  const { user } = useAuth();
  const userId = user?.userId != null ? String(user.userId) : String(user?.id ?? '');

  const [banner,    setBanner]    = useState(null); // current visible notif
  const [unreadInt, setUnreadInt] = useState(0);
  const channelRef                = useRef(null);
  const appState                  = useRef(AppState.currentState);

  const dismiss = useCallback(() => setBanner(null), []);

  const onNewNotif = useCallback((payload) => {
    const notif = payload.new || payload;
    setBanner(notif);
    // Vibrate as sound substitute
    Vibration.vibrate([0, 200, 100, 200]);
    setUnreadInt(prev => prev + 1);
  }, []);

  const loadUnread = useCallback(async () => {
    if (!userId) return;
    try {
      const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('to_user_id', userId)
        .eq('is_read', false);
      setUnreadInt(count || 0);
    } catch (_) {}
  }, [userId]);

  // Subscribe to real-time notifications for this user
  useEffect(() => {
    if (!userId) return;
    loadUnread();

    // Clean up any existing channel
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channel = supabase
      .channel(`internal-notifs-${userId}`)
      .on('postgres_changes', {
        event:  'INSERT',
        schema: 'public',
        table:  'notifications',
        filter: `to_user_id=eq.${userId}`,
      }, onNewNotif)
      .subscribe();

    channelRef.current = channel;
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [userId, onNewNotif, loadUnread]);

  // Also poll the CRM API notifications for project-related events
  // (handled by existing NotificationsContext)

  // Re-check on foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', next => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        loadUnread();
      }
      appState.current = next;
    });
    return () => sub.remove();
  }, [loadUnread]);

  const clearBadge = useCallback(() => setUnreadInt(0), []);

  return (
    <InternalNotifContext.Provider value={{ unreadInt, clearBadge }}>
      {children}
      {banner && <NotifBanner notif={banner} onDismiss={dismiss} />}
    </InternalNotifContext.Provider>
  );
}

export const useInternalNotif = () => useContext(InternalNotifContext);

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  banner: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 9999,
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', margin: 12, marginTop: 44,
    borderRadius: 16, padding: 14, gap: 12,
    elevation: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 12,
    borderLeftWidth: 4, borderLeftColor: '#1565C0',
  },
  bannerIcon:  { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  bannerBody:  { flex: 1 },
  bannerTitle: { fontSize: 13, fontWeight: '700', color: '#1a1a1a' },
  bannerTime:  { fontSize: 10, color: '#bbb', marginTop: 2 },
  bannerClose: { padding: 2 },
});
