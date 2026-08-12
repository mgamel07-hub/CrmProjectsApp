import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  TextInput, RefreshControl, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getProjects, deleteProject } from '../api/projects';
import { t } from '../i18n';
import { useLang } from '../context/LangContext';
import { useAuth } from '../context/AuthContext';
import { DEMO_PROJECTS } from '../api/demoData';
import { extractList, getProjectStatusLabel, getProjectStatusColor, formatDate } from '../utils/helpers';
import LoadingScreen from '../components/LoadingScreen';
import ErrorMessage from '../components/ErrorMessage';
import StatusBadge from '../components/StatusBadge';
import ProgressBar from '../components/ProgressBar';

export default function ProjectsScreen({ navigation, route }) {
  const { lang } = useLang();
  const { isDemo, can } = useAuth();
  const canCreate = can('Project', 'create');
  const canDelete = can('Project', 'delete');
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(route.params?.statusId || null);

  const statuses = [
    { id: null, label: t('all') },
    { id: 1, label: t('status1') },
    { id: 2, label: t('status2') },
    { id: 3, label: t('status3') },
    { id: 4, label: t('status4') },
  ];

  const load = useCallback(async () => {
    if (isDemo) {
      let data = DEMO_PROJECTS;
      if (statusFilter) data = data.filter(p => p.statusId === statusFilter);
      if (search) data = data.filter(p => p.title.includes(search));
      setProjects(data);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const res = await getProjects({
        pageNumber: 1, pageSize: 100,
        searchText: search || undefined,
        statusId: statusFilter || undefined,
        includeClosed: true,
      });
      setProjects(extractList(res) || []);
      setError(null);
    } catch (e) {
      setError(e?.response?.data?.message || t('networkError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [search, statusFilter, isDemo]);

  useEffect(() => { load(); }, [load]);

  // Refresh when screen comes back into focus (e.g. after creating a project)
  useEffect(() => {
    const unsub = navigation.addListener('focus', load);
    return unsub;
  }, [navigation, load]);

  useEffect(() => {
    navigation.setOptions({
      headerRight: canCreate ? () => (
        <TouchableOpacity
          style={{ marginRight: 16 }}
          onPress={() => navigation.navigate('CreateProject')}
        >
          <Ionicons name="add-circle" size={28} color="#1565C0" />
        </TouchableOpacity>
      ) : undefined,
    });
  }, [navigation, canCreate]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const handleDelete = (item) => {
    Alert.alert(
      lang === 'ar' ? 'تأكيد الحذف' : 'Confirm Delete',
      lang === 'ar' ? `هل أنت متأكد من حذف "${item.title}"؟` : `Delete "${item.title}"?`,
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete'), style: 'destructive',
          onPress: async () => {
            try {
              await deleteProject(item.id);
              setProjects((prev) => prev.filter((p) => p.id !== item.id));
            } catch (e) {
              Alert.alert(t('error'), e?.response?.data?.message || t('networkError'));
            }
          },
        },
      ]
    );
  };

  if (loading) return <LoadingScreen />;
  if (error && !projects.length) return <ErrorMessage message={error} onRetry={load} />;

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => navigation.navigate('ProjectDetail', { projectId: item.id, title: item.title })}
      onLongPress={canDelete ? () => handleDelete(item) : undefined}
      activeOpacity={0.7}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
        <StatusBadge
          label={getProjectStatusLabel(item.statusId)}
          color={getProjectStatusColor(item.statusId)}
        />
      </View>
      {item.branch && <Text style={styles.cardMeta}><Ionicons name="business-outline" size={13} /> {item.branch.name}</Text>}
      {item.customer && <Text style={styles.cardMeta}><Ionicons name="person-outline" size={13} /> {item.customer.fullName}</Text>}
      <View style={styles.cardFooter}>
        <Text style={styles.units}><Ionicons name="cube-outline" size={13} /> {item.allocatedUnits} {t('units')}</Text>
        {item.dateEnd && <Text style={styles.date}>{formatDate(item.dateEnd)}</Text>}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.root}>
      {/* Search */}
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={18} color="#888" />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder={t('search')}
            placeholderTextColor="#aaa"
            returnKeyType="search"
            onSubmitEditing={load}
            textAlign={lang === 'ar' ? 'right' : 'left'}
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color="#aaa" />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Status filter chips */}
      <View style={styles.chips}>
        {statuses.map((s) => (
          <TouchableOpacity
            key={String(s.id)}
            style={[styles.chip, statusFilter === s.id && styles.chipActive]}
            onPress={() => setStatusFilter(s.id)}
          >
            <Text style={[styles.chipText, statusFilter === s.id && styles.chipTextActive]}>{s.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={projects}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1565C0']} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="folder-open-outline" size={48} color="#ccc" />
            <Text style={styles.emptyText}>{t('noData')}</Text>
          </View>
        }
      />

      {canCreate && (
        <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate('CreateProject')}>
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F5F7FA' },
  searchRow: { padding: 12, paddingBottom: 8 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: 10, paddingHorizontal: 12, gap: 8,
    elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3,
  },
  searchInput: { flex: 1, height: 42, fontSize: 14, color: '#222' },
  chips: { flexDirection: 'row', paddingHorizontal: 12, paddingBottom: 8, gap: 8, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: '#E8EEF8', borderWidth: 1, borderColor: 'transparent' },
  chipActive: { backgroundColor: '#1565C0', borderColor: '#1565C0' },
  chipText: { fontSize: 13, color: '#555', fontWeight: '500' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  list: { padding: 12, paddingTop: 4, paddingBottom: 32 },
  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 4,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, gap: 8 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#1a1a1a', flex: 1 },
  cardMeta: { fontSize: 12, color: '#666', marginBottom: 3 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  units: { fontSize: 12, color: '#1565C0', fontWeight: '600' },
  date: { fontSize: 12, color: '#888' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyText: { color: '#aaa', marginTop: 10, fontSize: 14 },
  fab: {
    position: 'absolute', bottom: 24, right: 20,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#1565C0', justifyContent: 'center', alignItems: 'center',
    elevation: 6, shadowColor: '#1565C0', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.4, shadowRadius: 6,
  },
});
