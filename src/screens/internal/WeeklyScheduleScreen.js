import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal,
  TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getWeekSchedule, upsertScheduleEntry, deleteScheduleEntry } from '../../api/internal';

const DAYS_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const TYPE_COLORS = { visit: '#1565C0', office: '#388E3C', vacation: '#E65100' };
const TYPE_LABELS = { visit: 'زيارة عميل', office: 'مكتب', vacation: 'إجازة' };

function getWeekDates(offset = 0) {
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const sunday = new Date(now);
  sunday.setDate(now.getDate() - day + offset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    return d;
  });
}

function fmt(date) {
  return date.toISOString().split('T')[0];
}

export default function WeeklyScheduleScreen({ route }) {
  const { userId } = route.params;
  const [weekOffset, setWeekOffset] = useState(0);
  const [days, setDays] = useState([]);
  const [entries, setEntries] = useState({});
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // { date, entry? }
  const [form, setForm] = useState({ type: 'office', client_name: '', vacation_type: 'عارضة', notes: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const week = getWeekDates(weekOffset);
    setDays(week);
    try {
      const data = await getWeekSchedule(userId, fmt(week[0]), fmt(week[6]));
      const map = {};
      data.forEach(e => { map[e.date] = e; });
      setEntries(map);
    } catch (e) {
      Alert.alert('خطأ', e.message);
    } finally {
      setLoading(false);
    }
  }, [userId, weekOffset]);

  useEffect(() => { load(); }, [load]);

  const openModal = (date, entry) => {
    setModal({ date: fmt(date), entry });
    setForm(entry
      ? { type: entry.type, client_name: entry.client_name || '', vacation_type: entry.vacation_type || 'عارضة', notes: entry.notes || '' }
      : { type: 'office', client_name: '', vacation_type: 'عارضة', notes: '' }
    );
  };

  const save = async () => {
    setSaving(true);
    try {
      await upsertScheduleEntry({
        ...(modal.entry ? { id: modal.entry.id } : {}),
        crm_user_id: userId,
        date: modal.date,
        type: form.type,
        client_name: form.type === 'visit' ? form.client_name : null,
        vacation_type: form.type === 'vacation' ? form.vacation_type : null,
        notes: form.notes || null,
      });
      setModal(null);
      load();
    } catch (e) {
      Alert.alert('خطأ', e.message);
    } finally {
      setSaving(false);
    }
  };

  const del = async (entry) => {
    Alert.alert('حذف', 'حذف هذا اليوم من الجدول؟', [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'حذف', style: 'destructive', onPress: async () => {
          try { await deleteScheduleEntry(entry.id); load(); } catch (e) { Alert.alert('خطأ', e.message); }
        }
      },
    ]);
  };

  const weekLabel = () => {
    if (!days.length) return '';
    const s = days[0].toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });
    const e = days[6].toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });
    return `${s} – ${e}`;
  };

  return (
    <View style={styles.root}>
      {/* Week nav */}
      <View style={styles.nav}>
        <TouchableOpacity onPress={() => setWeekOffset(w => w - 1)} style={styles.navBtn}>
          <Ionicons name="chevron-back" size={22} color="#1565C0" />
        </TouchableOpacity>
        <Text style={styles.navLabel}>{weekLabel()}</Text>
        <TouchableOpacity onPress={() => setWeekOffset(w => w + 1)} style={styles.navBtn}>
          <Ionicons name="chevron-forward" size={22} color="#1565C0" />
        </TouchableOpacity>
      </View>
      <TouchableOpacity onPress={() => setWeekOffset(0)} style={styles.todayBtn}>
        <Text style={styles.todayText}>الأسبوع الحالي</Text>
      </TouchableOpacity>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color="#1565C0" size="large" />
      ) : (
        <ScrollView contentContainerStyle={styles.grid}>
          {days.map((day, i) => {
            const dateStr = fmt(day);
            const entry = entries[dateStr];
            const isToday = dateStr === fmt(new Date());
            return (
              <TouchableOpacity key={i} style={[styles.dayCard, isToday && styles.todayCard]} onPress={() => openModal(day, entry)} activeOpacity={0.8}>
                <View style={styles.dayHeader}>
                  <Text style={[styles.dayName, isToday && styles.todayDayName]}>{DAYS_AR[day.getDay()]}</Text>
                  <Text style={[styles.dayNum, isToday && styles.todayDayNum]}>{day.getDate()}</Text>
                </View>
                {entry ? (
                  <View style={styles.entryWrap}>
                    <View style={[styles.typePill, { backgroundColor: TYPE_COLORS[entry.type] }]}>
                      <Text style={styles.typeText}>{TYPE_LABELS[entry.type]}</Text>
                    </View>
                    {entry.client_name ? <Text style={styles.clientName} numberOfLines={1}>{entry.client_name}</Text> : null}
                    {entry.vacation_type ? <Text style={styles.vacType}>{entry.vacation_type}</Text> : null}
                    <TouchableOpacity style={styles.delBtn} onPress={() => del(entry)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="trash-outline" size={14} color="#aaa" />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.emptyDay}>
                    <Ionicons name="add-circle-outline" size={22} color="#ccc" />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* Modal */}
      <Modal visible={!!modal} transparent animationType="slide" onRequestClose={() => setModal(null)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{modal?.date}</Text>

            <Text style={styles.label}>نوع اليوم</Text>
            <View style={styles.typeBtns}>
              {Object.entries(TYPE_LABELS).map(([k, v]) => (
                <TouchableOpacity key={k} style={[styles.typeBtn, form.type === k && { backgroundColor: TYPE_COLORS[k] }]} onPress={() => setForm(f => ({ ...f, type: k }))}>
                  <Text style={[styles.typeBtnText, form.type === k && { color: '#fff' }]}>{v}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {form.type === 'visit' && (
              <>
                <Text style={styles.label}>اسم العميل</Text>
                <TextInput style={styles.input} placeholder="اسم العميل..." value={form.client_name} onChangeText={v => setForm(f => ({ ...f, client_name: v }))} />
              </>
            )}

            {form.type === 'vacation' && (
              <>
                <Text style={styles.label}>نوع الإجازة</Text>
                <View style={styles.typeBtns}>
                  {['عارضة', 'اعتيادية'].map(v => (
                    <TouchableOpacity key={v} style={[styles.typeBtn, form.vacation_type === v && { backgroundColor: '#E65100' }]} onPress={() => setForm(f => ({ ...f, vacation_type: v }))}>
                      <Text style={[styles.typeBtnText, form.vacation_type === v && { color: '#fff' }]}>{v}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {form.type === 'office' && (
              <>
                <Text style={styles.label}>ملاحظات (اختياري)</Text>
                <TextInput style={[styles.input, { height: 60 }]} multiline placeholder="أي تفاصيل..." value={form.notes} onChangeText={v => setForm(f => ({ ...f, notes: v }))} />
              </>
            )}

            <View style={styles.sheetBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModal(null)}>
                <Text style={styles.cancelText}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveText}>حفظ</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F5F7FA' },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#eee' },
  navBtn: { padding: 4 },
  navLabel: { fontSize: 15, fontWeight: '700', color: '#1a1a1a' },
  todayBtn: { alignSelf: 'center', paddingVertical: 4, paddingHorizontal: 12, marginVertical: 6, backgroundColor: '#E8EEF8', borderRadius: 20 },
  todayText: { fontSize: 12, color: '#1565C0', fontWeight: '600' },
  grid: { padding: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dayCard: {
    width: '30%', backgroundColor: '#fff', borderRadius: 12, padding: 10, minHeight: 110,
    elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3,
  },
  todayCard: { borderWidth: 2, borderColor: '#1565C0' },
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  dayName: { fontSize: 11, color: '#888', fontWeight: '600' },
  todayDayName: { color: '#1565C0' },
  dayNum: { fontSize: 18, fontWeight: '800', color: '#333' },
  todayDayNum: { color: '#1565C0' },
  entryWrap: { flex: 1, position: 'relative' },
  typePill: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start', marginBottom: 4 },
  typeText: { fontSize: 10, color: '#fff', fontWeight: '700' },
  clientName: { fontSize: 11, color: '#444', marginTop: 2 },
  vacType: { fontSize: 11, color: '#E65100', marginTop: 2 },
  delBtn: { position: 'absolute', bottom: 0, left: 0 },
  emptyDay: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  // Modal
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36 },
  sheetTitle: { fontSize: 16, fontWeight: '800', color: '#1a1a1a', marginBottom: 16, textAlign: 'center' },
  label: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6 },
  typeBtns: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  typeBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: '#f0f0f0', alignItems: 'center' },
  typeBtnText: { fontSize: 12, fontWeight: '600', color: '#555' },
  input: { backgroundColor: '#f5f5f5', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 14 },
  sheetBtns: { flexDirection: 'row', gap: 10, marginTop: 6 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#ddd', alignItems: 'center' },
  cancelText: { fontSize: 14, color: '#666', fontWeight: '600' },
  saveBtn: { flex: 2, paddingVertical: 12, borderRadius: 10, backgroundColor: '#1565C0', alignItems: 'center', justifyContent: 'center' },
  saveText: { fontSize: 14, color: '#fff', fontWeight: '700' },
});
