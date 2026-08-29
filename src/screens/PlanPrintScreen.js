/**
 * PlanPrintScreen — طباعة خطة التنفيذ للتوقيع من العميل
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import { Linking } from 'react-native';
import { getPlanByIdForView, getPlanItems, getProjectVisits } from '../api/projects';
import { extractData, extractList, formatDate } from '../utils/helpers';

// ── HTML Builder ──────────────────────────────────────────────────────────────
function buildPlanHtml({ clientName, scopeName, stageName, planTitle, items, visits, projectId }) {
  const today = new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
  const totalUnits = items.reduce((s, i) => s + (i.expectedUnits || 0), 0);

  // Group visits by planId items covered
  const visitsForPlan = visits.filter(v =>
    !v.projectPlanId || true // show all project visits; filter by plan if field exists
  );

  const itemRows = items.map((item, idx) => `
    <tr>
      <td style="text-align:center;width:40px">${idx + 1}</td>
      <td>${item.title || ''}</td>
      <td style="text-align:center;width:100px">${item.scheduledDate ? formatArabicDate(item.scheduledDate) : '—'}</td>
      <td style="text-align:center;width:70px">${item.expectedUnits || '—'}</td>
      <td style="width:80px"></td>
    </tr>`).join('');

  const emptyItemRows = items.length === 0
    ? Array(8).fill('<tr><td></td><td></td><td></td><td></td><td></td></tr>').join('')
    : '';

  const visitRows = visitsForPlan.length > 0
    ? visitsForPlan.map((v, idx) => {
        const itemsCount = v.projectPlanItemIds?.length || v.planItemCount || '';
        return `<tr>
          <td style="text-align:center">${idx + 1}</td>
          <td style="text-align:center">${v.executionDate || v.createdAt?.split('T')[0] || '—'}</td>
          <td style="text-align:center">${v.startTime || '—'} — ${v.endTime || '—'}</td>
          <td style="text-align:center">${locationLabel(v.location || v.locationId)}</td>
          <td style="text-align:center">${itemsCount}</td>
        </tr>`;
      }).join('')
    : Array(5).fill('<tr><td></td><td></td><td></td><td></td><td></td></tr>').join('');

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8"/>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Cairo', Arial, sans-serif; font-size: 12px; color: #000; direction: rtl; padding: 24px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; padding-bottom: 12px; border-bottom: 2px solid #003366; }
  .logo-text { font-size: 22px; font-weight: 700; color: #003366; line-height: 1.2; }
  .logo-sub { font-size: 11px; font-weight: 400; color: #555; }
  .logo-right { text-align: left; font-size: 18px; font-weight: 700; color: #003366; line-height: 1.3; }
  h2 { text-align: center; background: #003366; color: #fff; padding: 10px; font-size: 17px; margin-bottom: 14px; border-radius: 4px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
  th, td { border: 1px solid #aaa; padding: 7px 9px; text-align: right; }
  th { background: #dce6f5; font-weight: 700; font-size: 12px; }
  .section-title { font-weight: 700; font-size: 14px; background: #f0f4fb; border: 1px solid #aaa; padding: 7px 10px; margin-bottom: 0; border-bottom: none; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; margin-bottom: 14px; border: 1px solid #aaa; }
  .info-cell { padding: 8px 12px; border-bottom: 1px solid #ddd; border-left: 1px solid #ddd; }
  .info-cell:nth-child(even) { border-left: none; }
  .info-label { font-size: 10px; color: #666; margin-bottom: 2px; }
  .info-value { font-size: 13px; font-weight: 700; color: #003366; }
  .summary-row { display: flex; gap: 12px; margin-bottom: 14px; }
  .summary-box { flex: 1; border: 1px solid #aaa; border-radius: 4px; padding: 10px; text-align: center; background: #f9fbff; }
  .summary-num { font-size: 24px; font-weight: 700; color: #003366; }
  .summary-lbl { font-size: 11px; color: #555; }
  .agreement { background: #fffbe6; border: 1px solid #f0c040; border-radius: 4px; padding: 10px 14px; margin-bottom: 14px; font-size: 12px; line-height: 1.8; }
  .sig-table { margin-top: 20px; }
  .sig-table td { height: 70px; vertical-align: top; padding: 6px 10px; border: 1px solid #aaa; }
  .sig-label { font-weight: 700; font-size: 12px; margin-bottom: 4px; color: #003366; }
  .footer { text-align: center; font-size: 10px; color: #888; margin-top: 20px; padding-top: 10px; border-top: 1px solid #ddd; }
  .date-stamp { text-align: left; font-size: 11px; color: #666; margin-bottom: 6px; }
</style>
</head>
<body>

<div class="header">
  <div>
    <div class="logo-text">ULTIMATE<br/><span class="logo-sub">SOLUTIONS</span></div>
  </div>
  <div style="text-align:center;">
    <div style="font-size:10px;color:#666;">تاريخ الطباعة</div>
    <div style="font-size:12px;font-weight:700;">${today}</div>
  </div>
  <div class="logo-right">قوة الثقة<br/><span style="font-size:11px;font-weight:400;">Absolute Trust</span></div>
</div>

<h2>خطة التدريب والتنفيذ</h2>

<div class="info-grid">
  <div class="info-cell">
    <div class="info-label">اسم العميل</div>
    <div class="info-value">${clientName || '—'}</div>
  </div>
  <div class="info-cell">
    <div class="info-label">النظام / النطاق</div>
    <div class="info-value">${scopeName || '—'}</div>
  </div>
  <div class="info-cell">
    <div class="info-label">المرحلة</div>
    <div class="info-value">${stageName || '—'}</div>
  </div>
  <div class="info-cell">
    <div class="info-label">اسم الخطة</div>
    <div class="info-value">${planTitle || '—'}</div>
  </div>
</div>

<div class="summary-row">
  <div class="summary-box">
    <div class="summary-num">${items.length}</div>
    <div class="summary-lbl">إجمالي بنود الخطة</div>
  </div>
  <div class="summary-box">
    <div class="summary-num">${totalUnits || '—'}</div>
    <div class="summary-lbl">إجمالي الوحدات المخططة</div>
  </div>
  <div class="summary-box">
    <div class="summary-num">${visitsForPlan.length || '—'}</div>
    <div class="summary-lbl">عدد الزيارات المنفذة</div>
  </div>
</div>

<div class="section-title">بنود خطة التنفيذ</div>
<table>
  <tr>
    <th style="width:40px">#</th>
    <th>اسم البند / الشاشة</th>
    <th style="width:100px;text-align:center">الموعد المخطط</th>
    <th style="width:70px;text-align:center">الوحدات</th>
    <th style="width:80px;text-align:center">ملاحظات</th>
  </tr>
  ${itemRows}${emptyItemRows}
</table>

${visitsForPlan.length > 0 ? `
<div class="section-title">سجل الزيارات المنفذة</div>
<table>
  <tr>
    <th style="width:35px;text-align:center">#</th>
    <th style="text-align:center">التاريخ</th>
    <th style="text-align:center">الوقت</th>
    <th style="text-align:center">المكان</th>
    <th style="text-align:center">البنود المغطاة</th>
  </tr>
  ${visitRows}
</table>` : ''}

<div class="agreement">
  بموجب هذه الخطة يُقر العميل بالاطلاع على جميع بنودها والموافقة على الجدول الزمني المحدد للتدريب والتنفيذ،
  ويلتزم بتوفير الإمكانيات والبيانات اللازمة في المواعيد المتفق عليها، وتُعد هذه الوثيقة مرجعاً رسمياً
  لمتابعة سير المشروع.
</div>

<table class="sig-table">
  <tr>
    <td style="width:33%">
      <div class="sig-label">مدير المشروع (العميل)</div>
    </td>
    <td style="width:33%">
      <div class="sig-label">مدير المشروع (الحلول النهائية)</div>
    </td>
    <td style="width:33%">
      <div class="sig-label">مدير الفريق (الحلول النهائية)</div>
    </td>
  </tr>
</table>

<div class="footer">
  الرئيسي: 40 محي الدين أبو العز، الدقي، الجيزة &nbsp;|&nbsp; (+2) 02 374 89 333 &nbsp;|&nbsp; www.ultimate-erp.com
</div>
</body>
</html>`;
}

function locationLabel(loc) {
  if (!loc) return '—';
  if (loc === 1 || loc === 'client') return 'مقر العميل';
  if (loc === 2 || loc === 'online') return 'أونلاين';
  if (loc === 3 || loc === 'company') return 'الشركة';
  return String(loc);
}

function formatArabicDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch { return dateStr; }
}

// ── Screen ────────────────────────────────────────────────────────────────────
export default function PlanPrintScreen({ navigation, route }) {
  const {
    planId,
    projectId,
    clientName = '',
    scopeName  = '',
    stageName  = '',
    planTitle  = '',
  } = route.params || {};

  const [plan,       setPlan]       = useState(null);
  const [items,      setItems]      = useState([]);
  const [visits,     setVisits]     = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [printing,   setPrinting]   = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [planRes, itemsRes, visitsRes] = await Promise.allSettled([
        getPlanByIdForView(planId),
        getPlanItems(planId),
        projectId ? getProjectVisits(projectId) : Promise.resolve(null),
      ]);
      if (planRes.status === 'fulfilled')   setPlan(extractData(planRes.value));
      if (itemsRes.status === 'fulfilled')  setItems(extractList(itemsRes.value) || []);
      if (visitsRes.status === 'fulfilled' && visitsRes.value) {
        setVisits(extractList(visitsRes.value) || []);
      }
    } catch (e) {
      Alert.alert('خطأ', e?.message || 'حدث خطأ في التحميل');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [planId, projectId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    navigation.setOptions({ title: 'طباعة الخطة' });
  }, [navigation]);

  const handlePrint = async () => {
    setPrinting(true);
    try {
      const html = buildPlanHtml({
        clientName,
        scopeName,
        stageName,
        planTitle: planTitle || plan?.name || `خطة #${planId}`,
        items,
        visits,
        projectId,
      });
      const fileUri = FileSystem.documentDirectory + 'plan_document.html';
      await FileSystem.writeAsStringAsync(fileUri, html, { encoding: 'utf8' });
      const contentUri = await FileSystem.getContentUriAsync(fileUri);
      await Linking.openURL(contentUri);
    } catch (e) {
      Alert.alert('خطأ', 'فشل إنشاء الوثيقة: ' + (e?.message || ''));
    } finally {
      setPrinting(false);
    }
  };

  if (loading) {
    return (
      <View style={s.centered}>
        <ActivityIndicator size="large" color="#1565C0" />
        <Text style={s.loadingText}>جاري تحميل بيانات الخطة...</Text>
      </View>
    );
  }

  const totalUnits = items.reduce((sum, i) => sum + (i.expectedUnits || 0), 0);
  const withDates  = items.filter(i => i.scheduledDate).length;

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={['#1565C0']} />}
    >
      {/* Header info */}
      <View style={s.infoCard}>
        <View style={s.infoRow}>
          <Ionicons name="person-outline" size={16} color="#1565C0" />
          <Text style={s.infoLabel}>العميل</Text>
          <Text style={s.infoValue}>{clientName || '—'}</Text>
        </View>
        <View style={s.divider} />
        <View style={s.infoRow}>
          <Ionicons name="desktop-outline" size={16} color="#1565C0" />
          <Text style={s.infoLabel}>النظام / النطاق</Text>
          <Text style={s.infoValue}>{scopeName || '—'}</Text>
        </View>
        <View style={s.divider} />
        <View style={s.infoRow}>
          <Ionicons name="git-branch-outline" size={16} color="#1565C0" />
          <Text style={s.infoLabel}>المرحلة</Text>
          <Text style={s.infoValue}>{stageName || '—'}</Text>
        </View>
        <View style={s.divider} />
        <View style={s.infoRow}>
          <Ionicons name="document-text-outline" size={16} color="#1565C0" />
          <Text style={s.infoLabel}>الخطة</Text>
          <Text style={s.infoValue}>{planTitle || plan?.name || `#${planId}`}</Text>
        </View>
      </View>

      {/* Stats */}
      <View style={s.statsRow}>
        <View style={s.statBox}>
          <Text style={s.statNum}>{items.length}</Text>
          <Text style={s.statLbl}>بنود الخطة</Text>
        </View>
        <View style={s.statBox}>
          <Text style={[s.statNum, { color: '#F57C00' }]}>{withDates}</Text>
          <Text style={s.statLbl}>بنود بمواعيد</Text>
        </View>
        <View style={s.statBox}>
          <Text style={[s.statNum, { color: '#6A1B9A' }]}>{visits.length}</Text>
          <Text style={s.statLbl}>زيارات منفذة</Text>
        </View>
        <View style={s.statBox}>
          <Text style={[s.statNum, { color: '#2E7D32' }]}>{totalUnits || '—'}</Text>
          <Text style={s.statLbl}>الوحدات</Text>
        </View>
      </View>

      {/* Items preview */}
      <View style={s.sectionCard}>
        <View style={s.sectionHead}>
          <Text style={s.sectionTitle}>بنود الخطة</Text>
          <Text style={s.sectionCount}>{items.length} بند</Text>
        </View>
        {items.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="list-outline" size={32} color="#ccc" />
            <Text style={s.emptyText}>لا توجد بنود</Text>
          </View>
        ) : (
          items.map((item, idx) => (
            <View key={item.id || idx} style={s.itemRow}>
              <View style={s.itemNum}>
                <Text style={s.itemNumText}>{idx + 1}</Text>
              </View>
              <View style={s.itemInfo}>
                <Text style={s.itemTitle} numberOfLines={2}>{item.title || '—'}</Text>
                <View style={s.itemMeta}>
                  {item.scheduledDate && (
                    <View style={s.chip}>
                      <Ionicons name="calendar-outline" size={11} color="#F57C00" />
                      <Text style={[s.chipText, { color: '#F57C00' }]}>{formatArabicDate(item.scheduledDate)}</Text>
                    </View>
                  )}
                  {item.expectedUnits > 0 && (
                    <View style={s.chip}>
                      <Ionicons name="cube-outline" size={11} color="#1565C0" />
                      <Text style={[s.chipText, { color: '#1565C0' }]}>{item.expectedUnits} وحدة</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
          ))
        )}
      </View>

      {/* Visits preview */}
      {visits.length > 0 && (
        <View style={s.sectionCard}>
          <View style={s.sectionHead}>
            <Text style={s.sectionTitle}>الزيارات المنفذة</Text>
            <Text style={s.sectionCount}>{visits.length} زيارة</Text>
          </View>
          {visits.slice(0, 5).map((v, idx) => (
            <View key={v.id || idx} style={s.visitRow}>
              <View style={[s.itemNum, { backgroundColor: '#6A1B9A' }]}>
                <Text style={s.itemNumText}>{idx + 1}</Text>
              </View>
              <View style={s.itemInfo}>
                <Text style={s.itemTitle}>{v.executionDate || v.createdAt?.split('T')[0] || '—'}</Text>
                <View style={s.itemMeta}>
                  {(v.startTime || v.endTime) && (
                    <View style={s.chip}>
                      <Ionicons name="time-outline" size={11} color="#555" />
                      <Text style={s.chipText}>{v.startTime || '—'} — {v.endTime || '—'}</Text>
                    </View>
                  )}
                  <View style={s.chip}>
                    <Ionicons name="location-outline" size={11} color="#555" />
                    <Text style={s.chipText}>{locationLabel(v.location || v.locationId)}</Text>
                  </View>
                </View>
              </View>
            </View>
          ))}
          {visits.length > 5 && (
            <View style={s.moreRow}>
              <Text style={s.moreText}>+ {visits.length - 5} زيارات أخرى مدرجة في الوثيقة</Text>
            </View>
          )}
        </View>
      )}

      {/* Print button */}
      <TouchableOpacity
        style={[s.printBtn, printing && { opacity: 0.6 }]}
        onPress={handlePrint}
        disabled={printing}
      >
        {printing
          ? <ActivityIndicator color="#fff" />
          : <Ionicons name="print-outline" size={22} color="#fff" />
        }
        <Text style={s.printBtnText}>
          {printing ? 'جاري الإنشاء...' : 'طباعة الخطة للتوقيع'}
        </Text>
      </TouchableOpacity>

      <Text style={s.hint}>
        سيتم فتح وثيقة HTML في المتصفح — اختر "طباعة" أو "حفظ كـ PDF"
      </Text>

    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F5F7FA' },
  content: { padding: 16, paddingBottom: 40, gap: 12 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 14, color: '#888' },

  infoCard: {
    backgroundColor: '#fff', borderRadius: 12,
    borderWidth: 0.5, borderColor: '#ddd', overflow: 'hidden',
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  infoLabel: { fontSize: 12, color: '#888', width: 90 },
  infoValue: { flex: 1, fontSize: 13, color: '#1a1a1a', fontWeight: '600', textAlign: 'right' },
  divider: { height: 0.5, backgroundColor: '#eee', marginHorizontal: 12 },

  statsRow: { flexDirection: 'row', gap: 8 },
  statBox: {
    flex: 1, backgroundColor: '#fff', borderRadius: 10,
    borderWidth: 0.5, borderColor: '#ddd', padding: 12, alignItems: 'center',
  },
  statNum: { fontSize: 22, fontWeight: '700', color: '#1565C0' },
  statLbl: { fontSize: 10, color: '#888', marginTop: 2, textAlign: 'center' },

  sectionCard: {
    backgroundColor: '#fff', borderRadius: 12,
    borderWidth: 0.5, borderColor: '#ddd', overflow: 'hidden',
  },
  sectionHead: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 12, backgroundColor: '#f0f4fb', borderBottomWidth: 0.5, borderColor: '#ddd',
  },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#1a3a6b' },
  sectionCount: { fontSize: 12, color: '#888' },

  itemRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12, borderBottomWidth: 0.5, borderColor: '#f0f0f0' },
  visitRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12, borderBottomWidth: 0.5, borderColor: '#f0f0f0' },
  itemNum: {
    width: 24, height: 24, borderRadius: 6, backgroundColor: '#1565C0',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2,
  },
  itemNumText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  itemInfo: { flex: 1 },
  itemTitle: { fontSize: 13, color: '#1a1a1a', lineHeight: 18, textAlign: 'right' },
  itemMeta: { flexDirection: 'row', gap: 8, marginTop: 4, flexWrap: 'wrap', justifyContent: 'flex-end' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#f5f5f5', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  chipText: { fontSize: 11, color: '#555' },

  moreRow: { padding: 10, alignItems: 'center' },
  moreText: { fontSize: 12, color: '#888' },
  empty: { alignItems: 'center', padding: 24, gap: 8 },
  emptyText: { fontSize: 13, color: '#bbb' },

  printBtn: {
    backgroundColor: '#1a3a6b', borderRadius: 14, padding: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    marginTop: 4,
  },
  printBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  hint: { fontSize: 11, color: '#aaa', textAlign: 'center', marginTop: 4 },
});
