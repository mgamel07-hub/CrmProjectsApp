import React, { useState } from 'react';
import {
  View, Text, TextInput, ScrollView, StyleSheet,
  TouchableOpacity, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { createScope } from '../api/projects';
import { t } from '../i18n';
import { useLang } from '../context/LangContext';

export default function CreateScopeScreen({ navigation, route }) {
  const { projectId } = route.params;
  const { lang } = useLang();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    weightPercent: '', allocatedUnits: '', dateStart: '', dateEnd: '',
  });

  const set = (key, val) => setForm((prev) => ({ ...prev, [key]: val }));

  const handleSave = async () => {
    if (!form.weightPercent || isNaN(Number(form.weightPercent))) {
      Alert.alert(t('error'), lang === 'ar' ? 'النسبة المئوية مطلوبة' : 'Weight percent is required');
      return;
    }
    if (!form.allocatedUnits || isNaN(Number(form.allocatedUnits))) {
      Alert.alert(t('error'), lang === 'ar' ? 'الوحدات المخصصة مطلوبة' : 'Allocated units required');
      return;
    }

    setSaving(true);
    try {
      await createScope({
        projectId,
        weightPercent: Number(form.weightPercent),
        allocatedUnits: Number(form.allocatedUnits),
        dateStart: form.dateStart || undefined,
        dateEnd: form.dateEnd || undefined,
      });
      Alert.alert(t('success'), lang === 'ar' ? 'تم إنشاء النطاق بنجاح' : 'Scope created', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      Alert.alert(t('error'), e?.response?.data?.message || t('networkError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.field}>
        <Text style={styles.label}>{t('weight')} (%) *</Text>
        <TextInput
          style={styles.input}
          value={form.weightPercent}
          onChangeText={(v) => set('weightPercent', v)}
          keyboardType="decimal-pad"
          placeholder="0.0"
          placeholderTextColor="#aaa"
          textAlign={lang === 'ar' ? 'right' : 'left'}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>{t('allocatedUnits')} *</Text>
        <TextInput
          style={styles.input}
          value={form.allocatedUnits}
          onChangeText={(v) => set('allocatedUnits', v)}
          keyboardType="numeric"
          placeholder="0"
          placeholderTextColor="#aaa"
          textAlign={lang === 'ar' ? 'right' : 'left'}
        />
      </View>

      <View style={styles.dateRow}>
        <View style={[styles.field, { flex: 1 }]}>
          <Text style={styles.label}>{t('startDate')}</Text>
          <TextInput
            style={styles.input}
            value={form.dateStart}
            onChangeText={(v) => set('dateStart', v)}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#aaa"
          />
        </View>
        <View style={[styles.field, { flex: 1 }]}>
          <Text style={styles.label}>{t('endDate')}</Text>
          <TextInput
            style={styles.input}
            value={form.dateEnd}
            onChangeText={(v) => set('dateEnd', v)}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#aaa"
          />
        </View>
      </View>

      <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : (
          <>
            <Ionicons name="save-outline" size={18} color="#fff" />
            <Text style={styles.saveBtnText}>{t('create')}</Text>
          </>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F5F7FA' },
  content: { padding: 16, paddingBottom: 40 },
  field: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: '#444', marginBottom: 6 },
  input: {
    backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: '#222', borderWidth: 1.5, borderColor: '#E8E8E8',
  },
  dateRow: { flexDirection: 'row', gap: 12 },
  saveBtn: {
    backgroundColor: '#1565C0', borderRadius: 12, height: 50, flexDirection: 'row',
    justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 8,
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
