import React, { useEffect, useState, useMemo } from 'react';
import {
  View, Text, TextInput, ScrollView, StyleSheet, FlatList, Modal,
  TouchableOpacity, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { createProject, getProjectRelatedObjects, getAccountsDropdown, getBranches } from '../api/projects';
import { t } from '../i18n';
import { useLang } from '../context/LangContext';
import { extractData, extractList } from '../utils/helpers';

function Field({ label, required, children }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}{required ? ' *' : ''}</Text>
      {children}
    </View>
  );
}

function Select({ options, value, onSelect, placeholder, lang }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() =>
    search ? options.filter((o) => o.label?.toLowerCase().includes(search.toLowerCase())) : options,
    [options, search]
  );

  return (
    <View>
      <TouchableOpacity style={styles.select} onPress={() => { setSearch(''); setOpen(true); }}>
        <Text style={selected ? styles.selectText : styles.selectPlaceholder} numberOfLines={1}>
          {selected?.label || placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color="#888" />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setOpen(false)}>
          <View style={styles.modalBox}>
            <View style={styles.searchRow}>
              <Ionicons name="search-outline" size={16} color="#888" />
              <TextInput
                style={styles.searchInput}
                value={search}
                onChangeText={setSearch}
                placeholder={lang === 'ar' ? 'بحث...' : 'Search...'}
                placeholderTextColor="#aaa"
                autoFocus
                textAlign={lang === 'ar' ? 'right' : 'left'}
              />
              {search ? <TouchableOpacity onPress={() => setSearch('')}><Ionicons name="close" size={16} color="#aaa" /></TouchableOpacity> : null}
            </View>
            <FlatList
              data={filtered}
              keyExtractor={(o, i) => o.value != null ? String(o.value) : String(i)}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.dropdownItem, value === item.value && styles.dropdownItemActive]}
                  onPress={() => { onSelect(item.value); setOpen(false); setSearch(''); }}
                >
                  <Text style={[styles.dropdownText, value === item.value && styles.dropdownTextActive]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text style={styles.emptyText}>{lang === 'ar' ? 'لا توجد نتائج' : 'No results'}</Text>}
              style={{ maxHeight: 300 }}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

