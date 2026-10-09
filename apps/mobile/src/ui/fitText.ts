// One line text that shrinks to fit (adjustsFontSizeToFit with minimumFontScale). Native Text does it itself,
// so there is nothing to add here; fitText.web.ts measures and scales in the browser, where the prop is ignored.
import type { Ref } from 'react';
import type { TextStyle } from 'react-native';

export interface FitText {
  ref?: Ref<unknown>;
  style?: TextStyle;
}

export function useFitText(_fit: boolean, _minimumFontScale: number | undefined, _fontSize: number | undefined): FitText {
  return {};
}
