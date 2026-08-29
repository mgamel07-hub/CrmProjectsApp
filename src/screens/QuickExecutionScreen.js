/**
 * QuickExecutionScreen — إضافة تنفيذ + توليد 4 نماذج رسمية
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

// ── Constants ─────────────────────────────────────────────────────────────────
const LOCATIONS = [
  { id: 1, label: 'مقر العميل' },
  { id: 2, label: 'أونلاين'    },
  { id: 3, label: 'الشركة'     },
];

const FORM_TYPES = [
  { id: 1, label: 'نموذج تدريب',    icon: 'school-outline'       },
  { id: 2, label: 'انهاء تدريب',    icon: 'checkmark-done-outline'},
  { id: 3, label: 'محاكاة',         icon: 'sync-circle-outline'  },
  { id: 4, label: 'متابعة',         icon: 'eye-outline'          },
];

const VISIT_REASONS = [
  { id: 1, label: 'متابعة تشغيل تجريبي' },
  { id: 2, label: 'متابعة تشغيل فعلي'   },
  { id: 3, label: 'متابعة عامة للمشروع' },
];

// ── Shared subcomponents ──────────────────────────────────────────────────────
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

function RadioGroup({ label, options, value, onChange }) {
  return (
    <Field label={label}>
      <View style={s.radioRow}>
        {options.map(opt => (
          <TouchableOpacity
            key={opt.id}
            style={[s.radioBtn, value === opt.id && s.radioBtnActive]}
            onPress={() => onChange(opt.id)}
          >
            <Ionicons
              name={value === opt.id ? 'radio-button-on' : 'radio-button-off'}
              size={18}
              color={value === opt.id ? '#1565C0' : '#aaa'}
            />
            <Text style={[s.radioLabel, value === opt.id && s.radioLabelActive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </Field>
  );
}

// ── Form-type specific components ─────────────────────────────────────────────
function TraineesList({ trainees, onChange }) {
  const add = () => onChange([...trainees, { name: '', job: '' }]);
  const remove = (i) => onChange(trainees.filter((_, j) => j !== i));
  const update = (i, field, val) => onChange(trainees.map((t, j) => j === i ? { ...t, [field]: val } : t));
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
          <TouchableOpacity onPress={() => remove(i)} style={s.removeBtn}>
            <Ionicons name="close-circle" size={22} color="#D32F2F" />
          </TouchableOpacity>
        </View>
      ))}
      <TouchableOpacity style={s.addRowBtn} onPress={add}>
        <Ionicons name="person-add-outline" size={18} color="#1565C0" />
        <Text style={s.addRowBtnText}>إضافة متدرب</Text>
      </TouchableOpacity>
    </Field>
  );
}

function FinishedSystemsList({ systems, onChange }) {
  const add = () => onChange([...systems, { name: '', notes: '' }]);
  const remove = (i) => onChange(systems.filter((_, j) => j !== i));
  const update = (i, field, val) => onChange(systems.map((t, j) => j === i ? { ...t, [field]: val } : t));
  return (
    <Field label="الأنظمة التي تم الانتهاء من تدريبها">
      {systems.map((sys, i) => (
        <View key={i} style={s.traineeRow}>
          <TextInput
            style={[s.input, { flex: 2, marginBottom: 0 }]}
            placeholder="اسم النظام"
            placeholderTextColor="#aaa"
            value={sys.name}
            onChangeText={v => update(i, 'name', v)}
            textAlign="right"
          />
          <TextInput
            style={[s.input, { flex: 2, marginBottom: 0 }]}
            placeholder="ملاحظات"
            placeholderTextColor="#aaa"
            value={sys.notes}
            onChangeText={v => update(i, 'notes', v)}
            textAlign="right"
          />
          <TouchableOpacity onPress={() => remove(i)} style={s.removeBtn}>
            <Ionicons name="close-circle" size={22} color="#D32F2F" />
          </TouchableOpacity>
        </View>
      ))}
      <TouchableOpacity style={s.addRowBtn} onPress={add}>
        <Ionicons name="add-circle-outline" size={18} color="#1565C0" />
        <Text style={s.addRowBtnText}>إضافة نظام</Text>
      </TouchableOpacity>
    </Field>
  );
}

function SystemChangesList({ changes, onChange }) {
  const add = () => onChange([...changes, { system: '', change: '', isAdd: false, isRemove: false, isEdit: false }]);
  const remove = (i) => onChange(changes.filter((_, j) => j !== i));
  const update = (i, field, val) => onChange(changes.map((t, j) => j === i ? { ...t, [field]: val } : t));
  return (
    <Field label="التغيير في الإعدادات">
      {changes.map((ch, i) => (
        <View key={i} style={s.changeBlock}>
          <View style={s.traineeRow}>
            <TextInput
              style={[s.input, { flex: 2, marginBottom: 0 }]}
              placeholder="النظام"
              placeholderTextColor="#aaa"
              value={ch.system}
              onChangeText={v => update(i, 'system', v)}
              textAlign="right"
            />
            <TextInput
              style={[s.input, { flex: 3, marginBottom: 0 }]}
              placeholder="المتغير / الوصف"
              placeholderTextColor="#aaa"
              value={ch.change}
              onChangeText={v => update(i, 'change', v)}
              textAlign="right"
            />
            <TouchableOpacity onPress={() => remove(i)} style={s.removeBtn}>
              <Ionicons name="close-circle" size={22} color="#D32F2F" />
            </TouchableOpacity>
          </View>
          <View style={[s.radioRow, { marginTop: 6 }]}>
            {[['isAdd','إضافة'],['isRemove','إلغاء'],['isEdit','تعديل']].map(([field, lbl]) => (
              <TouchableOpacity
                key={field}
                style={[s.radioBtn, ch[field] && s.radioBtnActive]}
                onPress={() => update(i, field, !ch[field])}
              >
                <Ionicons
                  name={ch[field] ? 'checkbox' : 'square-outline'}
                  size={16}
                  color={ch[field] ? '#1565C0' : '#aaa'}
                />
                <Text style={[s.radioLabel, ch[field] && s.radioLabelActive]}>{lbl}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ))}
      <TouchableOpacity style={s.addRowBtn} onPress={add}>
        <Ionicons name="add-circle-outline" size={18} color="#1565C0" />
        <Text style={s.addRowBtnText}>إضافة تغيير</Text>
      </TouchableOpacity>
    </Field>
  );
}

// ── HTML Builders ─────────────────────────────────────────────────────────────
const HTML_HEADER = (title) => `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8"/>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Cairo', Arial, sans-serif; font-size: 12px; color: #000; direction: rtl; padding: 20px; }
  .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
  h2 { text-align: center; background: #003366; color: #fff; padding: 8px; font-size: 16px; margin-bottom: 10px; border-radius: 4px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  th, td { border: 1px solid #333; padding: 6px 8px; text-align: right; }
  th { background: #E8EAF6; font-weight: 700; }
  .section-title { font-weight: 700; text-align: center; background: #F5F5F5; padding: 6px; border: 1px solid #333; border-bottom: none; }
  .notes-box { border: 1px solid #333; min-height: 70px; padding: 8px; margin-bottom: 12px; white-space: pre-wrap; }
  .sig-table td { height: 70px; vertical-align: top; padding-top: 6px; }
  .footer { text-align: center; font-size: 10px; color: #666; margin-top: 20px; border-top: 1px solid #ccc; padding-top: 8px; }
  .info-text { font-size: 13px; font-weight: 700; text-align: center; margin: 14px 0; line-height: 1.8; }
</style>
</head>
<body>
<div class="header">
  <div style="font-size:20px;font-weight:700;color:#003366;">ULTIMATE<br/><span style="font-size:11px;font-weight:400;">SOLUTIONS</span></div>
  <div style="text-align:left;font-size:18px;font-weight:700;color:#003366;">قوة الثقة<br/><span style="font-size:11px;">Absolute Trust</span></div>
</div>
<h2>${title}</h2>`;

const HTML_INFO_TABLE = (clientName, systemName, date, startTime, endTime, location) => {
  const locClient  = location === 1 ? '☑' : '☐';
  const locOnline  = location === 2 ? '☑' : '☐';
  const locCompany = location === 3 ? '☑' : '☐';
  return `<table>
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
    <td colspan="3">${locClient} مقر العميل &nbsp;&nbsp;&nbsp; ${locOnline} أونلاين &nbsp;&nbsp;&nbsp; ${locCompany} الشركة</td>
  </tr>
</table>`;
};

const HTML_SIG_TRAINER = `<table class="sig-table" style="margin-top:16px">
  <tr>
    <th style="width:33%">مدير المشروع (العميل)</th>
    <th style="width:33%">المدرب (الحلول النهائية)</th>
    <th style="width:33%">مدير الفريق (الحلول النهائية)</th>
  </tr>
  <tr><td></td><td></td><td></td></tr>
</table>`;

const HTML_SIG_MANAGER = `<table class="sig-table" style="margin-top:16px">
  <tr>
    <th style="width:33%">مدير المشروع (العميل)</th>
    <th style="width:33%">مدير المشروع (الحلول النهائية)</th>
    <th style="width:33%">مدير الفريق (الحلول النهائية)</th>
  </tr>
  <tr><td></td><td></td><td></td></tr>
</table>`;

const HTML_FOOTER = `<div class="footer">
  الرئيسي: 40 محي الدين أبو العز، الدقي، الجيزة &nbsp;|&nbsp; (+2) 02 374 89 333 &nbsp;|&nbsp; www.ultimate-erp.com
</div></body></html>`;

// 1. Training Form
function buildTrainingFormHtml({ clientName, systemName, date, startTime, endTime, location, planItems, selectedItems, trainees, trainerNotes, clientNotes }) {
  const selectedItemObjects = planItems.filter(i => selectedItems.includes(i.id));
  const itemRows = selectedItemObjects.length > 0
    ? selectedItemObjects.map(item => `<tr><td>${item.title || item.name || ''}</td><td></td><td></td></tr>`).join('')
    : Array(5).fill('<tr><td></td><td></td><td></td></tr>').join('');
  const traineeRows = trainees.length > 0
    ? trainees.map(t => `<tr><td>${t.name || ''}</td><td>${t.job || ''}</td><td></td></tr>`).join('')
    : Array(5).fill('<tr><td></td><td></td><td></td></tr>').join('');
  return HTML_HEADER('بيانات زيارة تدريب')
    + HTML_INFO_TABLE(clientName, systemName, date, startTime, endTime, location)
    + `<div class="section-title">أسماء الشاشات والتقارير التي تم التدريب عليها</div>
<table><tr><th>الشاشة / التقرير</th><th>ملاحظات</th><th>تم التدريب</th></tr>${itemRows}</table>
<div class="section-title">المتدربون</div>
<table><tr><th>اسم المتدرب</th><th>الوظيفة</th><th>التوقيع</th></tr>${traineeRows}</table>
<div class="section-title" style="margin-top:12px">ملاحظات المدرب</div>
<div class="notes-box">${trainerNotes || ''}</div>
<div class="section-title">ملاحظات العميل</div>
<div class="notes-box">${clientNotes || ''}</div>`
    + HTML_SIG_TRAINER
    + HTML_FOOTER;
}

// 2. End of Training Form
function buildEndTrainingHtml({ clientName, systemName, date, startTime, endTime, location, finishedSystems, generalNotes }) {
  const rows = finishedSystems.length > 0
    ? finishedSystems.map(sys => `<tr><td>${sys.name || ''}</td><td>${sys.notes || ''}</td><td></td><td></td></tr>`).join('')
    : Array(4).fill('<tr><td></td><td></td><td></td><td></td></tr>').join('');
  return HTML_HEADER('بيانات زيارة انهاء تدريب')
    + HTML_INFO_TABLE(clientName, systemName, date, startTime, endTime, location)
    + `<div class="section-title">أسماء الانظمة التي تم الانتهاء من التدريب عليها</div>
<table>
  <tr><th style="width:30%">اسم النظام</th><th style="width:20%">ملاحظات</th><th style="width:30%">اسم النظام</th><th style="width:20%">ملاحظات</th></tr>
  ${rows}
</table>
<p class="info-text">- بموجب هذا النموذج يكون العميل استوفى التدريب الكافي الذي يمكنه من التعامل مع النظام<br/>
وبناء عليه يتم الانتقال إلى مرحلة التشغيل التجريبي لعمل عمليات تجريبية على النظام<br/>
كنوع من التطبيق العملي على ذلك التدريب.</p>
<div class="section-title">ملاحظات عامة</div>
<div class="notes-box">${generalNotes || ''}</div>`
    + HTML_SIG_TRAINER
    + HTML_FOOTER;
}

// 3. Simulation & Data Upload Form
function buildSimulationHtml({ clientName, systemName, date, startTime, endTime, location, systemChanges, procedureChanges }) {
  const changeRows = systemChanges.length > 0
    ? systemChanges.map(ch => `<tr>
        <td>${ch.system || ''}</td>
        <td>${ch.change || ''}</td>
        <td style="text-align:center">${ch.isAdd ? '☑' : '☐'}</td>
        <td style="text-align:center">${ch.isRemove ? '☑' : '☐'}</td>
        <td style="text-align:center">${ch.isEdit ? '☑' : '☐'}</td>
      </tr>`).join('')
    : Array(4).fill('<tr><td></td><td></td><td style="text-align:center">☐</td><td style="text-align:center">☐</td><td style="text-align:center">☐</td></tr>').join('');
  const procLines = procedureChanges
    ? procedureChanges.split('\n').map(l => `<tr><td style="height:28px">${l || '&nbsp;'}</td></tr>`).join('')
    : Array(5).fill('<tr><td style="height:28px">&nbsp;</td></tr>').join('');
  return HTML_HEADER('تقرير محاكاة على النظام')
    + HTML_INFO_TABLE(clientName, systemName, date, startTime, endTime, location)
    + `<div class="section-title">التغيير في الإعدادات</div>
<table>
  <tr><th style="width:25%">النظام</th><th style="width:35%">المتغير</th><th style="width:13%">إضافة</th><th style="width:13%">إلغاء</th><th style="width:14%">تعديل</th></tr>
  ${changeRows}
</table>
<p class="info-text">- بموجب هذا النموذج يكون قد تم رفع البيانات على النظام بشكل ناجح وتم مراجعتها من قبل العميل<br/>
ولا يوجد بها أخطاء، كما تم عرض كافة العمليات التي تخص الأنظمة المذكورة أعلاه</p>
<div class="section-title">التغيير في الإجراءات</div>
<table>${procLines}</table>`
    + HTML_SIG_TRAINER
    + HTML_FOOTER;
}

// 4. Follow-up Report
function buildFollowUpHtml({ clientName, systemName, date, startTime, endTime, visitReason, visitEvents, visitRequests }) {
  const r1 = visitReason === 1 ? '☑' : '☐';
  const r2 = visitReason === 2 ? '☑' : '☐';
  const r3 = visitReason === 3 ? '☑' : '☐';
  const eventLines = visitEvents
    ? visitEvents.split('\n').map(l => `<tr><td style="height:24px">${l || '&nbsp;'}</td></tr>`).join('')
    : Array(9).fill('<tr><td style="height:24px">&nbsp;</td></tr>').join('');
  const reqLines = visitRequests
    ? visitRequests.split('\n').map(l => `<tr><td style="height:24px">${l || '&nbsp;'}</td></tr>`).join('')
    : Array(6).fill('<tr><td style="height:24px">&nbsp;</td></tr>').join('');
  return HTML_HEADER('تقرير متابعة العمل')
    + `<table>
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
    <th>سبب الزيارة</th>
    <td colspan="3">${r1} متابعة تشغيل تجريبي &nbsp;&nbsp;&nbsp; ${r2} متابعة تشغيل فعلي &nbsp;&nbsp;&nbsp; ${r3} متابعة عامة للمشروع</td>
  </tr>
</table>
<div class="section-title">• أحداث الزيارة: -</div>
<table>${eventLines}</table>
<div class="section-title">• الطلبات والملاحظات: -</div>
<table>${reqLines}</table>`
    + HTML_SIG_MANAGER
    + HTML_FOOTER;
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function QuickExecutionScreen({ navigation }) {
  // Common state
  const [projects,       setProjects]       = useState([]);
  const [scopes,         setScopes]         = useState([]);
  const [stages,         setStages]         = useState([]);
  const [plans,          setPlans]          = useState([]);
  const [planItems,      setPlanItems]      = useState([]);
  const [selectedItems,  setSelectedItems]  = useState([]);

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

  // Form type
  const [formType, setFormType] = useState(1);

  // انهاء تدريب specific
  const [finishedSystems, setFinishedSystems] = useState([{ name: '', notes: '' }]);

  // محاكاة specific
  const [systemChanges,     setSystemChanges]     = useState([{ system: '', change: '', isAdd: false, isRemove: false, isEdit: false }]);
  const [procedureChanges,  setProcedureChanges]  = useState('');

  // متابعة specific
  const [visitReason,   setVisitReason]   = useState(1);
  const [visitEvents,   setVisitEvents]   = useState('');
  const [visitRequests, setVisitRequests] = useState('');

  // Loading flags
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingScopes,   setLoadingScopes]   = useState(false);
  const [loadingStages,   setLoadingStages]   = useState(false);
  const [loadingPlans,    setLoadingPlans]     = useState(false);
  const [loadingItems,    setLoadingItems]     = useState(false);
  const [saving,          setSaving]           = useState(false);
  const [generatingPdf,   setGeneratingPdf]   = useState(false);

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
    try { setScopes(extractList(await getScopesDropdown(id)) || []); }
    catch { setScopes([]); }
    finally { setLoadingScopes(false); }
  }, []);

  const onSelectScope = useCallback(async (id, obj) => {
    setScopeId(id);
    setScopeName(obj?.value || obj?.name || '');
    setStageId(null); setPlanId(null);
    setStages([]); setPlans([]); setPlanItems([]); setSelectedItems([]);
    setLoadingStages(true);
    try { setStages(extractList(await getStagesDropdown(id)) || []); }
    catch { setStages([]); }
    finally { setLoadingStages(false); }
  }, []);

  const onSelectStage = useCallback(async (id) => {
    setStageId(id);
    setPlanId(null);
    setPlans([]); setPlanItems([]); setSelectedItems([]);
    setLoadingPlans(true);
    try { setPlans(extractList(await getPlansDropDown(scopeId, id)) || []); }
    catch { setPlans([]); }
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
        { text: 'إنشاء النموذج', onPress: handleGeneratePdf },
        { text: 'إغلاق', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      const msg = e?.response?.data?.message || e?.response?.data?.title || e?.message;
      Alert.alert('خطأ', msg || 'حدث خطأ في الحفظ');
    } finally { setSaving(false); }
  };

  const handleGeneratePdf = async () => {
    setGeneratingPdf(true);
    try {
      const common = { clientName: projectName, systemName: scopeName, date, startTime, endTime, location };
      let html = '';
      if (formType === 1) {
        html = buildTrainingFormHtml({
          ...common,
          planItems, selectedItems,
          trainees: trainees.filter(t => t.name.trim()),
          trainerNotes: description,
          clientNotes,
        });
      } else if (formType === 2) {
        html = buildEndTrainingHtml({
          ...common,
          finishedSystems: finishedSystems.filter(s => s.name.trim()),
          generalNotes: description,
        });
      } else if (formType === 3) {
        html = buildSimulationHtml({
          ...common,
          systemChanges: systemChanges.filter(c => c.system.trim() || c.change.trim()),
          procedureChanges,
        });
      } else {
        html = buildFollowUpHtml({
          ...common,
          visitReason,
          visitEvents,
          visitRequests,
        });
      }

      const fileUri = FileSystem.documentDirectory + 'visit_form.html';
      await FileSystem.writeAsStringAsync(fileUri, html, { encoding: 'utf8' });
      const contentUri = await FileSystem.getContentUriAsync(fileUri);
      const { Linking } = require('react-native');
      await Linking.openURL(contentUri);
    } catch (e) {
      Alert.alert('خطأ', 'فشل إنشاء النموذج: ' + (e?.message || ''));
    } finally { setGeneratingPdf(false); }
  };

  const toggleItem = (id) => {
    setSelectedItems(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const formTypeLabel = FORM_TYPES.find(f => f.id === formType)?.label || 'النموذج';

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">

      {/* Form type selector */}
      <Field label="نوع النموذج">
        <View style={s.formTypeGrid}>
          {FORM_TYPES.map(ft => (
            <TouchableOpacity
              key={ft.id}
              style={[s.formTypeBtn, formType === ft.id && s.formTypeBtnActive]}
              onPress={() => setFormType(ft.id)}
            >
              <Ionicons name={ft.icon} size={18} color={formType === ft.id ? '#fff' : '#1565C0'} />
              <Text style={[s.formTypeBtnText, formType === ft.id && s.formTypeBtnTextActive]}>
                {ft.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </Field>

      {/* Project */}
      <Dropdown
        label="المشروع / اسم العميل *"
        options={projects}
        value={projectId}
        onSelect={onSelectProject}
        getLabel={o => o.value || o.name || `#${o.id ?? o.key}`}
        placeholder="اختر المشروع"
        loading={loadingProjects}
      />

      {projectId && (
        <Dropdown
          label="نطاق المشروع / اسم النظام *"
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
          label="المرحلة"
          options={stages}
          value={stageId}
          onSelect={onSelectStage}
          getLabel={o => o.value || o.name || `#${o.id ?? o.key}`}
          placeholder="اختر المرحلة"
          loading={loadingStages}
        />
      )}

      {scopeId && (
        <Dropdown
          label="الخطة *"
          options={plans}
          value={planId}
          onSelect={onSelectPlan}
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
            <TextInput style={s.input} value={startTime} onChangeText={setStartTime}
              placeholder="HH:MM" placeholderTextColor="#aaa" keyboardType="numeric" />
          </Field>
        </View>
        <View style={{ flex: 1 }}>
          <Field label="إلى">
            <TextInput style={s.input} value={endTime} onChangeText={setEndTime}
              placeholder="HH:MM" placeholderTextColor="#aaa" keyboardType="numeric" />
          </Field>
        </View>
      </View>

      {/* Location — not shown for متابعة */}
      {formType !== 4 && (
        <RadioGroup label="مكان الزيارة" options={LOCATIONS} value={location} onChange={setLocation} />
      )}

      {/* ── Training form fields ── */}
      {formType === 1 && (
        <>
          {loadingItems && (
            <View style={s.loadingRow}>
              <ActivityIndicator size="small" color="#1565C0" />
              <Text style={s.loadingText}>جاري تحميل الإجراءات...</Text>
            </View>
          )}
          {planItems.length > 0 && (
            <Field label="الشاشات والتقارير التي تم التدريب عليها">
              <View style={s.itemsHeader}>
                <TouchableOpacity onPress={() =>
                  setSelectedItems(selectedItems.length === planItems.length ? [] : planItems.map(i => i.id))
                }>
                  <Text style={s.selectAll}>{selectedItems.length === planItems.length ? 'إلغاء الكل' : 'تحديد الكل'}</Text>
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
                    <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={20} color={checked ? '#1565C0' : '#bbb'} />
                    <Text style={s.itemText} numberOfLines={3}>{item.title || item.name || `#${item.id}`}</Text>
                  </TouchableOpacity>
                );
              })}
            </Field>
          )}
          <TraineesList trainees={trainees} onChange={setTrainees} />
          <Field label="ملاحظات المدرب">
            <TextInput style={[s.input, s.textarea]} value={description} onChangeText={setDescription}
              placeholder="ملاحظات المدرب (اختياري)" placeholderTextColor="#aaa"
              multiline numberOfLines={3} textAlignVertical="top" textAlign="right" />
          </Field>
          <Field label="ملاحظات العميل">
            <TextInput style={[s.input, s.textarea]} value={clientNotes} onChangeText={setClientNotes}
              placeholder="ملاحظات العميل (اختياري)" placeholderTextColor="#aaa"
              multiline numberOfLines={3} textAlignVertical="top" textAlign="right" />
          </Field>
        </>
      )}

      {/* ── End-of-Training fields ── */}
      {formType === 2 && (
        <>
          <FinishedSystemsList systems={finishedSystems} onChange={setFinishedSystems} />
          <Field label="ملاحظات عامة">
            <TextInput style={[s.input, s.textarea]} value={description} onChangeText={setDescription}
              placeholder="ملاحظات عامة (اختياري)" placeholderTextColor="#aaa"
              multiline numberOfLines={4} textAlignVertical="top" textAlign="right" />
          </Field>
        </>
      )}

      {/* ── Simulation fields ── */}
      {formType === 3 && (
        <>
          <SystemChangesList changes={systemChanges} onChange={setSystemChanges} />
          <Field label="التغيير في الإجراءات">
            <TextInput style={[s.input, s.textarea]} value={procedureChanges} onChangeText={setProcedureChanges}
              placeholder="اكتب التغييرات في الإجراءات (اختياري)" placeholderTextColor="#aaa"
              multiline numberOfLines={5} textAlignVertical="top" textAlign="right" />
          </Field>
        </>
      )}

      {/* ── Follow-up fields ── */}
      {formType === 4 && (
        <>
          <RadioGroup label="سبب الزيارة" options={VISIT_REASONS} value={visitReason} onChange={setVisitReason} />
          <Field label="أحداث الزيارة">
            <TextInput style={[s.input, s.textarea, { minHeight: 120 }]} value={visitEvents} onChangeText={setVisitEvents}
              placeholder="اكتب أحداث الزيارة..." placeholderTextColor="#aaa"
              multiline textAlignVertical="top" textAlign="right" />
          </Field>
          <Field label="الطلبات والملاحظات">
            <TextInput style={[s.input, s.textarea, { minHeight: 100 }]} value={visitRequests} onChangeText={setVisitRequests}
              placeholder="الطلبات والملاحظات..." placeholderTextColor="#aaa"
              multiline textAlignVertical="top" textAlign="right" />
          </Field>
        </>
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
        <TouchableOpacity style={s.addRowBtn} onPress={pickAttachment}>
          <Ionicons name="attach-outline" size={18} color="#1565C0" />
          <Text style={s.addRowBtnText}>إضافة مرفق</Text>
        </TouchableOpacity>
      </Field>

      {/* Action buttons */}
      <View style={s.buttonsRow}>
        <TouchableOpacity
          style={[s.pdfBtn, generatingPdf && { opacity: 0.6 }]}
          onPress={handleGeneratePdf}
          disabled={generatingPdf}
        >
          {generatingPdf
            ? <ActivityIndicator color="#1565C0" size="small" />
            : <Ionicons name="document-text-outline" size={20} color="#1565C0" />
          }
          <Text style={s.pdfBtnText}>{formTypeLabel}</Text>
        </TouchableOpacity>

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

  radioRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  radioBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 7, paddingHorizontal: 12,
    borderWidth: 1.5, borderColor: '#ddd', borderRadius: 20, backgroundColor: '#fff',
  },
  radioBtnActive: { borderColor: '#1565C0', backgroundColor: '#E3F2FD' },
  radioLabel: { fontSize: 12, color: '#555' },
  radioLabelActive: { color: '#1565C0', fontWeight: '700' },

  formTypeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  formTypeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 9, paddingHorizontal: 14,
    borderWidth: 1.5, borderColor: '#1565C0', borderRadius: 10,
    backgroundColor: '#fff', minWidth: '45%', flex: 1,
  },
  formTypeBtnActive: { backgroundColor: '#1565C0' },
  formTypeBtnText: { fontSize: 13, color: '#1565C0', fontWeight: '600' },
  formTypeBtnTextActive: { color: '#fff' },

  traineeRow: { flexDirection: 'row', gap: 8, marginBottom: 8, alignItems: 'center' },
  removeBtn: { padding: 4 },

  changeBlock: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 10,
    backgroundColor: '#fff', padding: 10, marginBottom: 8,
  },

  attachRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#fff',
    borderRadius: 8, marginBottom: 4, borderWidth: 1, borderColor: '#eee',
  },
  attachName: { flex: 1, fontSize: 13, color: '#1565C0' },
  addRowBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 8, paddingHorizontal: 12,
    borderWidth: 1.5, borderColor: '#1565C0', borderRadius: 8, borderStyle: 'dashed',
    justifyContent: 'center', marginTop: 4,
  },
  addRowBtnText: { color: '#1565C0', fontSize: 13, fontWeight: '600' },

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
  pdfBtnText: { color: '#1565C0', fontSize: 13, fontWeight: '700' },
  saveBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#1565C0', borderRadius: 12, padding: 14,
  },
  saveBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
