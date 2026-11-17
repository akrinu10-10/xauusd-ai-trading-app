// apiKeyStorage.ts
// Simpan & ambil API key Twelve Data dan Gemini lewat secure storage HP,
// supaya tidak pernah ditulis langsung di kode.

import * as SecureStore from "expo-secure-store";

const TWELVE_DATA_KEY = "twelve_data_api_key";
const GEMINI_KEY = "gemini_api_key";

export interface StoredApiKeys {
  twelveDataApiKey: string;
  geminiApiKey: string;
}

export async function saveApiKeys(
  twelveDataApiKey: string,
  geminiApiKey: string
): Promise<void> {
  await SecureStore.setItemAsync(TWELVE_DATA_KEY, twelveDataApiKey);
  await SecureStore.setItemAsync(GEMINI_KEY, geminiApiKey);
}

/** Null kalau salah satu atau kedua key belum pernah diisi. */
export async function getApiKeys(): Promise<StoredApiKeys | null> {
  const twelveDataApiKey = await SecureStore.getItemAsync(TWELVE_DATA_KEY);
  const geminiApiKey = await SecureStore.getItemAsync(GEMINI_KEY);

  if (!twelveDataApiKey || !geminiApiKey) {
    return null;
  }

  return { twelveDataApiKey, geminiApiKey };
}

export async function clearApiKeys(): Promise<void> {
  await SecureStore.deleteItemAsync(TWELVE_DATA_KEY);
  await SecureStore.deleteItemAsync(GEMINI_KEY);
}
