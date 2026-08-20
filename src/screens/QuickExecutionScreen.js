/**
 * QuickExecutionScreen — إضافة تنفيذ (إجراء) بسرعة من برّا المشروع
 */
import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import {
  getProjectsDropdown, getScopesDropdown, getStagesDropdown,
  getPlansDropDown, getPlanItems,
  createProjectVisit, uploadPlanExecutionAttachment,
} from '../api/projects';
import { extractList } from '../utils/helpers';

// ── simple inline dropdown ────────────────────────────────────────────────────
function Field({ label, children }) {
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      {children}
    </View>
  );
}

function Dropdown({ label, options, value, onSelect, getLabel, placeholder, loading }) {
  const [open, setOpen] = useState(false);
  const selected = options.find(o => (o.id ?? o.key) === value);
  return (
    <Field label={label}>
      <TouchableOpacity style={s.dropBtn} onPress={() => setOpen(v => !v)}>
        {loading
          ? <ActivityIndicator size="small" color="#1565C0" />
          : <Text style={[s.dropVal, !selected && { color: '#aaa' }]} numberOfLines={1}>
              {selected ? getLabel(selected) : placeholder}
            </Text>
        }
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color="#888" />
      </TouchableOpacity>
      {open && (
        <View style={s.dropList}>
          {options.map((o, i) => {
            const id = o.id ?? o.key;
            return (
              <TouchableOpacity
                key={i}
                style={[s.dropItem, value === id && s.dropItemActive]}
                onPress={() => { onSelect(id, o); setOpen(false); }}
              >
                <Text style={[s.dropItemText, value === id && s.dropItemTextActive]} numberOfLines={2}>
                  {getLabel(o)}
                </Text>
              </TouchableOpacity>
            );
          })}
          {options.length === 0 && <Text style={s.dropEmpty}>لا توجد خيارات</Text>}
        </View>
      )}
    </Field>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function QuickExecutionScreen({ navigation }) {
  const [projects,     setProjects]     = useState([]);
  const [scopes,       setScopes]       = useState([]);
  const [stages,       setStages]       = useState([]);
  const [plans,        setPlans]        = useState([]);
  const [planItems,    setPlanItems]    = useState([]);
  const [selectedItems, setSelectedItems] = useState([]);

  const [projectId,  setProjectId]  = useState(null);
  const [scopeId,    setScopeId]    = useState(null);
  const [stageId,    setStageId]    = useState(null);
  const [planId,     setPlanId]     = useState(null);

  const [date,        setDate]        = useState('');
  const [startTime,   setStartTime]   = useState('');
  const [endTime,     setEndTime]     = useState('');
  const [description, setDescription] = useState('');
  const [attachments, setAttachments] = useState([]);

  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingScopes,   setLoadingScopes]   = useState(false);
  const [loadingStages,   setLoadingStages]   = useState(false);
  const [loadingPlans,    setLoadingPlans]     = useState(false);
  const [loadingItems,    setLoadingItems]     = useState(false);
  const [saving,          setSaving]           = useState(false);

  // Load projects on mount
  React.useEffect(() => {
    setLoadingProjects(true);
    getProjectsDropdown()
      .then(res => setProjects(extractList(res) || []))
      .catch(() => setProjects([]))
      .finally(() => setLoadingProjects(false));
  }, []);

  const onSelectProject = useCallback(async (id) => {
    setProjectId(id);
    setScopeId(null); setStageId(null); setPlanId(null);
    setScopes([]); setStages([]); setPlans([]); setPlanItems([]); setSelectedItems([]);
    setLoadingScopes(true);
    try {
      const res = await getScopesDropdown(id);
      setScopes(extractList(res) || []);
    } catch { setScopes([]); }
    finally { setLoadingScopes(false); }
  }, []);

  const onSelectScope = useCallback(async (id) => {
    setScopeId(id);
    setStageId(null); setPlanId(null);
    setStages([]); setPlans([]); setPlanItems([]); setSelectedItems([]);
    setLoadingStages(true);
    try {
      const res = await getStagesDropdown(id);
      setStages(extractList(res) || []);
    } catch { setStages([]); }
    finally { setLoadingStages(false); }
  }, []);

  const onSelectStage = useCallback(async (id) => {
    setStageId(id);
    setPlanId(null);
    setPlans([]); setPlanItems([]); setSelectedItems([]);
    setLoadingPlans(true);
    try {
      const res = await getPlansDropDown(scopeId, id);
      setPlans(extractList(res) || []);
    } catch { setPlans([]); }
    finally { setLoadingPlans(false); }
  }, [scopeId]);

  const onSelectPlan = useCallback(async (id) => {
    setPlanId(id);
    setPlanItems([]); setSelectedItems([]);
    setLoadingItems(true);
    try {
      const res = await getPlanItems(id);
      const items = extractList(res) || res?.data || [];
      setPlanItems(Array.isArray(items) ? items : []);
    } catch { setPlanItems([]); }
    finally { setLoadingItems(false); }
  }, []);

  const pickAttachment = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
      if (!result.canceled && result.assets?.length) {
        setAttachments(prev => [...prev, ...result.assets]);
      }
    } catch { }
  };

  const handleSave = async () => {
    if (!planId)  return Alert.alert('تنبيه', 'اختر الخطة أولاً');
    if (!date)    return Alert.alert('تنبيه', 'أدخل تاريخ التنفيذ');
    setSaving(true);
    try {
      const res = await createProjectVisit({
        projectPlanId: planId,
        executionDate: date,
        startTime: startTime || null,
        endTime: endTime || null,
        description: description.trim() || null,
        projectPlanItemIds: selectedItems,
        hideItemsInEmail: false,
      });
      const raw = res?.data;
      const executionId = typeof raw?.data === 'object' ? raw?.data?.id : (raw?.data ?? raw?.id ?? raw);

      if (attachments.length > 0 && executionId) {
        const failed = [];
        for (const file of attachments) {
          try {
            const fd = new FormData();
            fd.append('file', { uri: file.uri, name: file.name, type: file.mimeType || 'application/octet-stream' });
            await uploadPlanExecutionAttachment(executionId, fd);
          } catch { failed.push(file.name); }
        }
        if (failed.length) Alert.alert('تنبيه', 'لم يرفع بعض المرفقات: ' + failed.join(', '));
      }

      Alert.alert('تم', 'تم حفظ الإجراء بنجاح', [{ text: 'حسناً', onPress: () => navigation.goBack() }]);
    } catch (e) {
      const msg = e?.response?.data?.message || e?.response?.data?.title || e?.message;
      Alert.alert('خطأ', msg || 'حدث خطأ في الحفظ');
    } finally {
      setSaving(false);
    }
  };

  const toggleItem = (id) => {
    setSelectedItems(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">

      {/* Project */}
      <Dropdown
        label="المشروع *"
        options={projects}
        value={projectId}
        onSelect={(id) => onSelectProject(id)}
        getLabel={o => o.value || o.name || `#${o.id ?? o.key}`}
        placeholder="اختر المشروع"
        loading={loadingProjects}
      />

      {/* Scope */}
      {projectId && (
        <Dropdown
          label="نطاق المشروع *"
          options={scopes}
          value={scopeId}
          onSelect={(id) => onSelectScope(id)}
          getLabel={o => o.value || o.name || `#${o.id ?? o.key}`}
          placeholder="اختر النطاق"
          loading={loadingScopes}
        />
      )}

      {/* Stage */}
      {scopeId && (
        <Dropdown
          label="المرحلة"
          options={stages}
          value={stageId}
          onSelect={(id) => onSelectStage(id)}
          getLabel={o => o.value || o.name || `#${o.id ?? o.key}`}
          placeholder="اختر المرحلة"
          loading={loadingStages}
        />
      )}

      {/* Plan */}
      {scopeId && (
        <Dropdown
          label="الخطة *"
          options={plans}
          value={planId}
          onSelect={(id) => onSelectPlan(id)}
          getLabel={o => o.value || o.title || `#${o.id ?? o.key}`}
          placeholder="اختر الخطة"
          loading={loadingPlans}
        />
      )}

      {/* إجراءات (Plan Items) */}
      {loadingItems && (
        <View style={s.loadingRow}>
          <ActivityIndicator size="small" color="#1565C0" />
          <Text style={s.loadingText}>جاري تحميل الإجراءات...</Text>
        </View>
      )}
      {planItems.length > 0 && (
        <Field label="الإجراءات">
          <View style={s.itemsHeader}>
            <TouchableOpacity onPress={() => {
              setSelectedItems(selectedItems.length === planItems.length ? [] : planItems.map(i => i.id));
            }}>
              <Text style={s.selectAll}>
                {selectedItems.length === planItems.length ? 'إلغاء الكل' : 'تحديد الكل'}
              </Text>
            </TouchableOpacity>
          </View>
          {planItems.map(item => {
            const checked = selectedItems.includes(item.id);
            return (
              <TouchableOpacity
                key={item.id}
                style={[s.itemRow, checked && s.itemRowChecked]}
                onPress={() => toggleItem(item.id)}
              >
                <Ionicons
                  name={checked ? 'checkbox' : 'square-outline'}
                  size={20}
                  color={checked ? '#1565C0' : '#bbb'}
                />
                <Text style={s.itemText} numberOfLines={3}>
                  {item.title || item.name || `#${item.id}`}
                </Text>
              </TouchableOpacity>
            );
          })}
        </Field>
      )}

      {/* Attachments */}
      <Field label="المرفقات">
        {attachments.map((f, i) => (
          <View key={i} style={s.attachRow}>
            <Ionicons name="document-outline" size={16} color="#1565C0" />
            <Text style={s.attachName} numberOfLines={1}>{f.name}</Text>
            <TouchableOpacity onPress={() => setAttachments(prev => prev.filter((_, j) => j !== i))}>
              <Ionicons name="close-circle" size={18} color="#D32F2F" />
            </TouchableOpacity>
          </View>
        ))}
        <TouchableOpacity style={s.attachBtn} onPress={pickAttachment}>
          <Ionicons name="attach-outline" size={18} color="#1565C0" />
          <Text style={s.attachBtnText}>إضافة مرفق</Text>
        </TouchableOpacity>
      </Field>

      {/* Date */}
      <Field label="تاريخ التنفيذ *">
        <TextInput
          style={s.input}
          value={date}
          onChangeText={setDate}
          placeholder="YYYY-MM-DD"
          placeholderTextColor="#aaa"
          keyboardType="numeric"
          textAlign="right"
        />
      </Field>

      {/* Time */}
      <View style={s.timeRow}>
        <View style={{ flex: 1 }}>
          <Field label="من">
            <TextInput
              style={s.input}
              value={startTime}
              onChangeText={setStartTime}
              placeholder="HH:MM"
              placeholderTextColor="#aaa"
              keyboardType="numeric"
            />
          </Field>
        </View>
        <View style={{ flex: 1 }}>
          <Field label="إلى">
            <TextInput
              style={s.input}
              value={endTime}
              onChangeText={setEndTime}
              placeholder="HH:MM"
              placeholderTextColor="#aaa"
              keyboardType="numeric"
            />
          </Field>
        </View>
      </View>

      {/* Description */}
      <Field label="الوصف">
        <TextInput
          style={[s.input, s.textarea]}
          value={description}
          onChangeText={setDescription}
          placeholder="الوصف (اختياري)"
          placeholderTextColor="#aaa"
          multiline
          numberOfLines={3}
          textAlignVertical="top"
          textAlign="right"
        />
      </Field>

      {/* Save */}
      <TouchableOpacity style={s.saveBtn} onPress={handleSave} disabled={saving}>
        {saving
          ? <ActivityIndicator color="#fff" />
          : <>
              <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
              <Text style={s.saveBtnText}>حفظ الإجراء</Text>
            </>
        }
      </TouchableOpacity>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F5F7FA' },
  content: { padding: 16, paddingBottom: 40, gap: 4 },

  field: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '700', color: '#555', marginBottom: 6, textAlign: 'right' },

  dropBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: '#ddd', borderRadius: 10,
    backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 12,
  },
  dropVal: { fontSize: 14, color: '#1a1a1a', flex: 1, textAlign: 'right' },
  dropList: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 10,
    backgroundColor: '#fff', marginTop: 4, maxHeight: 220, overflow: 'hidden',
  },
  dropItem: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderColor: '#f5f5f5' },
  dropItemActive: { backgroundColor: '#E3F2FD' },
  dropItemText: { fontSize: 13, color: '#333', textAlign: 'right' },
  dropItemTextActive: { color: '#1565C0', fontWeight: '700' },
  dropEmpty: { padding: 12, textAlign: 'center', color: '#bbb', fontSize: 13 },

  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  loadingText: { fontSize: 13, color: '#888' },

  itemsHeader: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 6 },
  selectAll: { fontSize: 12, color: '#1565C0', fontWeight: '700' },
  itemRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, marginBottom: 4,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#eee',
  },
  itemRowChecked: { backgroundColor: '#E3F2FD', borderColor: '#BBDEFB' },
  itemText: { flex: 1, fontSize: 13, color: '#333', lineHeight: 18, textAlign: 'right' },

  attachRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#fff',
    borderRadius: 8, marginBottom: 4, borderWidth: 1, borderColor: '#eee',
  },
  attachName: { flex: 1, fontSize: 13, color: '#1565C0' },
  attachBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 8, paddingHorizontal: 12,
    borderWidth: 1.5, borderColor: '#1565C0', borderRadius: 8, borderStyle: 'dashed',
    justifyContent: 'center', marginTop: 4,
  },
  attachBtnText: { color: '#1565C0', fontSize: 13, fontWeight: '600' },

  input: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 10,
    backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: '#1a1a1a',
  },
  textarea: { minHeight: 80, textAlignVertical: 'top' },

  timeRow: { flexDirection: 'row', gap: 12 },

  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#1565C0', borderRadius: 12, padding: 16, marginTop: 8,
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
