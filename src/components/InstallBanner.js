import React, { useEffect, useState } from 'react';
import { Platform, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Web-only: shows Android install prompt or iOS instructions
export default function InstallBanner() {
  if (Platform.OS !== 'web') return null;
  return <InstallBannerWeb />;
}

function InstallBannerWeb() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [show, setShow]                     = useState(false);
  const [isIOS, setIsIOS]                   = useState(false);
  const [dismissed, setDismissed]           = useState(false);

  useEffect(() => {
    // Already installed — don't show
    if (window.matchMedia('(display-mode: standalone)').matches) return;
    if (window.navigator.standalone) return;

    const stored = localStorage.getItem('pwa_install_dismissed');
    if (stored) return;

    const ua = navigator.userAgent || '';
    const ios = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
    setIsIOS(ios);

    if (ios) {
      // iOS can't trigger prompt — show manual instructions
      const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS/.test(ua);
      if (isSafari) setShow(true);
      return;
    }

    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShow(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const dismiss = () => {
    setShow(false);
    setDismissed(true);
    localStorage.setItem('pwa_install_dismissed', '1');
  };

  const install = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setShow(false);
    setDeferredPrompt(null);
  };

  if (!show || dismissed) return null;

  return (
    <View style={styles.banner}>
      <View style={styles.iconWrap}>
        <Ionicons name="phone-portrait-outline" size={22} color="#1565C0" />
      </View>
      <View style={styles.text}>
        <Text style={styles.title}>ثبّت التطبيق</Text>
        {isIOS ? (
          <Text style={styles.sub}>
            اضغط <Ionicons name="share-outline" size={13} color="#555" /> ثم "إضافة للشاشة الرئيسية"
          </Text>
        ) : (
          <Text style={styles.sub}>أضف التطبيق على الموبايل للوصول السريع</Text>
        )}
      </View>
      {!isIOS && (
        <TouchableOpacity style={styles.installBtn} onPress={install}>
          <Text style={styles.installBtnText}>تثبيت</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity style={styles.closeBtn} onPress={dismiss}>
        <Ionicons name="close" size={18} color="#aaa" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    bottom: 70,
    left: 12,
    right: 12,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 9999,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#E3F2FD',
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: { flex: 1 },
  title: { fontSize: 14, fontWeight: '700', color: '#222', textAlign: 'right' },
  sub: { fontSize: 12, color: '#666', marginTop: 2, textAlign: 'right' },
  installBtn: {
    backgroundColor: '#1565C0',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  installBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  closeBtn: { padding: 4 },
});
