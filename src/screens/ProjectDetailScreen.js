import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  getProjectByIdForView, getProjectProgress,
  getScopesByProject, getProjectUsers,
} from '../api/projects';
import { t } from '../i18n';
import { useLang } from '../context/LangContext';
import { useAuth } from '../context/AuthContext';
import {
  extractData, extractList,
  getProjectStatusLabel, getProjectStatusColor,
  getStageStatusLabel, getStageStatusColor,
  formatDate,
} from '../utils/helpers';
import LoadingScreen from '../components/LoadingScreen';
import ErrorMessage from '../components/ErrorMessage';
import StatusBadge from '../components/StatusBadge';
import ProgressBar from '../components/ProgressBar';
import Card from '../components/Card';

export default function ProjectDetailScreen({ navigation, route }) {
  const { projectId, title } = route.params;
  const { lang } = useLang();
  const { can } = useAuth();
  const canEditProject  = can('Project', 'edit');
  const canCreateScope  = can('ProjectScope', 'create');
  const [project, setProject] = useState(null);
  const [scopes, setScopes] = useState([]);
  const [users, setUsers] = useState([]);
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('scopes');

  const load = useCallback(async () => {
    try {
      const [projRes, scopesRes, usersRes, progressRes] = await Promise.allSettled([
        getProjectByIdForView(projectId),
        getScopesByProject(projectId),
        getProjectUsers(projectId),
        getProjectProgress(projectId),
      ]);
      if (projRes.status === 'fulfilled') setProject(extractData(projRes.value));
      if (scopesRes.status === 'fulfilled') setScopes(extractList(scopesRes.value));
      if (usersRes.status === 'fulfilled') setUsers(extractList(usersRes.value));
      if (progressRes.status === 'fulfilled') setProgress(extractData(progressRes.value));
      setError(null);
    } catch (e) {
      setError(e?.response?.data?.message || t('networkError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    navigation.setOptions({
      title: title || t('projectDetails'),
      headerRight: canEditProject ? () => (
        <TouchableOpacity
          style={{ marginRight: 16 }}
          onPress={() => navigation.navigate('EditProject', { project })}
        >
          <Ionicons name="create-outline" size={24} color="#1565C0" />
        </TouchableOpacity>
      ) : undefined,
    });
  }, [navigation, project, title]);

  const onRefresh = () => { setRefreshing(true); load(); };

  if (loading) return <LoadingScreen />;
  if (error && !project) return <ErrorMessage message={error} onRetry={load} />;

  const tabs = [
    { key: 'scopes', label: lang === 'ar' ? 'النطاقات' : 'Scopes', icon: 'layers-outline' },
    { key: 'team', label: t('projectUsers'), icon: 'people-outline' },
    { key: 'info', label: lang === 'ar' ? 'التفاصيل' : 'Details', icon: 'information-circle-outline' },
  ];

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1565C0']} />}
    >
      {/* Header card */}
      <Card style={styles.headerCard}>
        <View style={styles.headerTop}>
          <Text style={styles.projectTitle}>{project?.title}</Text>
          <StatusBadge
            label={getProjectStatusLabel(project?.statusId)}
            color={getProjectStatusColor(project?.statusId)}
          />
        </View>
        {project?.description ? <Text style={styles.description}>{project.description}</Text> : null}

        <View style={styles.metaRow}>
          {project?.branch && (
            <View style={styles.metaItem}>
              <Ionicons name="business-outline" size={14} color="#666" />
              <Text style={styles.metaText}>{project.branch.name}</Text>
            </View>
          )}
          {project?.customer && (
            <View style={styles.metaItem}>
              <Ionicons name="person-outline" size={14} color="#666" />
              <Text style={styles.metaText}>{project.customer.fullName}</Text>
            </View>
          )}
        </View>

        <View style={styles.datesRow}>
          {project?.dateStart && (
            <Text style={styles.dateText}>{lang === 'ar' ? 'بداية:' : 'Start:'} {formatDate(project.dateStart)}</Text>
          )}
          {project?.dateEnd && (
            <Text style={styles.dateText}>{lang === 'ar' ? 'نهاية:' : 'End:'} {formatDate(project.dateEnd)}</Text>
          )}
        </View>

        <View style={styles.unitsRow}>
          <Ionicons name="cube-outline" size={16} color="#1565C0" />
          <Text style={styles.unitsText}>{project?.allocatedUnits} {t('allocatedUnits')}</Text>
        </View>

        {progress !== null && progress !== undefined && (
          <View style={styles.progressSection}>
            <Text style={styles.progressLabel}>{t('progress')}</Text>
            <ProgressBar value={typeof progress === 'number' ? progress : progress?.progress || 0} color="#1565C0" />
          </View>
        )}
      </Card>

      {/* Tabs */}
      <View style={styles.tabs}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Ionicons name={tab.icon} size={16} color={activeTab === tab.key ? '#1565C0' : '#888'} />
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Scopes Tab */}
      {activeTab === 'scopes' && (
        <View>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('scopes')}</Text>
            {canCreateScope && (
              <TouchableOpacity
                style={styles.addBtn}
                onPress={() => navigation.navigate('CreateScope', { projectId })}
              >
                <Ionicons name="add" size={18} color="#fff" />
                <Text style={styles.addBtnText}>{t('newScope')}</Text>
              </TouchableOpacity>
            )}
          </View>
          {scopes.length === 0 ? (
            <View style={styles.emptySection}>
              <Ionicons name="layers-outline" size={36} color="#ccc" />
              <Text style={styles.emptyText}>{t('noData')}</Text>
            </View>
          ) : (
            scopes.map((scope) => (
              <Card
                key={scope.id}
                onPress={() => navigation.navigate('ScopeDetail', { scopeId: scope.id, title: scope.title || scope.product?.name })}
                style={styles.scopeCard}
              >
                <View style={styles.scopeHeader}>
                  <Text style={styles.scopeTitle} numberOfLines={1}>
                    {scope.title || scope.product?.name || `Scope #${scope.id}`}
                  </Text>
                  <Text style={styles.scopeWeight}>{scope.weightPercent?.toFixed(1)}%</Text>
                </View>
                <View style={styles.scopeMeta}>
                  <Text style={styles.scopeMetaText}>{scope.allocatedUnits} {t('units')}</Text>
                  {scope.stages?.length > 0 && (
                    <Text style={styles.scopeMetaText}>
                      {scope.stages.length} {lang === 'ar' ? 'مراحل' : 'stages'}
                    </Text>
                  )}
                </View>
                <View style={styles.stagesRow}>
                  {(scope.stages || []).slice(0, 5).map((stage) => (
                    <View
                      key={stage.id}
                      style={[styles.stageDot, { backgroundColor: getStageStatusColor(stage.statusId) }]}
                    />
                  ))}
                </View>
                <Ionicons name="chevron-forward" size={18} color="#bbb" style={styles.cardArrow} />
              </Card>
            ))
          )}
        </View>
      )}

      {/* Team Tab */}
      {activeTab === 'team' && (
        <View>
          <Text style={styles.sectionTitle}>{t('projectUsers')}</Text>
          {users.length === 0 ? (
            <View style={styles.emptySection}>
              <Ionicons name="people-outline" size={36} color="#ccc" />
              <Text style={styles.emptyText}>{t('noData')}</Text>
            </View>
          ) : (
            users.map((u) => (
              <Card key={u.id} style={styles.userCard}>
                <View style={styles.userAvatar}>
                  <Text style={styles.userInitial}>{(u.user?.fullName || u.user?.userName || '?')[0].toUpperCase()}</Text>
                </View>
                <View style={styles.userInfo}>
                  <Text style={styles.userName}>{u.user?.fullName || u.user?.userName}</Text>
                  <Text style={styles.userRole}>{u.isAdmin ? (lang === 'ar' ? 'مسؤول' : 'Admin') : (lang === 'ar' ? 'عضو' : 'Member')}</Text>
                </View>
                {u.isAdmin && <Ionicons name="shield-checkmark" size={18} color="#1565C0" />}
              </Card>
            ))
          )}
        </View>
      )}

      {/* Info Tab */}
      {activeTab === 'info' && (
        <Card>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{lang === 'ar' ? 'نوع المشروع' : 'Project Type'}</Text>
            <Text style={styles.infoValue}>{project?.projectTypeFlag?.name || '—'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{t('branch')}</Text>
            <Text style={styles.infoValue}>{project?.branch?.name || '—'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{t('customer')}</Text>
            <Text style={styles.infoValue}>{project?.customer?.fullName || '—'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{t('allocatedUnits')}</Text>
            <Text style={styles.infoValue}>{project?.allocatedUnits}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{t('startDate')}</Text>
            <Text style={styles.infoValue}>{formatDate(project?.dateStart)}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{t('endDate')}</Text>
            <Text style={styles.infoValue}>{formatDate(project?.dateEnd)}</Text>
          </View>
          {project?.description && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>{t('description')}</Text>
              <Text style={styles.infoValue}>{project.description}</Text>
            </View>
          )}
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F5F7FA' },
  content: { padding: 16, paddingBottom: 32 },
  headerCard: { marginBottom: 12 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, gap: 8 },
  projectTitle: { fontSize: 18, fontWeight: '800', color: '#1a1a1a', flex: 1 },
  description: { fontSize: 13, color: '#555', marginBottom: 8, lineHeight: 18 },
  metaRow: { flexDirection: 'row', gap: 16, marginBottom: 6 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 13, color: '#666' },
  datesRow: { flexDirection: 'row', gap: 16, marginBottom: 6 },
  dateText: { fontSize: 12, color: '#888' },
  unitsRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  unitsText: { fontSize: 13, color: '#1565C0', fontWeight: '600' },
  progressSection: { marginTop: 4 },
  progressLabel: { fontSize: 12, color: '#666', marginBottom: 6 },
  tabs: {
    flexDirection: 'row', backgroundColor: '#fff', borderRadius: 12, marginBottom: 16, overflow: 'hidden',
    elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3,
  },
  tab: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 12, gap: 4 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#1565C0' },
  tabText: { fontSize: 12, color: '#888', fontWeight: '500' },
  tabTextActive: { color: '#1565C0', fontWeight: '700' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#1a1a1a', marginBottom: 10 },
  addBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1565C0', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, gap: 4 },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  scopeCard: { position: 'relative', paddingRight: 32 },
  scopeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  scopeTitle: { fontSize: 14, fontWeight: '700', color: '#222', flex: 1 },
  scopeWeight: { fontSize: 18, fontWeight: '800', color: '#1565C0' },
  scopeMeta: { flexDirection: 'row', gap: 16, marginBottom: 8 },
  scopeMetaText: { fontSize: 12, color: '#888' },
  stagesRow: { flexDirection: 'row', gap: 6 },
  stageDot: { width: 10, height: 10, borderRadius: 5 },
  cardArrow: { position: 'absolute', right: 12, top: '50%' },
  emptySection: { alignItems: 'center', paddingVertical: 32 },
  emptyText: { color: '#aaa', marginTop: 8, fontSize: 14 },
  userCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  userAvatar: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#1565C0',
    justifyContent: 'center', alignItems: 'center',
  },
  userInitial: { color: '#fff', fontWeight: '700', fontSize: 16 },
  userInfo: { flex: 1 },
  userName: { fontSize: 14, fontWeight: '600', color: '#222' },
  userRole: { fontSize: 12, color: '#888' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  infoLabel: { fontSize: 13, color: '#666', fontWeight: '500' },
  infoValue: { fontSize: 13, color: '#222', fontWeight: '600', textAlign: 'right', flex: 1, marginLeft: 8 },
});
