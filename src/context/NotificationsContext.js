import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getNotifications, markAsRead as apiMarkAsRead } from '../api/notifications';
import { useAuth } from './AuthContext';
import { extractData, extractList } from '../utils/helpers';

const NotificationsContext = createContext(null);

export function NotificationsProvider({ children }) {
  const { token, isDemo } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount]     = useState(0);
  const [loading, setLoading]             = useState(false);

  const parseNotifications = (res) => {
    const data = extractData(res);
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

  // Reset on logout
  useEffect(() => {
    if (!token || token === 'demo-token' || isDemo) {
      setNotifications([]);
      setUnreadCount(0);
    }
  }, [token, isDemo]);

  return (
    <NotificationsContext.Provider value={{
      notifications, unreadCount, loading, load, markAsRead, markAllRead,
    }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export const useNotifications = () => useContext(NotificationsContext);
