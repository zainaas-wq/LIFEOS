/**
 * LifeOS Language Registry
 *
 * Scalable, searchable registry of all supported and planned languages.
 * This replaces the hardcoded 3-language assumption throughout the codebase.
 *
 * Structure:
 *   isFullyTranslated: true  → complete translation exists in locales/
 *   isFullyTranslated: false → UI strings fall back to English; language
 *                              is shown in picker with a "partial" indicator
 *
 * Adding a new language:
 *   1. Add an entry here with isFullyTranslated: false initially
 *   2. Create src/i18n/locales/{code}.ts
 *   3. Register it in src/i18n/index.ts
 *   4. Set isFullyTranslated: true when coverage is complete
 *
 * RTL is detected from this registry at language-switch time.
 * The useDirection() hook reads isRTL to set flexDirection and textAlign.
 */

import type { LanguageEntry } from '../types';

export const LANGUAGES: LanguageEntry[] = [
  // ── Fully translated ──────────────────────────────────────────────────────
  {
    code: 'en',
    englishName: 'English',
    nativeName: 'English',
    isRTL: false,
    flag: '🇺🇸',
    isFullyTranslated: true,
  },
  {
    code: 'ar',
    englishName: 'Arabic',
    nativeName: 'العربية',
    isRTL: true,
    flag: '🇸🇦',
    isFullyTranslated: true,
  },
  {
    code: 'he',
    englishName: 'Hebrew',
    nativeName: 'עברית',
    isRTL: true,
    flag: '🇮🇱',
    isFullyTranslated: true,
  },

  // ── Partial / planned ─────────────────────────────────────────────────────
  {
    code: 'fr',
    englishName: 'French',
    nativeName: 'Français',
    isRTL: false,
    flag: '🇫🇷',
    isFullyTranslated: false,
  },
  {
    code: 'de',
    englishName: 'German',
    nativeName: 'Deutsch',
    isRTL: false,
    flag: '🇩🇪',
    isFullyTranslated: false,
  },
  {
    code: 'es',
    englishName: 'Spanish',
    nativeName: 'Español',
    isRTL: false,
    flag: '🇪🇸',
    isFullyTranslated: false,
  },
  {
    code: 'pt',
    englishName: 'Portuguese',
    nativeName: 'Português',
    isRTL: false,
    flag: '🇧🇷',
    isFullyTranslated: false,
  },
  {
    code: 'tr',
    englishName: 'Turkish',
    nativeName: 'Türkçe',
    isRTL: false,
    flag: '🇹🇷',
    isFullyTranslated: false,
  },
  {
    code: 'ur',
    englishName: 'Urdu',
    nativeName: 'اردو',
    isRTL: true,
    flag: '🇵🇰',
    isFullyTranslated: false,
  },
  {
    code: 'hi',
    englishName: 'Hindi',
    nativeName: 'हिन्दी',
    isRTL: false,
    flag: '🇮🇳',
    isFullyTranslated: false,
  },
  {
    code: 'id',
    englishName: 'Indonesian',
    nativeName: 'Bahasa Indonesia',
    isRTL: false,
    flag: '🇮🇩',
    isFullyTranslated: false,
  },
  {
    code: 'ms',
    englishName: 'Malay',
    nativeName: 'Bahasa Melayu',
    isRTL: false,
    flag: '🇲🇾',
    isFullyTranslated: false,
  },
  {
    code: 'zh',
    englishName: 'Chinese (Simplified)',
    nativeName: '中文（简体）',
    isRTL: false,
    flag: '🇨🇳',
    isFullyTranslated: false,
  },
  {
    code: 'zh-TW',
    englishName: 'Chinese (Traditional)',
    nativeName: '中文（繁體）',
    isRTL: false,
    flag: '🇹🇼',
    isFullyTranslated: false,
  },
  {
    code: 'ja',
    englishName: 'Japanese',
    nativeName: '日本語',
    isRTL: false,
    flag: '🇯🇵',
    isFullyTranslated: false,
  },
  {
    code: 'ko',
    englishName: 'Korean',
    nativeName: '한국어',
    isRTL: false,
    flag: '🇰🇷',
    isFullyTranslated: false,
  },
  {
    code: 'ru',
    englishName: 'Russian',
    nativeName: 'Русский',
    isRTL: false,
    flag: '🇷🇺',
    isFullyTranslated: false,
  },
  {
    code: 'fa',
    englishName: 'Persian (Farsi)',
    nativeName: 'فارسی',
    isRTL: true,
    flag: '🇮🇷',
    isFullyTranslated: false,
  },
  {
    code: 'sw',
    englishName: 'Swahili',
    nativeName: 'Kiswahili',
    isRTL: false,
    flag: '🇰🇪',
    isFullyTranslated: false,
  },
];

// ─── Search helpers ────────────────────────────────────────────────────────────

/**
 * Searches the language registry by English name, native name, or locale code.
 * Case-insensitive, partial match supported.
 * Returns all matching entries sorted by fully-translated status first.
 */
export function searchLanguages(query: string): LanguageEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return getOrderedLanguages();

  const matches = LANGUAGES.filter(
    lang =>
      lang.code.toLowerCase().includes(q) ||
      lang.englishName.toLowerCase().includes(q) ||
      lang.nativeName.toLowerCase().includes(q),
  );

  return sortLanguages(matches);
}

/**
 * Returns all languages: fully translated first, then partials alphabetically.
 */
export function getOrderedLanguages(): LanguageEntry[] {
  return sortLanguages(LANGUAGES);
}

/**
 * Returns the LanguageEntry for a given BCP-47 code.
 * Falls back to English entry if the code is not found.
 */
export function getLanguageEntry(code: string): LanguageEntry {
  return (
    LANGUAGES.find(l => l.code === code) ??
    LANGUAGES.find(l => l.code === 'en')!
  );
}

/**
 * Returns true if the given locale code corresponds to an RTL language.
 * Used by useDirection() and the language selection screen.
 */
export function isRTLCode(code: string): boolean {
  return getLanguageEntry(code).isRTL;
}

// ─── Internal ─────────────────────────────────────────────────────────────────

function sortLanguages(langs: LanguageEntry[]): LanguageEntry[] {
  return [...langs].sort((a, b) => {
    // Fully translated entries first
    if (a.isFullyTranslated !== b.isFullyTranslated) {
      return a.isFullyTranslated ? -1 : 1;
    }
    // Then alphabetical by English name
    return a.englishName.localeCompare(b.englishName);
  });
}
