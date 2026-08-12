import React, { useState } from 'react';
import {
  View, Text, TextInput, ScrollView, StyleSheet,
  TouchableOpacity, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { createPlanItem } from '../api/projects';
import { t } from '../i18n';
import { useLang } from '../context/LangContext';

export default function CreatePlanItemScreen({ navigation, route }) {
  const { planId, onDone } = route.params;
  const { lang } = useLang();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: '', expectedUnits: '', scheduledDate: '' });

  const set = (key, val) => setForm((prev) => ({ ...prev, [key]: val }));

  const handleSave = async () => {
    if (!form.title.trim()) {
      Alert.alert(t('error'), lang === 'ar' ? 'العنوان مطلوب' : 'Title is required');
      return;
    }
    if (!form.expectedUnits || isNaN(Number(form.expectedUnits))) {
      Alert.alert(t('error'), lang === 'ar' ? 'الوحدات المتوقعة مطلوبة' : 'Expected units required');
      return;
    }

    setSaving(true);
    try {
      await createPlanItem({
        projectPlanId: planId,
        title: form.title.trim(),
        expectedUnits: Number(form.expectedUnits),
        scheduledDate: form.scheduledDate || undefined,
      });
      if (onDone) onDone();
      navigation.goBack();
    } catch (e) {
      Alert.alert(t('error'), e?.response?.data?.message || t('networkError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.field}>
        <Text style={styles.label}>{t('title')} *</Text>
        <TextInput
          style={styles.input}
          value={form.title}
          onChangeText={(v) => set('title', v)}
          placeholder={lang === 'ar' ? 'عنوان البند' : 'Item title'}
          placeholderTextColor="#aaa"
          textAlign={lang === 'ar' ? 'right' : 'left'}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>{t('expectedUnits')} *</Text>
        <TextInput
          style={styles.input}
          value={form.expectedUnits}
          onChangeText={(v) => set('expectedUnits', v)}
          keyboardType="numeric"
          placeholder="0"
          placeholderTextColor="#aaa"
          textAlign={lang === 'ar' ? 'right' : 'left'}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>{t('scheduledDate')}</Text>
        <TextInput
          style={styles.input}
          value={form.scheduledDate}
          onChangeText={(v) => set('scheduledDate', v)}
          placeholder="YYYY-MM-DD"
          placeholderTextColor="#aaa"
        />
      </View>

      <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Ionicons name="save-outline" size={18} color="#fff" />
            <Text style={styles.saveBtnText}>{t('add')}</Text>
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
  saveBtn: {
    backgroundColor: '#1565C0', borderRadius: 12, height: 50, flexDirection: 'row',
    justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 8,
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
