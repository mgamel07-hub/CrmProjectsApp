import React, { useState } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';

const SERVER = 'https://crm.yemensoft.net:3346';

function buildUrl(photo) {
  if (!photo) return null;
  if (photo.startsWith('http')) return photo;
  return `${SERVER}${photo.startsWith('/') ? '' : '/'}${photo}`;
}

function getInitial(name) {
  const str = String(name || '?').trim();
  return str[0].toUpperCase();
}

export default function UserAvatar({ photo, name, size = 40, bgColor = '#1565C0', textColor = '#fff', style }) {
  const [imgError, setImgError] = useState(false);
  const url = buildUrl(photo);
  const radius = size / 2;
  const fontSize = Math.round(size * 0.4);

  return (
    <View style={[styles.wrap, { width: size, height: size, borderRadius: radius, backgroundColor: bgColor }, style]}>
      {url && !imgError ? (
        <Image
          source={{ uri: url }}
          style={{ width: size, height: size, borderRadius: radius }}
          onError={() => setImgError(true)}
        />
      ) : (
        <Text style={[styles.initial, { fontSize, color: textColor }]}>{getInitial(name)}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  initial: { fontWeight: '700' },
});
