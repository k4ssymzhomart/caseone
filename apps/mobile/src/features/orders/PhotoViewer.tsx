// A photo full screen on black; one big «Закрыть» at the bottom (glove mode), tap anywhere closes too.
import { primitives } from '@rota/design';
import { Image, Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { Button } from '@/ui/Button';

export interface PhotoViewerProps {
  uri: string | null;
  onClose: () => void;
}

export function PhotoViewer({ uri, onClose }: PhotoViewerProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={uri !== null} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: primitives.black }}>
        <Pressable
          style={{ flex: 1, paddingTop: insets.top }}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('order.detail.photoClose')}
        >
          {uri ? (
            <Image
              source={{ uri }}
              style={{ flex: 1 }}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
            />
          ) : null}
        </Pressable>
        <View style={{ paddingHorizontal: theme.size.gutter, paddingBottom: insets.bottom + theme.space[4] }}>
          <Button label={t('order.detail.photoClose')} variant="ghostOnDanger" size="L" full onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}
