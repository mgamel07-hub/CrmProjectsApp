import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity, Modal,
  StyleSheet, Alert, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../api/supabase';
import { getCustomers } from '../api/projects';
import { extractList } from '../utils/helpers';

const SYSTEMS = [
  { value: 'onyx',      label: 'أونكس' },
  { value: 'mutakamil', label: 'متكامل' },
  { value: 'ix',        label: 'IX' },
];

const HISTORY_KEY = 'crm_cloud_search_history';
const BLUE = '#1565C0';

// ─── Customer searchable picker ───────────────────────────────────────────────
function CustomerPicker({ customers, value, onChange }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const selected = customers.find(c => String(c.id) === String(value));
  const filtered = q.trim()
    ? customers.filter(c =>
        (c.name || '').toLowerCase().includes(q.toLowerCase()) ||
        (c.code || '').toLowerCase().includes(q.toLowerCase())
      ).slice(0, 40)
    : customers.slice(0, 40);

  return (
    <View>
      <TouchableOpacity
        style={styles.pickerBtn}
        onPress={() => { setOpen(true); setQ(''); }}
        activeOpacity={0.8}
      >
        <Text style={[styles.pickerBtnText, !selected && { color: '#aaa' }]}>
          {selected ? `${selected.name}${selected.code ? ` (${selected.code})` : ''}` : 'اختر العميل...'}
        </Text>
        <Ionicons name="chevron-down" size={16} color="#888" />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={() => setOpen(false)}>
          <View style={styles.pickerModal}>
            <TextInput
              style={styles.pickerSearch}
              placeholder="ابحث بالاسم أو الكود..."
              value={q}
              onChangeText={setQ}
              autoFocus
              textAlign="right"
            />
            <ScrollView style={{ maxHeight: 300 }} keyboardShouldPersistTaps="handled">
              <TouchableOpacity
                style={styles.pickerItem}
                onPress={() => { onChange(null, null); setOpen(false); }}
              >
                <Text style={{ color: '#888' }}>— بدون عميل —</Text>
              </TouchableOpacity>
              {filtered.map(c => (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.pickerItem, String(c.id) === String(value) && styles.pickerItemActive]}
                  onPress={() => { onChange(c.id, c.name); setOpen(false); }}
                >
                  <Text style={[styles.pickerItemText, String(c.id) === String(value) && { color: BLUE, fontWeight: '700' }]}>
                    {c.name}{c.code ? ` (${c.code})` : ''}
                  </Text>
                </TouchableOpacity>
              ))}
              {filtered.length === 0 && (
                <Text style={styles.pickerEmpty}>لا توجد نتائج</Text>
              )}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function ClientCloudAccessScreen() {
  const [rows, setRows]           = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [query, setQuery]         = useState('');
  const [history, setHistory]     = useState([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [showPwd, setShowPwd]     = useState({});
  const [modalOpen, setModalOpen] = useState(false);
  const [editRow, setEditRow]     = useState(null);
  const [pwdModalOpen, setPwdModalOpen] = useState(false);
  const [pwdRow, setPwdRow]       = useState(null);
  const [newPwd, setNewPwd]       = useState('');
  const [saving, setSaving]       = useState(false);

  // form state
  const [form, setForm] = useState({
    customer_id: null, customer_name: '', system_name: 'onyx',
    username: '', password: '', executor_name: '', notes: '',
  });

  const loadHistory = async () => {
    try {
      const h = await AsyncStorage.getItem(HISTORY_KEY);
      setHistory(h ? JSON.parse(h) : []);
    } catch {}
  };

  const commitSearch = async (q) => {
    if (!q.trim()) return;
    const next = [q, ...history.filter(h => h !== q)].slice(0, 10);
    setHistory(next);
    try { await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch {}
  };

  const clearHistory = async () => {
    setHistory([]);
    try { await AsyncStorage.removeItem(HISTORY_KEY); } catch {}
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('client_cloud_access')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setRows(data || []);
    } catch (e) {
      Alert.alert('خطأ', 'تعذر تحميل البيانات: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCustomers = useCallback(async () => {
    try {
      const res = await getCustomers();
      const list = extractList(res) || [];
      setCustomers(list);
    } catch {}
  }, []);

  useEffect(() => {
    load();
    loadCustomers();
    loadHistory();
  }, []);

  const filtered = rows.filter(r => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      (r.username || '').toLowerCase().includes(q) ||
      (r.customer_name || '').toLowerCase().includes(q) ||
      (r.executor_name || '').toLowerCase().includes(q) ||
      (r.system_name || '').toLowerCase().includes(q)
    );
  });

  const openAdd = () => {
    setEditRow(null);
    setForm({ customer_id: null, customer_name: '', system_name: 'onyx', username: '', password: '', executor_name: '', notes: '' });
    setModalOpen(true);
  };

  const openEdit = (row) => {
    setEditRow(row);
    setForm({
      customer_id: row.customer_id,
      customer_name: row.customer_name || '',
      system_name: row.system_name || 'onyx',
      username: row.username || '',
      password: row.password || '',
      executor_name: row.executor_name || '',
      notes: row.notes || '',
    });
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.username.trim()) return Alert.alert('تنبيه', 'اسم المستخدم مطلوب');
    if (!form.password.trim()) return Alert.alert('تنبيه', 'كلمة المرور مطلوبة');
    setSaving(true);
    try {
      const payload = {
        customer_id: form.customer_id,
        customer_name: form.customer_name,
        system_name: form.system_name,
        username: form.username.trim(),
        password: form.password,
        executor_name: form.executor_name.trim() || null,
        notes: form.notes.trim() || null,
        updated_at: new Date().toISOString(),
      };
      if (editRow) {
        const { error } = await supabase.from('client_cloud_access').update(payload).eq('id', editRow.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('client_cloud_access').insert(payload);
        if (error) throw error;
      }
      setModalOpen(false);
      await commitSearch(form.username);
      load();
    } catch (e) {
      Alert.alert('خطأ', e.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteRow = (row) => {
    Alert.alert('حذف', `هل تريد حذف "${row.username}"؟`, [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'حذف', style: 'destructive', onPress: async () => {
          await supabase.from('client_cloud_access').delete().eq('id', row.id);
          load();
        }
      },
    ]);
  };

  const savePwd = async () => {
    if (!newPwd.trim()) return Alert.alert('تنبيه', 'أدخل كلمة المرور الجديدة');
    setSaving(true);
    try {
      const { error } = await supabase
        .from('client_cloud_access')
        .update({ password: newPwd, updated_at: new Date().toISOString() })
        .eq('id', pwdRow.id);
      if (error) throw error;
      setPwdModalOpen(false);
      setNewPwd('');
      load();
    } catch (e) {
      Alert.alert('خطأ', e.message);
    } finally {
      setSaving(false);
    }
  };

  const systemLabel = (v) => SYSTEMS.find(s => s.value === v)?.label || v;

  const renderRow = ({ item }) => (
    <View style={styles.rowCard}>
      <View style={styles.rowHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowUsername}>{item.username}</Text>
          {item.customer_name ? <Text style={styles.rowCustomer}>{item.customer_name}</Text> : null}
        </View>
        <View style={styles.rowBadge}>
          <Text style={styles.rowBadgeText}>{systemLabel(item.system_name)}</Text>
        </View>
      </View>

      <View style={styles.rowPwdRow}>
        <Text style={styles.rowPwdLabel}>كلمة المرور: </Text>
        <Text style={styles.rowPwd}>
          {showPwd[item.id] ? (item.password || '—') : '••••••••'}
        </Text>
        <TouchableOpacity onPress={() => setShowPwd(p => ({ ...p, [item.id]: !p[item.id] }))} style={styles.eyeBtn}>
          <Ionicons name={showPwd[item.id] ? 'eye-off-outline' : 'eye-outline'} size={18} color="#666" />
        </TouchableOpacity>
      </View>

      {item.executor_name ? (
        <Text style={styles.rowMeta}>منفذ العميل: {item.executor_name}</Text>
      ) : null}
      {item.notes ? <Text style={styles.rowNotes}>{item.notes}</Text> : null}

      <View style={styles.rowActions}>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => { setPwdRow(item); setNewPwd(''); setPwdModalOpen(true); }}
        >
          <Ionicons name="key-outline" size={15} color={BLUE} />
          <Text style={styles.actionBtnText}>تغيير الباسورد</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={() => openEdit(item)}>
          <Ionicons name="create-outline" size={15} color="#555" />
          <Text style={[styles.actionBtnText, { color: '#555' }]}>تعديل</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={() => deleteRow(item)}>
          <Ionicons name="trash-outline" size={15} color="#D32F2F" />
          <Text style={[styles.actionBtnText, { color: '#D32F2F' }]}>حذف</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.root}>
      {/* Search bar */}
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={18} color="#888" />
          <TextInput
            style={styles.searchInput}
            placeholder="ابحث بالاسم أو العميل أو النظام..."
            value={query}
            onChangeText={setQuery}
            onFocus={() => setHistoryOpen(true)}
            onBlur={() => setTimeout(() => setHistoryOpen(false), 150)}
            onSubmitEditing={() => commitSearch(query)}
            textAlign="right"
            returnKeyType="search"
          />
          {query ? (
            <TouchableOpacity onPress={() => setQuery('')}>
              <Ionicons name="close-circle" size={18} color="#bbb" />
            </TouchableOpacity>
          ) : null}
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={openAdd}>
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Search history dropdown */}
      {historyOpen && history.length > 0 && (
        <View style={styles.historyBox}>
          <View style={styles.historyHeader}>
            <Text style={styles.historyTitle}>سجل البحث</Text>
            <TouchableOpacity onPress={clearHistory}>
              <Text style={styles.historyClear}>مسح الكل</Text>
            </TouchableOpacity>
          </View>
          {history.map((h, i) => (
            <TouchableOpacity key={i} style={styles.historyItem} onPress={() => { setQuery(h); setHistoryOpen(false); }}>
              <Ionicons name="time-outline" size={14} color="#aaa" />
              <Text style={styles.historyText}>{h}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {loading ? (
        <ActivityIndicator size="large" color={BLUE} style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          renderItem={renderRow}
          contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="cloud-outline" size={48} color="#ccc" />
              <Text style={styles.emptyText}>لا توجد بيانات</Text>
            </View>
          }
        />
      )}

      {/* Add/Edit modal */}
      <Modal visible={modalOpen} animationType="slide" transparent onRequestClose={() => setModalOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalBox}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{editRow ? 'تعديل' : 'إضافة'} وصول كلاود</Text>
                <TouchableOpacity onPress={() => setModalOpen(false)}>
                  <Ionicons name="close" size={22} color="#555" />
                </TouchableOpacity>
              </View>

              <ScrollView style={{ maxHeight: 480 }} keyboardShouldPersistTaps="handled">
                <Text style={styles.label}>العميل</Text>
                <CustomerPicker
                  customers={customers}
                  value={form.customer_id}
                  onChange={(id, name) => setForm(f => ({ ...f, customer_id: id, customer_name: name || '' }))}
                />

                <Text style={styles.label}>النظام</Text>
                <View style={styles.systemRow}>
                  {SYSTEMS.map(s => (
                    <TouchableOpacity
                      key={s.value}
                      style={[styles.systemBtn, form.system_name === s.value && styles.systemBtnActive]}
                      onPress={() => setForm(f => ({ ...f, system_name: s.value }))}
                    >
                      <Text style={[styles.systemBtnText, form.system_name === s.value && { color: '#fff' }]}>
                        {s.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.label}>اسم المستخدم *</Text>
                <TextInput
                  style={styles.input}
                  value={form.username}
                  onChangeText={v => setForm(f => ({ ...f, username: v }))}
                  placeholder="اسم المستخدم"
                  textAlign="right"
                  autoCapitalize="none"
                />

                <Text style={styles.label}>كلمة المرور *</Text>
                <TextInput
                  style={styles.input}
                  value={form.password}
                  onChangeText={v => setForm(f => ({ ...f, password: v }))}
                  placeholder="كلمة المرور"
                  textAlign="right"
                  autoCapitalize="none"
                />

                <Text style={styles.label}>منفذ العميل</Text>
                <TextInput
                  style={styles.input}
                  value={form.executor_name}
                  onChangeText={v => setForm(f => ({ ...f, executor_name: v }))}
                  placeholder="اسم المنفذ"
                  textAlign="right"
                />

                <Text style={styles.label}>ملاحظات</Text>
                <TextInput
                  style={[styles.input, { height: 70, textAlignVertical: 'top' }]}
                  value={form.notes}
                  onChangeText={v => setForm(f => ({ ...f, notes: v }))}
                  placeholder="ملاحظات..."
                  textAlign="right"
                  multiline
                />
              </ScrollView>

              <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>حفظ</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Change password modal */}
      <Modal visible={pwdModalOpen} animationType="fade" transparent onRequestClose={() => setPwdModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { maxHeight: 260 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>تغيير كلمة المرور</Text>
              <TouchableOpacity onPress={() => setPwdModalOpen(false)}>
                <Ionicons name="close" size={22} color="#555" />
              </TouchableOpacity>
            </View>
            <Text style={{ color: '#666', marginBottom: 12, textAlign: 'right' }}>
              {pwdRow?.username}
            </Text>
            <TextInput
              style={styles.input}
              value={newPwd}
              onChangeText={setNewPwd}
              placeholder="كلمة المرور الجديدة"
              textAlign="right"
              autoFocus
              autoCapitalize="none"
            />
            <TouchableOpacity style={[styles.saveBtn, { marginTop: 16 }]} onPress={savePwd} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>حفظ</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F5F7FA' },

  searchRow: { flexDirection: 'row', padding: 12, gap: 8, alignItems: 'center' },
  searchBox: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 12, height: 42,
    elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3,
  },
  searchInput: { flex: 1, fontSize: 14, color: '#222' },
  addBtn: { backgroundColor: BLUE, width: 42, height: 42, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },

  historyBox: {
    marginHorizontal: 12, backgroundColor: '#fff', borderRadius: 10,
    elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 6,
    zIndex: 100, position: 'absolute', top: 62, left: 12, right: 64,
  },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8 },
  historyTitle: { fontSize: 12, color: '#888', fontWeight: '600' },
  historyClear: { fontSize: 12, color: '#D32F2F' },
  historyItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#F5F5F5' },
  historyText: { fontSize: 14, color: '#444' },

  rowCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10,
    elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3,
  },
  rowHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  rowUsername: { fontSize: 16, fontWeight: '700', color: '#222', textAlign: 'right' },
  rowCustomer: { fontSize: 13, color: '#666', marginTop: 2, textAlign: 'right' },
  rowBadge: { backgroundColor: BLUE + '18', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginLeft: 8 },
  rowBadgeText: { fontSize: 12, color: BLUE, fontWeight: '700' },
  rowPwdRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  rowPwdLabel: { fontSize: 13, color: '#888' },
  rowPwd: { fontSize: 13, color: '#222', flex: 1 },
  eyeBtn: { padding: 4 },
  rowMeta: { fontSize: 12, color: '#888', marginBottom: 2, textAlign: 'right' },
  rowNotes: { fontSize: 12, color: '#aaa', marginTop: 4, textAlign: 'right' },
  rowActions: { flexDirection: 'row', gap: 12, marginTop: 10, borderTopWidth: 1, borderTopColor: '#F5F5F5', paddingTop: 10 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionBtnText: { fontSize: 13, color: BLUE, fontWeight: '500' },

  empty: { alignItems: 'center', paddingTop: 80 },
  emptyText: { color: '#bbb', fontSize: 15, marginTop: 12 },

  // Picker
  pickerBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#F8F8F8', borderWidth: 1, borderColor: '#E0E0E0',
    borderRadius: 8, paddingHorizontal: 12, height: 44,
  },
  pickerBtnText: { fontSize: 14, color: '#222', flex: 1, textAlign: 'right' },
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 },
  pickerModal: {
    backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden',
    elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.15, shadowRadius: 10,
  },
  pickerSearch: {
    padding: 12, fontSize: 14, borderBottomWidth: 1, borderBottomColor: '#EEE', textAlign: 'right',
  },
  pickerItem: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  pickerItemActive: { backgroundColor: BLUE + '10' },
  pickerItemText: { fontSize: 14, color: '#333', textAlign: 'right' },
  pickerEmpty: { textAlign: 'center', color: '#aaa', padding: 16 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalBox: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 32,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#222' },

  label: { fontSize: 13, color: '#666', marginBottom: 6, marginTop: 12, textAlign: 'right', fontWeight: '600' },
  input: {
    backgroundColor: '#F8F8F8', borderWidth: 1, borderColor: '#E0E0E0',
    borderRadius: 8, paddingHorizontal: 12, height: 44, fontSize: 14, color: '#222',
  },
  systemRow: { flexDirection: 'row', gap: 8 },
  systemBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#E0E0E0', alignItems: 'center' },
  systemBtnActive: { backgroundColor: BLUE, borderColor: BLUE },
  systemBtnText: { fontSize: 14, fontWeight: '600', color: '#555' },

  saveBtn: { backgroundColor: BLUE, borderRadius: 10, height: 48, justifyContent: 'center', alignItems: 'center', marginTop: 8 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
