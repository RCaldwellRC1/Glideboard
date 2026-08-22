import React from 'react';
import { View, Text } from 'react-native';

export default function TrackerScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontSize: 24, fontWeight: 'bold' }}>RECOVERY MODE</Text>
      <Text style={{ color: '#f97316', marginTop: 12 }}>Version 1.2.0 (Build 230)</Text>
    </View>
  );
}
