// «Фото после»: tiles with upload states, retry for failed uploads, photos of the previous attempt after a
// rework, the simulator note and the missing photo banner (PHASE_0 §7.1 close, PHASE_2 §2.4).
import type { OrderPhoto } from '@rota/shared';
import { useState } from 'react';
import { View } from 'react-native';

import { PhotoZoom } from '@/features/review/PhotoZoom';
import { usePhotoUrls } from '@/features/review/usePhotoUrls';
import { t } from '@/lib/i18n';
import { isSimulator } from '@/lib/photo';
import { useTheme } from '@/lib/theme';
import { Banner } from '@/ui/Banner';
import { PhotoTile } from '@/ui/PhotoTile';
import { T } from '@/ui/T';

import { FormSection } from './FormSection';
import type { useAfterPhotos } from './useAfterPhotos';

const MAX_PHOTOS = 5;

export interface AfterPhotosSectionProps {
  photos: ReturnType<typeof useAfterPhotos>;
  /** «После» photos already attached to the order by an earlier attempt. */
  previous: readonly OrderPhoto[];
  /** Unplanned order with no usable photo yet: show the warning banner. */
  warnMissing: boolean;
}

export function AfterPhotosSection({ photos, previous, warnMissing }: AfterPhotosSectionProps) {
  const theme = useTheme();
  const urls = usePhotoUrls(previous);
  const [zoom, setZoom] = useState<{ uris: string[]; index: number } | null>(null);

  const prevTiles = previous
    .map((p) => ({ id: String(p.id), uri: urls[p.storage_path] ?? '' }))
    .filter((p) => p.uri);

  return (
    <FormSection title={t('close.photo')}>
      {isSimulator ? <Banner tone="info" text={t('close.simulator')} /> : null}

      {prevTiles.length ? (
        <View style={{ gap: theme.space[2] }}>
          <T variant="footnote" tone="secondary">
            {t('close.photoPrev')}
          </T>
          <PhotoTile
            photos={prevTiles}
            readOnly
            photoLabel={t('close.photoPrev')}
            onOpen={(id) =>
              setZoom({ uris: prevTiles.map((p) => p.uri), index: Math.max(0, prevTiles.findIndex((p) => p.id === id)) })
            }
          />
        </View>
      ) : null}

      <PhotoTile
        photos={photos.tiles}
        max={MAX_PHOTOS}
        addLabel={t('close.photoAdd')}
        photoLabel={t('close.photoItem')}
        errorLabel={t('close.photoError')}
        {...(photos.preparing ? {} : { onAdd: () => void photos.add() })}
        onOpen={(id) => {
          const item = photos.items.find((p) => p.id === id);
          if (!item) return;
          if (item.status === 'error') {
            photos.retry(id);
            return;
          }
          const uris = photos.items.map((p) => p.photo.uri);
          setZoom({ uris, index: Math.max(0, photos.items.findIndex((p) => p.id === id)) });
        }}
      />

      {photos.preparing ? (
        <T variant="callout" tone="secondary">
          {t('close.photoPreparing')}
        </T>
      ) : null}

      {photos.failed > 0 ? (
        <Banner
          tone="critical"
          text={t('close.photoFailed')}
          actionLabel={t('common.retry')}
          onAction={photos.retryFailed}
        />
      ) : null}

      {warnMissing ? <Banner tone="warning" text={t('close.noPhotoBanner')} /> : null}

      <PhotoZoom
        uris={zoom?.uris ?? null}
        index={zoom?.index ?? 0}
        title={t('close.photo')}
        onClose={() => setZoom(null)}
      />
    </FormSection>
  );
}
