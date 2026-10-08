// Bottom sheet shell for the master's decision sheets (override, return): a transparent Modal with a
// backdrop, an elevated card with SheetHeader, scrollable content and a footer in the thumb zone.
import { primitives, withAlpha } from '@rota/design';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { SheetHeader } from '@/ui/SheetHeader';

export interface SheetModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function SheetModal({ visible, onClose, title, subtitle, children, footer }: SheetModalProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable
          style={[styles.fill, { backgroundColor: withAlpha(primitives.black, theme.mode === 'dark' ? 0.62 : 0.35) }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
        />
        <View
          style={{
            maxHeight: '90%',
            backgroundColor: theme.color.bgElevated,
            borderTopLeftRadius: theme.radius.lg,
            borderTopRightRadius: theme.radius.lg,
            paddingBottom: insets.bottom + theme.space[4],
          }}
        >
          <SheetHeader
            title={title}
            {...(subtitle ? { subtitle } : {})}
            closeLabel={t('common.close')}
            onClose={onClose}
          />
          <ScrollView
            keyboardShouldPersistTaps="handled"
            style={{ flexGrow: 0 }}
            contentContainerStyle={{
              paddingHorizontal: theme.size.gutter,
              paddingTop: theme.space[2],
              gap: theme.space[4],
            }}
          >
            {children}
          </ScrollView>
          {footer ? (
            <View style={{ paddingHorizontal: theme.size.gutter, paddingTop: theme.space[4], gap: theme.space[2] }}>
              {footer}
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
