// src/screens/SettingsScreen.tsx
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { saveApiKeys } from "@/services/apiKeyStorage";

type Props = {
  onSaved: () => void;
};

export function SettingsScreen({ onSaved }: Props) {
  const [twelveDataApiKey, setTwelveDataApiKey] = useState("");
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave =
    twelveDataApiKey.trim().length > 0 && geminiApiKey.trim().length > 0 && !saving;

  async function handleSave() {
    setError(null);

    const trimmedTwelveData = twelveDataApiKey.trim();
    const trimmedGemini = geminiApiKey.trim();

    if (!trimmedTwelveData || !trimmedGemini) {
      setError("Kedua API key wajib diisi.");
      return;
    }

    setSaving(true);
    try {
      await saveApiKeys({
        twelveDataApiKey: trimmedTwelveData,
        geminiApiKey: trimmedGemini,
      });
      onSaved();
    } catch {
      setError("Gagal menyimpan API key. Coba lagi.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <ThemedText type="title" style={styles.title}>
        Pengaturan API Key
      </ThemedText>

      <View style={styles.field}>
        <ThemedText type="small">Twelve Data API Key</ThemedText>
        <TextInput
          style={styles.input}
          value={twelveDataApiKey}
          onChangeText={setTwelveDataApiKey}
          placeholder="Masukkan Twelve Data API key"
          placeholderTextColor="#777"
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
        />
      </View>

      <View style={styles.field}>
        <ThemedText type="small">Gemini API Key</ThemedText>
        <TextInput
          style={styles.input}
          value={geminiApiKey}
          onChangeText={setGeminiApiKey}
          placeholder="Masukkan Gemini API key"
          placeholderTextColor="#777"
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
        />
      </View>

      {error && (
        <ThemedText type="small" style={styles.error}>
          {error}
        </ThemedText>
      )}

      <Pressable
        style={[styles.button, !canSave && styles.buttonDisabled]}
        onPress={handleSave}
        disabled={!canSave}
      >
        {saving ? (
          <ActivityIndicator color="#0b0d11" />
        ) : (
          <ThemedText style={styles.buttonText}>Simpan</ThemedText>
        )}
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    gap: 20,
  },
  title: {
    marginBottom: 8,
  },
  field: {
    gap: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: "#333",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#fff",
  },
  error: {
    color: "#ff6b6b",
  },
  button: {
    backgroundColor: "#26a69a",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: "#0b0d11",
    fontWeight: "600",
  },
});