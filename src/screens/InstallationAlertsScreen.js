import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../api/client';
import { useRole, projectMatchesRole } from '../context/RoleContext';
import { formatDate } from '../utils/helpers';
import { isInstallationType, buildFlagsMap } from '../utils/projectTypeHelper';

export default function InstallationAlertsScreen({ navigation }) {
  const { visibleCrmIds } = useRole();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const [projRes, relRes] = await Promise.allSettled([
        api.post('/Project/GetAll', { pageNo: 1, pageSize: 200, includeClosed: true }),
        api.get('/Project/GetRelatedObjectsForFilter'),
      ]);
      if (projRes.status === 'rejected') throw projRes.reason;
      const all = projRes.value?.data?.data ?? [];
      const flagsMap = relRes.status === 'fulfilled'
        ? buildFlagsMap(relRes.value?.data?.data || relRes.value?.data || {})
        : {};
      const roleFiltered = visibleCrmIds
        ? all.filter(p => projectMatchesRole(p, visibleCrmIds))
        : all;
      // Only Installation projects that are completed (statusId=3)
      const alerts = roleFiltered.filter(
        p => isInstallationType(p, flagsMap) && p.statusId === 3
      );
      setProjects(alerts);
      setError(null);
    } catch (e) {
      setError(e?.response?.data?.message || 'تعذر تحميل البيانات');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [visibleCrmIds]);

  // load on mount
  React.useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#E65100" />
        <Text style={styles.centerText}>جاري التحميل...</Text>
      </View>
    );
  }

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => navigation.navigate('ProjectDetail', { projectId: item.id, title: item.title })}
      activeOpacity={0.75}
    >
      {/* Header row */}
      <View style={styles.cardHeader}>
        <View style={styles.alertBadge}>
          <Ionicons name="alert-circle" size={16} color="#fff" />
          <Text style={styles.alertBadgeText}>يحتاج إجراء</Text>
        </View>
        {item.dateEnd && (
          <Text style={styles.dateText}>{formatDate(item.dateEnd)}</Text>
        )}
      </View>

      {/* Title */}
      <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>

      {/* Meta row */}
      <View style={styles.metaRow}>
        {item.branch?.name || item.branchName ? (
          <View style={styles.metaItem}>
            <Ionicons name="business-outline" size={13} color="#666" />
            <Text style={styles.metaText}>{item.branch?.name || item.branchName}</Text>
          </View>
        ) : null}
        {item.customerName || item.customer?.fullName ? (
          <View style={styles.metaItem}>
            <Ionicons name="person-outline" size={13} color="#666" />
            <Text style={styles.metaText}>{item.customerName || item.customer?.fullName}</Text>
          </View>
        ) : null}
      </View>

      {/* Action hint */}
      <View style={styles.actionRow}>
        <Text style={styles.actionHint}>اضغط لفتح المشروع واتخاذ الإجراء</Text>
        <Ionicons name="chevron-forward" size={16} color="#E65100" />
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.root}>
      {/* Info banner */}
      <View style={styles.infoBanner}>
        <Ionicons name="information-circle-outline" size={16} color="#7B3F00" />
        <Text style={styles.infoBannerText}>
          هذه المشاريع نوعها توريد (Installation) وقد اكتملت — يرجى اتخاذ الإجراء المناسب لكل منها.
        </Text>
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <Ionicons name="wifi-outline" size={16} color="#C62828" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={load} style={styles.retryBtn}>
            <Text style={styles.retryText}>إعادة</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={projects}
        keyExtractor={item => String(item.id)}
        renderItem={renderItem}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#E65100']} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          !error ? (
            <View style={styles.empty}>
              <Ionicons name="checkmark-done-circle-outline" size={56} color="#ccc" />
              <Text style={styles.emptyTitle}>لا توجد مشاريع توريد منتهية</Text>
              <Text style={styles.emptySubtitle}>ستظهر هنا أي مشاريع توريد تكتمل وتحتاج إلى إجراء</Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F5F5F5' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  centerText: { color: '#888', fontSize: 14 },
  list: { padding: 12, gap: 12, paddingBottom: 32 },

  infoBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#FFF3E0', paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#FFB74D',
  },
  infoBannerText: { flex: 1, fontSize: 12, color: '#7B3F00', lineHeight: 18 },

  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FFEBEE', paddingHorizontal: 14, paddingVertical: 8,
  },
  errorText: { flex: 1, fontSize: 13, color: '#C62828' },
  retryBtn: { paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#C62828', borderRadius: 6 },
  retryText: { fontSize: 12, color: '#fff', fontWeight: '600' },

  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 4,
    borderLeftColor: '#E65100',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  alertBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#E65100', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3,
  },
  alertBadgeText: { fontSize: 11, color: '#fff', fontWeight: '700' },
  dateText: { fontSize: 12, color: '#888' },

  cardTitle: { fontSize: 15, fontWeight: '700', color: '#1a1a1a', marginBottom: 8, lineHeight: 22 },

  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 10 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 13, color: '#555' },

  actionRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderTopWidth: 1, borderTopColor: '#F0F0F0', paddingTop: 8, marginTop: 2,
  },
  actionHint: { fontSize: 12, color: '#E65100', fontStyle: 'italic' },

  empty: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#999' },
  emptySubtitle: { fontSize: 13, color: '#bbb', textAlign: 'center', paddingHorizontal: 32, lineHeight: 20 },
});
