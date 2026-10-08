// A bottom sheet for in screen pickers (deadline, assignee). A React Native Modal rendered by the screen
// that opens it, so it also shows above the native create modal. Radius lg, bgElevated, SheetHeader on top.
import { primitives, withAlpha } from '@rota/design';
import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { SheetHeader } from '@/ui/SheetHeader';

/** Sheets never cover the whole screen: the backdrop above them closes them. */
const MAX_SHARE = 0.9;

export interface BottomSheetProps {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  /** Fixed share of the window height (0..0.9) for long lists; natural height otherwise. */
  heightShare?: number;
  children?: ReactNode;
}

export function BottomSheet({ visible, title, subtitle, onClose, heightShare, children }: BottomSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const maxHeight = Math.round(height * MAX_SHARE);
  const fixed = heightShare ? Math.round(height * Math.min(heightShare, MAX_SHARE)) : undefined;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.fill}>
        <Pressable
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: withAlpha(primitives.black, theme.mode === 'dark' ? 0.62 : 0.35) },
          ]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
        />
        <View
          style={[
            styles.sheet,
            {
              maxHeight,
              height: fixed,
              backgroundColor: theme.color.bgElevated,
              borderTopLeftRadius: theme.radius.lg,
              borderTopRightRadius: theme.radius.lg,
              paddingBottom: insets.bottom + theme.space[2],
            },
          ]}
        >
          <SheetHeader title={title} subtitle={subtitle} closeLabel={t('common.close')} onClose={onClose} />
          <View style={fixed ? styles.fill : styles.shrink}>{children}</View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  shrink: { flexShrink: 1 },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, overflow: 'hidden' },
});
