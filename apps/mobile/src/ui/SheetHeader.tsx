import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/lib/theme';

import { PressableScale } from './PressableScale';
import { T } from './T';

/** Grab handle 36 × 5 (iOS sheet grabber size). */
const HANDLE_WIDTH = 36;
const HANDLE_HEIGHT = 5;

export interface SheetHeaderProps {
  title: string;
  /** Callout secondary line under the title. */
  subtitle?: string;
  /** Text of the close button («Закрыть», «Готово»); the button shows only with both closeLabel and onClose. */
  closeLabel?: string;
  onClose?: () => void;
  /** Grab handle on top; true by default. Hide it on iOS when the route sets sheetGrabberVisible. */
  showHandle?: boolean;
}

/**
 * Header for expo-router formSheet routes (Android form sheets have no native header):
 * grab handle, title (headline) with an optional close text button, optional subtitle.
 */
export function SheetHeader({
  title,
  subtitle,
  closeLabel,
  onClose,
  showHandle = true,
}: SheetHeaderProps) {
  const theme = useTheme();
  const showClose = Boolean(closeLabel && onClose);

  return (
    <View
      style={{
        paddingTop: showHandle ? theme.space[2] : theme.space[3],
        paddingBottom: theme.space[2],
      }}
    >
      {showHandle ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[
            styles.handle,
            {
              borderRadius: theme.radius.full,
              backgroundColor: theme.color.borderStrong,
              marginBottom: theme.space[1],
            },
          ]}
        />
      ) : null}
      <View
        style={[
          styles.row,
          { minHeight: theme.size.tapMin, paddingLeft: theme.size.gutter, gap: theme.space[2] },
        ]}
      >
        <T variant="headline" accessibilityRole="header" style={styles.title} numberOfLines={2}>
          {title}
        </T>
        {showClose ? (
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={closeLabel}
            onPress={onClose}
            style={[
              styles.close,
              {
                minHeight: theme.size.tapMin,
                minWidth: theme.size.tapMin,
                paddingHorizontal: theme.size.gutter,
              },
            ]}
          >
            <T variant="buttonM" tone="secondary" numberOfLines={1}>
              {closeLabel}
            </T>
          </PressableScale>
        ) : (
          <View style={{ width: theme.size.gutter }} />
        )}
      </View>
      {subtitle ? (
        <T variant="callout" tone="secondary" style={{ paddingHorizontal: theme.size.gutter }}>
          {subtitle}
        </T>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  handle: { alignSelf: 'center', width: HANDLE_WIDTH, height: HANDLE_HEIGHT },
  row: { flexDirection: 'row', alignItems: 'center' },
  title: { flex: 1 },
  close: { alignItems: 'center', justifyContent: 'center' },
});
