import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

const NOTIFIED_KEY  = 'notified_plan_items';
const PUSH_TOKEN_KEY = 'expo_push_token';
const PROJECT_ID     = 'b7f82206-bc3a-4086-982e-0173cfe8735f';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge:  true,
  }),
});

export async function requestPermission() {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function setBadgeCount(count) {
  try { await Notifications.setBadgeCountAsync(Math.max(0, count)); } catch (_) {}
}

export async function clearBadge() {
  try { await Notifications.setBadgeCountAsync(0); } catch (_) {}
}

export async function fireLocalNotification({ title, body, data = {} }) {
  const granted = await requestPermission();
  if (!granted) return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, data, sound: true },
      trigger: null,
    });
  } catch (_) {}
}

export async function registerForPushNotifications() {
  const granted = await requestPermission();
  if (!granted) return null;
  try {
    const cached = await AsyncStorage.getItem(PUSH_TOKEN_KEY).catch(() => null);
    if (cached) return cached;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: PROJECT_ID });
    if (token) await AsyncStorage.setItem(PUSH_TOKEN_KEY, token).catch(() => {});
    return token;
  } catch (_) {
    return null;
  }
}

export async function scheduleItemReminders(planItems = [], planTitle = '') {
  const granted = await requestPermission();
  if (!granted) return 0;

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
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `تذكير: ${planTitle || 'بند مجدول'}`,
          body:  `${item.name || item.title || 'بند'} — مجدول ${diffDays === 1 ? 'غداً' : 'اليوم'}`,
          data:  { itemId },
          sound: true,
        },
        trigger: { type: 'date', date: fireDate },
      });
      notified[itemId] = true;
      scheduled.push(item.name || itemId);
    } catch (_) {}
  }

  if (scheduled.length > 0) {
    await AsyncStorage.setItem(NOTIFIED_KEY, JSON.stringify(notified)).catch(() => {});
  }
  return scheduled.length;
}
