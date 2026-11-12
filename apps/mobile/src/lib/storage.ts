import * as SecureStore from "expo-secure-store";
import Storage from "expo-sqlite/kv-store";

/** Plain key-value storage (SQLite) for caches and preferences. Never put secrets here. */
export const kv = Storage;

// Keychain/Keystore entries above ~2 KB are unreliable on some devices, and a
// Supabase session is larger than that, so values are split across entries.
const CHUNK_SIZE = 1800;
const countKey = (key: string) => `${key}.chunks`;
const chunkKey = (key: string, index: number) => `${key}.${index}`;

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    const count = Number(await SecureStore.getItemAsync(countKey(key)));
    if (!Number.isInteger(count) || count <= 0) return null;
    const parts = await Promise.all(Array.from({ length: count }, (_, index) => SecureStore.getItemAsync(chunkKey(key, index))));
    if (parts.some((part) => part == null)) return null;
    return parts.join("");
  },
  async setItem(key: string, value: string): Promise<void> {
    const previous = Number(await SecureStore.getItemAsync(countKey(key))) || 0;
    const parts = value.match(new RegExp(`[\\s\\S]{1,${CHUNK_SIZE}}`, "g")) ?? [""];
    await Promise.all(parts.map((part, index) => SecureStore.setItemAsync(chunkKey(key, index), part)));
    await SecureStore.setItemAsync(countKey(key), String(parts.length));
    for (let index = parts.length; index < previous; index += 1) await SecureStore.deleteItemAsync(chunkKey(key, index));
  },
  async removeItem(key: string): Promise<void> {
    const count = Number(await SecureStore.getItemAsync(countKey(key))) || 0;
    await Promise.all(Array.from({ length: count }, (_, index) => SecureStore.deleteItemAsync(chunkKey(key, index))));
    await SecureStore.deleteItemAsync(countKey(key));
  },
};
