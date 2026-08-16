import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Alert,
  Modal, TextInput, ActivityIndicator, ScrollView, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  getTeams, createTeam, renameTeam, deleteTeam,
  getTeamMembers, upsertTeamMember, deleteTeamMember,
} from '../../api/internal';
import { getUsers } from '../../api/projects';
import { extractList } from '../../utils/helpers';

const TABS = [
  { key: 'teams', label: 'الفرق', icon: 'layers-outline' },
  { key: 'members', label: 'الأعضاء', icon: 'people-outline' },
  { key: 'permissions', label: 'الصلاحيات', icon: 'shield-checkmark-outline' },
];

const ROLES = [
  { key: 'manager', label: 'مدير فريق', icon: 'star', color: '#E65100', bg: '#FFF3E0' },
  { key: 'employee', label: 'موظف', icon: 'person', color: '#1565C0', bg: '#E3F2FD' },
];

function getCrmId(u) {
  return String(u.key ?? u.userId ?? u.id ?? '');
}
function getCrmName(u) {
  return u.value || u.fullName || u.name || getCrmId(u);
}

export default function TeamSetupScreen() {
  const [tab, setTab] = useState('teams');
  const [crmUsers, setCrmUsers] = useState([]);
  const [members, setMembers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  // Edit member sheet (used for both تعديل from الأعضاء tab AND إضافة from الفرق tab)
  const [editUser, setEditUser] = useState(null);
  const [editForm, setEditForm] = useState({ role: 'employee', teamId: null });
  const [saving, setSaving] = useState(false);

  // New / rename team modal
  const [teamModal, setTeamModal] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [editingTeam, setEditingTeam] = useState(null);

  // Add-member-to-team picker (shown when pressing + on a team card)
  const [addToTeam, setAddToTeam] = useState(null); // the team object
  const [addSearch, setAddSearch] = useState('');

  const load = useCallback(async () => {
    try {
      const [userRes, membersData, teamsData] = await Promise.all([
        getUsers().catch(() => null),
        getTeamMembers(),
        getTeams(),
      ]);
      const raw = (userRes ? extractList(userRes) : null) || [];
      setCrmUsers(raw);
      setMembers(membersData);
      setTeams(teamsData);
    } catch (e) {
      Alert.alert('خطأ', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Merge CRM user with Supabase member record
  const merged = crmUsers.map(u => {
    const crmId = getCrmId(u);
    const member = members.find(m => m.crm_user_id === crmId);
    return { crmId, name: getCrmName(u), member };
  });

  const filtered = search.trim()
    ? merged.filter(u => u.name.toLowerCase().includes(search.toLowerCase()) || u.crmId.includes(search))
    : merged;

  // Users NOT yet in the target team (for the add-member picker)
  const unassignedForTeam = addToTeam
    ? merged.filter(u => !u.member || u.member.team_id !== addToTeam.id)
    : [];
  const addFiltered = addSearch.trim()
    ? unassignedForTeam.filter(u => u.name.toLowerCase().includes(addSearch.toLowerCase()) || u.crmId.includes(addSearch))
    : unassignedForTeam;

  const openEdit = (u, presetTeamId = null) => {
    setEditUser(u);
    setEditForm({
      role: u.member?.role || 'employee',
      teamId: presetTeamId ?? (u.member?.team_id || null),
    });
  };

  const saveEdit = async () => {
    if (!editUser) return;
    setSaving(true);
    try {
      await upsertTeamMember({
        crm_user_id: editUser.crmId,
        display_name: editUser.name,
        role: editForm.role,
        team_id: editForm.teamId,
      });
      await load();
      setEditUser(null);
      setAddToTeam(null);
    } catch (e) {
      Alert.alert('خطأ', e.message);
    } finally {
      setSaving(false);
    }
  };

  const clearMember = async (u) => {
    if (!u.member) return;
    Alert.alert('إزالة', `إزالة "${u.name}" من إعداد الفريق؟`, [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'إزالة', style: 'destructive', onPress: async () => {
        try { await deleteTeamMember(u.crmId); load(); } catch (e) { Alert.alert('خطأ', e.message); }
      }},
    ]);
  };

  const removeMemberFromTeam = async (member) => {
    Alert.alert('إزالة من الفريق', `إزالة "${member.display_name}" من الفريق؟`, [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'إزالة', style: 'destructive', onPress: async () => {
        try {
          await upsertTeamMember({ crm_user_id: member.crm_user_id, display_name: member.display_name, role: member.role, team_id: null });
          load();
        } catch (e) { Alert.alert('خطأ', e.message); }
      }},
    ]);
  };

  // Teams actions
  const openNewTeam = () => { setEditingTeam(null); setTeamName(''); setTeamModal(true); };
  const openRenameTeam = (t) => { setEditingTeam(t); setTeamName(t.name); setTeamModal(true); };

  const saveTeam = async () => {
    if (!teamName.trim()) return;
    try {
      if (editingTeam) { await renameTeam(editingTeam.id, teamName.trim()); }
      else { await createTeam(teamName.trim()); }
      setTeamModal(false);
      load();
    } catch (e) {
      Alert.alert('خطأ', e.message);
    }
  };

  const removeTeam = (t) => {
    Alert.alert('حذف', `حذف الفريق "${t.name}"؟`, [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'حذف', style: 'destructive', onPress: async () => {
        try { await deleteTeam(t.id); load(); } catch (e) { Alert.alert('خطأ', e.message); }
      }},
    ]);
  };

  // ── Permissions computation ───────────────────────────────────────────────
  const permGroups = React.useMemo(() => {
    const groups = [];
    const managers = members.filter(m => m.role === 'manager');
    const teamMap = {};
    teams.forEach(t => { teamMap[t.id] = t.name; });

    managers.forEach(mgr => {
      const crmUser = crmUsers.find(u => getCrmId(u) === mgr.crm_user_id);
      const name = mgr.display_name || (crmUser ? getCrmName(crmUser) : mgr.crm_user_id);
      const teamMembers = mgr.team_id
        ? members.filter(m => m.team_id === mgr.team_id && m.crm_user_id !== mgr.crm_user_id)
        : [];
      groups.push({
        managerId: mgr.crm_user_id,
        managerName: name,
        teamName: mgr.team_id ? (teamMap[mgr.team_id] || '—') : 'بدون فريق',
        canSee: [
          { id: mgr.crm_user_id, name, self: true },
          ...teamMembers.map(m => ({ id: m.crm_user_id, name: m.display_name || m.crm_user_id })),
        ],
      });
    });

    const assignedToManagedTeams = new Set(
      managers.flatMap(mg => mg.team_id ? members.filter(m => m.team_id === mg.team_id).map(m => m.crm_user_id) : [])
    );
    const standalone = members.filter(m => m.role === 'employee' && !assignedToManagedTeams.has(m.crm_user_id));
    standalone.forEach(emp => {
      const name = emp.display_name || emp.crm_user_id;
      groups.push({ managerId: null, managerName: name, teamName: '—', isEmployee: true, canSee: [{ id: emp.crm_user_id, name, self: true }] });
    });

    return groups;
  }, [members, teams, crmUsers]);

  // ── Render ────────────────────────────────────────────────────────────────

  const renderMember = ({ item: u }) => {
    const role = ROLES.find(r => r.key === u.member?.role);
    const teamName = u.member?.teams?.name;
    return (
      <TouchableOpacity style={styles.memberRow} onPress={() => openEdit(u)} activeOpacity={0.8}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{u.name.charAt(0)}</Text>
        </View>
        <View style={styles.memberInfo}>
          <View style={styles.memberNameRow}>
            <Text style={styles.memberName}>{u.name}</Text>
            <View style={styles.idBadge}>
              <Text style={styles.idText}>#{u.crmId}</Text>
            </View>
          </View>
          <View style={styles.memberMeta}>
            {role ? (
              <View style={[styles.rolePill, { backgroundColor: role.bg }]}>
                <Ionicons name={role.icon} size={10} color={role.color} />
                <Text style={[styles.rolePillText, { color: role.color }]}>{role.label}</Text>
              </View>
            ) : (
              <View style={[styles.rolePill, { backgroundColor: '#f0f0f0' }]}>
                <Text style={[styles.rolePillText, { color: '#aaa' }]}>اضغط لتعيين الدور</Text>
              </View>
            )}
            {teamName && (
              <View style={styles.teamPill}>
                <Ionicons name="layers-outline" size={10} color="#00695C" />
                <Text style={styles.teamPillText}>{teamName}</Text>
              </View>
            )}
          </View>
        </View>
        {u.member && (
          <TouchableOpacity onPress={() => clearMember(u)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ paddingLeft: 8 }}>
            <Ionicons name="close-circle-outline" size={18} color="#ddd" />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  const renderTeam = ({ item: t }) => {
    const teamMembersList = members.filter(m => m.team_id === t.id);
    const manager = teamMembersList.find(m => m.role === 'manager');
    return (
      <View style={styles.teamCard}>
        <View style={styles.teamCardHeader}>
          <View style={styles.teamIconWrap}>
            <Ionicons name="layers" size={20} color="#00695C" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.teamCardName}>{t.name}</Text>
            <Text style={styles.teamCardMeta}>{teamMembersList.length} {teamMembersList.length === 1 ? 'عضو' : 'أعضاء'}</Text>
          </View>
          <TouchableOpacity onPress={() => openRenameTeam(t)} style={styles.teamAction}>
            <Ionicons name="pencil-outline" size={16} color="#888" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => removeTeam(t)} style={styles.teamAction}>
            <Ionicons name="trash-outline" size={16} color="#ccc" />
          </TouchableOpacity>
        </View>

        {/* Members chips */}
        {teamMembersList.length > 0 && (
          <View style={styles.memberChips}>
            {teamMembersList.map(m => (
              <TouchableOpacity
                key={m.id}
                style={[styles.memberChip, m.role === 'manager' && styles.memberChipManager]}
                onLongPress={() => removeMemberFromTeam(m)}
                activeOpacity={0.7}
              >
                <Ionicons name={m.role === 'manager' ? 'star' : 'person-outline'} size={11} color={m.role === 'manager' ? '#E65100' : '#555'} />
                <Text style={[styles.memberChipText, m.role === 'manager' && { color: '#E65100' }]}>
                  {m.display_name || m.crm_user_id}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {manager && (
          <View style={styles.managerBanner}>
            <Ionicons name="star" size={12} color="#E65100" />
            <Text style={styles.managerBannerText}>المدير: {manager.display_name || manager.crm_user_id}</Text>
          </View>
        )}

        {/* Add member button */}
        <TouchableOpacity
          style={styles.addMemberBtn}
          onPress={() => { setAddToTeam(t); setAddSearch(''); }}
        >
          <Ionicons name="person-add-outline" size={15} color="#00695C" />
          <Text style={styles.addMemberText}>إضافة عضو للفريق</Text>
        </TouchableOpacity>
      </View>
    );
  };

  if (loading) {
    return <ActivityIndicator style={{ flex: 1, marginTop: 80 }} color="#1565C0" size="large" />;
  }

  return (
    <View style={styles.root}>
      {/* Tabs */}
      <View style={styles.tabBar}>
        {TABS.map(t => (
          <TouchableOpacity key={t.key} style={[styles.tabItem, tab === t.key && styles.tabItemActive]} onPress={() => setTab(t.key)}>
            <Ionicons name={t.icon} size={16} color={tab === t.key ? '#1565C0' : '#aaa'} />
            <Text style={[styles.tabLabel, tab === t.key && styles.tabLabelActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Teams Tab ── */}
      {tab === 'teams' && (
        <>
          <TouchableOpacity style={styles.newTeamBtn} onPress={openNewTeam}>
            <Ionicons name="add-circle-outline" size={18} color="#fff" />
            <Text style={styles.newTeamText}>إنشاء فريق جديد</Text>
          </TouchableOpacity>
          <FlatList
            data={teams}
            keyExtractor={t => t.id}
            renderItem={renderTeam}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={['#1565C0']} />}
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <Ionicons name="layers-outline" size={48} color="#ddd" />
                <Text style={styles.emptyText}>ابدأ بإنشاء فريق من الزرار أعلاه</Text>
              </View>
            }
          />
        </>
      )}

      {/* ── Members Tab ── */}
      {tab === 'members' && (
        <>
          <View style={styles.membersHint}>
            <Ionicons name="information-circle-outline" size={14} color="#1565C0" />
            <Text style={styles.membersHintText}>اضغط على أي شخص لتعيين دوره وفريقه</Text>
          </View>
          <View style={styles.searchWrap}>
            <Ionicons name="search-outline" size={16} color="#aaa" />
            <TextInput
              style={styles.searchInput}
              placeholder="ابحث بالاسم أو رقم المستخدم..."
              value={search}
              onChangeText={setSearch}
              placeholderTextColor="#bbb"
            />
            {search ? <TouchableOpacity onPress={() => setSearch('')}><Ionicons name="close" size={16} color="#aaa" /></TouchableOpacity> : null}
          </View>
          <FlatList
            data={filtered}
            keyExtractor={u => u.crmId}
            renderItem={renderMember}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={['#1565C0']} />}
            ListEmptyComponent={<Text style={styles.emptyText}>لا يوجد مستخدمون</Text>}
          />
        </>
      )}

      {/* ── Permissions Tab ── */}
      {tab === 'permissions' && (
        <ScrollView
          contentContainerStyle={styles.permList}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={['#1565C0']} />}
        >
          <View style={styles.permNote}>
            <Ionicons name="information-circle-outline" size={15} color="#1565C0" />
            <Text style={styles.permNoteText}>المدير يشوف كل أعضاء فريقه — الموظف يشوف نفسه فقط</Text>
          </View>
          {permGroups.length === 0 && (
            <View style={styles.emptyWrap}>
              <Ionicons name="shield-outline" size={48} color="#ddd" />
              <Text style={styles.emptyText}>أنشئ فرقاً وعيّن أدواراً أولاً</Text>
            </View>
          )}
          {permGroups.map((g, i) => (
            <View key={i} style={styles.permCard}>
              <View style={styles.permCardHeader}>
                {g.isEmployee ? (
                  <View style={[styles.permRoleBadge, { backgroundColor: '#E3F2FD' }]}>
                    <Ionicons name="person" size={12} color="#1565C0" />
                    <Text style={[styles.permRoleText, { color: '#1565C0' }]}>موظف</Text>
                  </View>
                ) : (
                  <View style={[styles.permRoleBadge, { backgroundColor: '#FFF3E0' }]}>
                    <Ionicons name="star" size={12} color="#E65100" />
                    <Text style={[styles.permRoleText, { color: '#E65100' }]}>مدير</Text>
                  </View>
                )}
                <Text style={styles.permName}>{g.managerName}</Text>
                <View style={styles.permTeamTag}>
                  <Ionicons name="layers-outline" size={10} color="#00695C" />
                  <Text style={styles.permTeamTagText}>{g.teamName}</Text>
                </View>
              </View>
              <View style={styles.permSeeRow}>
                <Text style={styles.permSeeLabel}>يشوف ({g.canSee.length}):</Text>
                <View style={styles.permSeeList}>
                  {g.canSee.map((s) => (
                    <View key={s.id} style={[styles.seeChip, s.self && styles.seeChipSelf]}>
                      <Text style={[styles.seeChipText, s.self && styles.seeChipTextSelf]}>
                        {s.self ? '👤 ' : ''}{s.name}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {/* ── Add Member to Team Picker ── */}
      <Modal visible={!!addToTeam} transparent animationType="slide" onRequestClose={() => setAddToTeam(null)}>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { maxHeight: '80%' }]}>
            <View style={styles.sheetHeaderRow}>
              <Text style={styles.sheetTitle}>إضافة عضو إلى "{addToTeam?.name}"</Text>
              <TouchableOpacity onPress={() => setAddToTeam(null)}>
                <Ionicons name="close" size={22} color="#888" />
              </TouchableOpacity>
            </View>
            <View style={styles.searchWrap}>
              <Ionicons name="search-outline" size={15} color="#aaa" />
              <TextInput
                style={styles.searchInput}
                placeholder="ابحث..."
                value={addSearch}
                onChangeText={setAddSearch}
                autoFocus
                placeholderTextColor="#bbb"
              />
            </View>
            {crmUsers.length === 0 ? (
              <Text style={styles.emptyText}>لا يوجد مستخدمون من الـ CRM</Text>
            ) : (
              <FlatList
                data={addFiltered}
                keyExtractor={u => u.crmId}
                renderItem={({ item: u }) => (
                  <TouchableOpacity
                    style={styles.addPickerRow}
                    onPress={() => { setAddToTeam(null); openEdit(u, addToTeam.id); }}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.avatar, { width: 34, height: 34, borderRadius: 17 }]}>
                      <Text style={[styles.avatarText, { fontSize: 13 }]}>{u.name.charAt(0)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.addPickerName}>{u.name}</Text>
                      <Text style={styles.addPickerId}>#{u.crmId}</Text>
                    </View>
                    {u.member?.team_id && (
                      <View style={styles.alreadyBadge}>
                        <Text style={styles.alreadyBadgeText}>
                          {teams.find(t => t.id === u.member.team_id)?.name || 'فريق آخر'}
                        </Text>
                      </View>
                    )}
                    <Ionicons name="chevron-forward" size={16} color="#ccc" />
                  </TouchableOpacity>
                )}
                ListEmptyComponent={<Text style={styles.emptyText}>لا نتائج</Text>}
                contentContainerStyle={{ paddingBottom: 20 }}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* ── Edit Member Role/Team Modal ── */}
      <Modal visible={!!editUser} transparent animationType="slide" onRequestClose={() => setEditUser(null)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>{editUser?.name}</Text>
            <View style={styles.crmIdRow}>
              <Text style={styles.crmIdLabel}>رقم المستخدم:</Text>
              <Text style={styles.crmIdValue}>#{editUser?.crmId}</Text>
            </View>

            <Text style={styles.sheetSectionLabel}>الدور</Text>
            <View style={styles.roleRow}>
              {ROLES.map(r => (
                <TouchableOpacity
                  key={r.key}
                  style={[styles.roleBtn, editForm.role === r.key && { borderColor: r.color, backgroundColor: r.bg }]}
                  onPress={() => setEditForm(f => ({ ...f, role: r.key }))}
                >
                  <Ionicons name={r.icon} size={22} color={editForm.role === r.key ? r.color : '#ccc'} />
                  <Text style={[styles.roleBtnText, editForm.role === r.key && { color: r.color }]}>{r.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.sheetSectionLabel}>الفريق</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.teamChips}>
              <TouchableOpacity
                style={[styles.teamChip, !editForm.teamId && styles.teamChipSelected]}
                onPress={() => setEditForm(f => ({ ...f, teamId: null }))}
              >
                <Text style={[styles.teamChipText, !editForm.teamId && { color: '#fff' }]}>بدون فريق</Text>
              </TouchableOpacity>
              {teams.map(t => (
                <TouchableOpacity
                  key={t.id}
                  style={[styles.teamChip, editForm.teamId === t.id && styles.teamChipSelected]}
                  onPress={() => setEditForm(f => ({ ...f, teamId: t.id }))}
                >
                  <Text style={[styles.teamChipText, editForm.teamId === t.id && { color: '#fff' }]}>{t.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.sheetBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditUser(null)}>
                <Text style={styles.cancelText}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={saveEdit} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveText}>حفظ</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── New/Rename Team Modal ── */}
      <Modal visible={teamModal} transparent animationType="fade" onRequestClose={() => setTeamModal(false)}>
        <View style={styles.overlay}>
          <View style={styles.smallSheet}>
            <Text style={styles.sheetTitle}>{editingTeam ? 'تعديل اسم الفريق' : 'فريق جديد'}</Text>
            <TextInput
              style={styles.teamNameInput}
              placeholder="اسم الفريق..."
              value={teamName}
              onChangeText={setTeamName}
              autoFocus
            />
            <View style={styles.sheetBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setTeamModal(false)}>
                <Text style={styles.cancelText}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={saveTeam}>
                <Text style={styles.saveText}>حفظ</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F5F7FA' },

  // Tabs
  tabBar: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#eee' },
  tabItem: { flex: 1, paddingVertical: 12, alignItems: 'center', gap: 3, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabItemActive: { borderBottomColor: '#1565C0' },
  tabLabel: { fontSize: 11, color: '#aaa', fontWeight: '600' },
  tabLabelActive: { color: '#1565C0' },

  // Members hint
  membersHint: { flexDirection: 'row', alignItems: 'center', gap: 6, margin: 12, marginBottom: 0, backgroundColor: '#E3F2FD', borderRadius: 8, padding: 10 },
  membersHintText: { fontSize: 12, color: '#1565C0', flex: 1 },

  // Search
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    margin: 12, backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2,
  },
  searchInput: { flex: 1, fontSize: 13, color: '#333', padding: 0 },

  list: { padding: 12, paddingBottom: 32, gap: 6 },

  // Member row
  memberRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 12,
    elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2,
  },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#1565C0', justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  avatarText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  memberInfo: { flex: 1 },
  memberNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  memberName: { fontSize: 14, fontWeight: '700', color: '#1a1a1a' },
  idBadge: { backgroundColor: '#f0f0f0', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  idText: { fontSize: 10, color: '#888', fontWeight: '700' },
  memberMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5, flexWrap: 'wrap' },
  rolePill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  rolePillText: { fontSize: 11, fontWeight: '600' },
  teamPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#E8F5E9', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  teamPillText: { fontSize: 11, color: '#00695C', fontWeight: '600' },

  // Teams tab
  newTeamBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, margin: 12, backgroundColor: '#00695C', borderRadius: 10, padding: 14, justifyContent: 'center' },
  newTeamText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  teamCard: { backgroundColor: '#fff', borderRadius: 14, marginBottom: 10, overflow: 'hidden', elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3 },
  teamCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  teamIconWrap: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#E8F5E9', justifyContent: 'center', alignItems: 'center' },
  teamCardName: { fontSize: 15, fontWeight: '800', color: '#1a1a1a' },
  teamCardMeta: { fontSize: 12, color: '#888', marginTop: 2 },
  teamAction: { padding: 6 },
  managerBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFF8F0', paddingHorizontal: 14, paddingVertical: 6 },
  managerBannerText: { fontSize: 12, color: '#E65100', fontWeight: '600' },
  memberChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 14, paddingVertical: 8 },
  memberChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#f5f5f5', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  memberChipManager: { backgroundColor: '#FFF3E0' },
  memberChipText: { fontSize: 12, color: '#555', fontWeight: '600' },
  addMemberBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center',
    borderTopWidth: 1, borderTopColor: '#f0f0f0', paddingVertical: 12,
    backgroundColor: '#F1F8F5',
  },
  addMemberText: { fontSize: 13, color: '#00695C', fontWeight: '700' },

  // Add member picker
  addPickerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 12, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: '#f5f5f5',
  },
  addPickerName: { fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
  addPickerId: { fontSize: 11, color: '#aaa', marginTop: 2 },
  alreadyBadge: { backgroundColor: '#FFF3E0', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  alreadyBadgeText: { fontSize: 11, color: '#E65100', fontWeight: '600' },

  // Permissions tab
  permList: { padding: 12, paddingBottom: 40 },
  permNote: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#E3F2FD', borderRadius: 10, padding: 12, marginBottom: 12 },
  permNoteText: { flex: 1, fontSize: 12, color: '#1565C0', lineHeight: 18 },
  permCard: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3 },
  permCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  permRoleBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  permRoleText: { fontSize: 11, fontWeight: '700' },
  permName: { flex: 1, fontSize: 14, fontWeight: '700', color: '#1a1a1a' },
  permTeamTag: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#E8F5E9', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  permTeamTagText: { fontSize: 11, color: '#00695C', fontWeight: '600' },
  permSeeRow: { backgroundColor: '#f9f9f9', borderRadius: 10, padding: 10 },
  permSeeLabel: { fontSize: 11, color: '#888', fontWeight: '600', marginBottom: 8 },
  permSeeList: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  seeChip: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e0e0e0', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  seeChipSelf: { backgroundColor: '#E3F2FD', borderColor: '#BBDEFB' },
  seeChipText: { fontSize: 12, color: '#666' },
  seeChipTextSelf: { color: '#1565C0', fontWeight: '600' },

  // Modals
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40 },
  sheetHandle: { width: 40, height: 4, backgroundColor: '#e0e0e0', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sheetHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  smallSheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 32 },
  sheetTitle: { fontSize: 15, fontWeight: '800', color: '#1a1a1a', marginBottom: 6, textAlign: 'center', flex: 1 },
  crmIdRow: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center', marginBottom: 20 },
  crmIdLabel: { fontSize: 12, color: '#888' },
  crmIdValue: { fontSize: 15, fontWeight: '800', color: '#1565C0' },
  sheetSectionLabel: { fontSize: 11, fontWeight: '700', color: '#aaa', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  roleRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  roleBtn: { flex: 1, alignItems: 'center', gap: 6, padding: 14, borderRadius: 14, borderWidth: 2, borderColor: '#eee', backgroundColor: '#fafafa' },
  roleBtnText: { fontSize: 13, fontWeight: '700', color: '#ccc' },
  teamChips: { gap: 8, paddingBottom: 4, marginBottom: 20 },
  teamChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#ddd', backgroundColor: '#fafafa' },
  teamChipSelected: { backgroundColor: '#1565C0', borderColor: '#1565C0' },
  teamChipText: { fontSize: 13, fontWeight: '600', color: '#555' },
  sheetBtns: { flexDirection: 'row', gap: 10 },
  cancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: '#ddd', alignItems: 'center' },
  cancelText: { fontSize: 14, color: '#666', fontWeight: '600' },
  saveBtn: { flex: 2, paddingVertical: 13, borderRadius: 12, backgroundColor: '#1565C0', alignItems: 'center', justifyContent: 'center' },
  saveText: { fontSize: 14, color: '#fff', fontWeight: '700' },
  teamNameInput: { backgroundColor: '#f5f5f5', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, marginBottom: 16 },
  emptyWrap: { alignItems: 'center', paddingVertical: 60 },
  emptyText: { color: '#aaa', marginTop: 10, fontSize: 14, textAlign: 'center' },
});
