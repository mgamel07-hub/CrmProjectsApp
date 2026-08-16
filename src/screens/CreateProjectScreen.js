import React, { useEffect, useState, useMemo } from 'react';
import {
  View, Text, TextInput, ScrollView, StyleSheet, FlatList, Modal,
  TouchableOpacity, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  createProject, getProjectRelatedObjects,
  getAccountsDropdown, getAccountsDynamic,
  getBranches, getUserBranches, getProducts,
} from '../api/projects';
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
  const [related, setRelated] = useState({ branches: [], customers: [], flags: [], products: [] });
  const [form, setForm] = useState({
    title: '', description: '', branchId: null,
    customerId: null, projectTypeFlagId: null,
    productId: null,
    allocatedUnits: '', dateStart: '', dateEnd: '',
  });

  const set = (key, val) => setForm((prev) => ({ ...prev, [key]: val }));

  useEffect(() => {
    (async () => {
      try {
        // Decode JWT to get user's default branch
        let jwtBranchId = null;
        try {
          const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
          const tok = await AsyncStorage.getItem('token');
          const pad = (s) => s + '='.repeat((4 - s.length % 4) % 4);
          const claims = JSON.parse(atob(pad(tok.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))));
          jwtBranchId = claims.BranchId ? Number(claims.BranchId) : null;
        } catch (_) {}

        const [relRes, branchRes, userBranchRes, custRes, custDynRes, prodRes] = await Promise.all([
          getProjectRelatedObjects(),
          getBranches().catch(() => null),
          getUserBranches().catch(() => null),
          getAccountsDropdown().catch(() => null),
          getAccountsDynamic().catch(() => null),
          getProducts().catch(() => null),
        ]);

        const data = extractData(relRes) || {};

        // Branches: merge all-branches + user-branches, dedup by id
        const rawBranches = (() => {
          const fromAll  = extractList(branchRes)     || extractData(branchRes)     || [];
          const fromUser = extractList(userBranchRes) || extractData(userBranchRes) || [];
          const merged = [...(Array.isArray(fromAll) ? fromAll : []), ...(Array.isArray(fromUser) ? fromUser : [])];
          return merged.length ? merged : (data.branchesDDL || data.branches || []);
        })();

        const branchSeen = new Map();
        rawBranches.forEach((b) => {
          const rawKey = b.key ?? b.officeId ?? b.id;
          const label = b.value || b.officeName || b.branchName || b.name || String(rawKey ?? '');
          const dk = String(rawKey ?? '');
          if (rawKey != null && !branchSeen.has(dk)) branchSeen.set(dk, { value: rawKey, label });
        });

        // Customers
        const rawCust = (() => {
          const s = extractList(custRes) || extractData(custRes);
          if (Array.isArray(s) && s.length) return s;
          const d = extractList(custDynRes) || extractData(custDynRes);
          if (Array.isArray(d) && d.length) return d;
          return data.customersDDL || data.accounts || [];
        })();
        const customers = rawCust
          .map((c) => ({ value: c.key ?? c.id ?? c.customerId, label: c.value || c.fullName || c.localName || c.name || '' }))
          .filter((c) => c.value != null && c.label);

        // Products for scope
        const rawProds = extractList(prodRes) || extractData(prodRes) || [];
        const products = Array.isArray(rawProds)
          ? rawProds.map((p) => ({ value: p.key ?? p.id, label: p.value || p.name || String(p.key ?? p.id) })).filter((p) => p.value != null)
          : [];

        setRelated({
          branches: Array.from(branchSeen.values()),
          customers,
          flags: (data.projectTypeFlagsDDL || data.flags || [])
            .map((f) => ({ value: f.key ?? f.id, label: f.value || f.name || String(f.key ?? f.id) }))
            .filter((f) => f.value != null),
          products,
        });

        // Pre-select user's own branch and first available product
        if (jwtBranchId) setForm((prev) => ({ ...prev, branchId: jwtBranchId }));
        if (products.length > 0) setForm((prev) => ({ ...prev, productId: products[0].value }));

      } catch (_) {}
    })();
  }, []);

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

    const toISO = (d) => {
      if (!d) return null;
      return d.includes('T') ? d : `${d}T00:00:00`;
    };

    setSaving(true);
    try {
      // Decode JWT for structureId
      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
      const tok = await AsyncStorage.getItem('token');
      let structureId = null;
      try {
        const pad = (s) => s + '='.repeat((4 - s.length % 4) % 4);
        const claims = JSON.parse(atob(pad(tok.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))));
        structureId = claims.StructureId ? Number(claims.StructureId) : null;
      } catch (_) {}

      // flagId may arrive as composite "370-1" — API wants only the numeric part after the dash
      const rawFlag = form.projectTypeFlagId;
      const flagId = rawFlag
        ? (String(rawFlag).includes('-') ? Number(String(rawFlag).split('-').pop()) : Number(rawFlag))
        : null;

      // productId: user selection, or fallback to known-valid product 203
      const productId = form.productId ?? 203;

      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        branchId: Number(form.branchId),
        customerId: form.customerId ? Number(form.customerId) : null,
        projectTypeFlagId: flagId || null,
        allocatedUnits: Number(form.allocatedUnits),
        structureId,
        dateStart: toISO(form.dateStart),
        dateEnd: toISO(form.dateEnd),
        projectScope: [{
          productId,
          weightPercent: 100,
          allocatedUnits: Number(form.allocatedUnits),
          propertyId: null,
          dateStart: null,
          dateEnd: null,
        }],
      };

      // TEMP DEBUG — remove after diagnosis
      await new Promise((resolve) => {
        Alert.alert(
          'DEBUG PAYLOAD',
          `branchId: ${payload.branchId}\nstructureId: ${payload.structureId}\nproductId: ${payload.projectScope[0]?.productId}\ncustomerId: ${payload.customerId}\nflagId: ${payload.projectTypeFlagId}`,
          [{ text: 'Send', onPress: resolve }]
        );
      });

      const res = await createProject(payload);
      const body = res?.data;

      if (body?.isSuccess === false) {
        const detail = [body?.message, ...(body?.errors || [])].filter(Boolean).join('\n');
        Alert.alert(t('error'), detail || (lang === 'ar' ? 'فشل إنشاء المشروع' : 'Failed to create project'));
        return;
      }

      const newId = body?.data?.id ?? body?.data;
      Alert.alert(
        t('success'),
        lang === 'ar' ? 'تم إنشاء المشروع بنجاح' : 'Project created successfully',
        [{
          text: 'OK',
          onPress: () => {
            if (newId && typeof newId === 'number') {
              navigation.replace('ProjectDetail', { projectId: newId, title: form.title.trim() });
            } else {
              navigation.goBack();
            }
          },
        }]
      );
    } catch (e) {
      const errBody = e?.response?.data;
      Alert.alert(t('error'), errBody?.message || errBody?.errors?.join('\n') || t('networkError'));
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

      <Field label={lang === 'ar' ? 'المنتج / النظام' : 'Product / System'} required>
        <Select
          options={related.products.length > 0 ? related.products : [{ value: 203, label: lang === 'ar' ? 'المنتج الافتراضي' : 'Default product' }]}
          value={form.productId ?? 203}
          onSelect={(v) => set('productId', v)}
          placeholder={lang === 'ar' ? 'اختر المنتج' : 'Select product'}
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
