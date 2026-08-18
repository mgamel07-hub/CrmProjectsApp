import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, Alert,
  Modal, TextInput, RefreshControl, ActivityIndicator, ScrollView, Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import {
  getAssignedByMeTasks, createTask, deleteTask, createNotification,
  getTeamMembers, getMyTeamRecord,
} from '../../api/internal';

// Convert a team_members row to the shape the UI needs
function memberToUser(m) {
  return {
    key: m.crm_user_id,
    value: m.display_name || m.crm_user_id,
  };
}

const ROLE_LABELS = {
  admin:    { label: 'مدير إدارة', color: '#6A1B9A', bg: '#F3E5F5' },
  manager:  { label: 'مدير فريق',  color: '#E65100', bg: '#FFF3E0' },
  employee: { label: 'موظف',       color: '#1565C0', bg: '#E3F2FD' },
};

export default function ManageTasksScreen({ route, navigation }) {
  const { userId } = route.params;
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);       // filtered by role
  const [myRecord, setMyRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', assignedTo: null, dueDate: null });
  const [saving, setSaving] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const load = useCallback(async () => {
    try {
      const [taskData, allMembers, myRec] = await Promise.all([
        getAssignedByMeTasks(userId),
        getTeamMembers(),
        getMyTeamRecord(userId),
      ]);
      setTasks(taskData);
      setMyRecord(myRec);

      const role = myRec?.role;
      let visible = [];

      if (role === 'admin') {
        // مدير الإدارة: كل الأعضاء المضافين في التطبيق ما عدا نفسه
        visible = allMembers.filter(m => m.crm_user_id !== String(userId));
      } else if (role === 'manager' && myRec?.team_id) {
        // مدير الفريق: أعضاء فريقه فقط ما عدا نفسه
        visible = allMembers.filter(
          m => m.team_id === myRec.team_id && m.crm_user_id !== String(userId)
        );
      }
      // الموظف أو غير المحدد: لا أحد

      setUsers(visible.map(memberToUser));
    } catch (e) {
      Alert.alert('خطأ', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const openModal = () => {
    setForm({ title: '', description: '', assignedTo: null, dueDate: null });
    setModal(true);
  };

  const save = async () => {
    if (!form.title.trim()) { Alert.alert('', 'أدخل عنوان المهمة'); return; }
    if (!form.assignedTo) { Alert.alert('', 'اختر موظفاً'); return; }
    setSaving(true);
    try {
      const dueDateStr = form.dueDate ? form.dueDate.toISOString().split('T')[0] : null;
      await createTask({
        title: form.title.trim(),
        description: form.description.trim() || null,
        assigned_by: String(userId),
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

  const del = (task) => {
    Alert.alert('حذف', `حذف "${task.title}"؟`, [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'حذف', style: 'destructive', onPress: async () => {
        try { await deleteTask(task.id); load(); } catch (e) { Alert.alert('خطأ', e.message); }
      }},
    ]);
  };

  const renderItem = ({ item }) => {
    const isDone = item.status === 'done';
    const assignedUser = users.find(u => u.key === item.assigned_to);
    return (
      <View style={styles.card}>
        <View style={[styles.statusDot, { backgroundColor: isDone ? '#388E3C' : '#E65100' }]} />
        <View style={styles.taskBody}>
          <Text style={styles.taskTitle}>{item.title}</Text>
          <View style={styles.metaRow}>
            <Ionicons name="person-outline" size={11} color="#888" />
            <Text style={styles.metaText}>{assignedUser?.value || item.assigned_to}</Text>
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

  const dueDateLabel = form.dueDate
    ? form.dueDate.toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' })
    : 'اختر تاريخ...';

  // Role info banner
  const roleInfo = myRecord ? ROLE_LABELS[myRecord.role] : null;
  const teamName = myRecord?.teams?.name;

  // Not configured
  if (!loading && !myRecord) {
    return (
      <View style={styles.notSetupWrap}>
        <Ionicons name="shield-outline" size={52} color="#ddd" />
        <Text style={styles.notSetupTitle}>لم يتم تعيين دورك بعد</Text>
        <Text style={styles.notSetupSub}>
          أضف نفسك أولاً في شاشة "إعداد الفريق" وحدد دورك (مدير إدارة / مدير فريق)
        </Text>
        <TouchableOpacity style={styles.setupBtn} onPress={() => navigation.navigate('TeamSetup')}>
          <Ionicons name="settings-outline" size={16} color="#fff" />
          <Text style={styles.setupBtnText}>اذهب إلى إعداد الفريق</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!loading && myRecord?.role === 'employee') {
    return (
      <View style={styles.notSetupWrap}>
        <Ionicons name="lock-closed-outline" size={52} color="#ddd" />
        <Text style={styles.notSetupTitle}>لا تملك صلاحية إسناد مهام</Text>
        <Text style={styles.notSetupSub}>صلاحية الإسناد متاحة لمديري الفرق ومديري الإدارة فقط</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {/* Role banner */}
      {roleInfo && (
        <View style={[styles.roleBanner, { backgroundColor: roleInfo.bg }]}>
          <Ionicons name="information-circle-outline" size={14} color={roleInfo.color} />
          <Text style={[styles.roleBannerText, { color: roleInfo.color }]}>
            {roleInfo.label}
            {myRecord?.role === 'manager' && teamName ? ` — ${teamName}` : ''}
            {myRecord?.role === 'admin' ? ' — ترى جميع الأعضاء' : myRecord?.role === 'manager' ? ' — ترى فريقك فقط' : ''}
          </Text>
        </View>
      )}

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
          <ScrollView contentContainerStyle={styles.sheetScroll} keyboardShouldPersistTaps="handled">
            <View style={styles.sheet}>
              <Text style={styles.sheetTitle}>إسناد مهمة</Text>

              <Text style={styles.label}>العنوان *</Text>
              <TextInput style={styles.input} placeholder="عنوان المهمة..." value={form.title} onChangeText={v => setForm(f => ({ ...f, title: v }))} />

              <Text style={styles.label}>التفاصيل</Text>
              <TextInput style={[styles.input, { height: 60 }]} multiline placeholder="تفاصيل اختيارية..." value={form.description} onChangeText={v => setForm(f => ({ ...f, description: v }))} />

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
                    if (event.type !== 'dismissed' && selectedDate) {
                      setForm(f => ({ ...f, dueDate: selectedDate }));
                    }
                    if (Platform.OS === 'android') setShowDatePicker(false);
                  }}
                />
              )}

              <Text style={styles.label}>
                إسناد إلى *
                {users.length === 0 && !loading ? '  (لا يوجد أعضاء في فريقك)' : ''}
              </Text>
              {users.length === 0 ? (
                <Text style={styles.noUsersText}>
                  {myRecord?.role === 'manager'
                    ? 'لا يوجد أعضاء في فريقك — أضف أعضاء من شاشة "إعداد الفريق"'
                    : 'لا يوجد أعضاء مضافون في التطبيق بعد'}
                </Text>
              ) : (
                <View style={styles.userList}>
                  {users.map((u) => {
                    const selected = form.assignedTo?.key === u.key;
                    return (
                      <TouchableOpacity
                        key={u.key}
                        style={[styles.userChip, selected && styles.userChipSelected]}
                        onPress={() => setForm(f => ({ ...f, assignedTo: u }))}
                      >
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
  roleBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10 },
  roleBannerText: { fontSize: 12, fontWeight: '600', flex: 1 },
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
  notSetupWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 12 },
  notSetupTitle: { fontSize: 16, fontWeight: '800', color: '#555', textAlign: 'center' },
  notSetupSub: { fontSize: 13, color: '#aaa', textAlign: 'center', lineHeight: 20 },
  setupBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#6A1B9A', borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12, marginTop: 8 },
  setupBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  // Modal
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheetScroll: { justifyContent: 'flex-end', flexGrow: 1 },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36 },
  sheetTitle: { fontSize: 16, fontWeight: '800', color: '#1a1a1a', marginBottom: 16, textAlign: 'center' },
  label: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6 },
  input: { backgroundColor: '#f5f5f5', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 14 },
  dateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#f5f5f5', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12,
    marginBottom: 14,
  },
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
