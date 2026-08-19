import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, Alert,
  RefreshControl, ActivityIndicator, Modal, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getMyTasks, markTaskDone, markTaskPending, deleteTask } from '../../api/internal';
import { useAuth } from '../../context/AuthContext';

export default function MyTasksScreen({ route }) {
  const { user } = useAuth();
  const userId = user?.userId != null ? String(user.userId) : String(user?.id ?? '');
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('pending'); // 'pending' | 'done' | 'all'
  const [doneModal, setDoneModal] = useState({ visible: false, task: null, notes: '' });

  const load = useCallback(async () => {
    try {
      const data = await getMyTasks(userId);
      setTasks(data);
    } catch (e) {
      Alert.alert('خطأ', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const today    = new Date().toISOString().split('T')[0];
  const tomorrow = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0]; })();
  const filtered = tasks.filter(t => filter === 'all' ? true : t.status === filter);
  const pending = tasks.filter(t => t.status === 'pending').length;
  const done = tasks.filter(t => t.status === 'done').length;
  const overdueCount  = tasks.filter(t => t.status === 'pending' && t.due_date && t.due_date < today).length;
  const dueSoonCount  = tasks.filter(t => t.status === 'pending' && t.due_date && t.due_date >= today && t.due_date <= tomorrow).length;

  const toggle = (task) => {
    if (task.status === 'pending') {
      setDoneModal({ visible: true, task, notes: '' });
    } else {
      markTaskPending(task.id).then(load).catch(e => Alert.alert('خطأ', e.message));
    }
  };

  const confirmDone = async () => {
    try {
      await markTaskDone(doneModal.task.id, doneModal.notes.trim() || null);
      setDoneModal({ visible: false, task: null, notes: '' });
      load();
    } catch (e) { Alert.alert('خطأ', e.message); }
  };

  const del = (task) => {
    Alert.alert('حذف مهمة', `حذف "${task.title}"؟`, [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'حذف', style: 'destructive', onPress: async () => { try { await deleteTask(task.id); load(); } catch (e) { Alert.alert('خطأ', e.message); } } },
    ]);
  };

  const renderItem = ({ item }) => {
    const isDone = item.status === 'done';
    return (
      <View style={[styles.card, isDone && styles.doneCard]}>
        <TouchableOpacity style={styles.checkBtn} onPress={() => toggle(item)}>
          <View style={[styles.check, isDone && styles.checked]}>
            {isDone && <Ionicons name="checkmark" size={14} color="#fff" />}
          </View>
        </TouchableOpacity>
        <View style={styles.taskBody}>
          <Text style={[styles.taskTitle, isDone && styles.doneText]}>{item.title}</Text>
          {item.description ? <Text style={styles.taskDesc} numberOfLines={2}>{item.description}</Text> : null}
          {item.completion_notes ? (
            <View style={styles.completionNoteBox}>
              <Ionicons name="chatbubble-outline" size={11} color="#388E3C" />
              <Text style={styles.completionNoteText} numberOfLines={2}>{item.completion_notes}</Text>
            </View>
          ) : null}
          <View style={styles.meta}>
            {item.due_date && (
              <View style={styles.metaChip}>
                <Ionicons name="calendar-outline" size={11} color="#888" />
                <Text style={styles.metaText}>{item.due_date}</Text>
              </View>
            )}
            {isDone && item.done_at && (
              <View style={[styles.metaChip, { backgroundColor: '#E8F5E9' }]}>
                <Ionicons name="checkmark-circle-outline" size={11} color="#388E3C" />
                <Text style={[styles.metaText, { color: '#388E3C' }]}>
                  {new Date(item.done_at).toLocaleDateString('ar-EG')}
                </Text>
              </View>
            )}
          </View>
        </View>
        <TouchableOpacity onPress={() => del(item)} style={styles.delBtn}>
          <Ionicons name="trash-outline" size={18} color="#ccc" />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.root}>
      {/* Overdue alert */}
      {overdueCount > 0 && (
        <TouchableOpacity style={styles.overdueBanner} onPress={() => setFilter('pending')} activeOpacity={0.8}>
          <Ionicons name="alert-circle" size={15} color="#C62828" />
          <Text style={styles.overdueText}>{overdueCount} مهمة متأخرة</Text>
          <Ionicons name="chevron-back" size={13} color="#C62828" />
        </TouchableOpacity>
      )}
      {/* Due soon alert */}
      {dueSoonCount > 0 && (
        <View style={styles.soonBanner}>
          <Ionicons name="time-outline" size={15} color="#E65100" />
          <Text style={styles.soonText}>{dueSoonCount} مهمة تستحق اليوم أو غداً</Text>
        </View>
      )}
      {/* Stats */}
      <View style={styles.stats}>
        <View style={styles.statBox}>
          <Text style={styles.statNum}>{pending}</Text>
          <Text style={styles.statLabel}>معلقة</Text>
        </View>
        <View style={[styles.statBox, { borderColor: '#388E3C' }]}>
          <Text style={[styles.statNum, { color: '#388E3C' }]}>{done}</Text>
          <Text style={styles.statLabel}>منجزة</Text>
        </View>
        <View style={[styles.statBox, { borderColor: '#607D8B' }]}>
          <Text style={[styles.statNum, { color: '#607D8B' }]}>{tasks.length}</Text>
          <Text style={styles.statLabel}>الكل</Text>
        </View>
      </View>

      {/* Filter tabs */}
      <View style={styles.tabs}>
        {[['pending', 'معلقة'], ['done', 'منجزة'], ['all', 'الكل']].map(([k, v]) => (
          <TouchableOpacity key={k} style={[styles.tab, filter === k && styles.activeTab]} onPress={() => setFilter(k)}>
            <Text style={[styles.tabText, filter === k && styles.activeTabText]}>{v}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Completion notes modal */}
      <Modal visible={doneModal.visible} transparent animationType="slide" onRequestClose={() => setDoneModal(s => ({ ...s, visible: false }))}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>إغلاق المهمة</Text>
            {doneModal.task && (
              <Text style={styles.sheetTaskTitle} numberOfLines={2}>{doneModal.task.title}</Text>
            )}
            <Text style={styles.sheetLabel}>ملاحظات الإنجاز (اختياري)</Text>
            <TextInput
              style={styles.sheetInput}
              multiline
              placeholder="اكتب ما تم إنجازه..."
              value={doneModal.notes}
              onChangeText={v => setDoneModal(s => ({ ...s, notes: v }))}
              autoFocus
            />
            <View style={styles.sheetBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setDoneModal(s => ({ ...s, visible: false }))}>
                <Text style={styles.cancelText}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.doneBtn} onPress={confirmDone}>
                <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
                <Text style={styles.doneBtnText}>تأكيد الإنجاز</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color="#1565C0" size="large" />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={i => i.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={['#1565C0']} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="checkmark-done-outline" size={48} color="#ccc" />
              <Text style={styles.emptyText}>لا توجد مهام</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F5F7FA' },
  overdueBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFEBEE', paddingHorizontal: 14, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#FFCDD2' },
  overdueText: { flex: 1, fontSize: 12, fontWeight: '700', color: '#C62828' },
  soonBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFF3E0', paddingHorizontal: 14, paddingVertical: 7 },
  soonText: { fontSize: 12, fontWeight: '700', color: '#E65100' },
  stats: { flexDirection: 'row', padding: 12, gap: 8 },
  statBox: {
    flex: 1, backgroundColor: '#fff', borderRadius: 10, padding: 12, alignItems: 'center',
    borderWidth: 1.5, borderColor: '#E65100',
    elevation: 1,
  },
  statNum: { fontSize: 22, fontWeight: '800', color: '#E65100' },
  statLabel: { fontSize: 11, color: '#888', marginTop: 2 },
  tabs: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#eee' },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  activeTab: { borderBottomWidth: 2, borderBottomColor: '#1565C0' },
  tabText: { fontSize: 13, color: '#888', fontWeight: '600' },
  activeTabText: { color: '#1565C0' },
  list: { padding: 12, paddingBottom: 32, gap: 8 },
  card: {
    flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#fff', borderRadius: 12, padding: 14,
    elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3,
  },
  doneCard: { opacity: 0.65 },
  checkBtn: { marginRight: 12, marginTop: 2 },
  check: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#1565C0',
    justifyContent: 'center', alignItems: 'center',
  },
  checked: { backgroundColor: '#388E3C', borderColor: '#388E3C' },
  taskBody: { flex: 1 },
  taskTitle: { fontSize: 14, fontWeight: '700', color: '#1a1a1a' },
  doneText: { textDecorationLine: 'line-through', color: '#aaa' },
  taskDesc: { fontSize: 12, color: '#777', marginTop: 3, lineHeight: 17 },
  meta: { flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#f0f0f0', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10 },
  metaText: { fontSize: 10, color: '#888' },
  delBtn: { padding: 4, marginLeft: 6 },
  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyText: { color: '#aaa', marginTop: 10, fontSize: 14 },
  completionNoteBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 4, marginTop: 4, backgroundColor: '#E8F5E9', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  completionNoteText: { fontSize: 11, color: '#388E3C', flex: 1, lineHeight: 16 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36 },
  sheetTitle: { fontSize: 16, fontWeight: '800', color: '#1a1a1a', marginBottom: 8, textAlign: 'center' },
  sheetTaskTitle: { fontSize: 13, color: '#555', textAlign: 'center', marginBottom: 14, lineHeight: 20 },
  sheetLabel: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6 },
  sheetInput: { backgroundColor: '#f5f5f5', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 16, height: 80, textAlignVertical: 'top' },
  sheetBtns: { flexDirection: 'row', gap: 10 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#ddd', alignItems: 'center' },
  cancelText: { fontSize: 14, color: '#666', fontWeight: '600' },
  doneBtn: { flex: 2, paddingVertical: 12, borderRadius: 10, backgroundColor: '#388E3C', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  doneBtnText: { fontSize: 14, color: '#fff', fontWeight: '700' },
});
