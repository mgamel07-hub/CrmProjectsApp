import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getScopeById, getStagesByScope, getScopeUsers, getProducts, getPlanExecutionStages } from '../api/projects';
import { t } from '../i18n';
import { useLang } from '../context/LangContext';
import { extractData, extractList, getStageStatusLabel, getStageStatusColor, formatDate } from '../utils/helpers';
import LoadingScreen from '../components/LoadingScreen';
import ErrorMessage from '../components/ErrorMessage';
import StatusBadge from '../components/StatusBadge';
import Card from '../components/Card';
import UserAvatar from '../components/UserAvatar';

export default function ScopeDetailScreen({ navigation, route }) {
  const { scopeId, title } = route.params;
  const { lang } = useLang();
  const [scope, setScope] = useState(null);
  const [stages, setStages] = useState([]);
  const [users, setUsers] = useState([]);
  const [productMap, setProductMap] = useState({});
  const [stageNameMap, setStageNameMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [scopeRes, stagesRes, usersRes, prodRes, stageNamesRes] = await Promise.allSettled([
        getScopeById(scopeId),
        getStagesByScope(scopeId),
        getScopeUsers(scopeId),
        getProducts(),
        getPlanExecutionStages(scopeId),
      ]);
      if (scopeRes.status === 'fulfilled') setScope(extractData(scopeRes.value));
      if (stagesRes.status === 'fulfilled') setStages(extractList(stagesRes.value) || []);
      if (stageNamesRes.status === 'fulfilled') {
        const ddl = extractData(stageNamesRes.value)?.stagesDDL || [];
        const map = {};
        ddl.forEach((s) => { if (s.key != null) map[String(s.key)] = s.value; });
        setStageNameMap(map);
      }
      if (usersRes.status === 'fulfilled') setUsers(extractList(usersRes.value) || []);
      if (prodRes.status === 'fulfilled') {
        const rawProds = extractList(prodRes.value) || extractData(prodRes.value) || [];
        const map = {};
        (Array.isArray(rawProds) ? rawProds : []).forEach((p) => {
          const key = p.key ?? p.id;
          if (key != null) map[String(key)] = p.value || p.name || String(key);
        });
        setProductMap(map);
      }
      setError(null);
    } catch (e) {
      setError(e?.response?.data?.message || t('networkError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [scopeId]);

  const getStageName = (stage, index) =>
    stageNameMap[String(stage.id)] ||
    stage.stageDef?.name || stage.stageDef?.localName ||
    stage.name || stage.stageName || stage.title || stage.stageDefName ||
    `Stage ${index + 1}`;

  const getScopeName = (s) => {
    if (!s) return title || t('scopeDetails');
    const byId = productMap[String(s.productId ?? '')] || productMap[String(s.product?.id ?? '')];
    return byId || s.product?.name || s.product?.localName || s.title || title || t('scopeDetails');
  };

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const name = getScopeName(scope);
    navigation.setOptions({ title: name });
  }, [navigation, scope, productMap, title]);

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
        <View style={styles.scopeNameRow}>
          <View style={styles.scopeIconWrap}>
            <Ionicons name="cube-outline" size={18} color="#1565C0" />
          </View>
          <Text style={styles.scopeTitle}>{getScopeName(scope)}</Text>
        </View>
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
              title: getStageName(stage, index),
              scopeId,
            })}
            style={styles.stageCard}
          >
            <View style={styles.stageHeader}>
              <View style={styles.stageNumCircle}>
                <Text style={styles.stageNum}>{index + 1}</Text>
              </View>
              <View style={styles.stageInfo}>
                <Text style={styles.stageName}>{getStageName(stage, index)}</Text>
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
              <UserAvatar photo={u.user?.photo || u.user?.Photo} name={u.user?.fullName || u.user?.userName} size={36} />
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
  scopeNameRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  scopeIconWrap: {
    width: 34, height: 34, borderRadius: 10, backgroundColor: '#E8EEF8',
    justifyContent: 'center', alignItems: 'center',
  },
  scopeTitle: { fontSize: 17, fontWeight: '800', color: '#1a1a1a', flex: 1 },
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
  userName: { fontSize: 14, color: '#222', fontWeight: '500' },
});
