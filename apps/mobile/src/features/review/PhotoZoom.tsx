// Full screen photo viewer: swipe between photos (buttons too, nothing is swipe only), pinch to zoom on iOS.
import { primitives } from '@rota/design';
import { useEffect, useRef, useState } from 'react';
import { Image, Modal, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { Button } from '@/ui/Button';
import { T } from '@/ui/T';

export interface PhotoZoomProps {
  /** Image URLs; null hides the viewer. */
  uris: readonly string[] | null;
  index: number;
  title?: string;
  onClose: () => void;
}

const MAX_ZOOM = 4;

export function PhotoZoom({ uris, index, title, onClose }: PhotoZoomProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const pager = useRef<ScrollView>(null);
  const [page, setPage] = useState(index);
  const total = uris?.length ?? 0;

  useEffect(() => {
    if (!uris) return;
    setPage(index);
    const id = setTimeout(() => pager.current?.scrollTo({ x: index * width, animated: false }), 0);
    return () => clearTimeout(id);
  }, [uris, index, width]);

  const go = (next: number) => {
    const p = Math.min(total - 1, Math.max(0, next));
    setPage(p);
    pager.current?.scrollTo({ x: p * width, animated: true });
  };

  return (
    <Modal visible={uris !== null} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.fill, { backgroundColor: primitives.black }]}>
        <ScrollView
          ref={pager}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
          style={styles.fill}
        >
          {(uris ?? []).map((uri, i) => (
            <ScrollView
              key={`${uri}-${i}`}
              style={{ width, height }}
              contentContainerStyle={styles.center}
              maximumZoomScale={MAX_ZOOM}
              minimumZoomScale={1}
              centerContent
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
            >
              <Image
                source={{ uri }}
                style={{ width, height: height * 0.8 }}
                resizeMode="contain"
                accessibilityIgnoresInvertColors
                accessibilityLabel={t('review.photoN', { n: i + 1, total })}
              />
            </ScrollView>
          ))}
        </ScrollView>

        <View
          style={[
            styles.top,
            { paddingTop: insets.top + theme.space[2], paddingHorizontal: theme.size.gutter, gap: theme.space[3] },
          ]}
        >
          <View style={styles.fill}>
            {title ? (
              <T variant="headline" color={primitives.white} numberOfLines={1}>
                {title}
              </T>
            ) : null}
            {total > 1 ? (
              <T variant="monoM" color={primitives.white}>
                {t('review.photoN', { n: page + 1, total })}
              </T>
            ) : null}
          </View>
          <Button variant="ghostOnDanger" size="S" label={t('common.close')} onPress={onClose} />
        </View>

        {total > 1 ? (
          <View
            style={[
              styles.bottom,
              { paddingBottom: insets.bottom + theme.space[4], paddingHorizontal: theme.size.gutter, gap: theme.space[2] },
            ]}
          >
            <Button
              variant="ghostOnDanger"
              size="M"
              left="‹"
              label={t('review.prevPhoto')}
              disabled={page <= 0}
              onPress={() => go(page - 1)}
            />
            <Button
              variant="ghostOnDanger"
              size="M"
              right="›"
              label={t('review.nextPhoto')}
              disabled={page >= total - 1}
              onPress={() => go(page + 1)}
            />
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  top: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center' },
  bottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
