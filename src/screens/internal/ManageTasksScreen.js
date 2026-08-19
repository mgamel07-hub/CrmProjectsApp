import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, Alert,
  Modal, TextInput, RefreshControl, ActivityIndicator, ScrollView, Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import {
  getTeamTasks, createTask, deleteTask, markTaskDone, markTaskPending,
  createNotification, getTeamMembers, getMyTeamRecord,
} from '../../api/internal';
import { useAuth } from '../../context/AuthContext';

function memberToUser(m) {
  return { key: String(m.crm_user_id), value: m.display_name || String(m.crm_user_id) };
}

const ROLE_LABELS = {
  admin:    { label: 'مدير إدارة', color: '#6A1B9A', bg: '#F3E5F5' },
  manager:  { label: 'مدير فريق',  color: '#E65100', bg: '#FFF3E0' },
  employee: { label: 'موظف',       color: '#1565C0', bg: '#E3F2FD' },
};

export default function ManageTasksScreen({ route, navigation }) {
  const { user } = useAuth();
  const userId = user?.userId != null ? String(user.userId) : String(user?.id ?? '');

  // All team members (for display names)
  const [allMembers, setAllMembers] = useState([]);
  // Members the current user can assign to (role-filtered, excludes self)
  const [assignableUsers, setAssignableUsers] = useState([]);
  const [myRecord, setMyRecord] = useState(null);

  // Task list
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'pending' | 'done'
  const [assigneeFilter, setAssigneeFilter] = useState(null); // crm_user_id string or null

  // New task modal
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', assignedTo: null, dueDate: null });
  const [saving, setSaving] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Completion notes modal
  const [doneModal, setDoneModal] = useState({ visible: false, task: null, notes: '' });

  const load = useCallback(async () => {
    try {
      const members = await getTeamMembers();
      setAllMembers(members);

      const myRec = userId ? await getMyTeamRecord(userId) : null;
      const nameMatch = !myRec && user?.fullName
        ? members.find(m => m.display_name === user.fullName) || null
        : null;
      const resolvedRec = myRec || nameMatch;
      setMyRecord(resolvedRec);

      const role = resolvedRec?.role || 'admin';
      const selfId = resolvedRec?.crm_user_id ? String(resolvedRec.crm_user_id) : userId;

      let visible = [];
      if (role === 'admin') {
        visible = members;
      } else if (role === 'manager' && resolvedRec?.team_id) {
        visible = members.filter(m => m.team_id === resolvedRec.team_id);
      } else {
        // employee: show all anyway for task visibility (manager can see them)
        visible = members;
      }

      setAssignableUsers(visible.filter(m => String(m.crm_user_id) !== selfId).map(memberToUser));

      // Fetch all tasks for visible members
      const memberIds = visible.map(m => String(m.crm_user_id));
      const allIds = selfId && !memberIds.includes(selfId) ? [selfId, ...memberIds] : memberIds;
      const taskData = allIds.length ? await getTeamTasks(allIds) : [];
      setTasks(taskData);
    } catch (e) {
      Alert.alert('خطأ', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId, user?.fullName]);

  useEffect(() => { load(); }, [load]);

  // Build name lookup
  const nameOf = (id) => {
    if (!id) return '—';
    const m = allMembers.find(m => String(m.crm_user_id) === String(id));
    return m ? (m.display_name || String(id)) : String(id);
  };

  // Filtered tasks
  const filtered = tasks.filter(t => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    if (assigneeFilter && String(t.assigned_to) !== assigneeFilter) return false;
    return true;
  });

  const pendingCount = tasks.filter(t => t.status === 'pending').length;
  const doneCount = tasks.filter(t => t.status === 'done').length;

  const toggle = (task) => {
    if (task.status === 'pending') {
      // Show notes modal before marking done
      setDoneModal({ visible: true, task, notes: '' });
    } else {
      // Reopen: no notes needed
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
    Alert.alert('حذف', `حذف "${task.title}"؟`, [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'حذف', style: 'destructive', onPress: async () => {
        try { await deleteTask(task.id); load(); } catch (e) { Alert.alert('خطأ', e.message); }
      }},
    ]);
  };

  const openModal = () => {
    setForm({ title: '', description: '', assignedTo: null, dueDate: null });
    setModal(true);
  };

  const save = async () => {
    if (!form.title.trim()) { Alert.alert('', 'أدخل عنوان المهمة'); return; }
    if (!form.description.trim()) { Alert.alert('', 'الملاحظات إجبارية — أدخل تفاصيل المهمة'); return; }
    if (!form.assignedTo) { Alert.alert('', 'اختر موظفاً'); return; }
    setSaving(true);
    try {
      const dueDateStr = form.dueDate ? form.dueDate.toISOString().split('T')[0] : null;
      await createTask({
        title: form.title.trim(),
        description: form.description.trim() || null,
        assigned_by: userId,
        assigned_to: form.assignedTo.key,
        due_date: dueDateStr,
      });
      await createNotification({
        to_user_id: form.assignedTo.key,
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

  const dueDateLabel = form.dueDate
    ? form.dueDate.toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' })
    : 'اختر تاريخ...';

  const roleInfo = myRecord ? ROLE_LABELS[myRecord.role] : ROLE_LABELS['admin'];
  const teamName = myRecord?.teams?.name;

  const renderItem = ({ item }) => {
    const isDone = item.status === 'done';
    const isOverdue = !isDone && item.due_date && item.due_date < new Date().toISOString().split('T')[0];
    return (
      <View style={styles.card}>
        <TouchableOpacity style={styles.checkBtn} onPress={() => toggle(item)}>
          <View style={[styles.check, isDone && styles.checked]}>
            {isDone && <Ionicons name="checkmark" size={14} color="#fff" />}
          </View>
        </TouchableOpacity>
        <View style={styles.taskBody}>
          <Text style={[styles.taskTitle, isDone && styles.doneTitle]} numberOfLines={2}>{item.title}</Text>
          {item.description ? (
            <Text style={styles.taskDesc} numberOfLines={1}>{item.description}</Text>
          ) : null}
          <View style={styles.metaRow}>
            <View style={styles.metaChip}>
              <Ionicons name="person-outline" size={10} color="#888" />
              <Text style={styles.metaText}>{nameOf(item.assigned_to)}</Text>
            </View>
            {item.due_date && (
              <View style={[styles.metaChip, isOverdue && { backgroundColor: '#FFEBEE' }]}>
                <Ionicons name="calendar-outline" size={10} color={isOverdue ? '#C62828' : '#888'} />
                <Text style={[styles.metaText, isOverdue && { color: '#C62828' }]}>{item.due_date}</Text>
              </View>
            )}
            <View style={[styles.statusBadge, isDone ? styles.badgeDone : styles.badgePending]}>
              <Text style={[styles.badgeText, { color: isDone ? '#388E3C' : '#E65100' }]}>
                {isDone ? 'منجزة' : 'معلقة'}
              </Text>
            </View>
          </View>
        </View>
        <TouchableOpacity onPress={() => del(item)} style={styles.delBtn}>
          <Ionicons name="trash-outline" size={17} color="#ddd" />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.root}>
      {/* Role banner */}
      {roleInfo && (
        <View style={[styles.roleBanner, { backgroundColor: roleInfo.bg }]}>
          <Ionicons name="shield-checkmark-outline" size={14} color={roleInfo.color} />
          <Text style={[styles.roleBannerText, { color: roleInfo.color }]}>
            {roleInfo.label}
            {myRecord?.role === 'manager' && teamName ? ` — ${teamName}` : ''}
            {!myRecord || myRecord.role === 'admin' ? ' — جميع الأعضاء' : myRecord.role === 'manager' ? ' — فريقك' : ''}
          </Text>
        </View>
      )}

      {/* Stats */}
      <View style={styles.stats}>
        <View style={styles.statBox}>
          <Text style={styles.statNum}>{tasks.length}</Text>
          <Text style={styles.statLabel}>الكل</Text>
        </View>
        <View style={[styles.statBox, { borderColor: '#E65100' }]}>
          <Text style={[styles.statNum, { color: '#E65100' }]}>{pendingCount}</Text>
          <Text style={styles.statLabel}>معلقة</Text>
        </View>
        <View style={[styles.statBox, { borderColor: '#388E3C' }]}>
          <Text style={[styles.statNum, { color: '#388E3C' }]}>{doneCount}</Text>
          <Text style={styles.statLabel}>منجزة</Text>
        </View>
        <TouchableOpacity style={[styles.statBox, styles.assignBox]} onPress={openModal}>
          <Ionicons name="add-circle-outline" size={20} color="#6A1B9A" />
          <Text style={[styles.statLabel, { color: '#6A1B9A', fontWeight: '700' }]}>إسناد</Text>
        </TouchableOpacity>
      </View>

      {/* Status filter tabs */}
      <View style={styles.tabs}>
        {[['all', 'الكل'], ['pending', 'معلقة'], ['done', 'منجزة']].map(([k, v]) => (
          <TouchableOpacity key={k} style={[styles.tab, statusFilter === k && styles.activeTab]} onPress={() => setStatusFilter(k)}>
            <Text style={[styles.tabText, statusFilter === k && styles.activeTabText]}>{v}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Assignee filter chips */}
      {allMembers.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chipRow}>
          <TouchableOpacity
            style={[styles.chip, !assigneeFilter && styles.chipActive]}
            onPress={() => setAssigneeFilter(null)}
          >
            <Text style={[styles.chipText, !assigneeFilter && styles.chipActiveText]}>الجميع</Text>
          </TouchableOpacity>
          {allMembers.map(m => {
            const id = String(m.crm_user_id);
            const active = assigneeFilter === id;
            return (
              <TouchableOpacity
                key={id}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setAssigneeFilter(active ? null : id)}
              >
                <Text style={[styles.chipText, active && styles.chipActiveText]} numberOfLines={1}>
                  {m.display_name || id}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

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
              <Ionicons name="checkmark-done-circle-outline" size={52} color="#ddd" />
              <Text style={styles.emptyText}>
                {tasks.length === 0 ? 'لا توجد مهام للفريق بعد' : 'لا توجد مهام بهذا الفلتر'}
              </Text>
            </View>
          }
        />
      )}

      {/* Completion notes modal */}
      <Modal visible={doneModal.visible} transparent animationType="slide" onRequestClose={() => setDoneModal(s => ({ ...s, visible: false }))}>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { paddingBottom: 30 }]}>
            <Text style={styles.sheetTitle}>إغلاق المهمة</Text>
            {doneModal.task && (
              <Text style={{ fontSize: 13, color: '#555', marginBottom: 12, textAlign: 'center' }} numberOfLines={2}>
                {doneModal.task.title}
              </Text>
            )}
            <Text style={styles.label}>ملاحظات الإنجاز (اختياري)</Text>
            <TextInput
              style={[styles.input, { height: 80 }]}
              multiline
              placeholder="اكتب ملاحظات عن ما تم إنجازه..."
              value={doneModal.notes}
              onChangeText={v => setDoneModal(s => ({ ...s, notes: v }))}
              autoFocus
            />
            <View style={styles.sheetBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setDoneModal(s => ({ ...s, visible: false }))}>
                <Text style={styles.cancelText}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, { backgroundColor: '#388E3C' }]} onPress={confirmDone}>
                <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
                <Text style={[styles.saveText, { marginLeft: 4 }]}>إغلاق المهمة</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Create task modal */}
      <Modal visible={modal} transparent animationType="slide" onRequestClose={() => setModal(false)}>
        <View style={styles.overlay}>
          <ScrollView contentContainerStyle={styles.sheetScroll} keyboardShouldPersistTaps="handled">
            <View style={styles.sheet}>
              <Text style={styles.sheetTitle}>إسناد مهمة جديدة</Text>

              <Text style={styles.label}>العنوان *</Text>
              <TextInput style={styles.input} placeholder="عنوان المهمة..." value={form.title} onChangeText={v => setForm(f => ({ ...f, title: v }))} />

              <Text style={styles.label}>الملاحظات *</Text>
              <TextInput style={[styles.input, { height: 72 }]} multiline placeholder="اكتب ملاحظات وتفاصيل المهمة..." value={form.description} onChangeText={v => setForm(f => ({ ...f, description: v }))} />

              <Text style={styles.label}>تاريخ الاستحقاق (اختياري)</Text>
              <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDatePicker(true)}>
                <Ionicons name="calendar-outline" size={16} color={form.dueDate ? '#1565C0' : '#aaa'} />
                <Text style={[styles.dateBtnText, form.dueDate && { color: '#1565C0' }]}>{dueDateLabel}</Text>
                {form.dueDate && (
                  <TouchableOpacity onPress={() => setForm(f => ({ ...f, dueDate: null }))} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close-circle" size={16} color="#aaa" />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>

              {showDatePicker && (
                <DateTimePicker
                  value={form.dueDate || new Date()}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'inline' : 'default'}
                  minimumDate={new Date()}
                  onChange={(event, selectedDate) => {
                    setShowDatePicker(Platform.OS === 'ios');
                    if (event.type !== 'dismissed' && selectedDate) setForm(f => ({ ...f, dueDate: selectedDate }));
                    if (Platform.OS === 'android') setShowDatePicker(false);
                  }}
                />
              )}

              <Text style={styles.label}>
                إسناد إلى *
                {assignableUsers.length === 0 ? '  (لا يوجد أعضاء)' : ''}
              </Text>
              {assignableUsers.length === 0 ? (
                <Text style={styles.noUsersText}>لا يوجد أعضاء مضافون — أضف أعضاء من "إعداد الفريق"</Text>
              ) : (
                <View style={styles.userList}>
                  {assignableUsers.map((u) => {
                    const selected = form.assignedTo?.key === u.key;
                    return (
                      <TouchableOpacity key={u.key} style={[styles.userChip, selected && styles.userChipSelected]} onPress={() => setForm(f => ({ ...f, assignedTo: u }))}>
                        <Text style={[styles.userChipText, selected && { color: '#fff' }]}>{u.value}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              <View style={styles.sheetBtns}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setModal(false)}>
                  <Text style={styles.cancelText}>إلغاء</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving}>
                  {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveText}>إسناد</Text>}
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
  roleBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8 },
  roleBannerText: { fontSize: 12, fontWeight: '600', flex: 1 },
  stats: { flexDirection: 'row', padding: 10, gap: 8 },
  statBox: {
    flex: 1, backgroundColor: '#fff', borderRadius: 10, padding: 10, alignItems: 'center',
    borderWidth: 1.5, borderColor: '#1565C0', elevation: 1,
  },
  statNum: { fontSize: 20, fontWeight: '800', color: '#1565C0' },
  statLabel: { fontSize: 10, color: '#888', marginTop: 1 },
  assignBox: { borderColor: '#6A1B9A', justifyContent: 'center', gap: 2 },
  tabs: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#eee' },
  tab: { flex: 1, paddingVertical: 11, alignItems: 'center' },
  activeTab: { borderBottomWidth: 2, borderBottomColor: '#1565C0' },
  tabText: { fontSize: 13, color: '#888', fontWeight: '600' },
  activeTabText: { color: '#1565C0' },
  chipScroll: { maxHeight: 46, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#f0f0f0' },
  chipRow: { flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 8, gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 5, backgroundColor: '#f0f0f0', borderRadius: 16, borderWidth: 1, borderColor: '#e0e0e0' },
  chipActive: { backgroundColor: '#1565C0', borderColor: '#1565C0' },
  chipText: { fontSize: 12, color: '#555', fontWeight: '600' },
  chipActiveText: { color: '#fff' },
  list: { padding: 12, paddingBottom: 32, gap: 8 },
  card: {
    flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#fff', borderRadius: 12, padding: 14,
    elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3,
  },
  checkBtn: { marginRight: 12, marginTop: 2 },
  check: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#1565C0',
    justifyContent: 'center', alignItems: 'center',
  },
  checked: { backgroundColor: '#388E3C', borderColor: '#388E3C' },
  taskBody: { flex: 1 },
  taskTitle: { fontSize: 14, fontWeight: '700', color: '#1a1a1a' },
  doneTitle: { textDecorationLine: 'line-through', color: '#aaa' },
  taskDesc: { fontSize: 12, color: '#888', marginTop: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6, flexWrap: 'wrap' },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#f3f3f3', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10 },
  metaText: { fontSize: 10, color: '#888' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgePending: { backgroundColor: '#FFF3E0' },
  badgeDone: { backgroundColor: '#E8F5E9' },
  badgeText: { fontSize: 10, fontWeight: '700' },
  delBtn: { padding: 4, marginLeft: 4 },
  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyText: { color: '#aaa', marginTop: 10, fontSize: 14, textAlign: 'center' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheetScroll: { justifyContent: 'flex-end', flexGrow: 1 },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36 },
  sheetTitle: { fontSize: 16, fontWeight: '800', color: '#1a1a1a', marginBottom: 16, textAlign: 'center' },
  label: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6 },
  input: { backgroundColor: '#f5f5f5', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 14 },
  dateBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#f5f5f5', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, marginBottom: 14 },
  dateBtnText: { flex: 1, fontSize: 14, color: '#aaa' },
  noUsersText: { fontSize: 13, color: '#aaa', marginBottom: 14, fontStyle: 'italic', lineHeight: 20 },
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
