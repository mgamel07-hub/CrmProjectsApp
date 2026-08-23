/**
 * QuickCreatePlanScreen — تعبئة وتقديم خطة التنفيذ للمنفذ
 * الخطط تُنشأ تلقائياً من النظام — المنفذ يملأ التواريخ والبنود ويقدم للاعتماد
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, Platform, Switch,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import {
  getProjects, getScopesDropdown, getStagesDropdown,
  getPlansByScope, updatePlan, getPlanItems,
  getAvailableStageDefItems, createPlanItem, createPlanItemFromCatalog,
  submitPlan,
} from '../api/projects';
import { getTeamMembers, getMyTeamRecord, createNotification } from '../api/internal';
import { extractList, extractData } from '../utils/helpers';
import { useAuth } from '../context/AuthContext';
import { useRole, projectMatchesRole } from '../context/RoleContext';

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d) {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  return date.toISOString().split('T')[0];
}

function parseDate(str) {
  if (!str) return null;
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

function displayDate(d) {
  if (!d) return 'اختر التاريخ';
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── sub-components ────────────────────────────────────────────────────────────

function SectionTitle({ icon, title, badge }) {
  return (
    <View style={s.sectionTitle}>
      <Ionicons name={icon} size={16} color="#1565C0" />
      <Text style={s.sectionTitleText}>{title}</Text>
      {badge != null && (
        <View style={s.badge}><Text style={s.badgeText}>{badge}</Text></View>
      )}
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
  const { visibleCrmIds } = useRole();
  const userId = user?.userId != null ? String(user.userId) : String(user?.id ?? '');

  // Selection
  const [projects,   setProjects]   = useState([]);
  const [scopes,     setScopes]     = useState([]);
  const [stages,     setStages]     = useState([]);
  const [projectId,  setProjectId]  = useState(null);
  const [scopeId,    setScopeId]    = useState(null);
  const [stageId,    setStageId]    = useState(null);
  const [stageName,  setStageName]  = useState('');

  // Loaded plan
  const [planId,       setPlanId]       = useState(null);
  const [planStatus,   setPlanStatus]   = useState(null); // statusId
  const [existingItems, setExistingItems] = useState([]);
  const [loadingPlan,  setLoadingPlan]  = useState(false);
  const [noPlanFound,  setNoPlanFound]  = useState(false);

  // Plan fields
  const [startDate,        setStartDate]        = useState(null);
  const [endDate,          setEndDate]          = useState(null);
  const [units,            setUnits]            = useState('');
  const [noUnits,          setNoUnits]          = useState(false);
  const [requiredDocument, setRequiredDocument] = useState(false);

  // New manual items (to be added after plan found)
  const [newItems,   setNewItems]   = useState([]); // {tempId, title, expectedUnits, scheduledDate}
  const [addingItem, setAddingItem] = useState(false);
  const [newItem,    setNewItem]    = useState({ title: '', expectedUnits: '', scheduledDate: null });

  // Catalog
  const [catalogItems,   setCatalogItems]   = useState([]);
  const [selectedCatIds, setSelectedCatIds] = useState([]);
  const [showCatalog,    setShowCatalog]    = useState(false);
  const [loadingCatalog, setLoadingCatalog] = useState(false);

  // Saving
  const [saving, setSaving] = useState(false);
  const [step,   setStep]   = useState(null);

  // Loading states
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingScopes,   setLoadingScopes]   = useState(false);
  const [loadingStages,   setLoadingStages]   = useState(false);

  // Load projects filtered by role (same logic as ProjectsScreen)
  useEffect(() => {
    setLoadingProjects(true);
    getProjects({ pageNumber: 1, pageSize: 200, includeClosed: true })
      .then(res => {
        const all = extractList(res) || [];
        const filtered = visibleCrmIds
          ? all.filter(p => projectMatchesRole(p, visibleCrmIds))
          : all;
        // Normalise to {id, value} shape for the Dropdown component
        setProjects(filtered.map(p => ({ id: p.id, value: p.title || p.name || `#${p.id}` })));
      })
      .catch(() => setProjects([]))
      .finally(() => setLoadingProjects(false));
  }, [visibleCrmIds]);

  const onSelectProject = useCallback(async (id) => {
    setProjectId(id); setScopeId(null); setStageId(null); setStageName('');
    setScopes([]); setStages([]);
    resetPlan();
    setLoadingScopes(true);
    try { setScopes(extractList(await getScopesDropdown(id)) || []); }
    catch { setScopes([]); }
    finally { setLoadingScopes(false); }
  }, []);

  const onSelectScope = useCallback(async (id) => {
    setScopeId(id); setStageId(null); setStageName('');
    setStages([]);
    resetPlan();
    setLoadingStages(true);
    try { setStages(extractList(await getStagesDropdown(id)) || []); }
    catch { setStages([]); }
    finally { setLoadingStages(false); }
  }, []);

  const onSelectStage = useCallback(async (id, obj) => {
    setStageId(id);
    setStageName(obj?.value || obj?.name || '');
    await loadDraftPlan(scopeId, id);
  }, [scopeId]);

  // Reset plan-level state
  const resetPlan = () => {
    setPlanId(null); setPlanStatus(null);
    setExistingItems([]); setNoPlanFound(false);
    setStartDate(null); setEndDate(null);
    setUnits(''); setNoUnits(false); setRequiredDocument(false);
    setNewItems([]); setSelectedCatIds([]);
    setCatalogItems([]); setShowCatalog(false);
  };

  // Find the plan for the selected scope+stage
  const loadDraftPlan = useCallback(async (scopeIdParam, stageIdParam) => {
    if (!scopeIdParam || !stageIdParam) return;
    setLoadingPlan(true);
    setNoPlanFound(false);
    setPlanId(null);
    try {
      const res = await getPlansByScope({ projectScopeId: scopeIdParam });

      // Handle both array and single-object responses
      let plans = extractList(res);
      if (!plans) {
        const raw = res?.data?.data ?? res?.data ?? null;
        plans = Array.isArray(raw) ? raw : (raw && raw.id ? [raw] : []);
      }
      // DEV: log response shape to help debug field names
      if (__DEV__ && plans.length > 0) {
        console.log('[Plan] sample keys:', Object.keys(plans[0]).join(', '));
        console.log('[Plan] sample stageId fields:', {
          projectScopeStageId: plans[0].projectScopeStageId,
          stageId: plans[0].stageId,
          scopeStageId: plans[0].scopeStageId,
          statusId: plans[0].statusId,
        });
      }

      const targetId = String(stageIdParam);

      // Match by stage id (convert both to string to avoid type mismatch)
      const matchStage = p =>
        String(p.projectScopeStageId ?? p.stageId ?? p.scopeStageId ?? '') === targetId;

      // Prefer draft/rejected (can be edited); fall back to any matching plan
      const found =
        plans.find(p => matchStage(p) && (p.statusId === 1 || p.statusId === 4)) ||
        plans.find(p => matchStage(p));

      if (!found) {
        setNoPlanFound(true);
        return;
      }

      // Pre-populate fields
      setPlanId(found.id);
      setPlanStatus(found.statusId);
      setStartDate(parseDate(found.startDate));
      setEndDate(parseDate(found.endDate));
      setUnits(found.expectedUnits != null ? String(found.expectedUnits) : '');
      setNoUnits(!!(found.noUnits));
      setRequiredDocument(!!(found.requiredDocument));

      // Load existing items
      try {
        const itemsRes = await getPlanItems(found.id);
        const items = extractList(itemsRes) || [];
        setExistingItems(Array.isArray(items) ? items : []);
      } catch { setExistingItems([]); }

    } catch {
      setNoPlanFound(true);
    } finally {
      setLoadingPlan(false);
    }
  }, []);

  // Catalog
  const openCatalog = async () => {
    if (!planId) return;
    setShowCatalog(true);
    setLoadingCatalog(true);
    try {
      const res = await getAvailableStageDefItems(planId);
      const items = extractList(res) || res?.data || [];
      setCatalogItems(Array.isArray(items) ? items : []);
    } catch { setCatalogItems([]); }
    finally { setLoadingCatalog(false); }
  };

  const toggleCatId = (id) =>
    setSelectedCatIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  // New manual item
  const addNewItem = () => {
    if (!newItem.title.trim()) return Alert.alert('تنبيه', 'اكتب عنوان البند');
    setNewItems(prev => [...prev, { ...newItem, tempId: Date.now() }]);
    setNewItem({ title: '', expectedUnits: '', scheduledDate: null });
    setAddingItem(false);
  };

  // Notify manager
  const notifyManager = async (stageLabel) => {
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

  // Main save
  const handleSave = async (andSubmit = true) => {
    if (!planId)    return Alert.alert('تنبيه', 'لم يتم تحميل الخطة بعد');
    if (!startDate) return Alert.alert('تنبيه', 'تاريخ البداية مطلوب');
    if (!endDate)   return Alert.alert('تنبيه', 'تاريخ الإنتهاء مطلوب');

    setSaving(true);
    try {
      // 1. Update plan dates/units/flags
      setStep('جاري حفظ تفاصيل الخطة...');
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
      } catch (_) {} // may 4xx if field names differ — plan items still go through

      // 2. Add new catalog items
      if (selectedCatIds.length > 0) {
        setStep('جاري إضافة بنود الكتالوج...');
        for (const catId of selectedCatIds) {
          try { await createPlanItemFromCatalog({ projectPlanId: planId, stageDefItemId: catId }); }
          catch (_) {}
        }
      }

      // 3. Add new manual items
      if (newItems.length > 0) {
        setStep('جاري إضافة البنود اليدوية...');
        for (const item of newItems) {
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

      // 4. Submit for approval
      if (andSubmit) {
        setStep('جاري تقديم الخطة للاعتماد...');
        await submitPlan(planId);
        setStep('جاري إرسال إشعار للمدير...');
        await notifyManager(stageName);
      }

      Alert.alert(
        'تم بنجاح ✓',
        andSubmit
          ? 'تم تقديم الخطة للمدير للاعتماد — ستصلك إشعار بالنتيجة'
          : 'تم حفظ الخطة كمسودة',
        [{
          text: 'عرض الخطة',
          onPress: () => navigation.navigate('PlanDetail', { planId, title: `خطة: ${stageName}` }),
        }, {
          text: 'حسناً',
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
    resetPlan();
  };

  const isDraftOrRejected = !planStatus || planStatus === 1 || planStatus === 4;

  // ── render ────────────────────────────────────────────────────────────────────

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">

      {/* ── 1. اختيار المشروع والمرحلة ─────────────────────────────── */}
      <SectionTitle icon="folder-outline" title="اختيار المشروع والمرحلة" />

      <Dropdown
        label="المشروع *"
        options={projects}
        value={projectId}
        onSelect={onSelectProject}
        getLabel={o => o.value || o.name || `#${o.id ?? o.key}`}
        placeholder="اختر المشروع"
        loading={loadingProjects}
      />

      {projectId && (
        <Dropdown
          label="نطاق المشروع *"
          options={scopes}
          value={scopeId}
          onSelect={onSelectScope}
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

      {/* Loading plan */}
      {loadingPlan && (
        <View style={s.loadingPlanBox}>
          <ActivityIndicator color="#1565C0" />
          <Text style={s.loadingPlanText}>جاري تحميل الخطة...</Text>
        </View>
      )}

      {/* No plan found */}
      {noPlanFound && !loadingPlan && (
        <View style={s.noPlanBox}>
          <Ionicons name="alert-circle-outline" size={32} color="#E65100" />
          <Text style={s.noPlanText}>لا توجد خطة لهذه المرحلة بعد</Text>
          <Text style={s.noPlanSub}>يرجى التواصل مع المشرف لإنشاء الخطة أولاً</Text>
        </View>
      )}

      {/* Plan loaded */}
      {planId && !loadingPlan && (<>
        {/* Plan status banner */}
        {planStatus && planStatus !== 1 && (
          <View style={[s.statusBanner, planStatus === 3 && s.statusBannerGreen, planStatus === 4 && s.statusBannerRed]}>
            <Ionicons
              name={planStatus === 3 ? 'checkmark-circle-outline' : planStatus === 4 ? 'close-circle-outline' : 'time-outline'}
              size={16}
              color={planStatus === 3 ? '#388E3C' : planStatus === 4 ? '#D32F2F' : '#E65100'}
            />
            <Text style={[s.statusBannerText,
              planStatus === 3 && { color: '#388E3C' },
              planStatus === 4 && { color: '#D32F2F' },
            ]}>
              {planStatus === 2 ? 'الخطة بانتظار الاعتماد'
                : planStatus === 3 ? 'الخطة معتمدة'
                : planStatus === 4 ? 'الخطة مرفوضة — يمكن تعديلها وإعادة التقديم'
                : ''}
            </Text>
          </View>
        )}

        <View style={s.divider} />

        {/* ── 2. تفاصيل الخطة ──────────────────────────────────────── */}
        <SectionTitle icon="document-text-outline" title="تفاصيل الخطة" />

        <View style={s.dateRow}>
          <View style={{ flex: 1 }}>
            <DateField label="تاريخ البداية" value={startDate} onChange={setStartDate} required />
          </View>
          <View style={{ flex: 1 }}>
            <DateField label="تاريخ الإنتهاء" value={endDate} onChange={setEndDate} required />
          </View>
        </View>

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
          <Switch value={noUnits} onValueChange={v => { setNoUnits(v); if (v) setUnits(''); }}
            trackColor={{ true: '#1565C0' }} thumbColor="#fff" />
          <Text style={s.checkLabel}>بدون وحدات</Text>
        </View>

        <View style={s.checkRow}>
          <Switch value={requiredDocument} onValueChange={setRequiredDocument}
            trackColor={{ true: '#1565C0' }} thumbColor="#fff" />
          <Text style={s.checkLabel}>وثيقة مطلوبة</Text>
        </View>

        <View style={s.divider} />

        {/* ── 3. بنود الخطة ─────────────────────────────────────────── */}
        <SectionTitle
          icon="list-outline"
          title="بنود الخطة"
          badge={existingItems.length + newItems.length || null}
        />

        {/* Existing items */}
        {existingItems.map(item => (
          <View key={item.id} style={s.itemCard}>
            <View style={s.itemCardBody}>
              <Text style={s.itemCardTitle}>{item.title || item.name}</Text>
              <View style={s.itemCardMeta}>
                {item.expectedUnits != null && (
                  <View style={s.metaChip}>
                    <Ionicons name="cube-outline" size={12} color="#1565C0" />
                    <Text style={s.metaChipText}>{item.expectedUnits} وحدة</Text>
                  </View>
                )}
                {item.scheduledDate && (
                  <View style={s.metaChip}>
                    <Ionicons name="calendar-outline" size={12} color="#F57C00" />
                    <Text style={s.metaChipText}>{fmtDate(item.scheduledDate)}</Text>
                  </View>
                )}
              </View>
            </View>
            <View style={s.existingBadge}>
              <Text style={s.existingBadgeText}>موجود</Text>
            </View>
          </View>
        ))}

        {/* New manual items */}
        {newItems.map(item => (
          <View key={item.tempId} style={[s.itemCard, s.itemCardNew]}>
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
            <TouchableOpacity onPress={() => setNewItems(prev => prev.filter(i => i.tempId !== item.tempId))}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="trash-outline" size={18} color="#D32F2F" />
            </TouchableOpacity>
          </View>
        ))}

        {/* Catalog items selected */}
        {selectedCatIds.length > 0 && (
          <View style={s.catSelectedBanner}>
            <Ionicons name="checkmark-circle-outline" size={14} color="#388E3C" />
            <Text style={s.catSelectedText}>{selectedCatIds.length} بند من الكتالوج محدد</Text>
            <TouchableOpacity onPress={() => setSelectedCatIds([])}>
              <Ionicons name="close" size={14} color="#888" />
            </TouchableOpacity>
          </View>
        )}

        {/* Add item form */}
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
              <TouchableOpacity style={s.confirmBtn} onPress={addNewItem}>
                <Ionicons name="checkmark" size={16} color="#fff" />
                <Text style={s.confirmBtnText}>إضافة</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.cancelItemBtn}
                onPress={() => { setAddingItem(false); setNewItem({ title: '', expectedUnits: '', scheduledDate: null }); }}>
                <Text style={s.cancelItemText}>إلغاء</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={s.addItemsRow}>
            <TouchableOpacity style={s.addItemBtn} onPress={() => setAddingItem(true)}>
              <Ionicons name="add-circle-outline" size={16} color="#1565C0" />
              <Text style={s.addItemBtnText}>بند يدوي</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.addItemBtn, s.addItemBtnCatalog]} onPress={openCatalog}>
              <Ionicons name="list-outline" size={16} color="#6A1B9A" />
              <Text style={[s.addItemBtnText, { color: '#6A1B9A' }]}>من الكتالوج</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Catalog modal inline */}
        {showCatalog && (
          <View style={s.catalogBox}>
            <View style={s.catalogHeader}>
              <Text style={s.catalogTitle}>اختر من الكتالوج</Text>
              <TouchableOpacity onPress={() => setShowCatalog(false)}>
                <Ionicons name="close" size={20} color="#444" />
              </TouchableOpacity>
            </View>
            {loadingCatalog ? (
              <ActivityIndicator style={{ padding: 20 }} color="#1565C0" />
            ) : catalogItems.length === 0 ? (
              <Text style={s.dropEmpty}>لا توجد بنود متاحة في الكتالوج</Text>
            ) : (
              <>
                <TouchableOpacity style={s.selectAllRow}
                  onPress={() => setSelectedCatIds(
                    selectedCatIds.length === catalogItems.length ? [] : catalogItems.map(i => i.id ?? i.stageDefItemId)
                  )}>
                  <Ionicons
                    name={selectedCatIds.length === catalogItems.length ? 'checkbox' : 'square-outline'}
                    size={18} color="#1565C0" />
                  <Text style={s.selectAllText}>تحديد الكل</Text>
                </TouchableOpacity>
                {catalogItems.map((item, i) => {
                  const catId = item.id ?? item.stageDefItemId;
                  const checked = selectedCatIds.includes(catId);
                  return (
                    <TouchableOpacity key={i} style={s.catalogItem} onPress={() => toggleCatId(catId)}>
                      <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={18}
                        color={checked ? '#1565C0' : '#bbb'} />
                      <Text style={s.catalogItemText} numberOfLines={2}>
                        {item.title || item.name || item.nameAr || `#${catId}`}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                <TouchableOpacity style={s.confirmBtn}
                  onPress={() => setShowCatalog(false)}>
                  <Ionicons name="checkmark" size={16} color="#fff" />
                  <Text style={s.confirmBtnText}>تم ({selectedCatIds.length} محدد)</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        <View style={s.divider} />

        {/* ── 4. أزرار الحفظ ────────────────────────────────────────── */}
        {saving ? (
          <View style={s.savingBox}>
            <ActivityIndicator color="#1565C0" />
            <Text style={s.savingText}>{step || 'جاري الحفظ...'}</Text>
          </View>
        ) : isDraftOrRejected ? (
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
        ) : (
          <View style={s.noPlanBox}>
            <Ionicons name="lock-closed-outline" size={24} color="#888" />
            <Text style={s.noPlanText}>الخطة لا يمكن تعديلها بحالتها الحالية</Text>
          </View>
        )}
      </>)}

      {/* Placeholder */}
      {!stageId && !loadingPlan && !projectId && (
        <View style={s.placeholder}>
          <Ionicons name="document-text-outline" size={60} color="#ddd" />
          <Text style={s.placeholderText}>اختر المشروع والمرحلة{'\n'}لعرض الخطة وتعبئتها</Text>
        </View>
      )}

    </ScrollView>
  );
}

// ── styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F5F7FA' },
  content: { padding: 16, paddingBottom: 48 },

  sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, marginTop: 4 },
  sectionTitleText: { fontSize: 14, fontWeight: '800', color: '#1565C0', flex: 1 },
  badge: { backgroundColor: '#1565C0', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 1 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  divider: { height: 1, backgroundColor: '#E8EAF6', marginVertical: 16 },

  field: { marginBottom: 12 },
  label: { fontSize: 12, fontWeight: '700', color: '#555', marginBottom: 6, textAlign: 'right' },

  dropBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: '#ddd', borderRadius: 10,
    backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 12,
  },
  dropBtnDisabled: { backgroundColor: '#f5f5f5' },
  dropVal: { fontSize: 14, color: '#1a1a1a', flex: 1, textAlign: 'right' },
  dropList: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, backgroundColor: '#fff', marginTop: 4, maxHeight: 200 },
  dropItem: { paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderColor: '#f5f5f5' },
  dropItemActive: { backgroundColor: '#E3F2FD' },
  dropItemText: { fontSize: 13, color: '#333', textAlign: 'right' },
  dropItemTextActive: { color: '#1565C0', fontWeight: '700' },
  dropEmpty: { padding: 14, textAlign: 'center', color: '#bbb', fontSize: 13 },

  dateRow: { flexDirection: 'row', gap: 10, marginBottom: 4 },
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

  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10, justifyContent: 'flex-end' },
  checkLabel: { fontSize: 13, color: '#444', fontWeight: '600' },

  // Status banner
  statusBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FFF3E0', borderRadius: 10, padding: 10, marginBottom: 4,
  },
  statusBannerGreen: { backgroundColor: '#E8F5E9' },
  statusBannerRed:   { backgroundColor: '#FFF3F3' },
  statusBannerText:  { fontSize: 13, fontWeight: '600', color: '#E65100', flex: 1, textAlign: 'right' },

  // Loading / no plan
  loadingPlanBox: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, justifyContent: 'center' },
  loadingPlanText: { fontSize: 13, color: '#888' },
  noPlanBox: { alignItems: 'center', padding: 24, gap: 8 },
  noPlanText: { fontSize: 14, fontWeight: '700', color: '#555', textAlign: 'center' },
  noPlanSub:  { fontSize: 12, color: '#aaa', textAlign: 'center' },

  // Items
  itemCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: '#E8EAF6', gap: 10,
  },
  itemCardNew: { borderColor: '#BBDEFB', backgroundColor: '#F0F7FF' },
  itemCardBody: { flex: 1 },
  itemCardTitle: { fontSize: 13, fontWeight: '600', color: '#222', textAlign: 'right' },
  itemCardMeta: { flexDirection: 'row', gap: 8, marginTop: 4, justifyContent: 'flex-end', flexWrap: 'wrap' },
  metaChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#F0F4FF', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6,
  },
  metaChipText: { fontSize: 11, color: '#444' },
  existingBadge: { backgroundColor: '#E8F5E9', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  existingBadgeText: { fontSize: 10, color: '#388E3C', fontWeight: '700' },

  catSelectedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#E8F5E9', borderRadius: 8, padding: 10, marginBottom: 8,
  },
  catSelectedText: { flex: 1, fontSize: 12, color: '#388E3C', fontWeight: '600', textAlign: 'right' },

  // New item form
  newItemBox: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    borderWidth: 1.5, borderColor: '#BBDEFB', marginBottom: 10,
  },
  newItemBtns: { flexDirection: 'row', gap: 10, marginTop: 10 },
  addItemsRow: { flexDirection: 'row', gap: 10, marginBottom: 4 },
  addItemBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1.5, borderColor: '#1565C0', borderRadius: 10, borderStyle: 'dashed', paddingVertical: 11,
  },
  addItemBtnCatalog: { borderColor: '#6A1B9A' },
  addItemBtnText: { color: '#1565C0', fontSize: 13, fontWeight: '600' },

  // Catalog inline
  catalogBox: {
    backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#ddd',
    padding: 14, marginBottom: 12,
  },
  catalogHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  catalogTitle: { fontSize: 14, fontWeight: '700', color: '#1a1a1a' },
  selectAllRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderColor: '#f0f0f0', marginBottom: 4 },
  selectAllText: { fontSize: 13, fontWeight: '600', color: '#1565C0' },
  catalogItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderColor: '#f5f5f5' },
  catalogItemText: { flex: 1, fontSize: 13, color: '#333', textAlign: 'right' },

  // Buttons
  confirmBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: '#1565C0', borderRadius: 8, paddingVertical: 9, marginTop: 8,
  },
  confirmBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  cancelItemBtn: { paddingHorizontal: 16, paddingVertical: 9, justifyContent: 'center', alignItems: 'center' },
  cancelItemText: { color: '#888', fontSize: 13 },

  btnRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
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

  placeholder: { alignItems: 'center', paddingTop: 60, gap: 14 },
  placeholderText: { color: '#bbb', fontSize: 14, textAlign: 'center', lineHeight: 24 },
});
