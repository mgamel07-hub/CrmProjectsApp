import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, RefreshControl, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getUnitsRequests, approveUnitsRequest, rejectUnitsRequest } from '../api/projects';
import { t } from '../i18n';
import { useLang } from '../context/LangContext';
import { useAuth } from '../context/AuthContext';
import { DEMO_APPROVALS } from '../api/demoData';
import { extractList, getRequestStatusLabel, getRequestStatusColor, formatDate } from '../utils/helpers';
import LoadingScreen from '../components/LoadingScreen';
import ErrorMessage from '../components/ErrorMessage';
import StatusBadge from '../components/StatusBadge';
import Card from '../components/Card';

export default function ApprovalsScreen({ navigation }) {
  const { lang } = useLang();
  const { isDemo } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('pending');

  const load = useCallback(async () => {
    if (isDemo) {
      const statusId = filter === 'pending' ? 1 : filter === 'approved' ? 2 : 3;
      setRequests(DEMO_APPROVALS.filter(r => r.statusId === statusId));
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const statusId = filter === 'pending' ? 1 : filter === 'approved' ? 2 : filter === 'rejected' ? 3 : undefined;
      const res = await getUnitsRequests({ statusId, pageNumber: 1, pageSize: 100 });
      setRequests(extractList(res));
      setError(null);
    } catch (e) {
      setError(e?.response?.data?.message || t('networkError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter, isDemo]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const handleApprove = (req) => {
    Alert.prompt(
      lang === 'ar' ? 'عدد الوحدات المعتمدة' : 'Approved Units',
      lang === 'ar' ? 'أدخل عدد الوحدات المعتمدة' : 'Enter approved unit count',
      async (count) => {
        if (!count) return;
        try {
          await approveUnitsRequest(req.id, { approvedUnitCount: Number(count) });
          load();
        } catch (e) {
          Alert.alert(t('error'), e?.response?.data?.message || t('networkError'));
        }
      },
      'plain-text',
      String(req.requestedUnitCount)
    );
  };

  const handleReject = (req) => {
    Alert.prompt(
      lang === 'ar' ? 'سبب الرفض' : 'Rejection Reason',
      lang === 'ar' ? 'أدخل سبب الرفض' : 'Enter rejection reason',
      async (reason) => {
        if (reason === null) return;
        try {
          await rejectUnitsRequest(req.id, { reason });
          load();
        } catch (e) {
          Alert.alert(t('error'), e?.response?.data?.message || t('networkError'));
        }
      },
      'plain-text'
    );
  };

  const filters = [
    { key: 'pending', label: lang === 'ar' ? 'معلق' : 'Pending' },
    { key: 'approved', label: lang === 'ar' ? 'معتمد' : 'Approved' },
    { key: 'rejected', label: lang === 'ar' ? 'مرفوض' : 'Rejected' },
    { key: 'all', label: t('all') },
  ];

  if (loading) return <LoadingScreen />;
  if (error && !requests.length) return <ErrorMessage message={error} onRetry={load} />;

  return (
    <View style={styles.root}>
      {/* Filter chips */}
      <View style={styles.chips}>
        {filters.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.chip, filter === f.key && styles.chipActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[styles.chipText, filter === f.key && styles.chipTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={requests}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1565C0']} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="checkmark-done-circle-outline" size={48} color="#ccc" />
            <Text style={styles.emptyText}>{t('noData')}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Card style={styles.reqCard}>
            <View style={styles.reqHeader}>
              <View style={styles.reqLeft}>
                <Text style={styles.reqTitle}>
                  {lang === 'ar' ? 'طلب رقم' : 'Request #'}{item.id}
                </Text>
                <Text style={styles.reqSub} numberOfLines={1}>
                  {item.projectPlanItem?.title || ''}
                </Text>
              </View>
              <StatusBadge
                label={getRequestStatusLabel(item.statusId)}
                color={getRequestStatusColor(item.statusId)}
              />
            </View>

            <View style={styles.unitsRow}>
              <View style={styles.unitBox}>
                <Text style={styles.unitLabel}>{lang === 'ar' ? 'مطلوب' : 'Requested'}</Text>
                <Text style={[styles.unitValue, { color: '#F57C00' }]}>{item.requestedUnitCount}</Text>
              </View>
              <Ionicons name="arrow-forward" size={16} color="#ccc" />
              <View style={styles.unitBox}>
                <Text style={styles.unitLabel}>{lang === 'ar' ? 'معتمد' : 'Approved'}</Text>
                <Text style={[styles.unitValue, { color: '#388E3C' }]}>{item.approvedUnitCount || '—'}</Text>
              </View>
            </View>

            {item.reason ? (
              <Text style={styles.reason}>
                {lang === 'ar' ? 'السبب: ' : 'Reason: '}{item.reason}
              </Text>
            ) : null}

            <Text style={styles.date}>{formatDate(item.requestedOn)}</Text>

            {item.statusId === 1 && (
              <View style={styles.actions}>
                <TouchableOpacity style={[styles.actionBtn, styles.approveBtn]} onPress={() => handleApprove(item)}>
                  <Ionicons name="checkmark-outline" size={15} color="#fff" />
                  <Text style={styles.actionText}>{t('approve')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionBtn, styles.rejectBtn]} onPress={() => handleReject(item)}>
                  <Ionicons name="close-outline" size={15} color="#fff" />
                  <Text style={styles.actionText}>{t('reject')}</Text>
                </TouchableOpacity>
              </View>
            )}
          </Card>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F5F7FA' },
  chips: { flexDirection: 'row', padding: 12, paddingBottom: 8, gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: '#E8EEF8' },
  chipActive: { backgroundColor: '#1565C0' },
  chipText: { fontSize: 13, color: '#555', fontWeight: '500' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  list: { padding: 12, paddingTop: 4, paddingBottom: 32 },
  reqCard: {},
  reqHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  reqLeft: { flex: 1, marginRight: 8 },
  reqTitle: { fontSize: 14, fontWeight: '700', color: '#222' },
  reqSub: { fontSize: 12, color: '#888', marginTop: 2 },
  unitsRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  unitBox: { alignItems: 'center' },
  unitLabel: { fontSize: 11, color: '#888' },
  unitValue: { fontSize: 20, fontWeight: '800' },
  reason: { fontSize: 12, color: '#666', fontStyle: 'italic', marginBottom: 6 },
  date: { fontSize: 11, color: '#aaa', marginBottom: 10 },
  actions: { flexDirection: 'row', gap: 8 },
  actionBtn: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 8, borderRadius: 8, gap: 4 },
  actionText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  approveBtn: { backgroundColor: '#388E3C' },
  rejectBtn: { backgroundColor: '#D32F2F' },
  empty: { alignItems: 'center', paddingVertical: 80 },
  emptyText: { color: '#aaa', marginTop: 10, fontSize: 14 },
});
