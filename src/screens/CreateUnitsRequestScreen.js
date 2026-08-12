import React, { useState } from 'react';
import {
  View, Text, TextInput, ScrollView, StyleSheet,
  TouchableOpacity, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { createUnitsRequest } from '../api/projects';
import { t } from '../i18n';
import { useLang } from '../context/LangContext';

export default function CreateUnitsRequestScreen({ navigation, route }) {
  const { planItemId, itemTitle, onDone } = route.params;
  const { lang } = useLang();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ requestedUnitCount: '', reason: '', reviewNotes: '' });

  const set = (key, val) => setForm((prev) => ({ ...prev, [key]: val }));

  const handleSave = async () => {
    if (!form.requestedUnitCount || isNaN(Number(form.requestedUnitCount)) || Number(form.requestedUnitCount) <= 0) {
      Alert.alert(t('error'), lang === 'ar' ? 'عدد الوحدات المطلوبة يجب أن يكون أكبر من صفر' : 'Requested units must be > 0');
      return;
    }

    setSaving(true);
    try {
      await createUnitsRequest({
        projectPlanItemId: planItemId,
        requestedUnitCount: Number(form.requestedUnitCount),
        reason: form.reason.trim() || undefined,
        reviewNotes: form.reviewNotes.trim() || undefined,
      });
      Alert.alert(t('success'), lang === 'ar' ? 'تم إرسال الطلب بنجاح' : 'Request submitted successfully', [
        { text: 'OK', onPress: () => { if (onDone) onDone(); navigation.goBack(); } },
      ]);
    } catch (e) {
      Alert.alert(t('error'), e?.response?.data?.message || t('networkError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {/* Item info */}
      <View style={styles.infoBox}>
        <Ionicons name="list-outline" size={18} color="#1565C0" />
        <Text style={styles.infoText} numberOfLines={2}>{itemTitle}</Text>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>{t('requestedUnits')} *</Text>
        <TextInput
          style={styles.input}
          value={form.requestedUnitCount}
          onChangeText={(v) => set('requestedUnitCount', v)}
          keyboardType="numeric"
          placeholder="0"
          placeholderTextColor="#aaa"
          textAlign={lang === 'ar' ? 'right' : 'left'}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>{t('reason')}</Text>
        <TextInput
          style={[styles.input, styles.textarea]}
          value={form.reason}
          onChangeText={(v) => set('reason', v)}
          placeholder={lang === 'ar' ? 'سبب الطلب (اختياري)' : 'Reason for request (optional)'}
          placeholderTextColor="#aaa"
          multiline
          numberOfLines={3}
          textAlignVertical="top"
          textAlign={lang === 'ar' ? 'right' : 'left'}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>{t('notes')}</Text>
        <TextInput
          style={[styles.input, styles.textarea]}
          value={form.reviewNotes}
          onChangeText={(v) => set('reviewNotes', v)}
          placeholder={lang === 'ar' ? 'ملاحظات (اختياري)' : 'Notes (optional)'}
          placeholderTextColor="#aaa"
          multiline
          numberOfLines={3}
          textAlignVertical="top"
          textAlign={lang === 'ar' ? 'right' : 'left'}
        />
      </View>

      <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Ionicons name="send-outline" size={18} color="#fff" />
            <Text style={styles.saveBtnText}>{t('submit')}</Text>
          </>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F5F7FA' },
  content: { padding: 16, paddingBottom: 40 },
  infoBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#EEF3FF',
    borderRadius: 10, padding: 12, marginBottom: 20, borderLeftWidth: 3, borderLeftColor: '#1565C0',
  },
  infoText: { flex: 1, fontSize: 14, color: '#333', fontWeight: '500' },
  field: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: '#444', marginBottom: 6 },
  input: {
    backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: '#222', borderWidth: 1.5, borderColor: '#E8E8E8',
  },
  textarea: { height: 80, paddingTop: 10 },
  saveBtn: {
    backgroundColor: '#1565C0', borderRadius: 12, height: 50, flexDirection: 'row',
    justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 8,
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
