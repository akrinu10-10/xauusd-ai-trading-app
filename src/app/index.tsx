import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ChartScreen } from '@/screens/ChartScreen';
import { getApiKeys, StoredApiKeys } from '@/services/apiKeyStorage';

export default function HomeScreen() {
  const [loading, setLoading] = useState(true);
  const [apiKeys, setApiKeys] = useState<StoredApiKeys | null>(null);

  const loadKeys = useCallback(async () => {
    const keys = await getApiKeys();
    setApiKeys(keys);
    setLoading(false);
  }, []);

  // Cek ulang tiap tab ini kebuka lagi — jaga-jaga user baru saja
  // simpan key dari tab Settings.
  useFocusEffect(
    useCallback(() => {
      loadKeys();
    }, [loadKeys])
  );

  if (loading) {
    return (
      <ThemedView style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color="#26a69a" />
      </ThemedView>
    );
  }

  if (!apiKeys) {
    return (
      <ThemedView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 }}>
        <ThemedText type="title">API key belum diatur</ThemedText>
        <ThemedText type="small" style={{ textAlign: 'center' }}>
          Buka tab Settings untuk memasukkan Twelve Data dan Gemini API key.
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <ChartScreen
      twelveDataApiKey={apiKeys.twelveDataApiKey}
      geminiApiKey={apiKeys.geminiApiKey}
    />
  );
}