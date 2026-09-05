import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Platform, AppState } from 'react-native';
import { getNotifications, markAsRead as apiMarkAsRead } from '../api/notifications';
import { useAuth } from './AuthContext';
import { extractData, extractList } from '../utils/helpers';
import {
  setBadgeCount,
  clearBadge,
  fireLocalNotification,
  registerForPushNotifications,
} from '../utils/notifications';

const POLL_INTERVAL = 30000; // 30 seconds

const NotificationsContext = createContext(null);

export function NotificationsProvider({ children }) {
  const { token, isDemo } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount]     = useState(0);
  const [loading, setLoading]             = useState(false);
  const prevUnreadRef  = useRef(0);
  const intervalRef    = useRef(null);
  const appStateRef    = useRef(AppState.currentState);

  const parseNotifications = (res) => {
    const data = extractData(res);
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.items)) return data.items;
    const list = extractList(res);
    return Array.isArray(list) ? list : [];
  };

  const load = useCallback(async (silent = false) => {
    if (!token || token === 'demo-token' || isDemo) return;
    try {
      if (!silent) setLoading(true);
      const res  = await getNotifications(1, 50);
      const list = parseNotifications(res);
      const newUnread = list.filter((n) => !n.isRead && !n.IsRead).length;

      setNotifications(list);
      setUnreadCount(newUnread);

      // Update app icon badge
      if (newUnread > 0) {
        setBadgeCount(newUnread);
      } else {
        clearBadge();
      }

      // Fire local notification + sound if new items arrived since last check
      if (newUnread > prevUnreadRef.current) {
        const diff = newUnread - prevUnreadRef.current;
        fireLocalNotification({
          title: 'إشعار جديد',
          body:  diff === 1
            ? 'لديك إشعار جديد في التطبيق'
            : `لديك ${diff} إشعارات جديدة`,
          data: { screen: 'Notifications' },
        });
      }
      prevUnreadRef.current = newUnread;
    } catch (_) {}
    finally { if (!silent) setLoading(false); }
  }, [token, isDemo]);

  const markAsRead = useCallback(async (id) => {
    try {
      await apiMarkAsRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id || n.Id === id) ? { ...n, isRead: true } : n)
      );
      setUnreadCount((prev) => {
        const next = Math.max(0, prev - 1);
        if (next === 0) clearBadge(); else setBadgeCount(next);
        return next;
      });
    } catch (_) {}
  }, []);

  const markAllRead = useCallback(() => {
    notifications
      .filter((n) => !n.isRead && !n.IsRead)
      .forEach((n) => markAsRead(n.id || n.Id));
    clearBadge();
    prevUnreadRef.current = 0;
  }, [notifications, markAsRead]);

  // Start/stop polling based on auth state
  useEffect(() => {
    if (!token || token === 'demo-token' || isDemo) {
      setNotifications([]);
      setUnreadCount(0);
      clearBadge();
      prevUnreadRef.current = 0;
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    // Initial load
    load();

    // Register for push notifications (native only, no-op on web)
    registerForPushNotifications();

    // Poll every 30s when app is active
    intervalRef.current = setInterval(() => {
      if (appStateRef.current === 'active') load(true);
    }, POLL_INTERVAL);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [load, token, isDemo]);

  // Pause polling when app goes to background, resume when active
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      appStateRef.current = nextState;
      if (nextState === 'active' && token && !isDemo) {
        load(true); // immediate refresh when coming back to foreground
      }
    });
    return () => sub.remove();
  }, [load, token, isDemo]);

  return (
    <NotificationsContext.Provider value={{
      notifications, unreadCount, loading, load, markAsRead, markAllRead,
    }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export const useNotifications = () => useContext(NotificationsContext);
