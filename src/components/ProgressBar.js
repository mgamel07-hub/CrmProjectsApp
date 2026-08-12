import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function ProgressBar({ value = 0, color = '#1565C0', height = 8, showLabel = false }) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <View>
      {showLabel && (
        <Text style={[styles.label, { color }]}>{pct}%</Text>
      )}
      <View style={[styles.track, { height }]}>
        <View style={[styles.fill, { width: `${pct}%`, backgroundColor: color, height }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 12, fontWeight: '700', marginBottom: 4, textAlign: 'right' },
  track: { backgroundColor: '#E8EAF6', borderRadius: 4, overflow: 'hidden', width: '100%' },
  fill:  { borderRadius: 4 },
});
