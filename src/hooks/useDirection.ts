/**
 * useDirection — RTL layout direction hook.
 *
 * Reads the selected app language from the store and returns layout helpers
 * so components can adapt flexDirection and textAlign without an app restart.
 *
 * React Native's I18nManager.forceRTL() requires a full restart to flip
 * low-level layout. This hook covers the 95% case: flex rows, text alignment,
 * icon flipping, and content alignment — all applied at component level.
 */

import { useAppStore } from '../store/useAppStore';
import { isRTLLanguage } from '../i18n';

export interface DirectionHelpers {
  /** true when the selected language is RTL (Arabic / Hebrew) */
  isRTL: boolean;
  /** 'row-reverse' for RTL, 'row' for LTR — use for flexDirection */
  rowDir: 'row' | 'row-reverse';
  /** 'right' for RTL, 'left' for LTR — use for textAlign */
  textAlign: 'left' | 'right';
  /** 'flex-end' for RTL, 'flex-start' for LTR — use for alignSelf / alignItems */
  contentStart: 'flex-start' | 'flex-end';
  /** 'flex-start' for RTL, 'flex-end' for LTR (end = right in LTR, left in RTL) */
  contentEnd: 'flex-start' | 'flex-end';
  /** Back icon name — arrow-back (LTR) or arrow-forward (RTL) */
  backIcon: 'arrow-back' | 'arrow-forward';
  /** Forward icon name — arrow-forward (LTR) or arrow-back (RTL) */
  forwardIcon: 'arrow-back' | 'arrow-forward';
}

export function useDirection(): DirectionHelpers {
  const appLanguage = useAppStore((s) => s.appLanguage);
  const isRTL = isRTLLanguage(appLanguage);

  return {
    isRTL,
    rowDir:        isRTL ? 'row-reverse' : 'row',
    textAlign:     isRTL ? 'right'       : 'left',
    contentStart:  isRTL ? 'flex-end'    : 'flex-start',
    contentEnd:    isRTL ? 'flex-start'  : 'flex-end',
    backIcon:      isRTL ? 'arrow-forward' : 'arrow-back',
    forwardIcon:   isRTL ? 'arrow-back'    : 'arrow-forward',
  };
}
