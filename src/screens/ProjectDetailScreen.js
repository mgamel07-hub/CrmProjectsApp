import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, Alert, Modal, FlatList, TextInput, ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import UserAvatar from '../components/UserAvatar';
import {
  getProjectByIdForView, getProjectProgress,
  getScopesByProject, getProjectUsers, addProjectUser, deleteProjectUser,
  getClientContacts, addClientContact, deleteClientContact,
  getEligibleClientUsers, getProducts, getUsers,
  getProjectVisits, createProjectVisit, deleteProjectVisit,
  getPlanExecutionStages, getPlansDropDown, getPlanItems,
  uploadPlanExecutionAttachment,
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

function calcScopeProgress(scope) {
  const stages = scope.stages || [];
  if (stages.length === 0) return null;
  const completed = stages.filter((s) => {
    const key = String(s.statusId ?? '').toLowerCase().replace(/[_\s]/g, '');
    return ['2', 'completed', 'finished'].includes(key);
  }).length;
  return Math.round((completed / stages.length) * 100);
}

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
  const [productMap, setProductMap] = useState({});
  const [clientContacts, setClientContacts] = useState([]);
  const [clientContactsErr, setClientContactsErr] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('scopes');

  // Add contact modal state
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [eligibleUsers, setEligibleUsers] = useState([]);
  const [eligibleSearch, setEligibleSearch] = useState('');
  const [addingContact, setAddingContact] = useState(null);

  // Visit / Plan Execution state
  const [visits, setVisits] = useState([]);
  const [visitsErr, setVisitsErr] = useState(false);
  const [visitModalVisible, setVisitModalVisible] = useState(false);
  const [savingVisit, setSavingVisit] = useState(false);
  const [visitForm, setVisitForm] = useState({
    scopeId: null, stageId: null, planId: null,
    date: '', startTime: '', endTime: '', description: '',
  });
  const [visitStages, setVisitStages] = useState([]);
  const [visitPlans, setVisitPlans]   = useState([]);
  const [visitPlanItems, setVisitPlanItems]   = useState([]);
  const [loadingPlanItems, setLoadingPlanItems] = useState(false);
  const [selectedPlanItemIds, setSelectedPlanItemIds] = useState([]);
  const [visitAttachments, setVisitAttachments] = useState([]);
  const [visitScopeOpen,  setVisitScopeOpen]  = useState(false);
  const [visitStageOpen,  setVisitStageOpen]  = useState(false);
  const [visitPlanOpen,   setVisitPlanOpen]   = useState(false);
  const [visitDropSearch, setVisitDropSearch] = useState('');

  // Team member add modal
  const [teamModalVisible, setTeamModalVisible] = useState(false);
  const [allUsers, setAllUsers] = useState([]);
  const [teamSearch, setTeamSearch] = useState('');
  const [addingMember, setAddingMember] = useState(null);

  const load = useCallback(async () => {
    try {
      const [projRes, scopesRes, usersRes, progressRes, prodRes, contactsRes, visitsRes] = await Promise.allSettled([
        getProjectByIdForView(projectId),
        getScopesByProject(projectId),
        getProjectUsers(projectId),
        getProjectProgress(projectId),
        getProducts(),
        getClientContacts(projectId),
        getProjectVisits(projectId),
      ]);
      if (projRes.status === 'fulfilled') setProject(extractData(projRes.value));
      if (scopesRes.status === 'fulfilled') setScopes(extractList(scopesRes.value) || []);
      if (usersRes.status === 'fulfilled') setUsers(extractList(usersRes.value) || []);
      if (progressRes.status === 'fulfilled') setProgress(extractData(progressRes.value));

      if (prodRes.status === 'fulfilled') {
        const rawProds = extractList(prodRes.value) || extractData(prodRes.value) || [];
        const map = {};
        (Array.isArray(rawProds) ? rawProds : []).forEach((p) => {
          const key = p.key ?? p.id;
          if (key != null) map[String(key)] = p.value || p.name || String(key);
        });
        setProductMap(map);
      }

      if (contactsRes.status === 'fulfilled') {
        setClientContacts(extractList(contactsRes.value) || []);
        setClientContactsErr(false);
      } else {
        setClientContactsErr(true);
      }

      if (visitsRes.status === 'fulfilled') {
        setVisits(extractList(visitsRes.value) || []);
        setVisitsErr(false);
      } else {
        setVisitsErr(true);
      }

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
      headerRight: undefined,
    });
  }, [navigation, project, title]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const getScopeName = (scope) => {
    const byId = productMap[String(scope.productId ?? '')] || productMap[String(scope.product?.id ?? '')];
    return byId || scope.product?.name || scope.product?.localName || scope.title || `Scope #${scope.id}`;
  };

  const openAddContactModal = async () => {
    setAddModalVisible(true);
    setEligibleSearch('');
    try {
      const res = await getEligibleClientUsers(projectId);
      setEligibleUsers(extractList(res) || []);
    } catch {
      setEligibleUsers([]);
    }
  };

  const handleAddContact = async (user) => {
    setAddingContact(user.id ?? user.userId);
    try {
      await addClientContact({ projectId, userId: user.id ?? user.userId });
      await load();
      setAddModalVisible(false);
    } catch (e) {
      Alert.alert(t('error'), e?.response?.data?.message || t('networkError'));
    } finally {
      setAddingContact(null);
    }
  };

  const handleRemoveContact = (contact) => {
    Alert.alert(
      lang === 'ar' ? 'تأكيد الحذف' : 'Confirm Remove',
      lang === 'ar' ? `حذف ${contact.user?.fullName || ''} من فريق العميل؟` : `Remove ${contact.user?.fullName || ''} from client team?`,
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete'), style: 'destructive',
          onPress: async () => {
            try {
              await deleteClientContact(contact.id);
              await load();
            } catch (e) {
              Alert.alert(t('error'), e?.response?.data?.message || t('networkError'));
            }
          },
        },
      ]
    );
  };

  // ── Visit helpers ──────────────────────────────────────────────────────────
  const openVisitModal = () => {
    const today = new Date().toISOString().slice(0, 10);
    setVisitForm({ scopeId: null, stageId: null, planId: null, date: today, startTime: '', endTime: '', description: '' });
    setVisitStages([]);
    setVisitPlans([]);
    setVisitPlanItems([]);
    setSelectedPlanItemIds([]);
    setVisitAttachments([]);
    setVisitModalVisible(true);
  };

  const onVisitScopeSelect = async (scopeId) => {
    setVisitForm((f) => ({ ...f, scopeId, stageId: null, planId: null }));
    setVisitStages([]);
    setVisitPlans([]);
    try {
      const res = await getPlanExecutionStages(scopeId);
      setVisitStages(extractData(res)?.stagesDDL || []);
    } catch { setVisitStages([]); }
  };

  const onVisitStageSelect = async (stageId) => {
    setVisitForm((f) => ({ ...f, stageId, planId: null }));
    setVisitPlans([]);
    try {
      const res = await getPlansDropDown(visitForm.scopeId, stageId);
      setVisitPlans(extractList(res) || []);
    } catch { setVisitPlans([]); }
  };

  const onVisitPlanSelect = async (planId) => {
    setVisitForm((f) => ({ ...f, planId }));
    setSelectedPlanItemIds([]);
    setVisitPlanItems([]);
    if (!planId) return;
    setLoadingPlanItems(true);
    try {
      const res = await getPlanItems(planId);
      setVisitPlanItems(extractList(res) || []);
    } catch { setVisitPlanItems([]); }
    finally { setLoadingPlanItems(false); }
  };

  const pickAttachment = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
      if (!result.canceled && result.assets?.length) {
        setVisitAttachments((prev) => [...prev, ...result.assets]);
      }
    } catch { /* ignore */ }
  };

  const handleSaveVisit = async () => {
    if (!visitForm.planId) {
      Alert.alert(t('error'), lang === 'ar' ? 'اختر الخطة' : 'Select a plan');
      return;
    }
    if (!visitForm.date) {
      Alert.alert(t('error'), lang === 'ar' ? 'أدخل التاريخ' : 'Enter date');
      return;
    }
    setSavingVisit(true);
    try {
      const res = await createProjectVisit({
        projectPlanId: visitForm.planId,
        executionDate: visitForm.date,
        startTime: visitForm.startTime || null,
        endTime: visitForm.endTime || null,
        description: visitForm.description.trim() || null,
        projectPlanItemIds: selectedPlanItemIds,
        hideItemsInEmail: false,
      });
      // Extract the numeric/string execution ID from whatever shape the API returns
      const raw = res?.data;
      const executionId = typeof raw?.data === 'object' ? raw?.data?.id : (raw?.data ?? raw?.id ?? raw);
      // Upload attachments
      if (visitAttachments.length > 0 && executionId) {
        const failed = [];
        for (const file of visitAttachments) {
          try {
            const fd = new FormData();
            fd.append('file', { uri: file.uri, name: file.name, type: file.mimeType || 'application/octet-stream' });
            await uploadPlanExecutionAttachment(executionId, fd);
          } catch (attachErr) {
            failed.push(file.name);
            // error surfaced to user via Alert below
          }
        }
        if (failed.length > 0) {
          Alert.alert(
            lang === 'ar' ? 'تنبيه' : 'Warning',
            (lang === 'ar' ? 'لم يرفع بعض المرفقات: ' : 'Failed to upload: ') + failed.join(', ')
          );
        }
      }
      setVisitModalVisible(false);
      await load();
    } catch (e) {
      const status = e?.response?.status;
      const msg = e?.response?.data?.message || e?.response?.data?.title || e?.response?.data?.errors?.join(', ');
      Alert.alert(t('error'), [msg, status ? `(HTTP ${status})` : null].filter(Boolean).join(' ') || t('networkError'));
    } finally {
      setSavingVisit(false);
    }
  };

  // ── Team member handlers ─────────────────────────────────────────────────────
  const openTeamModal = async () => {
    setTeamModalVisible(true);
    setTeamSearch('');
    try {
      const res = await getUsers();
      const list = extractList(res) || extractData(res) || [];
      const addedIds = new Set(users.map((u) => u.userId ?? u.user?.id));
      setAllUsers(
        (Array.isArray(list) ? list : [])
          .map((u) => ({ id: u.key ?? u.id, name: u.value || u.fullName || u.userName || '' }))
          .filter((u) => u.id != null && !addedIds.has(u.id))
      );
    } catch { setAllUsers([]); }
  };

  const handleAddMember = async (user) => {
    setAddingMember(user.id);
    try {
      await addProjectUser({ projectId, userId: user.id });
      await load();
      setTeamModalVisible(false);
    } catch (e) {
      Alert.alert(t('error'), e?.response?.data?.message || t('networkError'));
    } finally {
      setAddingMember(null);
    }
  };

  const handleRemoveMember = (u) => {
    Alert.alert(
      lang === 'ar' ? 'تأكيد الحذف' : 'Confirm Remove',
      lang === 'ar' ? `حذف ${u.user?.fullName || u.user?.userName || ''} من الفريق؟` : `Remove from team?`,
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete'), style: 'destructive',
          onPress: async () => {
            try { await deleteProjectUser(u.id); await load(); }
            catch (e) { Alert.alert(t('error'), e?.response?.data?.message || t('networkError')); }
          },
        },
      ]
    );
  };

  const handleDeleteVisit = (visit) => {
    Alert.alert(
      t('confirmDelete'),
      t('deleteVisitConfirm'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete'), style: 'destructive',
          onPress: async () => {
            try {
              await deleteProjectVisit(visit.id);
              await load();
            } catch (e) {
              Alert.alert(t('error'), e?.response?.data?.message || t('networkError'));
            }
          },
        },
      ]
    );
  };

  // ── Mini inline-dropdown for visit modal ────────────────────────────────────
  function VisitDropdown({ label, options, value, onSelect, open, setOpen, getLabel }) {
    const selected = options.find((o) => (o.id ?? o.key) === value);
    const filtered = visitDropSearch
      ? options.filter((o) => getLabel(o).toLowerCase().includes(visitDropSearch.toLowerCase()))
      : options;
    return (
      <View style={vstyles.field}>
        <Text style={vstyles.label}>{label}</Text>
        <TouchableOpacity style={vstyles.select} onPress={() => { setVisitDropSearch(''); setOpen(true); }}>
          <Text style={selected ? vstyles.selectText : vstyles.selectPlaceholder} numberOfLines={1}>
            {selected ? getLabel(selected) : (lang === 'ar' ? '-- اختر --' : '-- Select --')}
          </Text>
          <Ionicons name="chevron-down" size={16} color="#888" />
        </TouchableOpacity>
        <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
          <TouchableOpacity style={vstyles.dropOverlay} activeOpacity={1} onPress={() => setOpen(false)}>
            <View style={vstyles.dropBox}>
              <View style={vstyles.dropSearch}>
                <Ionicons name="search-outline" size={14} color="#888" />
                <TextInput
                  style={vstyles.dropSearchInput}
                  value={visitDropSearch}
                  onChangeText={setVisitDropSearch}
                  placeholder={lang === 'ar' ? 'بحث...' : 'Search...'}
                  placeholderTextColor="#aaa"
                  autoFocus
                />
              </View>
              <FlatList
                data={filtered}
                keyExtractor={(o, i) => String(o.id ?? o.key ?? i)}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[vstyles.dropItem, value === (item.id ?? item.key) && vstyles.dropItemActive]}
                    onPress={() => { onSelect(item.id ?? item.key); setOpen(false); setVisitDropSearch(''); }}
                  >
                    <Text style={[vstyles.dropItemText, value === (item.id ?? item.key) && vstyles.dropItemTextActive]}>
                      {getLabel(item)}
                    </Text>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={<Text style={vstyles.dropEmpty}>{lang === 'ar' ? 'لا توجد نتائج' : 'No results'}</Text>}
                style={{ maxHeight: 260 }}
              />
            </View>
          </TouchableOpacity>
        </Modal>
      </View>
    );
  }

  if (loading) return <LoadingScreen />;
  if (error && !project) return <ErrorMessage message={error} onRetry={load} />;

  const tabs = [
    { key: 'scopes',  label: lang === 'ar' ? 'النطاقات' : 'Scopes',       icon: 'layers-outline' },
    { key: 'visits',  label: t('planExecution'),                            icon: 'checkmark-circle-outline' },
    { key: 'team',    label: t('projectUsers'),                             icon: 'people-outline' },
    { key: 'client',  label: t('clientTeam'),                               icon: 'business-outline' },
    { key: 'info',    label: lang === 'ar' ? 'التفاصيل' : 'Details',      icon: 'information-circle-outline' },
  ];

  const filteredEligible = eligibleSearch
    ? eligibleUsers.filter((u) => (u.fullName || u.userName || '').toLowerCase().includes(eligibleSearch.toLowerCase()))
    : eligibleUsers;

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

      {/* Tabs — horizontally scrollable */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabsScroll}
        contentContainerStyle={styles.tabsContent}
      >
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Ionicons name={tab.icon} size={14} color={activeTab === tab.key ? '#1565C0' : '#888'} />
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* ── Scopes Tab ── */}
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
            scopes.map((scope) => {
              const scopeProgress = calcScopeProgress(scope);
              const scopeName = getScopeName(scope);
              return (
                <Card
                  key={scope.id}
                  onPress={() => navigation.navigate('ScopeDetail', {
                    scopeId: scope.id,
                    title: scopeName,
                  })}
                  style={styles.scopeCard}
                >
                  {/* System name header */}
                  <View style={styles.scopeHeader}>
                    <View style={styles.scopeIconWrap}>
                      <Ionicons name="cube-outline" size={16} color="#1565C0" />
                    </View>
                    <Text style={styles.scopeProductName} numberOfLines={1}>{scopeName}</Text>
                    <Text style={styles.scopeWeight}>{scope.weightPercent?.toFixed(0)}%</Text>
                  </View>

                  {/* Weight bar — share of total project */}
                  <View style={styles.weightBarBg}>
                    <View style={[styles.weightBarFill, { width: `${Math.min(scope.weightPercent || 0, 100)}%` }]} />
                  </View>
                  <Text style={styles.weightLabel}>
                    {lang === 'ar' ? 'حصة من المشروع' : 'Share of project'} · {scope.allocatedUnits} {t('units')}
                  </Text>

                  {/* Stage completion progress */}
                  {scopeProgress !== null && (
                    <View style={styles.progressWrap}>
                      <View style={styles.progressRow}>
                        <Text style={styles.progressSubLabel}>
                          {lang === 'ar' ? 'إنجاز المراحل' : 'Stage completion'}
                        </Text>
                        <Text style={styles.progressPct}>{scopeProgress}%</Text>
                      </View>
                      <View style={styles.thinBarBg}>
                        <View style={[styles.thinBarFill, { width: `${scopeProgress}%` }]} />
                      </View>
                    </View>
                  )}

                  {/* Stage dots */}
                  {(scope.stages || []).length > 0 && (
                    <View style={styles.stagesRow}>
                      {(scope.stages || []).slice(0, 8).map((stage) => (
                        <View
                          key={stage.id}
                          style={[styles.stageDot, { backgroundColor: getStageStatusColor(stage.statusId) }]}
                        />
                      ))}
                      {(scope.stages || []).length > 8 && (
                        <Text style={styles.moreStages}>+{(scope.stages || []).length - 8}</Text>
                      )}
                    </View>
                  )}

                  <Ionicons name="chevron-forward" size={18} color="#bbb" style={styles.cardArrow} />
                </Card>
              );
            })
          )}
        </View>
      )}

      {/* ── Plan Execution / Visits Tab ── */}
      {activeTab === 'visits' && (
        <View>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('planExecution')}</Text>
            <TouchableOpacity style={styles.addBtn} onPress={openVisitModal}>
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={styles.addBtnText}>{t('addVisit')}</Text>
            </TouchableOpacity>
          </View>

          {visitsErr ? (
            <View style={styles.emptySection}>
              <Ionicons name="alert-circle-outline" size={36} color="#ccc" />
              <Text style={styles.emptyText}>{lang === 'ar' ? 'هذه الخاصية غير متاحة حالياً' : 'Feature not available'}</Text>
            </View>
          ) : visits.length === 0 ? (
            <View style={styles.emptySection}>
              <Ionicons name="checkmark-circle-outline" size={36} color="#ccc" />
              <Text style={styles.emptyText}>{t('noVisits')}</Text>
            </View>
          ) : (
            visits.map((v) => (
              <Card key={v.id} style={vstyles.visitCard}>
                {/* Header: scope + stage tags + delete */}
                <View style={vstyles.visitHeader}>
                  <View style={vstyles.visitTags}>
                    {(v.scopeTitle || v.productName) ? (
                      <View style={vstyles.tag}>
                        <Ionicons name="cube-outline" size={11} color="#1565C0" />
                        <Text style={vstyles.tagText} numberOfLines={1}>{v.scopeTitle || v.productName}</Text>
                      </View>
                    ) : null}
                    {v.stageName ? (
                      <View style={[vstyles.tag, { backgroundColor: '#FFF3E0' }]}>
                        <Text style={[vstyles.tagText, { color: '#E65100' }]}>{v.stageName}</Text>
                      </View>
                    ) : null}
                    {(v.items || []).length > 0 && (
                      <View style={[vstyles.tag, { backgroundColor: '#E8F5E9' }]}>
                        <Ionicons name="list-outline" size={11} color="#388E3C" />
                        <Text style={[vstyles.tagText, { color: '#388E3C' }]}>{v.items.length} {lang === 'ar' ? 'بند' : 'items'}</Text>
                      </View>
                    )}
                  </View>
                  <TouchableOpacity onPress={() => handleDeleteVisit(v)} style={vstyles.deleteBtn}>
                    <Ionicons name="trash-outline" size={18} color="#D32F2F" />
                  </TouchableOpacity>
                </View>

                {/* Date + time */}
                <View style={vstyles.visitMeta}>
                  <Ionicons name="calendar-outline" size={13} color="#888" />
                  <Text style={vstyles.visitMetaText}>{formatDate(v.executionDate)}</Text>
                  {(v.startTime || v.endTime) && (
                    <>
                      <Ionicons name="time-outline" size={13} color="#888" style={{ marginLeft: 10 }} />
                      <Text style={vstyles.visitMetaText}>
                        {v.startTime || ''}{v.startTime && v.endTime ? ' — ' : ''}{v.endTime || ''}
                      </Text>
                    </>
                  )}
                  {v.createdBy && (
                    <Text style={[vstyles.visitMetaText, { marginLeft: 10, color: '#aaa' }]}>{v.createdBy}</Text>
                  )}
                </View>

                {/* Description */}
                {v.description ? (
                  <Text style={vstyles.visitDesc} numberOfLines={2}>{v.description}</Text>
                ) : null}

                {/* Attachments */}
                {v.attachmentCount > 0 && (
                  <View style={vstyles.attachRow}>
                    <Ionicons name="attach-outline" size={14} color="#1565C0" />
                    <Text style={vstyles.attachText}>{v.attachmentCount} {lang === 'ar' ? 'مرفق' : 'attachment(s)'}</Text>
                  </View>
                )}
              </Card>
            ))
          )}
        </View>
      )}

      {/* ── Internal Team Tab ── */}
      {activeTab === 'team' && (
        <View>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('projectUsers')}</Text>
            <TouchableOpacity style={styles.addBtn} onPress={openTeamModal}>
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={styles.addBtnText}>{lang === 'ar' ? 'إضافة عضو' : 'Add Member'}</Text>
            </TouchableOpacity>
          </View>
          {users.length === 0 ? (
            <View style={styles.emptySection}>
              <Ionicons name="people-outline" size={36} color="#ccc" />
              <Text style={styles.emptyText}>{t('noData')}</Text>
            </View>
          ) : (
            users.map((u) => (
              <Card key={u.id} style={styles.userCard}>
                <UserAvatar
                  photo={u.user?.photo || u.user?.Photo || u.user?.avatar || u.user?.profileImage}
                  name={u.user?.fullName || u.user?.userName}
                  size={40}
                />
                <View style={styles.userInfo}>
                  <Text style={styles.userName}>{u.user?.fullName || u.user?.userName}</Text>
                  <Text style={styles.userRole}>{u.isAdmin ? (lang === 'ar' ? 'مسؤول' : 'Admin') : (lang === 'ar' ? 'عضو' : 'Member')}</Text>
                </View>
                {u.isAdmin && <Ionicons name="shield-checkmark" size={18} color="#1565C0" style={{ marginRight: 4 }} />}
                <TouchableOpacity onPress={() => handleRemoveMember(u)} style={styles.removeBtn}>
                  <Ionicons name="remove-circle-outline" size={20} color="#D32F2F" />
                </TouchableOpacity>
              </Card>
            ))
          )}
        </View>
      )}

      {/* ── Client Team Tab ── */}
      {activeTab === 'client' && (
        <View>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('clientTeam')}</Text>
            {!clientContactsErr && (
              <TouchableOpacity style={styles.addBtn} onPress={openAddContactModal}>
                <Ionicons name="add" size={18} color="#fff" />
                <Text style={styles.addBtnText}>{t('addContact')}</Text>
              </TouchableOpacity>
            )}
          </View>

          {clientContactsErr ? (
            <View style={styles.emptySection}>
              <Ionicons name="alert-circle-outline" size={36} color="#ccc" />
              <Text style={styles.emptyText}>
                {lang === 'ar' ? 'هذه الخاصية غير متاحة حالياً' : 'Feature not available yet'}
              </Text>
            </View>
          ) : clientContacts.length === 0 ? (
            <View style={styles.emptySection}>
              <Ionicons name="business-outline" size={36} color="#ccc" />
              <Text style={styles.emptyText}>
                {lang === 'ar' ? 'لا يوجد أعضاء من فريق العميل' : 'No client team members yet'}
              </Text>
            </View>
          ) : (
            clientContacts.map((c) => (
              <Card key={c.id} style={styles.userCard}>
                <UserAvatar
                  photo={c.user?.photo || c.user?.Photo || c.user?.avatar || c.photo}
                  name={c.user?.fullName || c.fullName || c.name}
                  size={40}
                  bgColor="#E65100"
                />
                <View style={styles.userInfo}>
                  <Text style={styles.userName}>{c.user?.fullName || c.fullName || c.name}</Text>
                  {(c.user?.email || c.email) && (
                    <Text style={styles.userRole}>{c.user?.email || c.email}</Text>
                  )}
                  {(c.user?.phone || c.phone || c.position) && (
                    <Text style={styles.userRole}>{c.position || c.user?.phone || c.phone}</Text>
                  )}
                </View>
                <TouchableOpacity onPress={() => handleRemoveContact(c)} style={styles.removeBtn}>
                  <Ionicons name="remove-circle-outline" size={22} color="#D32F2F" />
                </TouchableOpacity>
              </Card>
            ))
          )}
        </View>
      )}

      {/* ── Info Tab ── */}
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

      {/* ── Add Team Member Modal ── */}
      <Modal visible={teamModalVisible} transparent animationType="slide" onRequestClose={() => {}}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{lang === 'ar' ? 'إضافة عضو للفريق' : 'Add Team Member'}</Text>
              <TouchableOpacity onPress={() => setTeamModalVisible(false)}>
                <Ionicons name="close" size={22} color="#444" />
              </TouchableOpacity>
            </View>
            <View style={styles.searchRow}>
              <Ionicons name="search-outline" size={16} color="#888" />
              <TextInput
                style={styles.searchInput}
                value={teamSearch}
                onChangeText={setTeamSearch}
                placeholder={lang === 'ar' ? 'بحث...' : 'Search...'}
                placeholderTextColor="#aaa"
                autoFocus
              />
            </View>
            <FlatList
              data={teamSearch ? allUsers.filter((u) => u.name.toLowerCase().includes(teamSearch.toLowerCase())) : allUsers}
              keyExtractor={(u) => String(u.id)}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<Text style={styles.emptyText}>{lang === 'ar' ? 'لا توجد نتائج' : 'No results'}</Text>}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.eligibleRow}
                  onPress={() => handleAddMember(item)}
                  disabled={addingMember === item.id}
                >
                  <UserAvatar photo={item.photo || item.Photo} name={item.name} size={32} />
                  <Text style={[styles.userName, { flex: 1 }]}>{item.name}</Text>
                  {addingMember === item.id
                    ? <ActivityIndicator size="small" color="#1565C0" />
                    : <Ionicons name="add-circle-outline" size={22} color="#1565C0" />
                  }
                </TouchableOpacity>
              )}
              style={{ maxHeight: 380 }}
            />
          </View>
        </View>
      </Modal>

      {/* ── Add Visit Modal ── */}
      <Modal visible={visitModalVisible} transparent animationType="slide" onRequestClose={() => {}}>
        <View style={vstyles.modalOverlay}>
          <View style={vstyles.modalBox}>
            {/* Header */}
            <View style={vstyles.modalHeader}>
              <Text style={vstyles.modalTitle}>{lang === 'ar' ? 'إضافة تنفيذ' : 'Add Execution'}</Text>
              <TouchableOpacity onPress={() => setVisitModalVisible(false)}>
                <Ionicons name="close" size={22} color="#444" />
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
              {/* Scope */}
              <VisitDropdown
                label={lang === 'ar' ? 'نطاق المشروع *' : 'Project Scope *'}
                options={scopes}
                value={visitForm.scopeId}
                onSelect={onVisitScopeSelect}
                open={visitScopeOpen}
                setOpen={setVisitScopeOpen}
                getLabel={(s) => getScopeName(s)}
              />

              {/* Stage */}
              <VisitDropdown
                label={lang === 'ar' ? 'المرحلة' : 'Stage'}
                options={visitStages}
                value={visitForm.stageId}
                onSelect={(id) => { setVisitForm((f) => ({ ...f, stageId: id })); onVisitStageSelect(id); }}
                open={visitStageOpen}
                setOpen={setVisitStageOpen}
                getLabel={(s) => s.value || s.name || `Stage #${s.id ?? s.key}`}
              />

              {/* Plan */}
              <VisitDropdown
                label={lang === 'ar' ? 'الخطة *' : 'Plan *'}
                options={visitPlans}
                value={visitForm.planId}
                onSelect={onVisitPlanSelect}
                open={visitPlanOpen}
                setOpen={setVisitPlanOpen}
                getLabel={(p) => p.value || p.title || `Plan #${p.id ?? p.key}`}
              />

              {/* Plan Items (إجراءات) */}
              {loadingPlanItems && (
                <View style={vstyles.itemsLoading}>
                  <ActivityIndicator size="small" color="#1565C0" />
                  <Text style={vstyles.itemsLoadingText}>{lang === 'ar' ? 'جاري تحميل الإجراءات...' : 'Loading actions...'}</Text>
                </View>
              )}
              {visitPlanItems.length > 0 && (
                <View style={vstyles.field}>
                  <View style={vstyles.itemsHeader}>
                    <Text style={vstyles.label}>{lang === 'ar' ? 'الإجراءات' : 'Actions'}</Text>
                    <TouchableOpacity onPress={() => {
                      if (selectedPlanItemIds.length === visitPlanItems.length) {
                        setSelectedPlanItemIds([]);
                      } else {
                        setSelectedPlanItemIds(visitPlanItems.map((i) => i.id));
                      }
                    }}>
                      <Text style={vstyles.selectAllText}>
                        {selectedPlanItemIds.length === visitPlanItems.length
                          ? (lang === 'ar' ? 'إلغاء الكل' : 'Deselect All')
                          : (lang === 'ar' ? 'تحديد الكل' : 'Select All')}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  {visitPlanItems.map((item) => {
                    const checked = selectedPlanItemIds.includes(item.id);
                    return (
                      <TouchableOpacity
                        key={item.id}
                        style={[vstyles.itemRow, checked && vstyles.itemRowChecked]}
                        onPress={() => setSelectedPlanItemIds((prev) =>
                          prev.includes(item.id) ? prev.filter((id) => id !== item.id) : [...prev, item.id]
                        )}
                      >
                        <Ionicons
                          name={checked ? 'checkbox' : 'square-outline'}
                          size={20}
                          color={checked ? '#1565C0' : '#bbb'}
                          style={{ marginTop: 1 }}
                        />
                        <Text style={vstyles.itemText} numberOfLines={3}>
                          {item.title || item.name || `Item #${item.id}`}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {/* Attachments — shown right below إجراءات */}
              <View style={vstyles.field}>
                <Text style={vstyles.label}>{lang === 'ar' ? 'المرفقات' : 'Attachments'}</Text>
                {visitAttachments.map((f, i) => (
                  <View key={i} style={vstyles.attachmentRow}>
                    <Ionicons name="document-outline" size={16} color="#1565C0" />
                    <Text style={vstyles.attachmentName} numberOfLines={1}>{f.name}</Text>
                    <TouchableOpacity onPress={() => setVisitAttachments((prev) => prev.filter((_, j) => j !== i))}>
                      <Ionicons name="close-circle" size={18} color="#D32F2F" />
                    </TouchableOpacity>
                  </View>
                ))}
                <TouchableOpacity style={vstyles.attachPickBtn} onPress={pickAttachment}>
                  <Ionicons name="attach-outline" size={18} color="#1565C0" />
                  <Text style={vstyles.attachPickText}>{lang === 'ar' ? 'إضافة مرفق' : 'Add Attachment'}</Text>
                </TouchableOpacity>
              </View>

              {/* Date */}
              <View style={vstyles.field}>
                <Text style={vstyles.label}>{t('visitDate')} *</Text>
                <TextInput
                  style={vstyles.input}
                  value={visitForm.date}
                  onChangeText={(v) => setVisitForm((f) => ({ ...f, date: v }))}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#aaa"
                  keyboardType="numeric"
                  textAlign={lang === 'ar' ? 'right' : 'left'}
                />
              </View>

              {/* Time row */}
              <View style={vstyles.timeRow}>
                <View style={[vstyles.field, { flex: 1 }]}>
                  <Text style={vstyles.label}>{t('timeFrom')}</Text>
                  <TextInput
                    style={vstyles.input}
                    value={visitForm.startTime}
                    onChangeText={(v) => setVisitForm((f) => ({ ...f, startTime: v }))}
                    placeholder="HH:MM"
                    placeholderTextColor="#aaa"
                    keyboardType="numeric"
                  />
                </View>
                <View style={[vstyles.field, { flex: 1 }]}>
                  <Text style={vstyles.label}>{t('timeTo')}</Text>
                  <TextInput
                    style={vstyles.input}
                    value={visitForm.endTime}
                    onChangeText={(v) => setVisitForm((f) => ({ ...f, endTime: v }))}
                    placeholder="HH:MM"
                    placeholderTextColor="#aaa"
                    keyboardType="numeric"
                  />
                </View>
              </View>

              {/* Description */}
              <View style={vstyles.field}>
                <Text style={vstyles.label}>{t('description')}</Text>
                <TextInput
                  style={[vstyles.input, vstyles.textarea]}
                  value={visitForm.description}
                  onChangeText={(v) => setVisitForm((f) => ({ ...f, description: v }))}
                  placeholder={lang === 'ar' ? 'الوصف (اختياري)' : 'Description (optional)'}
                  placeholderTextColor="#aaa"
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  textAlign={lang === 'ar' ? 'right' : 'left'}
                />
              </View>

              {/* Save button */}
              <TouchableOpacity style={vstyles.saveBtn} onPress={handleSaveVisit} disabled={savingVisit}>
                {savingVisit
                  ? <ActivityIndicator color="#fff" />
                  : <><Ionicons name="save-outline" size={18} color="#fff" /><Text style={vstyles.saveBtnText}>{lang === 'ar' ? 'حفظ' : 'Save'}</Text></>
                }
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Add Contact Modal ── */}
      <Modal visible={addModalVisible} transparent animationType="slide" onRequestClose={() => {}}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('addContact')}</Text>
              <TouchableOpacity onPress={() => setAddModalVisible(false)}>
                <Ionicons name="close" size={22} color="#444" />
              </TouchableOpacity>
            </View>
            <View style={styles.searchRow}>
              <Ionicons name="search-outline" size={16} color="#888" />
              <TextInput
                style={styles.searchInput}
                value={eligibleSearch}
                onChangeText={setEligibleSearch}
                placeholder={lang === 'ar' ? 'بحث...' : 'Search...'}
                placeholderTextColor="#aaa"
                autoFocus
              />
            </View>
            <FlatList
              data={filteredEligible}
              keyExtractor={(u, i) => String(u.id ?? u.userId ?? i)}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <Text style={styles.emptyText}>{lang === 'ar' ? 'لا توجد نتائج' : 'No results'}</Text>
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.eligibleRow}
                  onPress={() => handleAddContact(item)}
                  disabled={addingContact === (item.id ?? item.userId)}
                >
                  <UserAvatar photo={item.photo || item.Photo || item.avatar} name={item.fullName || item.userName} size={32} bgColor="#E65100" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.userName}>{item.fullName || item.userName}</Text>
                    {item.email && <Text style={styles.userRole}>{item.email}</Text>}
                  </View>
                  {addingContact === (item.id ?? item.userId)
                    ? <ActivityIndicator size="small" color="#1565C0" />
                    : <Ionicons name="add-circle-outline" size={22} color="#1565C0" />
                  }
                </TouchableOpacity>
              )}
              style={{ maxHeight: 350 }}
            />
          </View>
        </View>
      </Modal>
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
  tabsScroll: { marginBottom: 16 },
  tabsContent: {
    flexDirection: 'row', backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden',
    elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3,
  },
  tab: { flexDirection: 'column', justifyContent: 'center', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14, gap: 2 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#1565C0' },
  tabText: { fontSize: 10, color: '#888', fontWeight: '500' },
  tabTextActive: { color: '#1565C0', fontWeight: '700' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#1a1a1a', marginBottom: 10 },
  addBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1565C0', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, gap: 4 },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  // Scope cards
  scopeCard: { position: 'relative', paddingRight: 32, marginBottom: 10 },
  scopeHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  scopeIconWrap: {
    width: 28, height: 28, borderRadius: 8, backgroundColor: '#E8EEF8',
    justifyContent: 'center', alignItems: 'center',
  },
  scopeProductName: { fontSize: 15, fontWeight: '700', color: '#1a1a1a', flex: 1 },
  scopeWeight: { fontSize: 20, fontWeight: '800', color: '#1565C0', minWidth: 46, textAlign: 'right' },
  weightBarBg: { height: 6, backgroundColor: '#E8EEF8', borderRadius: 3, marginBottom: 4 },
  weightBarFill: { height: 6, backgroundColor: '#1565C0', borderRadius: 3 },
  weightLabel: { fontSize: 11, color: '#999', marginBottom: 10 },
  progressWrap: { marginBottom: 8 },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  progressSubLabel: { fontSize: 11, color: '#666' },
  progressPct: { fontSize: 11, fontWeight: '700', color: '#388E3C' },
  thinBarBg: { height: 4, backgroundColor: '#E8F5E9', borderRadius: 2 },
  thinBarFill: { height: 4, backgroundColor: '#388E3C', borderRadius: 2 },
  stagesRow: { flexDirection: 'row', gap: 5, alignItems: 'center' },
  stageDot: { width: 10, height: 10, borderRadius: 5 },
  moreStages: { fontSize: 11, color: '#888', marginLeft: 2 },
  cardArrow: { position: 'absolute', right: 12, top: 16 },

  // Users / contacts
  emptySection: { alignItems: 'center', paddingVertical: 32 },
  emptyText: { color: '#aaa', marginTop: 8, fontSize: 14, textAlign: 'center' },
  userCard: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  userAvatar: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#1565C0',
    justifyContent: 'center', alignItems: 'center',
  },
  clientAvatar: { backgroundColor: '#E65100' },
  userInitial: { color: '#fff', fontWeight: '700', fontSize: 16 },
  userInfo: { flex: 1 },
  userName: { fontSize: 14, fontWeight: '600', color: '#222' },
  userRole: { fontSize: 12, color: '#888', marginTop: 1 },
  removeBtn: { padding: 4 },

  // Info tab
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  infoLabel: { fontSize: 13, color: '#666', fontWeight: '500' },
  infoValue: { fontSize: 13, color: '#222', fontWeight: '600', textAlign: 'right', flex: 1, marginLeft: 8 },

  // Add contact modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalBox: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingBottom: 32, maxHeight: '75%',
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#1a1a1a' },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginVertical: 10,
    backgroundColor: '#F5F7FA', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14, color: '#222', height: 28 },
  eligibleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#F5F5F5',
  },
});

