import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, Alert,
  Modal, TextInput, RefreshControl, ActivityIndicator, ScrollView, Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import {
  getTeamTasks, createTask, updateTask, deleteTask,
  markTaskDone, markTaskPending,
  createNotification, getTeamMembers, getMyTeamRecord,
  getWeekSchedule,
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

const PRIORITY = {
  high:   { label: 'عالية',   color: '#C62828', bg: '#FFEBEE', icon: 'flame-outline' },
  normal: { label: 'عادية',   color: '#1565C0', bg: '#E3F2FD', icon: 'remove-outline' },
  low:    { label: 'منخفضة',  color: '#388E3C', bg: '#E8F5E9', icon: 'arrow-down-outline' },
};

const PRIORITY_ORDER = { high: 0, normal: 1, low: 2 };

const TASK_TYPES = {
  general: { label: 'مهمة عامة',    color: '#1565C0', bg: '#E3F2FD', icon: 'list-outline' },
  office:  { label: 'عمل مكتبي',   color: '#00695C', bg: '#E0F2F1', icon: 'business-outline' },
};

const EMPTY_FORM = { title: '', description: '', assignedTo: null, dueDate: null, priority: 'normal', taskType: 'general', taskDate: null };

export default function ManageTasksScreen({ route, navigation }) {
  const { user } = useAuth();
  const userId = user?.userId != null ? String(user.userId) : String(user?.id ?? '');

  const [allMembers,      setAllMembers]      = useState([]);
  const [assignableUsers, setAssignableUsers] = useState([]);
  const [myRecord,        setMyRecord]        = useState(null);
  const [tasks,           setTasks]           = useState([]);
  const [loading,         setLoading]         = useState(true);
  const [refreshing,      setRefreshing]      = useState(false);

  // Filters
  const [statusFilter,   setStatusFilter]   = useState('all');
  const [assigneeFilter, setAssigneeFilter] = useState(null);
  const [priorityFilter, setPriorityFilter] = useState(null); // 'high'|'normal'|'low'|null

  // Create/Edit modal
  const [modal,         setModal]         = useState(false);
  const [editingTaskId, setEditingTaskId] = useState(null); // null = create
  const [form,          setForm]          = useState(EMPTY_FORM);
  const [saving,        setSaving]        = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [typeFilter,     setTypeFilter]     = useState(null); // null|'general'|'office'

  // Office days (from approved schedule_entries)
  const [officeDays,        setOfficeDays]        = useState([]);
  const [officeDaysLoading, setOfficeDaysLoading] = useState(false);

  // Bullet points for office task description
  const [bullets, setBullets] = useState(['']);

  // Finalized office days — user explicitly sealed the day (stored in AsyncStorage)
  const [finalizedDays, setFinalizedDays] = useState(new Set());

  // Completion notes modal
  const [doneModal, setDoneModal] = useState({ visible: false, task: null, notes: '' });

  const load = useCallback(async () => {
    try {
      const members = await getTeamMembers();
      setAllMembers(members);
      const myRec = userId ? await getMyTeamRecord(userId) : null;
      const nameMatch = !myRec && user?.fullName
        ? members.find(m => m.display_name === user.fullName) || null : null;
      const resolvedRec = myRec || nameMatch;
      setMyRecord(resolvedRec);
      const role   = resolvedRec?.role || 'admin';
      const selfId = resolvedRec?.crm_user_id ? String(resolvedRec.crm_user_id) : userId;
      let visible = [];
      if (role === 'admin') visible = members;
      else if (role === 'manager')
        visible = resolvedRec?.team_id ? members.filter(m => m.team_id === resolvedRec.team_id) : members;
      else visible = members;
      const selfMember = members.find(m => String(m.crm_user_id) === selfId);
      const selfItem   = selfMember
        ? { key: selfId, value: (selfMember.display_name || selfId) + ' (أنا)' }
        : null;
      const others = visible.filter(m => String(m.crm_user_id) !== selfId).map(memberToUser);
      setAssignableUsers(selfItem ? [selfItem, ...others] : others);
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

  // Load finalized days from AsyncStorage
  useEffect(() => {
    if (!userId) return;
    AsyncStorage.getItem(`office_finalized_${userId}`).then(raw => {
      if (raw) {
        try { setFinalizedDays(new Set(JSON.parse(raw))); } catch { }
      }
    }).catch(() => {});
  }, [userId]);

  const finalizeDay = useCallback((dateStr) => {
    setFinalizedDays(prev => {
      const updated = new Set([...prev, dateStr]);
      AsyncStorage.setItem(`office_finalized_${userId}`, JSON.stringify([...updated])).catch(() => {});
      return updated;
    });
  }, [userId]);

  const unfinalizeDay = useCallback((dateStr) => {
    setFinalizedDays(prev => {
      const updated = new Set([...prev].filter(d => d !== dateStr));
      AsyncStorage.setItem(`office_finalized_${userId}`, JSON.stringify([...updated])).catch(() => {});
      return updated;
    });
  }, [userId]);

  // Fetch approved office schedule days for a user (last 30 days only)
  const loadOfficeDays = useCallback(async (targetUserId) => {
    if (!targetUserId) return;
    setOfficeDaysLoading(true);
    try {
      const to   = new Date().toISOString().split('T')[0];
      const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const entries = await getWeekSchedule(targetUserId, from, to);
      const days = (entries || [])
        .filter(e => e.type === 'office' && e.status === 'approved')
        .map(e => String(e.date).slice(0, 10))  // ensure pure YYYY-MM-DD, no time component
        .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))
        .sort((a, b) => b.localeCompare(a)); // newest first
      setOfficeDays(days);
    } catch {
      setOfficeDays([]);
    } finally {
      setOfficeDaysLoading(false);
    }
  }, []);

  useEffect(() => {
    if (modal && form.taskType === 'office') {
      const targetId = form.assignedTo?.key || userId;
      loadOfficeDays(targetId);
    }
  }, [modal, form.taskType, form.assignedTo?.key, userId, loadOfficeDays]);

  const nameOf = (id) => {
    if (!id) return '—';
    const m = allMembers.find(m => String(m.crm_user_id) === String(id));
    return m ? (m.display_name || String(id)) : String(id);
  };

  // ── Date helpers ─────────────────────────────────────────────────────────────

  const today    = new Date().toISOString().split('T')[0];
  const tomorrow = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0]; })();

  // ── Derived counts ────────────────────────────────────────────────────────────

  const pendingCount  = tasks.filter(t => t.status === 'pending').length;
  const doneCount     = tasks.filter(t => t.status === 'done').length;
  const overdueCount  = tasks.filter(t => t.status === 'pending' && t.due_date && t.due_date < today).length;
  const dueSoonCount  = tasks.filter(t => t.status === 'pending' && t.due_date && t.due_date >= today && t.due_date <= tomorrow).length;

  // ── Filtered + sorted list ────────────────────────────────────────────────────

  const filtered = tasks
    .filter(t => {
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (assigneeFilter && String(t.assigned_to) !== assigneeFilter) return false;
      if (priorityFilter && t.priority !== priorityFilter) return false;
      if (typeFilter && (t.task_type || 'general') !== typeFilter) return false;
      return true;
    })
    .sort((a, b) => {
      // priority first (high < normal < low)
      const pa = PRIORITY_ORDER[a.priority ?? 'normal'] ?? 1;
      const pb = PRIORITY_ORDER[b.priority ?? 'normal'] ?? 1;
      if (pa !== pb) return pa - pb;
      // then by due date
      const da = a.due_date || '9999';
      const db = b.due_date || '9999';
      return da.localeCompare(db);
    });

  // Last office task per unfinalized day — these cards get the finalize button
  const lastOfficeTaskPerDayIds = useMemo(() => {
    const map = {};
    for (const t of filtered) {
      if (t.task_type === 'office' && t.task_date) {
        const d = String(t.task_date).slice(0, 10);
        if (!finalizedDays.has(d)) map[d] = t.id;
      }
    }
    return new Set(Object.values(map));
  }, [filtered, finalizedDays]);

  // ── Toggle done/pending ───────────────────────────────────────────────────────

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

  // ── Delete ────────────────────────────────────────────────────────────────────

  const del = (task) => {
    Alert.alert('حذف', `حذف "${task.title}"؟`, [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'حذف', style: 'destructive', onPress: async () => {
        try { await deleteTask(task.id); load(); } catch (e) { Alert.alert('خطأ', e.message); }
      }},
    ]);
  };

  // ── Open modal (create or edit) ───────────────────────────────────────────────

  const openCreate = () => {
    setEditingTaskId(null);
    setForm(EMPTY_FORM);
    setBullets(['']);
    setOfficeDays([]);
    setModal(true);
  };

  const openEdit = (task) => {
    setEditingTaskId(task.id);
    const assignedUser = assignableUsers.find(u => u.key === String(task.assigned_to)) || null;
    const ttype = task.task_type || 'general';
    setForm({
      title:      task.title || '',
      description:ttype === 'office' ? '' : (task.description || ''),
      assignedTo: assignedUser,
      dueDate:    ttype === 'office' ? null : (task.due_date ? new Date(task.due_date) : null),
      priority:   task.priority || 'normal',
      taskType:   ttype,
      taskDate:   task.task_date ? new Date(String(task.task_date).slice(0, 10) + 'T12:00:00') : null,
    });
    if (ttype === 'office' && task.description) {
      const parsed = task.description.split('\n')
        .map(l => l.replace(/^•\s*/, '').trim())
        .filter(Boolean);
      setBullets(parsed.length ? parsed : ['']);
    } else {
      setBullets(['']);
    }
    setOfficeDays([]);
    setModal(true);
  };

  // ── Save (create or update) ───────────────────────────────────────────────────

  const save = async () => {
    if (!form.assignedTo) { Alert.alert('', 'اختر موظفاً'); return; }

    const isOffice = form.taskType === 'office';
    let descStr = '';
    if (isOffice) {
      const filled = bullets.filter(b => b.trim());
      if (!filled.length) { Alert.alert('', 'أضف نقطة واحدة على الأقل'); return; }
      descStr = filled.map(b => `• ${b.trim()}`).join('\n');
    } else {
      if (!form.title.trim())       { Alert.alert('', 'أدخل عنوان المهمة'); return; }
      if (!form.description.trim()) { Alert.alert('', 'أدخل التفاصيل'); return; }
      descStr = form.description.trim();
    }

    if (isOffice && !form.taskDate) {
      Alert.alert('', 'اختر يوم العمل في المكتب');
      return;
    }
    setSaving(true);
    const isSelfOffice = isOffice && form.assignedTo.key === userId;
    try {
      const dueDateStr  = isOffice ? null : (form.dueDate ? form.dueDate.toISOString().split('T')[0] : null);
      const taskDateStr = form.taskDate ? form.taskDate.toISOString().split('T')[0] : null;
      // For office tasks, auto-generate title from the selected date
      const autoTitle = isOffice && form.taskDate
        ? `عمل مكتبي — ${form.taskDate.toLocaleDateString('ar-EG', { weekday: 'long', month: 'long', day: 'numeric' })}`
        : form.title.trim();
      const payload = {
        title:       autoTitle,
        description: descStr,
        assigned_to: form.assignedTo.key,
        due_date:    dueDateStr,
        priority:    isOffice ? 'normal' : form.priority,
        task_type:   form.taskType,
        task_date:   taskDateStr,
        // مهام مكتبية على نفسه → تُنشأ منجزة مباشرة
        ...(isSelfOffice && !editingTaskId
          ? { status: 'done', done_at: taskDateStr }
          : {}),
      };
      if (editingTaskId) {
        await updateTask(editingTaskId, payload);
      } else {
        await createTask({ ...payload, assigned_by: userId });
        if (!isSelfOffice) {
          await createNotification({
            to_user_id: form.assignedTo.key,
            type: 'task_assigned',
            message: `تم إسناد مهمة لك: ${form.title}`,
            ref_type: 'task',
          }).catch(() => {});
        }
      }
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

  const inlineFinalizeDate = form.taskType === 'office' && form.taskDate
    ? form.taskDate.toISOString().split('T')[0]
    : null;

  const roleInfo = myRecord ? ROLE_LABELS[myRecord.role] : ROLE_LABELS['admin'];
  const teamName = myRecord?.teams?.name;

  // ── Task card ─────────────────────────────────────────────────────────────────

  const renderItem = ({ item }) => {
    const isDone    = item.status === 'done';
    const isOverdue = !isDone && item.due_date && item.due_date < today;
    const isSoon    = !isDone && !isOverdue && item.due_date && item.due_date <= tomorrow;
    const prio      = PRIORITY[item.priority] || PRIORITY.normal;
    const showPrio  = item.priority && item.priority !== 'normal';
    const showFinalizeBtn = lastOfficeTaskPerDayIds.has(item.id) && String(item.assigned_to) === userId;
    const taskDateStr = item.task_date ? String(item.task_date).slice(0, 10) : null;
    return (
      <View>
        <View style={[styles.card, showPrio && { borderRightColor: prio.color, borderRightWidth: 3 }, showFinalizeBtn && { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, marginBottom: 0 }]}>
          <TouchableOpacity style={styles.checkBtn} onPress={() => toggle(item)}>
            <View style={[styles.check, isDone && styles.checked]}>
              {isDone && <Ionicons name="checkmark" size={14} color="#fff" />}
            </View>
          </TouchableOpacity>
          <View style={styles.taskBody}>
            <Text style={[styles.taskTitle, isDone && styles.doneTitle]} numberOfLines={2}>{item.title}</Text>
            {item.description ? (
              item.task_type === 'office'
                ? item.description.split('\n').filter(Boolean).map((line, i) => (
                    <Text key={i} style={styles.taskDesc}>{line}</Text>
                  ))
                : <Text style={styles.taskDesc} numberOfLines={1}>{item.description}</Text>
            ) : null}
            {item.completion_notes ? (
              <Text style={styles.completionNote} numberOfLines={1}>💬 {item.completion_notes}</Text>
            ) : null}
            <View style={styles.metaRow}>
              {item.task_type === 'office' && (
                <View style={[styles.prioBadge, { backgroundColor: '#E0F2F1' }]}>
                  <Ionicons name="business-outline" size={9} color="#00695C" />
                  <Text style={[styles.prioBadgeText, { color: '#00695C' }]}>
                    مكتبي{item.task_date ? ` · ${item.task_date}` : ''}
                  </Text>
                </View>
              )}
              {showPrio && (
                <View style={[styles.prioBadge, { backgroundColor: prio.bg }]}>
                  <Ionicons name={prio.icon} size={9} color={prio.color} />
                  <Text style={[styles.prioBadgeText, { color: prio.color }]}>{prio.label}</Text>
                </View>
              )}
              <View style={styles.metaChip}>
                <Ionicons name="person-outline" size={10} color="#888" />
                <Text style={styles.metaText}>{nameOf(item.assigned_to)}</Text>
              </View>
              {item.due_date && (
                <View style={[styles.metaChip, isOverdue && styles.metaChipRed, isSoon && styles.metaChipOrange]}>
                  <Ionicons name="calendar-outline" size={10}
                    color={isOverdue ? '#C62828' : isSoon ? '#E65100' : '#888'} />
                  <Text style={[styles.metaText,
                    isOverdue && { color: '#C62828' },
                    isSoon    && { color: '#E65100' }]}>{item.due_date}</Text>
                </View>
              )}
              <View style={[styles.statusBadge, isDone ? styles.badgeDone : styles.badgePending]}>
                <Text style={[styles.badgeText, { color: isDone ? '#388E3C' : '#E65100' }]}>
                  {isDone ? 'منجزة' : 'معلقة'}
                </Text>
              </View>
            </View>
          </View>
          {/* Edit button */}
          {!isDone && (
            <TouchableOpacity onPress={() => openEdit(item)} style={styles.editBtn}>
              <Ionicons name="create-outline" size={16} color="#bbb" />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => del(item)} style={styles.delBtn}>
            <Ionicons name="trash-outline" size={17} color="#ddd" />
          </TouchableOpacity>
        </View>
        {showFinalizeBtn && taskDateStr && (
          <TouchableOpacity
            style={styles.cardFinalizeBtn}
            onPress={() => Alert.alert(
              'إنهاء مهام اليوم',
              `سيتم قفل ${new Date(taskDateStr + 'T12:00:00').toLocaleDateString('ar-EG', { weekday: 'long', month: 'long', day: 'numeric' })} ولن تتمكن من إضافة مهام جديدة عليه. هل تريد المتابعة؟`,
              [
                { text: 'إلغاء', style: 'cancel' },
                { text: 'إنهاء اليوم', style: 'destructive', onPress: () => finalizeDay(taskDateStr) },
              ]
            )}
          >
            <Ionicons name="lock-closed-outline" size={13} color="#fff" />
            <Text style={styles.cardFinalizeBtnText}>إنهاء مهام اليوم</Text>
          </TouchableOpacity>
        )}
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

      {/* Overdue alert */}
      {overdueCount > 0 && (
        <TouchableOpacity style={styles.overdueBanner} onPress={() => setStatusFilter('pending')} activeOpacity={0.8}>
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
        <TouchableOpacity style={[styles.statBox, styles.assignBox]} onPress={openCreate}>
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

      {/* Priority filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chipRow}>
        <TouchableOpacity style={[styles.chip, !priorityFilter && styles.chipActive]} onPress={() => setPriorityFilter(null)}>
          <Text style={[styles.chipText, !priorityFilter && styles.chipActiveText]}>كل الأولويات</Text>
        </TouchableOpacity>
        {Object.entries(PRIORITY).map(([k, p]) => (
          <TouchableOpacity key={k} style={[styles.chip, priorityFilter === k && { backgroundColor: p.color, borderColor: p.color }]}
            onPress={() => setPriorityFilter(priorityFilter === k ? null : k)}>
            <Ionicons name={p.icon} size={11} color={priorityFilter === k ? '#fff' : p.color} />
            <Text style={[styles.chipText, priorityFilter === k && { color: '#fff' }]}>{p.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Type filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.chipScroll, { borderTopWidth: 0 }]} contentContainerStyle={styles.chipRow}>
        <TouchableOpacity style={[styles.chip, !typeFilter && styles.chipActive]} onPress={() => setTypeFilter(null)}>
          <Text style={[styles.chipText, !typeFilter && styles.chipActiveText]}>كل الأنواع</Text>
        </TouchableOpacity>
        {Object.entries(TASK_TYPES).map(([k, t]) => (
          <TouchableOpacity key={k} style={[styles.chip, typeFilter === k && { backgroundColor: t.color, borderColor: t.color }]}
            onPress={() => setTypeFilter(typeFilter === k ? null : k)}>
            <Ionicons name={t.icon} size={11} color={typeFilter === k ? '#fff' : t.color} />
            <Text style={[styles.chipText, typeFilter === k && { color: '#fff' }]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Assignee filter chips */}
      {allMembers.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.chipScroll, { borderTopWidth: 0 }]} contentContainerStyle={styles.chipRow}>
          <TouchableOpacity style={[styles.chip, !assigneeFilter && styles.chipActive]} onPress={() => setAssigneeFilter(null)}>
            <Text style={[styles.chipText, !assigneeFilter && styles.chipActiveText]}>الجميع</Text>
          </TouchableOpacity>
          {allMembers.map(m => {
            const id = String(m.crm_user_id);
            const active = assigneeFilter === id;
            return (
              <TouchableOpacity key={id} style={[styles.chip, active && styles.chipActive]}
                onPress={() => setAssigneeFilter(active ? null : id)}>
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

      {/* ── Completion notes modal ────────────────────────────────────────── */}
      <Modal visible={doneModal.visible} transparent animationType="slide"
        onRequestClose={() => setDoneModal(s => ({ ...s, visible: false }))}>
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
              placeholder="اكتب ما تم إنجازه..."
              value={doneModal.notes}
              onChangeText={v => setDoneModal(s => ({ ...s, notes: v }))}
              autoFocus
            />
            <View style={styles.sheetBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setDoneModal(s => ({ ...s, visible: false }))}>
                <Text style={styles.cancelText}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, { backgroundColor: '#388E3C', flexDirection: 'row', gap: 6 }]} onPress={confirmDone}>
                <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
                <Text style={styles.saveText}>إغلاق المهمة</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Create / Edit task modal ──────────────────────────────────────── */}
      <Modal visible={modal} transparent animationType="slide" onRequestClose={() => setModal(false)}>
        <View style={styles.overlay}>
          <ScrollView contentContainerStyle={styles.sheetScroll} keyboardShouldPersistTaps="handled">
            <View style={styles.sheet}>
              <Text style={styles.sheetTitle}>
                {editingTaskId ? 'تعديل المهمة' : form.taskType === 'office' ? 'تسجيل عمل مكتبي' : 'إسناد مهمة جديدة'}
              </Text>

              {/* Task type selector */}
              {!editingTaskId && (
                <>
                  <Text style={styles.label}>النوع</Text>
                  <View style={[styles.prioRow, { marginBottom: 16 }]}>
                    {Object.entries(TASK_TYPES).map(([k, t]) => (
                      <TouchableOpacity key={k}
                        style={[styles.prioBtn, form.taskType === k && { backgroundColor: t.color, borderColor: t.color }]}
                        onPress={() => {
                        setForm(f => ({ ...f, taskType: k, taskDate: null, dueDate: null }));
                        setBullets(['']);
                        setOfficeDays([]);
                      }}>
                        <Ionicons name={t.icon} size={13} color={form.taskType === k ? '#fff' : t.color} />
                        <Text style={[styles.prioBtnText, form.taskType === k && { color: '#fff' }]}>{t.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              {/* Auto-done notice for self office tasks */}
              {form.taskType === 'office' && form.assignedTo?.key === userId && (
                <View style={{ backgroundColor: '#E0F2F1', borderRadius: 8, padding: 10, marginBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                  <Ionicons name="checkmark-circle" size={16} color="#00695C" />
                  <Text style={{ fontSize: 12, color: '#00695C', fontWeight: '600', flex: 1 }}>
                    سيتم تسجيلها منجزة تلقائياً
                  </Text>
                </View>
              )}

              {/* Title — hidden for office tasks (auto-generated from date) */}
              {form.taskType !== 'office' && (
                <>
                  <Text style={styles.label}>العنوان *</Text>
                  <TextInput style={styles.input}
                    placeholder="عنوان المهمة..."
                    value={form.title} onChangeText={v => setForm(f => ({ ...f, title: v }))} />
                </>
              )}

              {/* Description: bullet points for office, textarea for general */}
              {form.taskType === 'office' ? (
                <>
                  <Text style={styles.label}>ما الذي تم إنجازه؟ (نقاط) *</Text>
                  {bullets.map((b, i) => (
                    <View key={i} style={styles.bulletRow}>
                      <Text style={styles.bulletDot}>•</Text>
                      <TextInput
                        style={[styles.input, styles.bulletInput]}
                        placeholder="أضف نقطة..."
                        value={b}
                        onChangeText={v => { const n = [...bullets]; n[i] = v; setBullets(n); }}
                        onSubmitEditing={() => { if (i === bullets.length - 1) setBullets([...bullets, '']); }}
                        returnKeyType="next"
                        blurOnSubmit={false}
                      />
                      {bullets.length > 1 && (
                        <TouchableOpacity onPress={() => setBullets(bullets.filter((_, j) => j !== i))}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Ionicons name="remove-circle" size={20} color="#e57373" />
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                  <TouchableOpacity style={styles.addBulletBtn} onPress={() => setBullets([...bullets, ''])}>
                    <Ionicons name="add-circle-outline" size={16} color="#00695C" />
                    <Text style={styles.addBulletText}>إضافة نقطة</Text>
                  </TouchableOpacity>

                  {inlineFinalizeDate ? (
                    <TouchableOpacity
                      style={styles.finalizeBtn}
                      onPress={() => Alert.alert(
                        'إنهاء مهام اليوم',
                        `سيتم قفل ${new Date(inlineFinalizeDate + 'T12:00:00').toLocaleDateString('ar-EG', { weekday: 'long', month: 'long', day: 'numeric' })} ولن تتمكن من إضافة مهام جديدة عليه. هل تريد المتابعة؟`,
                        [
                          { text: 'إلغاء', style: 'cancel' },
                          { text: 'إنهاء اليوم', style: 'destructive', onPress: () => {
                            finalizeDay(inlineFinalizeDate);
                            setForm(f => ({ ...f, taskDate: null }));
                            setModal(false);
                          }},
                        ]
                      )}
                    >
                      <Ionicons name="lock-closed-outline" size={15} color="#fff" />
                      <Text style={styles.finalizeBtnText}>إنهاء مهام اليوم</Text>
                    </TouchableOpacity>
                  ) : null}
                </>
              ) : (
                <>
                  <Text style={styles.label}>الملاحظات *</Text>
                  <TextInput style={[styles.input, { height: 72 }]} multiline
                    placeholder="اكتب ملاحظات وتفاصيل المهمة..."
                    value={form.description} onChangeText={v => setForm(f => ({ ...f, description: v }))} />
                </>
              )}

              {/* Priority selector — hidden for office tasks */}
              {form.taskType !== 'office' && (
                <>
                  <Text style={styles.label}>الأولوية</Text>
                  <View style={styles.prioRow}>
                    {Object.entries(PRIORITY).map(([k, p]) => (
                      <TouchableOpacity key={k}
                        style={[styles.prioBtn, form.priority === k && { backgroundColor: p.color, borderColor: p.color }]}
                        onPress={() => setForm(f => ({ ...f, priority: k }))}>
                        <Ionicons name={p.icon} size={13} color={form.priority === k ? '#fff' : p.color} />
                        <Text style={[styles.prioBtnText, form.priority === k && { color: '#fff' }]}>{p.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              {/* task_date — office days chips from approved schedule */}
              {form.taskType === 'office' && (
                <>
                  <Text style={styles.label}>يوم العمل في المكتب *</Text>
                  {officeDaysLoading ? (
                    <ActivityIndicator color="#00695C" style={{ marginBottom: 14 }} />
                  ) : (() => {
                    // Only hide finalized days — days with tasks but not finalized stay available
                    const assigneeId = form.assignedTo?.key || userId;
                    const isSelf = assigneeId === userId;
                    const availableDays = officeDays.filter(d => !finalizedDays.has(d));

                    // Check how many tasks exist on the currently selected day
                    const selectedDateStr = form.taskDate ? form.taskDate.toISOString().split('T')[0] : null;
                    const tasksOnSelected = selectedDateStr
                      ? tasks.filter(t =>
                          t.task_type === 'office' &&
                          String(t.assigned_to) === assigneeId &&
                          String(t.task_date || '').slice(0, 10) === selectedDateStr &&
                          t.id !== editingTaskId
                        ).length
                      : 0;

                    if (availableDays.length === 0) return (
                      <View style={{ backgroundColor: '#FFF8E1', borderRadius: 8, padding: 10, marginBottom: 14 }}>
                        <Text style={{ fontSize: 12, color: '#F57F17' }}>
                          {officeDays.length === 0
                            ? 'لا توجد أيام مكتب معتمدة في الجدول الأسبوعي لهذا الموظف'
                            : 'جميع أيام المكتب تم إنهاؤها'}
                        </Text>
                      </View>
                    );
                    return (
                      <>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false}
                          contentContainerStyle={{ gap: 8, paddingVertical: 6, marginBottom: 8 }}>
                          {availableDays.map(date => {
                            const dateObj  = new Date(date.slice(0, 10) + 'T12:00:00');
                            const isSelected = form.taskDate
                              ? form.taskDate.toISOString().split('T')[0] === date
                              : false;
                            const hasTask = tasks.some(t =>
                              t.task_type === 'office' &&
                              String(t.assigned_to) === assigneeId &&
                              String(t.task_date || '').slice(0, 10) === date
                            );
                            return (
                              <TouchableOpacity key={date}
                                style={[styles.dayChip, isSelected && styles.dayChipSelected]}
                                onPress={() => setForm(f => ({ ...f, taskDate: dateObj }))}>
                                {hasTask && (
                                  <Ionicons name="layers-outline" size={11}
                                    color={isSelected ? '#fff' : '#00695C'}
                                    style={{ marginLeft: 3 }} />
                                )}
                                <Text style={[styles.dayChipText, isSelected && styles.dayChipTextSelected]}>
                                  {dateObj.toLocaleDateString('ar-EG', { weekday: 'short', month: 'short', day: 'numeric' })}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </ScrollView>

                        {/* Finalize button — shown when selected day has ≥1 tasks and user is self */}
                        {isSelf && selectedDateStr && tasksOnSelected > 0 && (
                          <TouchableOpacity
                            style={styles.finalizeBtn}
                            onPress={() => Alert.alert(
                              'إنهاء مهام اليوم',
                              `سيتم قفل ${new Date(selectedDateStr + 'T12:00:00').toLocaleDateString('ar-EG', { weekday: 'long', month: 'long', day: 'numeric' })} ولن تتمكن من إضافة مهام جديدة عليه. هل تريد المتابعة؟`,
                              [
                                { text: 'إلغاء', style: 'cancel' },
                                { text: 'إنهاء اليوم', style: 'destructive', onPress: () => {
                                  finalizeDay(selectedDateStr);
                                  setForm(f => ({ ...f, taskDate: null }));
                                  setModal(false);
                                }},
                              ]
                            )}
                          >
                            <Ionicons name="lock-closed-outline" size={15} color="#fff" />
                            <Text style={styles.finalizeBtnText}>إنهاء مهام اليوم</Text>
                            <Text style={styles.finalizeBtnSub}>({tasksOnSelected} مهمة مسجلة)</Text>
                          </TouchableOpacity>
                        )}
                      </>
                    );
                  })()}
                </>
              )}

              {/* Due date — hidden for office tasks */}
              {form.taskType !== 'office' && (
                <>
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
                </>
              )}

              <Text style={styles.label}>
                إسناد إلى *{assignableUsers.length === 0 ? '  (لا يوجد أعضاء)' : ''}
              </Text>
              {assignableUsers.length === 0 ? (
                <Text style={styles.noUsersText}>لا يوجد أعضاء مضافون — أضف أعضاء من "إعداد الفريق"</Text>
              ) : (
                <View style={styles.userList}>
                  {assignableUsers.map((u) => {
                    const selected = form.assignedTo?.key === u.key;
                    return (
                      <TouchableOpacity key={u.key}
                        style={[styles.userChip, selected && styles.userChipSelected]}
                        onPress={() => setForm(f => ({ ...f, assignedTo: u }))}>
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
                  {saving
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={styles.saveText}>{editingTaskId ? 'حفظ التعديلات' : 'إسناد'}</Text>
                  }
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

  overdueBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFEBEE', paddingHorizontal: 14, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#FFCDD2' },
  overdueText: { flex: 1, fontSize: 12, fontWeight: '700', color: '#C62828' },

  soonBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFF3E0', paddingHorizontal: 14, paddingVertical: 7 },
  soonText: { fontSize: 12, fontWeight: '700', color: '#E65100' },

  stats: { flexDirection: 'row', padding: 10, gap: 8 },
  statBox: { flex: 1, backgroundColor: '#fff', borderRadius: 10, padding: 10, alignItems: 'center', borderWidth: 1.5, borderColor: '#1565C0', elevation: 1 },
  statNum: { fontSize: 20, fontWeight: '800', color: '#1565C0' },
  statLabel: { fontSize: 10, color: '#888', marginTop: 1 },
  assignBox: { borderColor: '#6A1B9A', justifyContent: 'center', gap: 2 },

  tabs: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#eee' },
  tab: { flex: 1, paddingVertical: 11, alignItems: 'center' },
  activeTab: { borderBottomWidth: 2, borderBottomColor: '#1565C0' },
  tabText: { fontSize: 13, color: '#888', fontWeight: '600' },
  activeTabText: { color: '#1565C0' },

  chipScroll: { maxHeight: 46, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#f0f0f0' },
  chipRow: { flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 8, gap: 6, alignItems: 'center' },
  chip: { paddingHorizontal: 12, paddingVertical: 5, backgroundColor: '#f0f0f0', borderRadius: 16, borderWidth: 1, borderColor: '#e0e0e0', flexDirection: 'row', alignItems: 'center', gap: 4 },
  chipActive: { backgroundColor: '#1565C0', borderColor: '#1565C0' },
  chipText: { fontSize: 12, color: '#555', fontWeight: '600' },
  chipActiveText: { color: '#fff' },

  list: { padding: 12, paddingBottom: 32, gap: 8 },
  card: {
    flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#fff',
    borderRadius: 12, padding: 14, elevation: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3,
  },
  checkBtn: { marginRight: 12, marginTop: 2 },
  check: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#1565C0', justifyContent: 'center', alignItems: 'center' },
  checked: { backgroundColor: '#388E3C', borderColor: '#388E3C' },
  taskBody: { flex: 1 },
  taskTitle: { fontSize: 14, fontWeight: '700', color: '#1a1a1a' },
  doneTitle: { textDecorationLine: 'line-through', color: '#aaa' },
  taskDesc: { fontSize: 12, color: '#888', marginTop: 2 },
  completionNote: { fontSize: 11, color: '#388E3C', marginTop: 3, fontStyle: 'italic' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6, flexWrap: 'wrap' },
  prioBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  prioBadgeText: { fontSize: 9, fontWeight: '700' },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#f3f3f3', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10 },
  metaChipRed: { backgroundColor: '#FFEBEE' },
  metaChipOrange: { backgroundColor: '#FFF3E0' },
  metaText: { fontSize: 10, color: '#888' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgePending: { backgroundColor: '#FFF3E0' },
  badgeDone: { backgroundColor: '#E8F5E9' },
  badgeText: { fontSize: 10, fontWeight: '700' },
  editBtn: { padding: 4, marginLeft: 4 },
  delBtn: { padding: 4, marginLeft: 4 },

  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyText: { color: '#aaa', marginTop: 10, fontSize: 14, textAlign: 'center' },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheetScroll: { justifyContent: 'flex-end', flexGrow: 1 },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36 },
  sheetTitle: { fontSize: 16, fontWeight: '800', color: '#1a1a1a', marginBottom: 16, textAlign: 'center' },
  label: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6 },
  input: { backgroundColor: '#f5f5f5', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 14, textAlignVertical: 'top' },

  prioRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  prioBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, borderRadius: 10, borderWidth: 1.5, borderColor: '#e0e0e0', backgroundColor: '#f8f8f8' },
  prioBtnText: { fontSize: 12, fontWeight: '700', color: '#555' },

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

  // Bullet points
  bulletRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  bulletDot: { fontSize: 18, color: '#00695C', width: 18, textAlign: 'center' },
  bulletInput: { flex: 1, height: 40, marginBottom: 0 },
  addBulletBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 4, marginBottom: 14 },
  addBulletText: { fontSize: 13, color: '#00695C', fontWeight: '600' },

  // Office day chips (inside modal)
  dayChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 9, backgroundColor: '#f0f0f0', borderRadius: 20, borderWidth: 1.5, borderColor: '#e0e0e0' },
  dayChipSelected: { backgroundColor: '#00695C', borderColor: '#00695C' },
  dayChipText: { fontSize: 13, color: '#444', fontWeight: '600' },
  dayChipTextSelected: { color: '#fff' },

  // Finalize day button
  finalizeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#C62828', borderRadius: 10,
    paddingHorizontal: 16, paddingVertical: 12, marginBottom: 14,
    justifyContent: 'center',
  },
  finalizeBtnText: { fontSize: 14, fontWeight: '800', color: '#fff' },
  finalizeBtnSub:  { fontSize: 11, color: 'rgba(255,255,255,0.8)' },
  cardFinalizeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#B71C1C', borderBottomLeftRadius: 10, borderBottomRightRadius: 10,
    paddingVertical: 9,
  },
  cardFinalizeBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  inlineFinalizeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#B71C1C', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  inlineFinalizeBtnText: { fontSize: 11, fontWeight: '700', color: '#fff' },
});
