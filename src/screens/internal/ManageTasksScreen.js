import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, Alert,
  Modal, TextInput, RefreshControl, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getAssignedByMeTasks, createTask, deleteTask, markTaskDone, markTaskPending, createNotification } from '../../api/internal';
import { getUsers } from '../../api/projects';
import { extractList } from '../../utils/helpers';

export default function ManageTasksScreen({ route }) {
  const { userId } = route.params;
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', assignedTo: null, dueDate: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [taskData, userRes] = await Promise.all([
        getAssignedByMeTasks(userId),
        getUsers().catch(() => null),
      ]);
      setTasks(taskData);
      if (userRes) {
        const list = extractList(userRes) || [];
        setUsers(list.filter(u => String(u.id || u.userId) !== String(userId)));
      }
    } catch (e) {
      Alert.alert('خطأ', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const openModal = () => {
    setForm({ title: '', description: '', assignedTo: null, dueDate: '' });
    setModal(true);
  };

  const save = async () => {
    if (!form.title.trim()) { Alert.alert('', 'أدخل عنوان المهمة'); return; }
    if (!form.assignedTo) { Alert.alert('', 'اختر موظفاً'); return; }
    setSaving(true);
    try {
      await createTask({
        title: form.title.trim(),
        description: form.description.trim() || null,
        assigned_by: String(userId),
        assigned_to: String(form.assignedTo.id || form.assignedTo.userId),
        due_date: form.dueDate || null,
      });
      // Notify assignee
      await createNotification({
        to_user_id: String(form.assignedTo.id || form.assignedTo.userId),
        type: 'task_assigned',
        message: `تم إسناد مهمة لك: ${form.title}`,
        ref_type: 'task',
      }).catch(() => {});
      setModal(false);
      load();
    } catch (e) {
      Alert.alert('خطأ', e.message);
    } finally {
      setSaving(false);
    }
  };

  const del = (task) => {
    Alert.alert('حذف', `حذف "${task.title}"؟`, [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'حذف', style: 'destructive', onPress: async () => { try { await deleteTask(task.id); load(); } catch (e) { Alert.alert('خطأ', e.message); } } },
    ]);
  };

  const getUserName = (uid) => {
    const u = users.find(u => String(u.id || u.userId) === String(uid));
    return u?.fullName || u?.name || uid;
  };

  const renderItem = ({ item }) => {
    const isDone = item.status === 'done';
    return (
      <View style={styles.card}>
        <View style={[styles.statusDot, { backgroundColor: isDone ? '#388E3C' : '#E65100' }]} />
        <View style={styles.taskBody}>
          <Text style={styles.taskTitle}>{item.title}</Text>
          <View style={styles.metaRow}>
            <Ionicons name="person-outline" size={11} color="#888" />
            <Text style={styles.metaText}>{getUserName(item.assigned_to)}</Text>
            {item.due_date && <>
              <Ionicons name="calendar-outline" size={11} color="#888" />
              <Text style={styles.metaText}>{item.due_date}</Text>
            </>}
          </View>
          <View style={[styles.statusBadge, { backgroundColor: isDone ? '#E8F5E9' : '#FFF3E0' }]}>
            <Text style={{ fontSize: 11, color: isDone ? '#388E3C' : '#E65100', fontWeight: '600' }}>
              {isDone ? 'منجزة' : 'معلقة'}
            </Text>
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
      <TouchableOpacity style={styles.addBtn} onPress={openModal}>
        <Ionicons name="add-circle-outline" size={18} color="#fff" />
        <Text style={styles.addText}>إسناد مهمة جديدة</Text>
      </TouchableOpacity>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color="#1565C0" size="large" />
      ) : (
        <FlatList
          data={tasks}
          keyExtractor={i => i.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={['#1565C0']} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={48} color="#ccc" />
              <Text style={styles.emptyText}>لم تسند مهام بعد</Text>
            </View>
          }
        />
      )}

      {/* Create task modal */}
      <Modal visible={modal} transparent animationType="slide" onRequestClose={() => setModal(false)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>إسناد مهمة</Text>

            <Text style={styles.label}>العنوان *</Text>
            <TextInput style={styles.input} placeholder="عنوان المهمة..." value={form.title} onChangeText={v => setForm(f => ({ ...f, title: v }))} />

            <Text style={styles.label}>التفاصيل</Text>
            <TextInput style={[styles.input, { height: 60 }]} multiline placeholder="تفاصيل اختيارية..." value={form.description} onChangeText={v => setForm(f => ({ ...f, description: v }))} />

            <Text style={styles.label}>تاريخ الاستحقاق (اختياري)</Text>
            <TextInput style={styles.input} placeholder="YYYY-MM-DD" value={form.dueDate} onChangeText={v => setForm(f => ({ ...f, dueDate: v }))} />

            <Text style={styles.label}>إسناد إلى *</Text>
            <View style={styles.userList}>
              {users.map(u => {
                const uid = u.id || u.userId;
                const selected = form.assignedTo && (form.assignedTo.id || form.assignedTo.userId) === uid;
                return (
                  <TouchableOpacity key={uid} style={[styles.userChip, selected && styles.userChipSelected]} onPress={() => setForm(f => ({ ...f, assignedTo: u }))}>
                    <Text style={[styles.userChipText, selected && { color: '#fff' }]}>{u.fullName || u.name || uid}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.sheetBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModal(false)}>
                <Text style={styles.cancelText}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveText}>إسناد</Text>}
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
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, margin: 12, backgroundColor: '#6A1B9A', borderRadius: 10, padding: 14, justifyContent: 'center' },
  addText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  list: { padding: 12, paddingBottom: 32, gap: 8 },
  card: {
    flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#fff', borderRadius: 12, padding: 14,
    elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3,
  },
  statusDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4, marginRight: 10 },
  taskBody: { flex: 1 },
  taskTitle: { fontSize: 14, fontWeight: '700', color: '#1a1a1a' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4, flexWrap: 'wrap' },
  metaText: { fontSize: 11, color: '#888' },
  statusBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginTop: 6 },
  delBtn: { padding: 4, marginLeft: 6 },
  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyText: { color: '#aaa', marginTop: 10, fontSize: 14 },
  // Modal
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36, maxHeight: '90%' },
  sheetTitle: { fontSize: 16, fontWeight: '800', color: '#1a1a1a', marginBottom: 16, textAlign: 'center' },
  label: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6 },
  input: { backgroundColor: '#f5f5f5', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 14 },
  userList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  userChip: { paddingHorizontal: 12, paddingVertical: 7, backgroundColor: '#f0f0f0', borderRadius: 20, borderWidth: 1, borderColor: '#e0e0e0' },
  userChipSelected: { backgroundColor: '#6A1B9A', borderColor: '#6A1B9A' },
  userChipText: { fontSize: 12, fontWeight: '600', color: '#444' },
  sheetBtns: { flexDirection: 'row', gap: 10, marginTop: 6 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#ddd', alignItems: 'center' },
  cancelText: { fontSize: 14, color: '#666', fontWeight: '600' },
  saveBtn: { flex: 2, paddingVertical: 12, borderRadius: 10, backgroundColor: '#6A1B9A', alignItems: 'center', justifyContent: 'center' },
  saveText: { fontSize: 14, color: '#fff', fontWeight: '700' },
});
