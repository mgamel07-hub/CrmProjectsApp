import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const NOTIFIED_KEY = 'notified_plan_items';

// expo-notifications is not available on web
if (Platform.OS !== 'web') {
  const N = require('expo-notifications');
  N.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

async function requestPermission() {
  if (Platform.OS === 'web') return false;
  const N = require('expo-notifications');
  const { status } = await N.requestPermissionsAsync();
  return status === 'granted';
}

export async function scheduleItemReminders(planItems = [], planTitle = '') {
  if (Platform.OS === 'web') return 0;

  const granted = await requestPermission();
  if (!granted) return 0;

  const N = require('expo-notifications');
  const raw = await AsyncStorage.getItem(NOTIFIED_KEY).catch(() => null);
  const notified = raw ? JSON.parse(raw) : {};

  const now = new Date();
  const scheduled = [];

  for (const item of planItems) {
    if (!item.scheduledDate) continue;
    const itemId = String(item.id ?? item.key ?? '');
    if (!itemId || notified[itemId]) continue;

    const itemDate = new Date(item.scheduledDate);
    const fireDate = new Date(itemDate);
    if (itemDate.getHours() === 0 && itemDate.getMinutes() === 0) {
      fireDate.setHours(8, 0, 0, 0);
    } else {
      fireDate.setHours(fireDate.getHours() - 1);
    }

    if (fireDate <= now) continue;
    const diffDays = Math.ceil((itemDate - now) / (1000 * 60 * 60 * 24));
    if (diffDays > 7) continue;

    try {
      await N.scheduleNotificationAsync({
        content: {
          title: `تذكير: ${planTitle || 'بند مجدول'}`,
          body: `${item.name || item.title || 'بند'} — مجدول ${diffDays === 1 ? 'غداً' : 'اليوم'}`,
          data: { itemId },
        },
        trigger: { type: 'date', date: fireDate },
      });
      notified[itemId] = true;
      scheduled.push(item.name || itemId);
    } catch (_) { }
  }

  if (scheduled.length > 0) {
    await AsyncStorage.setItem(NOTIFIED_KEY, JSON.stringify(notified)).catch(() => {});
  }
  return scheduled.length;
}
