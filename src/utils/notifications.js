import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

const NOTIFIED_KEY = 'notified_plan_items';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function requestNotificationPermission() {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function scheduleItemReminders(planItems = [], planTitle = '') {
  const granted = await requestNotificationPermission();
  if (!granted) return;

  const raw = await AsyncStorage.getItem(NOTIFIED_KEY).catch(() => null);
  const notified = raw ? JSON.parse(raw) : {};

  const now = new Date();
  const scheduled = [];

  for (const item of planItems) {
    if (!item.scheduledDate) continue;
    const itemId = String(item.id ?? item.key ?? '');
    if (!itemId || notified[itemId]) continue;

    const itemDate = new Date(item.scheduledDate);
    // Remind 1 hour before, or at 08:00 if date-only
    const fireDate = new Date(itemDate);
    if (itemDate.getHours() === 0 && itemDate.getMinutes() === 0) {
      fireDate.setHours(8, 0, 0, 0);
    } else {
      fireDate.setHours(fireDate.getHours() - 1);
    }

    if (fireDate <= now) continue; // already past

    const diffDays = Math.ceil((itemDate - now) / (1000 * 60 * 60 * 24));
    if (diffDays > 7) continue; // only schedule within 7 days

    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `تذكير: ${planTitle || 'بند مجدول'}`,
          body: `${item.name || item.title || 'بند'} — مجدول ${diffDays === 1 ? 'غداً' : 'اليوم'}`,
          data: { itemId },
        },
        trigger: { type: 'date', date: fireDate },
      });
      notified[itemId] = true;
      scheduled.push(item.name || itemId);
    } catch (_) { /* ignore individual failures */ }
  }

  if (scheduled.length > 0) {
    await AsyncStorage.setItem(NOTIFIED_KEY, JSON.stringify(notified)).catch(() => {});
  }

  return scheduled.length;
}
