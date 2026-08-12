import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getDashboardStats } from '../api/projects';
import { useAuth } from '../context/AuthContext';
import { DEMO_STATS } from '../api/demoData';
import { useLang } from '../context/LangContext';
import { t } from '../i18n';
import { extractData } from '../utils/helpers';
import LoadingScreen from '../components/LoadingScreen';
import ErrorMessage from '../components/ErrorMessage';
import ProgressBar from '../components/ProgressBar';

function StatCard({ icon, label, value, color, onPress }) {
  return (
    <TouchableOpacity style={[styles.statCard, { borderLeftColor: color }]} onPress={onPress} activeOpacity={onPress ? 0.7 : 1}>
      <View style={[styles.statIcon, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon} size={24} color={color} />
      </View>
      <View style={styles.statInfo}>
        <Text style={styles.statValue}>{value ?? '—'}</Text>
        <Text style={styles.statLabel}>{label}</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function DashboardScreen({ navigation }) {
  const { user, isDemo } = useAuth();
  const { lang } = useLang();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (isDemo) {
      setStats(DEMO_STATS);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const res = await getDashboardStats();
      setStats(extractData(res));
      setError(null);
    } catch (e) {
      setError(e?.response?.data?.message || t('networkError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isDemo]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  if (loading) return <LoadingScreen />;
  if (error && !stats) return <ErrorMessage message={error} onRetry={load} />;

  const greeting = lang === 'ar'
    ? `مرحباً، ${user?.fullName || user?.userName || 'مستخدم'}`
    : `Hello, ${user?.fullName || user?.userName || 'User'}`;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1565C0']} />}
    >
      {/* Greeting */}
      <View style={styles.greetingCard}>
        <View style={styles.greetingLeft}>
          <Text style={styles.greeting}>{greeting}</Text>
          <Text style={styles.greetingSub}>{lang === 'ar' ? 'لوحة إدارة المشاريع' : 'Project Management Dashboard'}</Text>
        </View>
        <View style={styles.greetingIcon}>
          <Ionicons name="grid-outline" size={32} color="#1565C0" />
        </View>
      </View>

      {/* Stats */}
      <Text style={styles.sectionTitle}>{lang === 'ar' ? 'إحصائيات سريعة' : 'Quick Stats'}</Text>
      <View style={styles.statsGrid}>
        <StatCard
          icon="folder-open-outline"
          label={t('totalProjects')}
          value={stats?.totalProjects}
          color="#1565C0"
          onPress={() => navigation.navigate('Projects')}
        />
        <StatCard
          icon="play-circle-outline"
          label={t('activeProjects')}
          value={stats?.activeProjects}
          color="#F57C00"
          onPress={() => navigation.navigate('Projects', { statusId: 1 })}
        />
        <StatCard
          icon="checkmark-circle-outline"
          label={t('completedProjects')}
          value={stats?.completedProjects}
          color="#388E3C"
          onPress={() => navigation.navigate('Projects', { statusId: 3 })}
        />
        <StatCard
          icon="time-outline"
          label={t('pendingApprovals')}
          value={stats?.pendingApprovals}
          color="#9C27B0"
          onPress={() => navigation.navigate('Approvals')}
        />
      </View>

      {/* Overall Progress */}
      {stats?.overallProgress !== undefined && (
        <>
          <Text style={styles.sectionTitle}>{t('overallProgress')}</Text>
          <View style={styles.progressCard}>
            <ProgressBar value={stats.overallProgress} color="#1565C0" />
          </View>
        </>
      )}

      {/* Recent Projects */}
      {stats?.recentProjects?.length > 0 && (
        <>
          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>{lang === 'ar' ? 'أحدث المشاريع' : 'Recent Projects'}</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Projects')}>
              <Text style={styles.seeAll}>{lang === 'ar' ? 'عرض الكل' : 'See All'}</Text>
            </TouchableOpacity>
          </View>
          {stats.recentProjects.map((p) => (
            <TouchableOpacity
              key={p.id}
              style={styles.recentCard}
              onPress={() => navigation.navigate('ProjectDetail', { projectId: p.id, title: p.title })}
              activeOpacity={0.7}
            >
              <View style={styles.recentLeft}>
                <Text style={styles.recentTitle} numberOfLines={1}>{p.title}</Text>
                <Text style={styles.recentSub}>{p.branch?.name || ''}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#bbb" />
            </TouchableOpacity>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F5F7FA' },
  content: { padding: 16, paddingBottom: 32 },
  greetingCard: {
    backgroundColor: '#1565C0', borderRadius: 16, padding: 20, marginBottom: 20,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  greetingLeft: { flex: 1 },
  greeting: { fontSize: 18, fontWeight: '700', color: '#fff' },
  greetingSub: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  greetingIcon: { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1a1a1a', marginBottom: 12, marginTop: 4 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, marginTop: 4 },
  seeAll: { color: '#1565C0', fontSize: 13, fontWeight: '600' },
  statsGrid: { gap: 10, marginBottom: 8 },
  statCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16, flexDirection: 'row',
    alignItems: 'center', borderLeftWidth: 4,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4,
  },
  statIcon: { width: 44, height: 44, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  statInfo: { flex: 1 },
  statValue: { fontSize: 24, fontWeight: '800', color: '#1a1a1a' },
  statLabel: { fontSize: 12, color: '#666', marginTop: 2 },
  progressCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 8,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4,
  },
  recentCard: {
    backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 8,
    flexDirection: 'row', alignItems: 'center',
    elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3,
  },
  recentLeft: { flex: 1 },
  recentTitle: { fontSize: 14, fontWeight: '600', color: '#222' },
  recentSub: { fontSize: 12, color: '#888', marginTop: 2 },
});
