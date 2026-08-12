import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getScopeById, getStagesByScope, getScopeUsers } from '../api/projects';
import { t } from '../i18n';
import { useLang } from '../context/LangContext';
import { extractData, extractList, getStageStatusLabel, getStageStatusColor, formatDate } from '../utils/helpers';
import LoadingScreen from '../components/LoadingScreen';
import ErrorMessage from '../components/ErrorMessage';
import StatusBadge from '../components/StatusBadge';
import Card from '../components/Card';

export default function ScopeDetailScreen({ navigation, route }) {
  const { scopeId, title } = route.params;
  const { lang } = useLang();
  const [scope, setScope] = useState(null);
  const [stages, setStages] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [scopeRes, stagesRes, usersRes] = await Promise.allSettled([
        getScopeById(scopeId),
        getStagesByScope(scopeId),
        getScopeUsers(scopeId),
      ]);
      if (scopeRes.status === 'fulfilled') setScope(extractData(scopeRes.value));
      if (stagesRes.status === 'fulfilled') setStages(extractList(stagesRes.value));
      if (usersRes.status === 'fulfilled') setUsers(extractList(usersRes.value));
      setError(null);
    } catch (e) {
      setError(e?.response?.data?.message || t('networkError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [scopeId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { navigation.setOptions({ title: title || t('scopeDetails') }); }, [navigation, title]);

  const onRefresh = () => { setRefreshing(true); load(); };

  if (loading) return <LoadingScreen />;
  if (error && !scope) return <ErrorMessage message={error} onRetry={load} />;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1565C0']} />}
    >
      {/* Scope Info */}
      <Card style={styles.headerCard}>
        <Text style={styles.scopeTitle}>{scope?.title || scope?.product?.name || `Scope #${scopeId}`}</Text>
        <View style={styles.metaGrid}>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>{t('weight')}</Text>
            <Text style={styles.metaValue}>{scope?.weightPercent?.toFixed(1)}%</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>{t('allocatedUnits')}</Text>
            <Text style={styles.metaValue}>{scope?.allocatedUnits}</Text>
          </View>
          {scope?.dateStart && (
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>{t('startDate')}</Text>
              <Text style={styles.metaValue}>{formatDate(scope.dateStart)}</Text>
            </View>
          )}
          {scope?.dateEnd && (
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>{t('endDate')}</Text>
              <Text style={styles.metaValue}>{formatDate(scope.dateEnd)}</Text>
            </View>
          )}
        </View>
      </Card>

      {/* Stages */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{t('stages')}</Text>
      </View>
      {stages.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="git-branch-outline" size={36} color="#ccc" />
          <Text style={styles.emptyText}>{t('noData')}</Text>
        </View>
      ) : (
        stages.map((stage, index) => (
          <Card
            key={stage.id}
            onPress={() => navigation.navigate('StageDetail', {
              stageId: stage.id,
              title: stage.stageDef?.name || `Stage ${index + 1}`,
              scopeId,
            })}
            style={styles.stageCard}
          >
            <View style={styles.stageHeader}>
              <View style={styles.stageNumCircle}>
                <Text style={styles.stageNum}>{index + 1}</Text>
              </View>
              <View style={styles.stageInfo}>
                <Text style={styles.stageName}>{stage.stageDef?.name || `Stage ${index + 1}`}</Text>
                <StatusBadge
                  label={getStageStatusLabel(stage.statusId)}
                  color={getStageStatusColor(stage.statusId)}
                />
              </View>
              <Ionicons name="chevron-forward" size={20} color="#bbb" />
            </View>
            {(stage.startedOn || stage.endedOn) && (
              <View style={styles.stageDates}>
                {stage.startedOn && <Text style={styles.stageDate}>{lang === 'ar' ? 'بدأت:' : 'Started:'} {formatDate(stage.startedOn)}</Text>}
                {stage.endedOn && <Text style={styles.stageDate}>{lang === 'ar' ? 'انتهت:' : 'Ended:'} {formatDate(stage.endedOn)}</Text>}
              </View>
            )}
            {stage.plans?.length > 0 && (
              <Text style={styles.planCount}>
                {stage.plans.length} {lang === 'ar' ? 'خطة' : 'plans'}
              </Text>
            )}
          </Card>
        ))
      )}

      {/* Users */}
      {users.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>{t('projectUsers')}</Text>
          {users.map((u) => (
            <Card key={u.id} style={styles.userCard}>
              <View style={styles.userAvatar}>
                <Text style={styles.userInitial}>{(u.user?.fullName || '?')[0].toUpperCase()}</Text>
              </View>
              <Text style={styles.userName}>{u.user?.fullName || u.user?.userName}</Text>
            </Card>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F5F7FA' },
  content: { padding: 16, paddingBottom: 32 },
  headerCard: { marginBottom: 16 },
  scopeTitle: { fontSize: 18, fontWeight: '800', color: '#1a1a1a', marginBottom: 12 },
  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  metaItem: {},
  metaLabel: { fontSize: 11, color: '#888', marginBottom: 2 },
  metaValue: { fontSize: 16, fontWeight: '700', color: '#1565C0' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#1a1a1a', marginBottom: 10 },
  stageCard: {},
  stageHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stageNumCircle: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: '#E8EEF8',
    justifyContent: 'center', alignItems: 'center',
  },
  stageNum: { fontSize: 14, fontWeight: '700', color: '#1565C0' },
  stageInfo: { flex: 1, gap: 4 },
  stageName: { fontSize: 14, fontWeight: '600', color: '#222' },
  stageDates: { flexDirection: 'row', gap: 16, marginTop: 8, marginLeft: 44 },
  stageDate: { fontSize: 12, color: '#888' },
  planCount: { fontSize: 12, color: '#1565C0', marginTop: 6, marginLeft: 44, fontWeight: '600' },
  empty: { alignItems: 'center', paddingVertical: 32 },
  emptyText: { color: '#aaa', marginTop: 8, fontSize: 14 },
  userCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  userAvatar: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#1565C0',
    justifyContent: 'center', alignItems: 'center',
  },
  userInitial: { color: '#fff', fontWeight: '700' },
  userName: { fontSize: 14, color: '#222', fontWeight: '500' },
});