// ── Visit / Plan-Execution styles (separate sheet to avoid collisions) ────────
const vstyles = StyleSheet.create({
  visitCard: { marginBottom: 10 },
  visitHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 },
  visitTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, flex: 1 },
  tag: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: '#E8EEF8', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3,
  },
  tagText: { fontSize: 11, color: '#1565C0', fontWeight: '600' },
  deleteBtn: { padding: 4, marginLeft: 8 },
  visitMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
  visitMetaText: { fontSize: 12, color: '#666' },
  visitDesc: { fontSize: 13, color: '#444', lineHeight: 18, marginBottom: 4 },
  attachRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  attachText: { fontSize: 12, color: '#1565C0' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalBox: {
    backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22,
    maxHeight: '88%',
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#1a1a1a' },

  // Form fields inside modal
  field: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '600', color: '#444', marginBottom: 5 },
  input: {
    backgroundColor: '#F5F7FA', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 14, color: '#222', borderWidth: 1.5, borderColor: '#E8E8E8',
  },
  textarea: { height: 70, paddingTop: 10 },
  timeRow: { flexDirection: 'row', gap: 10 },
  select: {
    backgroundColor: '#F5F7FA', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderWidth: 1.5, borderColor: '#E8E8E8',
  },
  selectText: { fontSize: 14, color: '#222', flex: 1 },
  selectPlaceholder: { fontSize: 14, color: '#aaa', flex: 1 },
  saveBtn: {
    backgroundColor: '#1565C0', borderRadius: 12, height: 48, flexDirection: 'row',
    justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 4,
  },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // Plan items
  itemsLoading: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8 },
  itemsLoadingText: { fontSize: 12, color: '#888' },
  itemsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  selectAllText: { fontSize: 12, color: '#1565C0', fontWeight: '600' },
  itemRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    paddingVertical: 9, paddingHorizontal: 10, borderRadius: 8,
    borderWidth: 1, borderColor: '#E8E8E8', marginBottom: 6, backgroundColor: '#FAFAFA',
  },
  itemRowChecked: { borderColor: '#1565C0', backgroundColor: '#F0F4FF' },
  itemText: { flex: 1, fontSize: 13, color: '#333', lineHeight: 18 },

  // Attachments
  attachmentRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#F0F4FF', borderRadius: 8, padding: 8, marginBottom: 6,
  },
  attachmentName: { flex: 1, fontSize: 13, color: '#1565C0' },
  attachPickBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1.5, borderColor: '#1565C0', borderStyle: 'dashed',
    borderRadius: 10, padding: 10, justifyContent: 'center', marginTop: 4,
  },
  attachPickText: { color: '#1565C0', fontSize: 13, fontWeight: '600' },

  // Inline dropdown
  dropOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 },
  dropBox: { backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden', elevation: 8 },
  dropSearch: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 12, borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
  },
  dropSearchInput: { flex: 1, fontSize: 14, color: '#222', height: 32 },
  dropItem: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  dropItemActive: { backgroundColor: '#F0F4FF' },
  dropItemText: { fontSize: 14, color: '#333' },
  dropItemTextActive: { color: '#1565C0', fontWeight: '600' },
  dropEmpty: { textAlign: 'center', color: '#aaa', padding: 20, fontSize: 13 },
});
