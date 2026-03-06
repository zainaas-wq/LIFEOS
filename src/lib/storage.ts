import AsyncStorage from '@react-native-async-storage/async-storage';

const STORE_KEY = '@lifeos_state';

export async function persistState(state: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('[LifeOS] Failed to persist state:', e);
  }
}

export async function hydrateState<T>(): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch (e) {
    console.warn('[LifeOS] Failed to hydrate state:', e);
    return null;
  }
}

export async function clearState(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORE_KEY);
  } catch (e) {
    console.warn('[LifeOS] Failed to clear state:', e);
  }
}
