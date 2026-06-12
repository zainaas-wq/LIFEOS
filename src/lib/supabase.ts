import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { Database } from './supabaseTypes';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

if (__DEV__ && (!supabaseUrl || !supabaseAnonKey)) {
  console.warn(
    '[Supabase] Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY.\n' +
    'Copy .env.example to .env and fill in your Supabase project values.',
  );
}

// On native: store session tokens in the OS-level encrypted store
//   iOS  → Keychain Services
//   Android → EncryptedSharedPreferences (via Keystore)
// On web: fall back to localStorage via AsyncStorage (SecureStore unavailable on web)
//
// IMPORTANT: Run `npx expo install expo-secure-store` before building.
const SecureStoreAdapter = {
  getItem:    (key: string) => SecureStore.getItemAsync(key),
  setItem:    (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

const authStorage = Platform.OS === 'web' ? AsyncStorage : SecureStoreAdapter;

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: authStorage as any,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
