import React from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { t } from '../i18n';

export default function LoadingScreen() {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#1565C0" />
      <Text style={styles.text}>{t('loading')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F5F7FA' },
  text: { marginTop: 12, color: '#666', fontSize: 14 },
});
