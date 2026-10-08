// A modal bottom sheet in the style of ui/ConfirmSheet: dimmed backdrop (tap closes), a bgElevated panel with
// the large radius on top, a SheetHeader with «Закрыть», scrollable content and an optional footer.
// Used for the board filters and the reassign picker, which open from inside tab screens.
import { primitives, withAlpha } from '@rota/design';
import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { SheetHeader } from '@/ui/SheetHeader';

/** Share of the window height the sheet may take. */
const MAX_HEIGHT_SHARE = 0.85;

export interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** Pinned under the header, above the scrolling content (a Segmented, a big action). */
  top?: ReactNode;
  children?: ReactNode;
  /** Gutters on the scrolling content; false for full bleed rows such as ActionList (default true). */
  gutters?: boolean;
}

export function BottomSheet({ visible, onClose, title, subtitle, top, children, gutters = true }: BottomSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable
        style={[styles.backdrop, { backgroundColor: withAlpha(primitives.black, theme.mode === 'dark' ? 0.62 : 0.35) }]}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t('common.close')}
      />
      <View
        style={[
          styles.sheet,
          {
            maxHeight: Math.round(height * MAX_HEIGHT_SHARE),
            backgroundColor: theme.color.bgElevated,
            borderTopLeftRadius: theme.radius.lg,
            borderTopRightRadius: theme.radius.lg,
            paddingBottom: insets.bottom + theme.space[4],
          },
        ]}
      >
        <SheetHeader title={title} subtitle={subtitle} closeLabel={t('common.close')} onClose={onClose} />
        {top ? (
          <View style={{ paddingHorizontal: theme.size.gutter, paddingTop: theme.space[2], gap: theme.space[3] }}>
            {top}
          </View>
        ) : null}
        <ScrollView
          style={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: gutters ? theme.size.gutter : 0,
            paddingTop: theme.space[3],
            gap: theme.space[6],
          }}
        >
          {children}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1 },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  scroll: { flexGrow: 0, flexShrink: 1 },
});
