// A bottom sheet drawn inside the screen (absolute fill), not a native Modal: the confirm sheet
// (useConfirm, a Modal at the root) and the HUD can then show above it without stacking two iOS modals.
// Render it as the last child of a flex 1 root view. Android back closes it. Children bring their own
// gutters, so full bleed rows (ActionList) fit.
import { primitives, withAlpha } from '@rota/design';
import { useEffect, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { onHardwareBack } from '@/lib/hardwareBack';
import { t } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { SheetHeader } from '@/ui/SheetHeader';

export interface OverlaySheetProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children?: ReactNode;
  testID?: string;
}

export function OverlaySheet({ title, subtitle, onClose, children, testID }: OverlaySheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    return onHardwareBack(() => {
      onClose();
      return true;
    });
  }, [onClose]);

  return (
    <View style={StyleSheet.absoluteFill} testID={testID}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Animated.View entering={FadeIn.duration(160)} style={{ flex: 1 }}>
          <Pressable
            style={{
              flex: 1,
              backgroundColor: withAlpha(primitives.black, theme.mode === 'dark' ? 0.62 : 0.35),
            }}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
          />
        </Animated.View>
        <Animated.View
          entering={SlideInDown.duration(220)}
          accessibilityViewIsModal
          style={{
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
          <View style={{ paddingTop: theme.space[2], gap: theme.space[4] }}>
            {children}
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}
