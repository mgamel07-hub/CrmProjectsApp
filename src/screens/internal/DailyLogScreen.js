import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, Alert,
  Modal, TextInput, ScrollView, ActivityIndicator, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getMyDailyLogs, createDailyLog, deleteDailyLog } from '../../api/internal';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/client';
import { extractList } from '../../utils/helpers';

const TYPES = {
  visit:   { label: 'زيارة عميل',    icon: 'car-outline',            color: '#1565C0', bg: '#E3F2FD', needsClient: true },
  issue:   { label: 'بلاغ / مشكلة',  icon: 'warning-outline',        color: '#C62828', bg: '#FFEBEE', needsClient: true },
  study:   { label: 'مذاكرة / تعلم',  icon: 'book-outline',           color: '#6A1B9A', bg: '#F3E5F5', needsClient: false },
  meeting: { label: 'اجتماع',         icon: 'people-outline',         color: '#00695C', bg: '#E0F2F1', needsClient: false },
  other:   { label: 'أخرى',           icon: 'ellipsis-horizontal-outline', color: '#607D8B', bg: '#ECEFF1', needsClient: false },
};

const todayStr = () => new Date().toISOString().split('T')[0];

function relativeTime(isoStr) {
  if (!isoStr) return '';
  const diff = Date.now() - new Date(isoStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'الآن';
  if (m < 60) return `منذ ${m} د`;
  const h = Math.floor(m / 60);
  if (h < 24) return `منذ ${h} س`;
  return new Date(isoStr).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });
}

