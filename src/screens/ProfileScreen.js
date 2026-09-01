import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { t } from '../i18n';

function MenuItem({ icon, label, value, onPress, color = '#1565C0', danger = false }) {
  return (
    <TouchableOpacity style={styles.menuItem} onPress={onPress} activeOpacity={onPress ? 0.7 : 1}>
      <View style={[styles.menuIcon, { backgroundColor: (danger ? '#D32F2F' : color) + '18' }]}>
        <Ionicons name={icon} size={20} color={danger ? '#D32F2F' : color} />
      </View>
      <View style={styles.menuInfo}>
        <Text style={[styles.menuLabel, danger && styles.dangerText]}>{label}</Text>
        {value ? <Text style={styles.menuValue}>{value}</Text> : null}
      </View>
      {onPress && <Ionicons name="chevron-forward" size={16} color="#ccc" />}
    </TouchableOpacity>
  );
}

export default function ProfileScreen({ navigation }) {
  const { user, logout, profile } = useAuth();
  const { lang, switchLang } = useLang();
  const displayName = profile?.fullName || user?.fullName || user?.userName || user?.userId || '—';
  const displayEmail = profile?.email || user?.email || user?.userId || '';
  const displayRole = profile?.roleName || '';

  const handleLogout = () => {
    Alert.alert(
      lang === 'ar' ? 'تسجيل الخروج' : 'Logout',
      lang === 'ar' ? 'هل أنت متأكد من تسجيل الخروج؟' : 'Are you sure you want to logout?',
      [
        { text: t('cancel'), style: 'cancel' },
        { text: t('logout'), style: 'destructive', onPress: logout },
      ]
    );
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      {/* Avatar */}
      <View style={styles.avatarSection}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{displayName[0]?.toUpperCase() || 'U'}</Text>
        </View>
        <Text style={styles.userName}>{displayName}</Text>
        {displayRole ? <Text style={styles.userRole}>{displayRole}</Text> : null}
        <Text style={styles.userEmail}>{displayEmail}</Text>
      </View>

      {/* Account info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{lang === 'ar' ? 'معلومات الحساب' : 'Account Info'}</Text>
        <View style={styles.card}>
          {displayRole ? <MenuItem icon="shield-checkmark-outline" label={lang === 'ar' ? 'الدور الوظيفي' : 'Role'} value={displayRole} color="#9C27B0" /> : null}
          <MenuItem icon="mail-outline" label={lang === 'ar' ? 'البريد الإلكتروني' : 'Email'} value={displayEmail} />
          {user?.branchName && (
            <MenuItem icon="business-outline" label={t('branch')} value={user.branchName} />
          )}
        </View>
      </View>

      {/* Tools */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{lang === 'ar' ? 'الأدوات' : 'Tools'}</Text>
        <View style={styles.card}>
          <MenuItem
            icon="cloud-outline"
            label="وصول عملاء الكلاود"
            onPress={() => navigation.navigate('ClientCloudAccess')}
            color="#1565C0"
          />
        </View>
      </View>

      {/* Settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{lang === 'ar' ? 'الإعدادات' : 'Settings'}</Text>
        <View style={styles.card}>
          <MenuItem
            icon="language-outline"
            label={lang === 'ar' ? 'اللغة' : 'Language'}
            value={lang === 'ar' ? 'العربية' : 'English'}
            onPress={() => switchLang(lang === 'ar' ? 'en' : 'ar')}
            color="#9C27B0"
          />
        </View>
      </View>

      {/* Logout */}
      <View style={styles.section}>
        <View style={styles.card}>
          <MenuItem icon="log-out-outline" label={t('logout')} onPress={handleLogout} danger />
        </View>
      </View>

      <Text style={styles.version}>CRM Projects v1.0 · YemenSoft</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F5F7FA' },
  content: { paddingBottom: 40 },
  avatarSection: { alignItems: 'center', paddingVertical: 32, backgroundColor: '#1565C0' },
  avatar: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center', alignItems: 'center', marginBottom: 12,
  },
  avatarText: { fontSize: 32, fontWeight: '800', color: '#fff' },
  userName: { fontSize: 20, fontWeight: '700', color: '#fff' },
  userRole: { fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 3, fontWeight: '600' },
  userEmail: { fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
  section: { padding: 16, paddingBottom: 0 },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: '#888', marginBottom: 8, textTransform: 'uppercase' },
  card: {
    backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden',
    elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3,
  },
  menuItem: {
    flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12,
    borderBottomWidth: 1, borderBottomColor: '#F5F5F5',
  },
  menuIcon: { width: 36, height: 36, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  menuInfo: { flex: 1 },
  menuLabel: { fontSize: 14, fontWeight: '500', color: '#222' },
  menuValue: { fontSize: 12, color: '#888', marginTop: 1 },
  dangerText: { color: '#D32F2F' },
  version: { textAlign: 'center', color: '#bbb', fontSize: 12, marginTop: 24, marginBottom: 16 },
});
