import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/lib/theme';

import { Eyebrow } from './Eyebrow';
import { T, type TextTone } from './T';

export interface ScreenProps {
  children?: ReactNode;
  /** Large title (`largeTitle`) at the top of the content; scrolls with it. */
  title?: string;
  /** Mono caps eyebrow above the title. */
  eyebrow?: string;
  eyebrowTone?: TextTone;
  /** Accessory next to the title (avatar, a small button), bottom aligned with it. */
  right?: ReactNode;
  /** ScrollView (default) or a static flex column. */
  scroll?: boolean;
  /** 16 px side gutters on the content (default true). The header keeps its gutters either way. */
  gutters?: boolean;
  /** Pad the top by the safe area (default true). Turn off under a native stack header. */
  insetTop?: boolean;
  /** Pad the bottom (content or footer) by the safe area (default true). */
  insetBottom?: boolean;
  /** Extra bottom padding for the scroll content, e.g. `theme.size.tabBar` above an absolutely positioned tab bar. */
  bottomPadding?: number;
  /** Sticky action bar pinned at the bottom in the thumb zone: 16 padding plus the safe area, 8 between children. */
  footer?: ReactNode;
  /** Pull to refresh (scroll mode only, when onRefresh is set). */
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Lift the content and the footer above the keyboard on iOS (default true). */
  avoidKeyboard?: boolean;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  /** Pass through props for the ScrollView, e.g. onScroll or scrollEventThrottle. */
  scrollProps?: Omit<ScrollViewProps, 'children' | 'contentContainerStyle' | 'refreshControl' | 'style'>;
  testID?: string;
}

/** Screen frame: safe area, canvas background, optional eyebrow and large title, scroll or static, sticky footer (PHASE_0 §6.9). */
export function Screen({
  children,
  title,
  eyebrow,
  eyebrowTone = 'secondary',
  right,
  scroll = true,
  gutters = true,
  insetTop = true,
  insetBottom = true,
  bottomPadding = 0,
  footer,
  refreshing = false,
  onRefresh,
  avoidKeyboard = true,
  style,
  contentContainerStyle,
  scrollProps,
  testID,
}: ScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const gutter = theme.size.gutter;
  const safeBottom = insetBottom ? insets.bottom : 0;

  const content: ViewStyle = {
    paddingTop: (insetTop ? insets.top : 0) + theme.space[4],
    paddingHorizontal: gutters ? gutter : 0,
    // With a footer the footer owns the safe area; otherwise the content does.
    paddingBottom: theme.space[6] + bottomPadding + (footer ? 0 : safeBottom),
  };

  const header =
    title || eyebrow || right ? (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: theme.space[3],
          marginBottom: theme.space[6],
          paddingHorizontal: gutters ? 0 : gutter,
        }}
      >
        <View style={{ flex: 1, gap: theme.space[1] }}>
          {eyebrow ? <Eyebrow tone={eyebrowTone}>{eyebrow}</Eyebrow> : null}
          {title ? (
            <T variant="largeTitle" accessibilityRole="header">
              {title}
            </T>
          ) : null}
        </View>
        {right ? <View>{right}</View> : null}
      </View>
    ) : null;

  const body = scroll ? (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      contentInsetAdjustmentBehavior="never"
      showsVerticalScrollIndicator={false}
      {...scrollProps}
      style={{ flex: 1 }}
      contentContainerStyle={[{ flexGrow: 1 }, content, contentContainerStyle]}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.color.textSecondary}
            colors={[theme.color.textPrimary]}
            progressBackgroundColor={theme.color.bgSubtle}
            progressViewOffset={insetTop ? insets.top : 0}
          />
        ) : undefined
      }
    >
      {header}
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1 }, content, contentContainerStyle]}>
      {header}
      {children}
    </View>
  );

  const bar = footer ? (
    <View
      style={{
        gap: theme.space[2],
        paddingHorizontal: gutter,
        paddingTop: theme.space[4],
        paddingBottom: theme.space[4] + safeBottom,
        backgroundColor: theme.color.bgCanvas,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: theme.color.borderDefault,
      }}
    >
      {footer}
    </View>
  ) : null;

  const inner = (
    <>
      {body}
      {bar}
    </>
  );

  return (
    <View testID={testID} style={[{ flex: 1, backgroundColor: theme.color.bgCanvas }, style]}>
      {avoidKeyboard ? (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {inner}
        </KeyboardAvoidingView>
      ) : (
        inner
      )}
      {/* Scrolled content must not run under the clock and the island: a canvas strip behind the status bar. */}
      {insetTop && scroll ? (
        <View
          pointerEvents="none"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top, backgroundColor: theme.color.bgCanvas }}
        />
      ) : null}
    </View>
  );
}
