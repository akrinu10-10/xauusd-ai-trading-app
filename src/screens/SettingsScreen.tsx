// SettingsScreen.tsx
// Form sederhana untuk input & simpan API key Twelve Data dan Gemini.
// Ditampilkan sekali di awal (saat belum ada key tersimpan).

import React, { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, Alert } from "react-native";
import { saveApiKeys } from "../services/apiKeyStorage";

interface Props {
  onSaved: () => void;
}

export function SettingsScreen({ onSaved }: Props) {
  const [twelveDataApiKey, setTwelveDataApiKey] = useState("");
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!twelveDataApiKey.trim() || !geminiApiKey.trim()) {
      Alert.alert("Belum lengkap", "Isi kedua API key terlebih dahulu.");
      return;
    }

    setSaving(true);
    try {
      await saveApiKeys(twelveDataApiKey.trim(), geminiApiKey.trim());
      onSaved();
    } catch (err) {
      Alert.alert("Gagal menyimpan", "Coba lagi.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Setup API Key</Text>

      <Text style={styles.label}>Twelve Data API Key</Text>
      <TextInput
        style={styles.input}
        value={twelveDataApiKey}
        onChangeText={setTwelveDataApiKey}
        placeholder="Dari twelvedata.com"
        placeholderTextColor="#6b7280"
        autoCapitalize="none"
        autoCorrect={false}
      />

      <Text style={styles.label}>Gemini API Key</Text>
      <TextInput
        style={styles.input}
        value={geminiApiKey}
        onChangeText={setGeminiApiKey}
        placeholder="Dari aistudio.google.com"
        placeholderTextColor="#6b7280"
        autoCapitalize="none"
        autoCorrect={false}
      />

      <Pressable style={styles.button} onPress={handleSave} disabled={saving}>
        <Text style={styles.buttonText}>{saving ? "Menyimpan..." : "Simpan & Lanjut"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0b0d11",
    padding: 20,
    justifyContent: "center",
  },
  title: {
    color: "#d1d4dc",
    fontSize: 22,
    fontWeight: "600",
    marginBottom: 24,
    textAlign: "center",
  },
  label: {
    color: "#9aa0a6",
    marginBottom: 6,
    marginTop: 16,
  },
  input: {
    backgroundColor: "#1a1d24",
    color: "#d1d4dc",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  button: {
    backgroundColor: "#26a69a",
    borderRadius: 8,
    paddingVertical: 14,
    marginTop: 28,
    alignItems: "center",
  },
  buttonText: {
    color: "#0b0d11",
    fontWeight: "700",
    fontSize: 16,
  },
});
