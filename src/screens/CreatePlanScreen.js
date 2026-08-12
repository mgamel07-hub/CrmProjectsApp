import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { createPlan } from '../api/projects';
import { t } from '../i18n';
import { useLang } from '../context/LangContext';

export default function CreatePlanScreen({ navigation, route }) {
  const { stageId } = route.params;
  const { lang } = useLang();
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    setSaving(true);
    try {
      await createPlan({ projectScopeStageId: stageId });
      Alert.alert(t('success'), lang === 'ar' ? 'تم إنشاء الخطة' : 'Plan created', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      Alert.alert(t('error'), e?.response?.data?.message || t('networkError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.content}>
        <View style={styles.iconWrap}>
          <Ionicons name="document-text-outline" size={64} color="#1565C0" />
        </View>
        <Text style={styles.title}>{lang === 'ar' ? 'إنشاء خطة جديدة' : 'Create New Plan'}</Text>
        <Text style={styles.sub}>
          {lang === 'ar'
            ? 'سيتم إنشاء خطة جديدة بحالة "مسودة"، ثم يمكنك إضافة البنود وتقديمها للموافقة'
            : 'A new plan will be created as "Draft". You can then add items and submit for approval.'}
        </Text>

        <TouchableOpacity style={styles.btn} onPress={handleCreate} disabled={saving}>
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="add-circle-outline" size={20} color="#fff" />
              <Text style={styles.btnText}>{lang === 'ar' ? 'إنشاء الخطة' : 'Create Plan'}</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.cancelBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.cancelText}>{t('cancel')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F5F7FA', justifyContent: 'center' },
  content: { padding: 32, alignItems: 'center' },
  iconWrap: {
    width: 100, height: 100, borderRadius: 50, backgroundColor: '#EEF3FF',
    justifyContent: 'center', alignItems: 'center', marginBottom: 20,
  },
  title: { fontSize: 22, fontWeight: '800', color: '#1a1a1a', marginBottom: 10, textAlign: 'center' },
  sub: { fontSize: 14, color: '#666', textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  btn: {
    backgroundColor: '#1565C0', borderRadius: 12, height: 50, width: '100%',
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, elevation: 2,
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  cancelBtn: { marginTop: 14 },
  cancelText: { color: '#888', fontSize: 14 },
});
