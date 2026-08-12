import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { AppState } from 'react-native';
import { getNotifications, pingNotifications, markAsRead as apiMarkAsRead } from '../api/notifications';
import { useAuth } from './AuthContext';
import { extractData, extractList } from '../utils/helpers';

const NotificationsContext = createContext(null);

const POLL_INTERVAL = 30000; // 30 seconds

export function NotificationsProvider({ children }) {
  const { token, isDemo } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount]     = useState(0);
  const [loading, setLoading]             = useState(false);
  const intervalRef = useRef(null);
  const appState    = useRef(AppState.currentState);

  const parseNotifications = (res) => {
    const data = extractData(res);
    // might be array directly or { items, totalItems }
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.items)) return data.items;
    const list = extractList(res);
    return Array.isArray(list) ? list : [];
  };

  const load = useCallback(async () => {
    if (!token || token === 'demo-token' || isDemo) return;
    try {
      setLoading(true);
      const res = await getNotifications(1, 30);
      const list = parseNotifications(res);
      setNotifications(list);
      setUnreadCount(list.filter((n) => !n.isRead && !n.IsRead).length);
    } catch (_) {}
    finally { setLoading(false); }
  }, [token, isDemo]);

  const ping = useCallback(async () => {
    if (!token || token === 'demo-token' || isDemo) return;
    try {
      const res = await pingNotifications();
      const count =
        res?.data?.data?.unreadCount ??
        res?.data?.data?.count ??
        res?.data?.unreadCount ??
        res?.data?.count ??
        null;
      if (count !== null && count !== unreadCount) {
        setUnreadCount(count);
        if (count > unreadCount) load(); // new notifications arrived → reload list
      }
    } catch (_) {}
  }, [token, isDemo, unreadCount, load]);

  const markAsRead = useCallback(async (id) => {
    try {
      await apiMarkAsRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id || n.Id === id) ? { ...n, isRead: true } : n)
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (_) {}
  }, []);

  const markAllRead = useCallback(() => {
    notifications
      .filter((n) => !n.isRead && !n.IsRead)
      .forEach((n) => markAsRead(n.id || n.Id));
  }, [notifications, markAsRead]);

  // Load on login
  useEffect(() => {
    if (token && token !== 'demo-token' && !isDemo) {
      load();
    } else {
      setNotifications([]);
      setUnreadCount(0);
    }
  }, [token, isDemo]);

  // Poll every 30s while app is active
  useEffect(() => {
    if (!token || token === 'demo-token' || isDemo) return;
    intervalRef.current = setInterval(ping, POLL_INTERVAL);
    return () => clearInterval(intervalRef.current);
  }, [ping, token, isDemo]);

  // Reload when app comes back to foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        ping();
      }
      appState.current = next;
    });
    return () => sub.remove();
  }, [ping]);

  return (
    <NotificationsContext.Provider value={{
      notifications, unreadCount, loading, load, markAsRead, markAllRead,
    }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export const useNotifications = () => useContext(NotificationsContext);
