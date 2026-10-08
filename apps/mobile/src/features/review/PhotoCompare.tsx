// «До» and «После» side by side (CLAUDE.md §12 master view); tap opens the full screen viewer.
import type { OrderPhoto } from '@rota/shared';
import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { t } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { Eyebrow } from '@/ui/Eyebrow';
import { PressableScale } from '@/ui/PressableScale';
import { T } from '@/ui/T';
import { Tag } from '@/ui/Tag';

import { PhotoZoom } from './PhotoZoom';
import { usePhotoUrls } from './usePhotoUrls';

export interface PhotoCompareProps {
  photos: readonly OrderPhoto[];
}

function byTime(a: OrderPhoto, b: OrderPhoto): number {
  return Date.parse(a.captured_at ?? a.uploaded_at) - Date.parse(b.captured_at ?? b.uploaded_at);
}

export function PhotoCompare({ photos }: PhotoCompareProps) {
  const theme = useTheme();
  const urls = usePhotoUrls(photos);
  const before = photos.filter((p) => p.kind === 'before').sort(byTime);
  // The latest «после» first: after a rework it is the one of this attempt.
  const after = photos.filter((p) => p.kind === 'after').sort((a, b) => byTime(b, a));
  const [zoom, setZoom] = useState<{ uris: string[]; title: string } | null>(null);

  const open = (list: OrderPhoto[], title: string) => {
    const uris = list.map((p) => urls[p.storage_path]).filter((u): u is string => !!u);
    if (uris.length) setZoom({ uris, title });
  };

  return (
    <>
      <View style={[styles.row, { gap: theme.space[3] }]}>
        <Column label={t('review.before')} list={before} urls={urls} onOpen={() => open(before, t('review.before'))} />
        <Column label={t('review.after')} list={after} urls={urls} onOpen={() => open(after, t('review.after'))} />
      </View>
      <PhotoZoom uris={zoom?.uris ?? null} index={0} {...(zoom ? { title: zoom.title } : {})} onClose={() => setZoom(null)} />
    </>
  );
}

function Column({
  label,
  list,
  urls,
  onOpen,
}: {
  label: string;
  list: OrderPhoto[];
  urls: Record<string, string>;
  onOpen: () => void;
}) {
  const theme = useTheme();
  const first = list[0];
  const uri = first ? urls[first.storage_path] : undefined;
  const tile = {
    aspectRatio: 1,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.bgMuted,
    overflow: 'hidden' as const,
  };

  return (
    <View style={[styles.col, { gap: theme.space[2] }]}>
      <Eyebrow>{label}</Eyebrow>
      {first ? (
        <PressableScale
          onPress={onOpen}
          accessibilityRole="imagebutton"
          accessibilityLabel={label}
          style={tile}
        >
          {uri ? (
            <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors />
          ) : null}
          {list.length > 1 ? (
            <View style={{ position: 'absolute', right: theme.space[2], bottom: theme.space[2] }}>
              <Tag label={t('review.morePhotos', { n: list.length - 1 })} tone="accent" />
            </View>
          ) : null}
        </PressableScale>
      ) : (
        <View
          style={[
            tile,
            styles.center,
            { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.color.borderStrong, borderStyle: 'dashed' },
          ]}
        >
          <T variant="callout" tone="secondary">
            {t('review.noPhoto')}
          </T>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  col: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
});
