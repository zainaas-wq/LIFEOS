/**
 * LifeOS 2.0 — i18n initialization
 *
 * Uses i18next + react-i18next.
 * Default language: English.
 * Fallback language: English (all other locales fall through).
 * RTL: Arabic and Hebrew — requires app reload to fully apply layout direction.
 *
 * Usage in components:
 *   import { useTranslation } from 'react-i18next';
 *   const { t } = useTranslation();
 *   t('home.greeting_morning')
 *
 * Switching language programmatically:
 *   import { setAppLanguage } from '../i18n';
 *   await setAppLanguage('ar');
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { I18nManager } from 'react-native';
import * as Localization from 'expo-localization';

import en from './locales/en';
import ar from './locales/ar';
import he from './locales/he';

// Languages that require RTL layout direction
export const RTL_LANGUAGES = ['ar', 'he'] as const;
export type SupportedLanguage = 'en' | 'ar' | 'he';

export function isRTLLanguage(lang: string): boolean {
  return (RTL_LANGUAGES as readonly string[]).includes(lang);
}

/**
 * Apply layout direction for a given language code.
 * React Native requires a full app reload for RTL to take effect in all components.
 * Call this on startup (via loadSavedLanguage) and when the user switches language.
 */
export function applyLayoutDirection(lang: string): void {
  const rtl = isRTLLanguage(lang);
  I18nManager.allowRTL(rtl);
  I18nManager.forceRTL(rtl);
}

/**
 * Change the active language and update layout direction.
 * The caller is responsible for prompting the user to restart if RTL changed.
 */
export async function setAppLanguage(lang: SupportedLanguage): Promise<void> {
  await i18n.changeLanguage(lang);
  applyLayoutDirection(lang);
}

// ─── Detect initial language ──────────────────────────────────────────────────
// Priority: 1) caller will override with saved profile.language after store hydrates
//           2) device locale if it matches a supported language
//           3) English default
const deviceLocale = Localization.getLocales()[0]?.languageCode ?? 'en';
const supportedCodes: SupportedLanguage[] = ['en', 'ar', 'he'];
const initialLang: SupportedLanguage = supportedCodes.includes(deviceLocale as SupportedLanguage)
  ? (deviceLocale as SupportedLanguage)
  : 'en';

// Apply direction for initial language
applyLayoutDirection(initialLang);

// ─── Initialize i18next ───────────────────────────────────────────────────────
i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ar: { translation: ar },
      he: { translation: he },
    },
    lng: initialLang,
    fallbackLng: 'en',
    // Synchronous init — no async plugins, safe to call before first render
    initAsync: false,
    interpolation: {
      escapeValue: false, // React Native handles XSS natively
    },
    // Use v4 key-based plural format (i18next 23+)
    compatibilityJSON: 'v4',
  });

export default i18n;