export default function DailyLogScreen() {
  const { user } = useAuth();
  const userId = user?.userId != null ? String(user.userId) : String(user?.id ?? '');

  const [logs,       setLogs]       = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modal,      setModal]      = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [clients,    setClients]    = useState([]);

  const [form, setForm] = useState({ type: 'visit', clientName: '', details: '' });

  const load = useCallback(async () => {
    try {
      const data = await getMyDailyLogs(userId, todayStr());
      setLogs(data);
    } catch (e) { Alert.alert('خطأ', e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  // Load clients from CRM
  useEffect(() => {
    api.post('/Project/GetAll', { pageNo: 1, pageSize: 200 })
      .then(res => {
        const projects = res?.data?.data ?? [];
        const names = [...new Set(projects.map(p => p.customerName).filter(Boolean))].sort();
        setClients(names);
      }).catch(() => {});
  }, []);

  const save = async () => {
    const typeInfo = TYPES[form.type];
    if (!form.details.trim()) { Alert.alert('', 'اكتب التفاصيل'); return; }
    if (typeInfo.needsClient && !form.clientName.trim()) { Alert.alert('', 'حدد اسم العميل'); return; }
    setSaving(true);
    try {
      await createDailyLog({
        crm_user_id: userId,
        date:        todayStr(),
        type:        form.type,
        client_name: form.clientName.trim() || null,
        details:     form.details.trim(),
      });
      setModal(false);
      setForm({ type: 'visit', clientName: '', details: '' });
      load();
    } catch (e) { Alert.alert('خطأ', e.message); }
    finally { setSaving(false); }
  };

  const del = (log) => {
    Alert.alert('حذف', 'حذف هذا الإدخال؟', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'حذف', style: 'destructive', onPress: async () => {
        try { await deleteDailyLog(log.id); load(); } catch (e) { Alert.alert('خطأ', e.message); }
      }},
    ]);
  };

  const today = new Date().toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const counts = Object.keys(TYPES).reduce((acc, k) => {
    acc[k] = logs.filter(l => l.type === k).length;
    return acc;
  }, {});

  const typeInfo = TYPES[form.type];

  const renderItem = ({ item }) => {
    const t = TYPES[item.type] || TYPES.other;
    return (
      <View style={[styles.logCard, { borderRightColor: t.color, borderRightWidth: 3 }]}>
        <View style={[styles.logIconWrap, { backgroundColor: t.bg }]}>
          <Ionicons name={t.icon} size={20} color={t.color} />
        </View>
        <View style={styles.logBody}>
          <View style={styles.logTop}>
            <Text style={[styles.logType, { color: t.color }]}>{t.label}</Text>
            <Text style={styles.logTime}>{relativeTime(item.created_at)}</Text>
          </View>
          {item.client_name && (
            <View style={styles.clientRow}>
              <Ionicons name="business-outline" size={11} color="#888" />
              <Text style={styles.clientText}>{item.client_name}</Text>
            </View>
          )}
          <Text style={styles.logDetails}>{item.details}</Text>
        </View>
        <TouchableOpacity onPress={() => del(item)} style={styles.delBtn}>
          <Ionicons name="trash-outline" size={16} color="#ddd" />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.root}>
      {/* Header date */}
      <View style={styles.dateHeader}>
        <Ionicons name="calendar-outline" size={16} color="#1565C0" />
        <Text style={styles.dateText}>{today}</Text>
      </View>

      {/* Summary chips */}
      {logs.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chipRow}>
          {Object.entries(TYPES).filter(([k]) => counts[k] > 0).map(([k, t]) => (
            <View key={k} style={[styles.summaryChip, { backgroundColor: t.bg, borderColor: t.color + '44' }]}>
              <Ionicons name={t.icon} size={12} color={t.color} />
              <Text style={[styles.summaryChipCount, { color: t.color }]}>{counts[k]}</Text>
              <Text style={[styles.summaryChipLabel, { color: t.color }]}>{t.label}</Text>
            </View>
          ))}
        </ScrollView>
      )}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color="#1565C0" size="large" />
      ) : (
        <FlatList
          data={logs}
          keyExtractor={i => i.id}
          renderItem={renderItem}
          contentContainerStyle={[styles.list, logs.length === 0 && { flex: 1 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={['#1565C0']} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="clipboard-outline" size={64} color="#ddd" />
              <Text style={styles.emptyTitle}>لم تسجّل أي نشاط اليوم</Text>
              <Text style={styles.emptySubtitle}>اضغط + لتسجيل أول نشاط</Text>
            </View>
          }
        />
      )}

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => { setForm({ type: 'visit', clientName: '', details: '' }); setModal(true); }} activeOpacity={0.85}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {/* Add Log Modal */}
      <Modal visible={modal} transparent animationType="slide" onRequestClose={() => setModal(false)}>
        <View style={styles.overlay}>
          <ScrollView contentContainerStyle={styles.sheetScroll} keyboardShouldPersistTaps="handled">
            <View style={styles.sheet}>
              <Text style={styles.sheetTitle}>تسجيل نشاط</Text>

              {/* Type selector */}
              <Text style={styles.label}>نوع النشاط</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
                {Object.entries(TYPES).map(([k, t]) => (
                  <TouchableOpacity key={k}
                    style={[styles.typeBtn, form.type === k && { backgroundColor: t.color, borderColor: t.color }]}
                    onPress={() => setForm(f => ({ ...f, type: k, clientName: '' }))}>
                    <Ionicons name={t.icon} size={16} color={form.type === k ? '#fff' : t.color} />
                    <Text style={[styles.typeBtnText, form.type === k && { color: '#fff' }]}>{t.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Client selector (if needed) */}
              {typeInfo.needsClient && (
                <>
                  <Text style={[styles.label, { marginTop: 16 }]}>العميل *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="اكتب اسم العميل أو اختر..."
                    value={form.clientName}
                    onChangeText={v => setForm(f => ({ ...f, clientName: v }))}
                  />
                  {clients.length > 0 && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 4, paddingTop: 4 }}>
                      {clients
                        .filter(c => !form.clientName || c.toLowerCase().includes(form.clientName.toLowerCase()))
                        .slice(0, 12)
                        .map(c => (
                          <TouchableOpacity key={c}
                            style={[styles.clientChip, form.clientName === c && { backgroundColor: typeInfo.color, borderColor: typeInfo.color }]}
                            onPress={() => setForm(f => ({ ...f, clientName: c }))}>
                            <Text style={[styles.clientChipText, form.clientName === c && { color: '#fff' }]} numberOfLines={1}>{c}</Text>
                          </TouchableOpacity>
                        ))}
                    </ScrollView>
                  )}
                </>
              )}

              {/* Details */}
              <Text style={[styles.label, { marginTop: 12 }]}>
                {form.type === 'study'   ? 'ذاكرت إيه؟ *'
                : form.type === 'issue'  ? 'وصف البلاغ *'
                : form.type === 'visit'  ? 'ماذا تم في الزيارة؟ *'
                : form.type === 'meeting'? 'موضوع الاجتماع *'
                : 'التفاصيل *'}
              </Text>
              <TextInput
                style={[styles.input, { height: 90 }]}
                multiline
                placeholder="اكتب تفاصيل النشاط..."
                value={form.details}
                onChangeText={v => setForm(f => ({ ...f, details: v }))}
                autoFocus={!typeInfo.needsClient}
              />

              <View style={styles.sheetBtns}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setModal(false)}>
                  <Text style={styles.cancelText}>إلغاء</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.saveBtn, { backgroundColor: typeInfo.color }]} onPress={save} disabled={saving}>
                  {saving
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <><Ionicons name="checkmark-circle-outline" size={16} color="#fff" /><Text style={styles.saveText}>حفظ</Text></>}
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F5F7FA' },
  dateHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#eee' },
  dateText:   { fontSize: 14, fontWeight: '700', color: '#1565C0' },
  chipScroll: { maxHeight: 48, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#eee' },
  chipRow:    { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  summaryChip:{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, borderWidth: 1 },
  summaryChipCount: { fontSize: 14, fontWeight: '800' },
  summaryChipLabel: { fontSize: 11, fontWeight: '600' },
  list:       { padding: 12, gap: 10, paddingBottom: 80 },
  logCard:    { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#fff', borderRadius: 14, padding: 14, gap: 12, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3 },
  logIconWrap:{ width: 40, height: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  logBody:    { flex: 1 },
  logTop:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 },
  logType:    { fontSize: 12, fontWeight: '700' },
  logTime:    { fontSize: 10, color: '#bbb' },
  clientRow:  { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  clientText: { fontSize: 11, color: '#888', fontWeight: '600' },
  logDetails: { fontSize: 13, color: '#333', lineHeight: 18 },
  delBtn:     { padding: 4 },
  empty:      { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#ccc' },
  emptySubtitle:{ fontSize: 13, color: '#ddd' },
  fab: { position: 'absolute', bottom: 24, right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: '#1565C0', justifyContent: 'center', alignItems: 'center', elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 6 },
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheetScroll:{ justifyContent: 'flex-end', flexGrow: 1 },
  sheet:      { backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, paddingBottom: 36 },
  sheetTitle: { fontSize: 17, fontWeight: '800', color: '#1a1a1a', marginBottom: 16, textAlign: 'center' },
  label:      { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 8 },
  input:      { backgroundColor: '#f5f5f5', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 4, textAlignVertical: 'top' },
  typeBtn:    { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, borderWidth: 1.5, borderColor: '#e0e0e0', backgroundColor: '#f8f8f8' },
  typeBtnText:{ fontSize: 12, fontWeight: '700', color: '#555' },
  clientChip: { paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#f0f0f0', borderRadius: 10, borderWidth: 1, borderColor: '#e0e0e0' },
  clientChipText: { fontSize: 12, fontWeight: '600', color: '#444' },
  sheetBtns:  { flexDirection: 'row', gap: 10, marginTop: 16 },
  cancelBtn:  { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#ddd', alignItems: 'center' },
  cancelText: { fontSize: 14, color: '#666', fontWeight: '600' },
  saveBtn:    { flex: 2, paddingVertical: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  saveText:   { fontSize: 14, color: '#fff', fontWeight: '700' },
});
