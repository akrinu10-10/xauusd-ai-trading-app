// src/services/apiKeyStorage.ts
import * as SecureStore from "expo-secure-store";

const TWELVE_DATA_KEY = "twelve_data_api_key";
const GEMINI_KEY = "gemini_api_key";

export type StoredApiKeys = {
  twelveDataApiKey: string;
  geminiApiKey: string;
};

export async function getApiKeys(): Promise<StoredApiKeys | null> {
  const [twelveDataApiKey, geminiApiKey] = await Promise.all([
    SecureStore.getItemAsync(TWELVE_DATA_KEY),
    SecureStore.getItemAsync(GEMINI_KEY),
  ]);

  if (!twelveDataApiKey || !geminiApiKey) {
    return null;
  }

  return { twelveDataApiKey, geminiApiKey };
}

export async function saveApiKeys(keys: StoredApiKeys): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(TWELVE_DATA_KEY, keys.twelveDataApiKey),
    SecureStore.setItemAsync(GEMINI_KEY, keys.geminiApiKey),
  ]);
}

export async function clearApiKeys(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(TWELVE_DATA_KEY),
    SecureStore.deleteItemAsync(GEMINI_KEY),
  ]);
}