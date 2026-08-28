/**
 * QuickExecutionScreen — إضافة تنفيذ (إجراء) بسرعة + توليد نموذج تدريب PDF
 */
import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
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

// ── Location Radio ────────────────────────────────────────────────────────────
const LOCATIONS = [
  { id: 1, label: 'مقر العميل' },
  { id: 2, label: 'أونلاين'    },
  { id: 3, label: 'الشركة'     },
];

function LocationPicker({ value, onChange }) {
  return (
    <Field label="مكان الزيارة">
      <View style={s.radioRow}>
        {LOCATIONS.map(loc => (
          <TouchableOpacity
            key={loc.id}
            style={[s.radioBtn, value === loc.id && s.radioBtnActive]}
            onPress={() => onChange(loc.id)}
          >
            <Ionicons
              name={value === loc.id ? 'radio-button-on' : 'radio-button-off'}
              size={18}
              color={value === loc.id ? '#1565C0' : '#aaa'}
            />
            <Text style={[s.radioLabel, value === loc.id && s.radioLabelActive]}>
              {loc.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </Field>
  );
}

// ── Trainees List ─────────────────────────────────────────────────────────────
function TraineesList({ trainees, onChange }) {
  const addTrainee = () => onChange([...trainees, { name: '', job: '' }]);
  const removeTrainee = (i) => onChange(trainees.filter((_, j) => j !== i));
  const update = (i, field, val) => {
    const copy = trainees.map((t, j) => j === i ? { ...t, [field]: val } : t);
    onChange(copy);
  };
  return (
    <Field label="المتدربون">
      {trainees.map((t, i) => (
        <View key={i} style={s.traineeRow}>
          <TextInput
            style={[s.input, { flex: 2, marginBottom: 0 }]}
            placeholder="الاسم"
            placeholderTextColor="#aaa"
            value={t.name}
            onChangeText={v => update(i, 'name', v)}
            textAlign="right"
          />
          <TextInput
            style={[s.input, { flex: 1.5, marginBottom: 0 }]}
            placeholder="الوظيفة"
            placeholderTextColor="#aaa"
            value={t.job}
            onChangeText={v => update(i, 'job', v)}
            textAlign="right"
          />
          <TouchableOpacity onPress={() => removeTrainee(i)} style={s.removeBtn}>
            <Ionicons name="close-circle" size={22} color="#D32F2F" />
          </TouchableOpacity>
        </View>
      ))}
      <TouchableOpacity style={s.attachBtn} onPress={addTrainee}>
        <Ionicons name="person-add-outline" size={18} color="#1565C0" />
        <Text style={s.attachBtnText}>إضافة متدرب</Text>
      </TouchableOpacity>
    </Field>
  );
}

// ── PDF HTML Template ─────────────────────────────────────────────────────────
function buildTrainingFormHtml({ clientName, systemName, date, startTime, endTime, location, planItems, selectedItems, trainees, trainerNotes, clientNotes }) {
  const selectedItemObjects = planItems.filter(i => selectedItems.includes(i.id));
  const locationLabel = LOCATIONS.find(l => l.id === location)?.label || '';

  const itemRows = selectedItemObjects.length > 0
    ? selectedItemObjects.map(item => `
        <tr>
          <td>${item.title || item.name || ''}</td>
          <td></td>
          <td></td>
        </tr>`).join('')
    : Array(4).fill('<tr><td></td><td></td><td></td></tr>').join('');

  const traineeRows = trainees.length > 0
    ? trainees.map(t => `
        <tr>
          <td>${t.name || ''}</td>
          <td>${t.job || ''}</td>
          <td></td>
        </tr>`).join('')
    : Array(5).fill('<tr><td></td><td></td><td></td></tr>').join('');

  const locClient  = location === 1 ? '☑' : '☐';
  const locOnline  = location === 2 ? '☑' : '☐';
  const locCompany = location === 3 ? '☑' : '☐';

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8"/>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Cairo', Arial, sans-serif; font-size: 12px; color: #000; direction: rtl; padding: 20px; }
  .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
  .header img { height: 50px; }
  h2 { text-align: center; background: #003366; color: #fff; padding: 8px; font-size: 16px; margin-bottom: 10px; border-radius: 4px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  th, td { border: 1px solid #333; padding: 6px 8px; text-align: right; }
  th { background: #E8EAF6; font-weight: 700; }
  .section-title { font-weight: 700; text-align: center; background: #F5F5F5; padding: 6px; border: 1px solid #333; margin-bottom: 0; }
  .notes-box { border: 1px solid #333; min-height: 60px; padding: 8px; margin-bottom: 12px; }
  .sig-table td { height: 60px; vertical-align: top; }
  .footer { text-align: center; font-size: 10px; color: #666; margin-top: 20px; border-top: 1px solid #ccc; padding-top: 8px; }
  .checkbox-row { display: flex; gap: 20px; align-items: center; }
</style>
</head>
<body>

<div class="header">
  <div style="font-size:20px; font-weight:700; color:#003366;">ULTIMATE<br/><span style="font-size:11px; font-weight:400;">SOLUTIONS</span></div>
  <div style="text-align:left; font-size:18px; font-weight:700; color:#003366;">قوة الثقة<br/><span style="font-size:11px;">Absolute Trust</span></div>
</div>

<h2>بيانات زيارة تدريب</h2>

<table>
  <tr>
    <th style="width:15%">اسم العميل</th>
    <td style="width:35%">${clientName || ''}</td>
    <th style="width:15%">اسم النظام</th>
    <td style="width:35%">${systemName || ''}</td>
  </tr>
  <tr>
    <th>تاريخ الزيارة</th>
    <td>${date || ''}</td>
    <th>الوقت</th>
    <td>من: ${startTime || '........'} &nbsp;&nbsp; إلى: ${endTime || '........'}</td>
  </tr>
  <tr>
    <th>مكان الزيارة</th>
    <td colspan="3">
      ${locClient} مقر العميل &nbsp;&nbsp;&nbsp;
      ${locOnline} أونلاين &nbsp;&nbsp;&nbsp;
      ${locCompany} الشركة
    </td>
  </tr>
</table>

<div class="section-title">أسماء الشاشات والتقارير التي تم التدريب عليها</div>
<table>
  <tr><th>الشاشة / التقرير</th><th>ملاحظات</th><th>تم التدريب</th></tr>
  ${itemRows}
</table>

<div class="section-title">المتدربون</div>
<table>
  <tr><th>اسم المتدرب</th><th>الوظيفة</th><th>الامضاء</th></tr>
  ${traineeRows}
</table>

<div class="section-title" style="margin-top:12px">ملاحظات المدرب</div>
<div class="notes-box">${trainerNotes || ''}</div>

<div class="section-title">ملاحظات العميل</div>
<div class="notes-box">${clientNotes || ''}</div>

<table class="sig-table" style="margin-top:16px">
  <tr>
    <th style="width:33%">مدير المشروع (العميل)</th>
    <th style="width:33%">المدرب (الحلول النهائية)</th>
    <th style="width:33%">مدير الفريق (الحلول النهائية)</th>
  </tr>
  <tr>
    <td></td>
    <td></td>
    <td></td>
  </tr>
</table>

<div class="footer">
  الرئيسي: 40 محي الدين أبو العز، الدقي، الجيزة &nbsp;|&nbsp;
  (+2) 02 374 89 333 &nbsp;|&nbsp;
  www.ultimate-erp.com
</div>

</body>
</html>`;
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function QuickExecutionScreen({ navigation }) {
  const [projects,     setProjects]     = useState([]);
  const [scopes,       setScopes]       = useState([]);
  const [stages,       setStages]       = useState([]);
  const [plans,        setPlans]        = useState([]);
  const [planItems,    setPlanItems]    = useState([]);
  const [selectedItems, setSelectedItems] = useState([]);

  const [projectId,   setProjectId]   = useState(null);
  const [projectName, setProjectName] = useState('');
  const [scopeId,     setScopeId]     = useState(null);
  const [scopeName,   setScopeName]   = useState('');
  const [stageId,     setStageId]     = useState(null);
  const [planId,      setPlanId]      = useState(null);

  const [date,        setDate]        = useState('');
  const [startTime,   setStartTime]   = useState('');
  const [endTime,     setEndTime]     = useState('');
  const [location,    setLocation]    = useState(1);
  const [description, setDescription] = useState('');
  const [clientNotes, setClientNotes] = useState('');
  const [trainees,    setTrainees]    = useState([{ name: '', job: '' }]);
  const [attachments, setAttachments] = useState([]);

  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingScopes,   setLoadingScopes]   = useState(false);
  const [loadingStages,   setLoadingStages]   = useState(false);
  const [loadingPlans,    setLoadingPlans]     = useState(false);
  const [loadingItems,    setLoadingItems]     = useState(false);
  const [saving,          setSaving]           = useState(false);
  const [generatingPdf,   setGeneratingPdf]   = useState(false);

  // Load projects on mount
  React.useEffect(() => {
    setLoadingProjects(true);
    getProjectsDropdown()
      .then(res => setProjects(extractList(res) || []))
      .catch(() => setProjects([]))
      .finally(() => setLoadingProjects(false));
  }, []);

  const onSelectProject = useCallback(async (id, obj) => {
    setProjectId(id);
    setProjectName(obj?.value || obj?.name || '');
    setScopeId(null); setScopeName(''); setStageId(null); setPlanId(null);
    setScopes([]); setStages([]); setPlans([]); setPlanItems([]); setSelectedItems([]);
    setLoadingScopes(true);
    try {
      const res = await getScopesDropdown(id);
      setScopes(extractList(res) || []);
    } catch { setScopes([]); }
    finally { setLoadingScopes(false); }
  }, []);

  const onSelectScope = useCallback(async (id, obj) => {
    setScopeId(id);
    setScopeName(obj?.value || obj?.name || '');
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

      Alert.alert('تم ✓', 'تم حفظ الإجراء بنجاح', [
        { text: 'إنشاء نموذج التدريب', onPress: handleGeneratePdf },
        { text: 'إغلاق', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      const msg = e?.response?.data?.message || e?.response?.data?.title || e?.message;
      Alert.alert('خطأ', msg || 'حدث خطأ في الحفظ');
    } finally {
      setSaving(false);
    }
  };

  const handleGeneratePdf = async () => {
    setGeneratingPdf(true);
    try {
      const html = buildTrainingFormHtml({
        clientName:   projectName,
        systemName:   scopeName,
        date,
        startTime,
        endTime,
        location,
        planItems,
        selectedItems,
        trainees:     trainees.filter(t => t.name.trim()),
        trainerNotes: description,
        clientNotes,
      });
      const fileUri = FileSystem.documentDirectory + 'training_form.html';
      await FileSystem.writeAsStringAsync(fileUri, html, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      const Sharing = await import('expo-sharing');
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'text/html',
          dialogTitle: 'نموذج تدريب',
          UTI: 'public.html',
        });
      } else {
        Alert.alert('تم', 'تم إنشاء النموذج بنجاح');
      }
    } catch (e) {
      Alert.alert('خطأ', 'فشل إنشاء النموذج: ' + (e?.message || ''));
    } finally {
      setGeneratingPdf(false);
    }
  };

  const toggleItem = (id) => {
    setSelectedItems(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">

      {/* Project */}
      <Dropdown
        label="المشروع / اسم العميل *"
        options={projects}
        value={projectId}
        onSelect={(id, o) => onSelectProject(id, o)}
        getLabel={o => o.value || o.name || `#${o.id ?? o.key}`}
        placeholder="اختر المشروع"
        loading={loadingProjects}
      />

      {/* Scope (= System Name) */}
      {projectId && (
        <Dropdown
          label="نطاق المشروع / اسم النظام *"
          options={scopes}
          value={scopeId}
          onSelect={(id, o) => onSelectScope(id, o)}
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

      {/* Location */}
      <LocationPicker value={location} onChange={setLocation} />

      {/* إجراءات (Plan Items) = الشاشات والتقارير */}
      {loadingItems && (
        <View style={s.loadingRow}>
          <ActivityIndicator size="small" color="#1565C0" />
          <Text style={s.loadingText}>جاري تحميل الإجراءات...</Text>
        </View>
      )}
      {planItems.length > 0 && (
        <Field label="الشاشات والتقارير التي تم التدريب عليها">
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

      {/* Trainees */}
      <TraineesList trainees={trainees} onChange={setTrainees} />

      {/* Trainer Notes */}
      <Field label="ملاحظات المدرب">
        <TextInput
          style={[s.input, s.textarea]}
          value={description}
          onChangeText={setDescription}
          placeholder="ملاحظات المدرب (اختياري)"
          placeholderTextColor="#aaa"
          multiline
          numberOfLines={3}
          textAlignVertical="top"
          textAlign="right"
        />
      </Field>

      {/* Client Notes */}
      <Field label="ملاحظات العميل">
        <TextInput
          style={[s.input, s.textarea]}
          value={clientNotes}
          onChangeText={setClientNotes}
          placeholder="ملاحظات العميل (اختياري)"
          placeholderTextColor="#aaa"
          multiline
          numberOfLines={3}
          textAlignVertical="top"
          textAlign="right"
        />
      </Field>

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

      {/* Buttons Row */}
      <View style={s.buttonsRow}>
        {/* Generate PDF */}
        <TouchableOpacity
          style={[s.pdfBtn, generatingPdf && { opacity: 0.6 }]}
          onPress={handleGeneratePdf}
          disabled={generatingPdf}
        >
          {generatingPdf
            ? <ActivityIndicator color="#1565C0" size="small" />
            : <Ionicons name="document-text-outline" size={20} color="#1565C0" />
          }
          <Text style={s.pdfBtnText}>نموذج التدريب PDF</Text>
        </TouchableOpacity>

        {/* Save */}
        <TouchableOpacity style={[s.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
          {saving
            ? <ActivityIndicator color="#fff" />
            : <>
                <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
                <Text style={s.saveBtnText}>حفظ الإجراء</Text>
              </>
          }
        </TouchableOpacity>
      </View>

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

  radioRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  radioBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 8, paddingHorizontal: 14,
    borderWidth: 1.5, borderColor: '#ddd', borderRadius: 20, backgroundColor: '#fff',
  },
  radioBtnActive: { borderColor: '#1565C0', backgroundColor: '#E3F2FD' },
  radioLabel: { fontSize: 13, color: '#555' },
  radioLabelActive: { color: '#1565C0', fontWeight: '700' },

  traineeRow: { flexDirection: 'row', gap: 8, marginBottom: 8, alignItems: 'center' },
  removeBtn: { padding: 4 },

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

  buttonsRow: { flexDirection: 'row', gap: 10, marginTop: 8 },

  pdfBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#E3F2FD', borderRadius: 12, padding: 14,
    borderWidth: 1.5, borderColor: '#1565C0',
  },
  pdfBtnText: { color: '#1565C0', fontSize: 14, fontWeight: '700' },

  saveBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#1565C0', borderRadius: 12, padding: 14,
  },
  saveBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
