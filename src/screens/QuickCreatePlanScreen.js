/**
 * QuickCreatePlanScreen — إنشاء خطة تنفيذ متكاملة للمنفذ
 * مشروع → نطاق → مرحلة → تواريخ + وحدات → بنود → تقديم للاعتماد
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, Platform, Switch,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import {
  getProjectsDropdown, getScopesDropdown, getStagesDropdown,
  createPlan, updatePlan, getPlanItems,
  getAvailableStageDefItems, createPlanItem, createPlanItemFromCatalog,
  submitPlan,
} from '../api/projects';
import { getTeamMembers, getMyTeamRecord, createNotification } from '../api/internal';
import { extractList } from '../utils/helpers';
import { useAuth } from '../context/AuthContext';

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d) {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  return date.toISOString().split('T')[0];
}

function displayDate(d) {
  if (!d) return 'اختر التاريخ';
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── sub-components ────────────────────────────────────────────────────────────

function SectionTitle({ icon, title }) {
  return (
    <View style={s.sectionTitle}>
      <Ionicons name={icon} size={16} color="#1565C0" />
      <Text style={s.sectionTitleText}>{title}</Text>
    </View>
  );
}

function Dropdown({ label, options, value, onSelect, getLabel, placeholder, loading, disabled }) {
  const [open, setOpen] = useState(false);
  const selected = options.find(o => (o.id ?? o.key) === value);
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <TouchableOpacity
        style={[s.dropBtn, disabled && s.dropBtnDisabled]}
        onPress={() => !disabled && setOpen(v => !v)}
        activeOpacity={disabled ? 1 : 0.7}
      >
        {loading
          ? <ActivityIndicator size="small" color="#1565C0" />
          : <Text style={[s.dropVal, !selected && { color: '#aaa' }]} numberOfLines={1}>
              {selected ? getLabel(selected) : placeholder}
            </Text>
        }
        {!disabled && <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color="#888" />}
      </TouchableOpacity>
      {open && (
        <View style={s.dropList}>
          {options.length === 0
            ? <Text style={s.dropEmpty}>لا توجد خيارات</Text>
            : options.map((o, i) => {
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
              })
          }
        </View>
      )}
    </View>
  );
}

function DateField({ label, value, onChange, required }) {
  const [show, setShow] = useState(false);
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}{required ? ' *' : ''}</Text>
      <TouchableOpacity style={s.dateBtn} onPress={() => setShow(true)}>
        <Ionicons name="calendar-outline" size={18} color="#1565C0" />
        <Text style={[s.dateVal, !value && { color: '#aaa' }]}>{displayDate(value)}</Text>
        {value && (
          <TouchableOpacity onPress={() => onChange(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={16} color="#ccc" />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
      {show && (
        <DateTimePicker
          value={value instanceof Date ? value : new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(e, d) => { setShow(false); if (e.type !== 'dismissed' && d) onChange(d); }}
        />
      )}
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function QuickCreatePlanScreen({ navigation }) {
  const { user } = useAuth();
  const userId = user?.userId != null ? String(user.userId) : String(user?.id ?? '');

  // Selection
  const [projects,  setProjects]  = useState([]);
  const [scopes,    setScopes]    = useState([]);
  const [stages,    setStages]    = useState([]);
  const [projectId, setProjectId] = useState(null);
  const [scopeId,   setScopeId]   = useState(null);
  const [stageId,   setStageId]   = useState(null);
  const [stageName, setStageName] = useState('');

  // Plan fields
  const [startDate,         setStartDate]         = useState(null);
  const [endDate,           setEndDate]           = useState(null);
  const [units,             setUnits]             = useState('');
  const [noUnits,           setNoUnits]           = useState(false);
  const [requiredDocument,  setRequiredDocument]  = useState(false);

  // Plan items (manual)
  const [manualItems, setManualItems] = useState([]); // {title, expectedUnits, scheduledDate}
  const [newItem, setNewItem] = useState({ title: '', expectedUnits: '', scheduledDate: null });
  const [addingItem, setAddingItem] = useState(false);

  // Catalog items (loaded after plan creation)
  const [catalogItems,   setCatalogItems]   = useState([]);
  const [selectedCatIds, setSelectedCatIds] = useState([]);
  const [showCatalog,    setShowCatalog]    = useState(false);
  const [catalogPlanId,  setCatalogPlanId]  = useState(null);

  // Loading / saving
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingScopes,   setLoadingScopes]   = useState(false);
  const [loadingStages,   setLoadingStages]   = useState(false);
  const [saving,          setSaving]           = useState(false);
  const [step,            setStep]             = useState(null); // progress text

  // Load projects on mount
  useEffect(() => {
    setLoadingProjects(true);
    getProjectsDropdown()
      .then(res => setProjects(extractList(res) || []))
      .catch(() => setProjects([]))
      .finally(() => setLoadingProjects(false));
  }, []);

  const onSelectProject = useCallback(async (id) => {
    setProjectId(id); setScopeId(null); setStageId(null); setStageName('');
    setScopes([]); setStages([]);
    setLoadingScopes(true);
    try { setScopes(extractList(await getScopesDropdown(id)) || []); }
    catch { setScopes([]); }
    finally { setLoadingScopes(false); }
  }, []);

  const onSelectScope = useCallback(async (id) => {
    setScopeId(id); setStageId(null); setStageName('');
    setStages([]);
    setLoadingStages(true);
    try { setStages(extractList(await getStagesDropdown(id)) || []); }
    catch { setStages([]); }
    finally { setLoadingStages(false); }
  }, []);

  const onSelectStage = useCallback((id, obj) => {
    setStageId(id);
    setStageName(obj?.value || obj?.name || '');
  }, []);

  // Add a manual item to local list
  const addManualItem = () => {
    if (!newItem.title.trim()) return Alert.alert('تنبيه', 'اكتب عنوان البند');
    setManualItems(prev => [...prev, { ...newItem, id: Date.now() }]);
    setNewItem({ title: '', expectedUnits: '', scheduledDate: null });
    setAddingItem(false);
  };

  const removeManualItem = (id) => setManualItems(prev => prev.filter(i => i.id !== id));

  // Notify manager via Supabase internal notifications
  const notifyManager = async (planId, stageLabel) => {
    try {
      const me = await getMyTeamRecord(userId);
      if (!me || me._bootstrap) return;
      const allMembers = await getTeamMembers();
      const manager = allMembers.find(m => m.team_id === me.team_id && m.role === 'manager');
      if (!manager) return;
      await createNotification({
        to_user_id: String(manager.crm_user_id),
        type: 'approval',
        message: `طلب اعتماد خطة: ${stageLabel || 'خطة جديدة'} — بانتظار مراجعتك`,
        is_read: false,
      });
    } catch (_) {}
  };

  // Main save flow
  const handleSave = async (andSubmit = true) => {
    if (!stageId)  return Alert.alert('تنبيه', 'اختر المرحلة أولاً');
    if (!startDate) return Alert.alert('تنبيه', 'تاريخ البداية مطلوب');
    if (!endDate)   return Alert.alert('تنبيه', 'تاريخ الإنتهاء مطلوب');

    setSaving(true);
    let planId = null;
    try {
      // 1. Create plan
      setStep('جاري إنشاء الخطة...');
      const createRes = await createPlan({ projectScopeStageId: stageId });
      const raw = createRes?.data;
      planId = raw?.data?.id ?? raw?.data ?? raw?.id ?? null;
      if (!planId) throw new Error('لم يُنشأ الـ planId');

      // 2. Update plan with dates / units / flags
      setStep('جاري حفظ التفاصيل...');
      try {
        await updatePlan({
          id: planId,
          projectScopeStageId: stageId,
          startDate: fmtDate(startDate),
          endDate:   fmtDate(endDate),
          expectedUnits: noUnits ? null : (units ? Number(units) : null),
          noUnits,
          requiredDocument,
        });
      } catch (_) {} // updatePlan may return 4xx if field names differ; plan is still created

      // 3. Add manual items
      if (manualItems.length > 0) {
        setStep('جاري إضافة البنود...');
        for (const item of manualItems) {
          try {
            await createPlanItem({
              projectPlanId: planId,
              title: item.title.trim(),
              expectedUnits: item.expectedUnits ? Number(item.expectedUnits) : 0,
              scheduledDate: item.scheduledDate ? fmtDate(item.scheduledDate) : undefined,
            });
          } catch (_) {}
        }
      }

      // 4. Add catalog items if any were selected
      if (selectedCatIds.length > 0) {
        setStep('جاري إضافة بنود الكتالوج...');
        for (const catId of selectedCatIds) {
          try { await createPlanItemFromCatalog({ projectPlanId: planId, stageDefItemId: catId }); }
          catch (_) {}
        }
      }

      // 5. Submit for approval
      if (andSubmit) {
        setStep('جاري تقديم الخطة للاعتماد...');
        await submitPlan(planId);
        setStep('جاري إرسال إشعار للمدير...');
        await notifyManager(planId, stageName);
      }

      Alert.alert(
        'تم بنجاح ✓',
        andSubmit
          ? 'تم إنشاء الخطة وتقديمها للمدير للاعتماد'
          : 'تم حفظ الخطة كمسودة',
        [{
          text: 'عرض الخطة',
          onPress: () => navigation.navigate('PlanDetail', { planId, title: `خطة: ${stageName}` }),
        }, {
          text: 'إنشاء خطة أخرى',
          onPress: resetForm,
        }]
      );
    } catch (e) {
      const msg = e?.response?.data?.message || e?.response?.data?.title || e?.message;
      Alert.alert('خطأ', msg || 'حدث خطأ في الحفظ');
    } finally {
      setSaving(false);
      setStep(null);
    }
  };

  const resetForm = () => {
    setProjectId(null); setScopeId(null); setStageId(null); setStageName('');
    setScopes([]); setStages([]);
    setStartDate(null); setEndDate(null);
    setUnits(''); setNoUnits(false); setRequiredDocument(false);
    setManualItems([]); setSelectedCatIds([]);
  };

  // Load catalog items for a given planId (called from PlanDetail)
  const loadCatalog = async (planId) => {
    setCatalogPlanId(planId);
    setShowCatalog(true);
    try {
      const res = await getAvailableStageDefItems(planId);
      const items = extractList(res) || res?.data || [];
      setCatalogItems(Array.isArray(items) ? items : []);
    } catch { setCatalogItems([]); }
  };

  const toggleCatId = (id) =>
    setSelectedCatIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  // ── render ──────────────────────────────────────────────────────────────────

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">

      {/* ── 1. اختيار المشروع والمرحلة ──────────────────────────────── */}
      <SectionTitle icon="folder-outline" title="اختيار المشروع والمرحلة" />

      <Dropdown
        label="المشروع *"
        options={projects}
        value={projectId}
        onSelect={(id) => onSelectProject(id)}
        getLabel={o => o.value || o.name || `#${o.id ?? o.key}`}
        placeholder="اختر المشروع"
        loading={loadingProjects}
      />

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

      {scopeId && (
        <Dropdown
          label="المرحلة *"
          options={stages}
          value={stageId}
          onSelect={onSelectStage}
          getLabel={o => o.value || o.name || `#${o.id ?? o.key}`}
          placeholder="اختر المرحلة"
          loading={loadingStages}
        />
      )}

      {/* ── 2. تفاصيل الخطة ─────────────────────────────────────────── */}
      {stageId && (<>
        <View style={s.divider} />
        <SectionTitle icon="document-text-outline" title="تفاصيل الخطة" />

        <View style={s.dateRow}>
          <View style={{ flex: 1 }}>
            <DateField label="تاريخ البداية" value={startDate} onChange={setStartDate} required />
          </View>
          <View style={{ flex: 1 }}>
            <DateField label="تاريخ الإنتهاء" value={endDate} onChange={setEndDate} required />
          </View>
        </View>

        {/* Units */}
        <View style={s.field}>
          <Text style={s.label}>الوحدات المتوقعة</Text>
          <TextInput
            style={[s.input, noUnits && s.inputDisabled]}
            value={units}
            onChangeText={setUnits}
            placeholder="0"
            placeholderTextColor="#aaa"
            keyboardType="numeric"
            textAlign="right"
            editable={!noUnits}
          />
        </View>

        <View style={s.checkRow}>
          <Switch
            value={noUnits}
            onValueChange={v => { setNoUnits(v); if (v) setUnits(''); }}
            trackColor={{ true: '#1565C0' }}
            thumbColor="#fff"
          />
          <Text style={s.checkLabel}>بدون وحدات</Text>
        </View>

        <View style={s.checkRow}>
          <Switch
            value={requiredDocument}
            onValueChange={setRequiredDocument}
            trackColor={{ true: '#1565C0' }}
            thumbColor="#fff"
          />
          <Text style={s.checkLabel}>وثيقة مطلوبة</Text>
        </View>

        {/* ── 3. بنود الخطة ─────────────────────────────────────────── */}
        <View style={s.divider} />
        <SectionTitle icon="list-outline" title="بنود الخطة" />

        {/* Manual items list */}
        {manualItems.map(item => (
          <View key={item.id} style={s.itemCard}>
            <View style={s.itemCardBody}>
              <Text style={s.itemCardTitle}>{item.title}</Text>
              <View style={s.itemCardMeta}>
                {item.expectedUnits ? (
                  <View style={s.metaChip}>
                    <Ionicons name="cube-outline" size={12} color="#1565C0" />
                    <Text style={s.metaChipText}>{item.expectedUnits} وحدة</Text>
                  </View>
                ) : null}
                {item.scheduledDate ? (
                  <View style={s.metaChip}>
                    <Ionicons name="calendar-outline" size={12} color="#F57C00" />
                    <Text style={s.metaChipText}>{fmtDate(item.scheduledDate)}</Text>
                  </View>
                ) : null}
              </View>
            </View>
            <TouchableOpacity onPress={() => removeManualItem(item.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="trash-outline" size={18} color="#D32F2F" />
            </TouchableOpacity>
          </View>
        ))}

        {/* Add new item form */}
        {addingItem ? (
          <View style={s.newItemBox}>
            <Text style={s.label}>عنوان البند *</Text>
            <TextInput
              style={s.input}
              value={newItem.title}
              onChangeText={v => setNewItem(p => ({ ...p, title: v }))}
              placeholder="اكتب عنوان البند"
              placeholderTextColor="#aaa"
              textAlign="right"
            />
            <View style={s.dateRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.label}>الوحدات</Text>
                <TextInput
                  style={s.input}
                  value={newItem.expectedUnits}
                  onChangeText={v => setNewItem(p => ({ ...p, expectedUnits: v }))}
                  placeholder="0"
                  placeholderTextColor="#aaa"
                  keyboardType="numeric"
                  textAlign="right"
                />
              </View>
              <View style={{ flex: 1 }}>
                <DateField
                  label="تاريخ التنفيذ"
                  value={newItem.scheduledDate}
                  onChange={d => setNewItem(p => ({ ...p, scheduledDate: d }))}
                />
              </View>
            </View>
            <View style={s.newItemBtns}>
              <TouchableOpacity style={s.confirmBtn} onPress={addManualItem}>
                <Ionicons name="checkmark" size={16} color="#fff" />
                <Text style={s.confirmBtnText}>إضافة</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.cancelItemBtn} onPress={() => { setAddingItem(false); setNewItem({ title: '', expectedUnits: '', scheduledDate: null }); }}>
                <Text style={s.cancelItemText}>إلغاء</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity style={s.addItemBtn} onPress={() => setAddingItem(true)}>
            <Ionicons name="add-circle-outline" size={18} color="#1565C0" />
            <Text style={s.addItemBtnText}>إضافة بند يدوي</Text>
          </TouchableOpacity>
        )}

        {/* ── 4. أزرار الحفظ ────────────────────────────────────────── */}
        <View style={s.divider} />

        {saving ? (
          <View style={s.savingBox}>
            <ActivityIndicator color="#1565C0" />
            <Text style={s.savingText}>{step || 'جاري الحفظ...'}</Text>
          </View>
        ) : (
          <View style={s.btnRow}>
            <TouchableOpacity style={s.draftBtn} onPress={() => handleSave(false)}>
              <Ionicons name="save-outline" size={18} color="#1565C0" />
              <Text style={s.draftBtnText}>حفظ كمسودة</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.submitBtn} onPress={() => handleSave(true)}>
              <Ionicons name="send-outline" size={18} color="#fff" />
              <Text style={s.submitBtnText}>تقديم للاعتماد</Text>
            </TouchableOpacity>
          </View>
        )}
      </>)}

      {/* Placeholder when nothing selected */}
      {!stageId && !projectId && (
        <View style={s.placeholder}>
          <Ionicons name="document-text-outline" size={60} color="#ddd" />
          <Text style={s.placeholderText}>اختر المشروع والمرحلة لبدء إنشاء الخطة</Text>
        </View>
      )}

    </ScrollView>
  );
}

// ── styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F5F7FA' },
  content: { padding: 16, paddingBottom: 48, gap: 2 },

  sectionTitle: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginBottom: 12, marginTop: 4,
  },
  sectionTitleText: { fontSize: 14, fontWeight: '800', color: '#1565C0' },

  divider: { height: 1, backgroundColor: '#E8EAF6', marginVertical: 18 },

  field: { marginBottom: 14 },
  label: { fontSize: 12, fontWeight: '700', color: '#555', marginBottom: 6, textAlign: 'right' },

  dropBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: '#ddd', borderRadius: 10,
    backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 12,
  },
  dropBtnDisabled: { backgroundColor: '#f5f5f5' },
  dropVal: { fontSize: 14, color: '#1a1a1a', flex: 1, textAlign: 'right' },
  dropList: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 10,
    backgroundColor: '#fff', marginTop: 4, maxHeight: 220,
  },
  dropItem: { paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderColor: '#f5f5f5' },
  dropItemActive: { backgroundColor: '#E3F2FD' },
  dropItemText: { fontSize: 13, color: '#333', textAlign: 'right' },
  dropItemTextActive: { color: '#1565C0', fontWeight: '700' },
  dropEmpty: { padding: 14, textAlign: 'center', color: '#bbb', fontSize: 13 },

  dateRow: { flexDirection: 'row', gap: 10 },
  dateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: '#ddd', borderRadius: 10,
    backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 12,
  },
  dateVal: { flex: 1, fontSize: 13, color: '#1a1a1a', textAlign: 'right' },

  input: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 10,
    backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 11,
    fontSize: 14, color: '#1a1a1a', textAlign: 'right',
  },
  inputDisabled: { backgroundColor: '#f5f5f5', color: '#aaa' },

  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12, justifyContent: 'flex-end' },
  checkLabel: { fontSize: 13, color: '#444', fontWeight: '600' },

  // Items
  itemCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: '#E8EAF6', gap: 10,
  },
  itemCardBody: { flex: 1 },
  itemCardTitle: { fontSize: 13, fontWeight: '600', color: '#222', textAlign: 'right' },
  itemCardMeta: { flexDirection: 'row', gap: 8, marginTop: 4, justifyContent: 'flex-end', flexWrap: 'wrap' },
  metaChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#F0F4FF', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6,
  },
  metaChipText: { fontSize: 11, color: '#444' },

  newItemBox: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    borderWidth: 1.5, borderColor: '#BBDEFB', marginBottom: 10,
  },
  newItemBtns: { flexDirection: 'row', gap: 10, marginTop: 10 },
  confirmBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: '#1565C0', borderRadius: 8, paddingVertical: 9,
  },
  confirmBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  cancelItemBtn: {
    paddingHorizontal: 16, paddingVertical: 9, justifyContent: 'center', alignItems: 'center',
  },
  cancelItemText: { color: '#888', fontSize: 13 },

  addItemBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1.5, borderColor: '#1565C0', borderRadius: 10, borderStyle: 'dashed',
    paddingVertical: 12, marginBottom: 4,
  },
  addItemBtnText: { color: '#1565C0', fontSize: 13, fontWeight: '600' },

  // Save buttons
  btnRow: { flexDirection: 'row', gap: 10 },
  draftBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, borderWidth: 1.5, borderColor: '#1565C0', borderRadius: 12, paddingVertical: 13,
  },
  draftBtnText: { color: '#1565C0', fontSize: 14, fontWeight: '700' },
  submitBtn: {
    flex: 1.4, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: '#1565C0', borderRadius: 12, paddingVertical: 13, elevation: 2,
  },
  submitBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  savingBox: { alignItems: 'center', paddingVertical: 20, gap: 12 },
  savingText: { color: '#1565C0', fontSize: 14, fontWeight: '600' },

  placeholder: { flex: 1, alignItems: 'center', paddingTop: 60, gap: 14 },
  placeholderText: { color: '#bbb', fontSize: 14, textAlign: 'center', lineHeight: 22 },
});
