// App.tsx
// Root component: tampilkan SettingsScreen kalau API key belum ada,
// kalau sudah ada langsung ke ChartScreen.

import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { ChartScreen } from "./src/screens/ChartScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { getApiKeys, StoredApiKeys } from "./src/services/apiKeyStorage";

export default function App() {
  const [loading, setLoading] = useState(true);
  const [apiKeys, setApiKeys] = useState<StoredApiKeys | null>(null);

  useEffect(() => {
    loadKeys();
  }, []);

  async function loadKeys() {
    const keys = await getApiKeys();
    setApiKeys(keys);
    setLoading(false);
  }

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "#0b0d11",
        }}
      >
        <ActivityIndicator color="#26a69a" />
      </View>
    );
  }

  if (!apiKeys) {
    return <SettingsScreen onSaved={loadKeys} />;
  }

  return (
    <ChartScreen
      twelveDataApiKey={apiKeys.twelveDataApiKey}
      geminiApiKey={apiKeys.geminiApiKey}
    />
  );
}