export default function CreateProjectScreen({ navigation }) {
  const { lang } = useLang();
  const [saving, setSaving] = useState(false);
  const [related, setRelated] = useState({ branches: [], customers: [], flags: [] });
  const [form, setForm] = useState({
    title: '', description: '', branchId: null,
    customerId: null, projectTypeFlagId: null,
    allocatedUnits: '', dateStart: '', dateEnd: '',
  });

  useEffect(() => {
    (async () => {
      try {
        const [relRes, branchRes, custRes] = await Promise.all([
          getProjectRelatedObjects(),
          getBranches().catch((e) => { console.log('BRANCH_ERR', e?.response?.status, e?.message); return null; }),
          getAccountsDropdown().catch((e) => { console.log('CUST_ERR', e?.response?.status, e?.message); return null; }),
        ]);
        console.log('REL_RAW', JSON.stringify(relRes?.data)?.slice(0, 300));
        console.log('BRANCH_RAW', JSON.stringify(branchRes?.data)?.slice(0, 300));
        console.log('CUST_RAW', JSON.stringify(custRes?.data)?.slice(0, 300));
        const data = extractData(relRes) || {};

        // ── Branches ────────────────────────────────────────────────────────
        const rawBranches = (() => {
          const list = extractList(branchRes) || extractData(branchRes);
          if (Array.isArray(list) && list.length) return list;
          return data.branchesDDL || data.branches || [];
        })();

        // Normalise: API returns {key,value} OR {officeId,branchName} OR {id,name}
        const normBranch = (b) => ({
          value: b.key ?? b.officeId ?? b.branchTransId ?? b.id,
          label: b.value || b.branchName || b.officeName || b.name || String(b.key ?? b.id ?? ''),
          dedupeKey: b.branchTransId ?? b.key ?? b.officeId ?? b.id,
        });

        const branchSeen = new Map();
        rawBranches.forEach((b) => {
          const n = normBranch(b);
          if (n.value != null && !branchSeen.has(n.dedupeKey)) {
            branchSeen.set(n.dedupeKey, { value: n.value, label: n.label });
          }
        });

        // ── Customers ───────────────────────────────────────────────────────
        const rawCust = (() => {
          const list = extractList(custRes) || extractData(custRes);
          if (Array.isArray(list)) return list;
          return data.customersDDL || data.accounts || [];
        })();

        // Normalise: {key,value} OR {id,fullName} OR {customerId,name}
        const customers = rawCust
          .map((c) => ({
            value: c.key ?? c.id ?? c.customerId,
            label: c.value || c.fullName || c.localName || c.name || String(c.key ?? c.id ?? ''),
          }))
          .filter((c) => c.value != null && c.label);

        setRelated({
          branches: Array.from(branchSeen.values()),
          customers,
          flags: (data.projectTypeFlagsDDL || data.flags || [])
            .map((f) => ({ value: f.key ?? f.id, label: f.value || f.name || String(f.key ?? f.id) }))
            .filter((f) => f.value != null),
        });
      } catch (_) {}
    })();
  }, []);

  const set = (key, val) => setForm((prev) => ({ ...prev, [key]: val }));

  const handleSave = async () => {
    if (!form.title.trim()) {
      Alert.alert(t('error'), lang === 'ar' ? 'العنوان مطلوب' : 'Title is required');
      return;
    }
    if (!form.branchId) {
      Alert.alert(t('error'), lang === 'ar' ? 'الفرع مطلوب' : 'Branch is required');
      return;
    }
    if (!form.allocatedUnits || isNaN(Number(form.allocatedUnits))) {
      Alert.alert(t('error'), lang === 'ar' ? 'الوحدات المخصصة مطلوبة' : 'Allocated units required');
      return;
    }

    setSaving(true);
    try {
      await createProject({
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        branchId: form.branchId,
        customerId: form.customerId || undefined,
        projectTypeFlagId: form.projectTypeFlagId || undefined,
        allocatedUnits: Number(form.allocatedUnits),
        dateStart: form.dateStart || undefined,
        dateEnd: form.dateEnd || undefined,
      });
      Alert.alert(t('success'), lang === 'ar' ? 'تم إنشاء المشروع بنجاح' : 'Project created successfully', [
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
      <Field label={t('projectTitle')} required>
        <TextInput
          style={styles.input}
          value={form.title}
          onChangeText={(v) => set('title', v)}
          placeholder={lang === 'ar' ? 'أدخل اسم المشروع' : 'Enter project name'}
          placeholderTextColor="#aaa"
          textAlign={lang === 'ar' ? 'right' : 'left'}
        />
      </Field>

      <Field label={t('description')}>
        <TextInput
          style={[styles.input, styles.textarea]}
          value={form.description}
          onChangeText={(v) => set('description', v)}
          placeholder={lang === 'ar' ? 'وصف المشروع (اختياري)' : 'Project description (optional)'}
          placeholderTextColor="#aaa"
          multiline
          numberOfLines={3}
          textAlignVertical="top"
          textAlign={lang === 'ar' ? 'right' : 'left'}
        />
      </Field>

      <Field label={t('branch')} required>
        <Select
          options={related.branches}
          value={form.branchId}
          onSelect={(v) => set('branchId', v)}
          placeholder={lang === 'ar' ? 'اختر الفرع' : 'Select branch'}
          lang={lang}
        />
      </Field>

      <Field label={t('customer')}>
        <Select
          options={related.customers}
          value={form.customerId}
          onSelect={(v) => set('customerId', v)}
          placeholder={lang === 'ar' ? 'اختر العميل (اختياري)' : 'Select customer (optional)'}
          lang={lang}
        />
      </Field>

      <Field label={t('projectType')}>
        <Select
          options={related.flags}
          value={form.projectTypeFlagId}
          onSelect={(v) => set('projectTypeFlagId', v)}
          placeholder={lang === 'ar' ? 'اختر نوع المشروع' : 'Select project type'}
          lang={lang}
        />
      </Field>

      <Field label={t('allocatedUnits')} required>
        <TextInput
          style={styles.input}
          value={form.allocatedUnits}
          onChangeText={(v) => set('allocatedUnits', v)}
          keyboardType="numeric"
          placeholder="0"
          placeholderTextColor="#aaa"
          textAlign={lang === 'ar' ? 'right' : 'left'}
        />
      </Field>

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
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
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
  textarea: { height: 80, paddingTop: 10 },
  select: {
    backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderWidth: 1.5, borderColor: '#E8E8E8',
  },
  selectText: { fontSize: 14, color: '#222' },
  selectPlaceholder: { fontSize: 14, color: '#aaa' },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 20,
  },
  modalBox: {
    backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden',
    elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 10,
  },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#F0F0F0', gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14, color: '#222', height: 36 },
  dropdownItem: { paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  dropdownItemActive: { backgroundColor: '#F0F4FF' },
  dropdownText: { fontSize: 14, color: '#333' },
  dropdownTextActive: { color: '#1565C0', fontWeight: '600' },
  emptyText: { textAlign: 'center', color: '#aaa', padding: 20 },
  dateRow: { flexDirection: 'row', gap: 12 },
  saveBtn: {
    backgroundColor: '#1565C0', borderRadius: 12, height: 50, flexDirection: 'row',
    justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 8, elevation: 2,
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
