import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator, Image,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { t } from '../i18n';
import { Ionicons } from '@expo/vector-icons';

export default function LoginScreen() {
  const { login, loginDemo } = useAuth();
  const { lang, switchLang } = useLang();
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!userId.trim() || !password.trim()) {
      Alert.alert(t('error'), lang === 'ar' ? 'يرجى إدخال اسم المستخدم وكلمة المرور' : 'Please enter user ID and password');
      return;
    }
    setLoading(true);
    try {
      await login(userId.trim(), password);
    } catch (err) {
      const msg = err?.response?.data?.message || err?.response?.data?.title || err?.message || t('loginError');
      Alert.alert(t('error'), msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.root}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.logoCircle}>
            <Ionicons name="business" size={40} color="#fff" />
          </View>
          <Text style={styles.appName}>CRM Projects</Text>
          <Text style={styles.subtitle}>{lang === 'ar' ? 'نظام إدارة المشاريع' : 'Project Management System'}</Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <Text style={styles.label}>{t('userId')}</Text>
          <View style={styles.inputRow}>
            <Ionicons name="person-outline" size={18} color="#888" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              value={userId}
              onChangeText={setUserId}
              autoCapitalize="none"
              placeholder={t('userId')}
              placeholderTextColor="#aaa"
              textAlign={lang === 'ar' ? 'right' : 'left'}
            />
          </View>

          <Text style={styles.label}>{t('password')}</Text>
          <View style={styles.inputRow}>
            <Ionicons name="lock-closed-outline" size={18} color="#888" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPass}
              placeholder={t('password')}
              placeholderTextColor="#aaa"
              textAlign={lang === 'ar' ? 'right' : 'left'}
            />
            <TouchableOpacity onPress={() => setShowPass(!showPass)} style={styles.eyeBtn}>
              <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={18} color="#888" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.loginBtn} onPress={handleLogin} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.loginBtnText}>{t('login')}</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.demoBtn} onPress={loginDemo}>
            <Ionicons name="flask-outline" size={16} color="#1565C0" />
            <Text style={styles.demoBtnText}>{lang === 'ar' ? 'وضع تجريبي (بدون اتصال)' : 'Demo Mode (No login)'}</Text>
          </TouchableOpacity>
        </View>

        {/* Language switch */}
        <TouchableOpacity style={styles.langBtn} onPress={() => switchLang(lang === 'ar' ? 'en' : 'ar')}>
          <Ionicons name="language-outline" size={16} color="#1565C0" />
          <Text style={styles.langText}>{lang === 'ar' ? 'English' : 'عربي'}</Text>
        </TouchableOpacity>

        <Text style={styles.footer}>YemenSoft CRM © 2026</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F0F4FF' },
  container: { flex: 1, padding: 24, justifyContent: 'center' },
  header: { alignItems: 'center', marginBottom: 36 },
  logoCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#1565C0', justifyContent: 'center', alignItems: 'center',
    marginBottom: 12, elevation: 4,
    shadowColor: '#1565C0', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8,
  },
  appName: { fontSize: 26, fontWeight: '800', color: '#1565C0' },
  subtitle: { fontSize: 13, color: '#666', marginTop: 4 },
  form: {
    backgroundColor: '#fff', borderRadius: 16, padding: 20,
    elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8,
  },
  label: { fontSize: 13, color: '#555', marginBottom: 6, fontWeight: '600' },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1.5,
    borderColor: '#E0E0E0', borderRadius: 10, paddingHorizontal: 10, marginBottom: 16, backgroundColor: '#F9F9F9',
  },
  inputIcon: { marginRight: 8 },
  input: { flex: 1, height: 46, fontSize: 15, color: '#222' },
  eyeBtn: { padding: 4 },
  demoBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginTop: 12, padding: 10, borderRadius: 8, borderWidth: 1.5,
    borderColor: '#1565C0', gap: 6, backgroundColor: '#F0F4FF',
  },
  demoBtnText: { color: '#1565C0', fontSize: 13, fontWeight: '600' },
  loginBtn: {
    backgroundColor: '#1565C0', borderRadius: 10, height: 48,
    justifyContent: 'center', alignItems: 'center', marginTop: 4, elevation: 2,
  },
  loginBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  langBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 20, gap: 6 },
  langText: { color: '#1565C0', fontSize: 14, fontWeight: '600' },
  footer: { textAlign: 'center', color: '#999', fontSize: 11, marginTop: 24 },
});
