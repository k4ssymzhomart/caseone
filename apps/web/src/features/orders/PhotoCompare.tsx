// «До» and «После» side by side (CLAUDE.md §12): the first photo of each kind large, the rest as thumbnails, the
// source and capture time under each. A click opens the viewer with ‹ › through every photo of the order. URLs are
// signed by photos.urls (an hour, cached). An unplanned order waiting for the master without an after photo says so in red.
import { formatDateTime, type OrderDetail, type OrderPhoto, type PhotoKind } from '@rota/shared';
import { useEffect, useMemo, useState } from 'react';
import { usePhotoUrls } from '@/lib/queries';
import { Dialog } from './Dialog';
import { t } from './strings';
import styles from './order.module.css';

const KINDS: readonly PhotoKind[] = ['before', 'after'];
const KIND_LABEL = { before: 'order.photo.before', after: 'order.photo.after' } as const;

export function PhotoCompare({ detail }: { detail: OrderDetail }) {
  const o = detail.order;
  const photos = useMemo(
    () =>
      KINDS.flatMap((k) =>
        detail.photos
          .filter((p) => p.kind === k)
          .slice()
          .sort((a, b) => Date.parse(a.captured_at ?? a.uploaded_at) - Date.parse(b.captured_at ?? b.uploaded_at)),
      ),
    [detail.photos],
  );
  const urls = usePhotoUrls(photos.map((p) => p.storage_path));
  const [open, setOpen] = useState<number | null>(null);
  // the rule bites while the master still decides; a closed order (history has no photos) just says there is none
  const deciding = o.status === 'done' || o.status === 'ai_review' || o.status === 'rework';

  return (
    <>
      <div className={styles.photos} data-compact={photos.length === 0 || undefined}>
        {KINDS.map((kind) => {
          const list = photos.filter((p) => p.kind === kind);
          const first = list[0];
          const missingAfter = kind === 'after' && deciding && o.type === 'unplanned';
          return (
            <figure key={kind} className={styles.photoColumn}>
              <figcaption className={styles.photoKind}>{t(KIND_LABEL[kind])}</figcaption>
              {first ? (
                <>
                  <PhotoTile
                    url={urls.data?.[first.storage_path]}
                    loading={urls.isPending}
                    large
                    label={t('order.photo.open', { kind: t(KIND_LABEL[kind]), n: 1, total: list.length })}
                    alt={t('order.photo.alt', { kind: t(KIND_LABEL[kind]), equipment: o.equipment_name })}
                    onOpen={() => setOpen(photos.indexOf(first))}
                  />
                  {list.length > 1 ? (
                    <div className={styles.thumbs}>
                      {list.slice(1).map((p, i) => (
                        <PhotoTile
                          key={p.id}
                          url={urls.data?.[p.storage_path]}
                          loading={urls.isPending}
                          label={t('order.photo.open', { kind: t(KIND_LABEL[kind]), n: i + 2, total: list.length })}
                          alt={t('order.photo.alt', { kind: t(KIND_LABEL[kind]), equipment: o.equipment_name })}
                          onOpen={() => setOpen(photos.indexOf(p))}
                        />
                      ))}
                    </div>
                  ) : null}
                  <span className={styles.photoMeta}>{photoMeta(first)}</span>
                </>
              ) : (
                <div className={styles.photoEmpty} data-critical={missingAfter || undefined}>
                  <span>{kind === 'before' ? t('order.photo.none_before') : t('order.photo.none_after')}</span>
                  {missingAfter ? <span className={styles.photoEmptyNote}>{t('order.photo.required_after')}</span> : null}
                </div>
              )}
            </figure>
          );
        })}
      </div>
      {open != null && photos[open] ? (
        <PhotoViewer
          photos={photos}
          index={open}
          urls={urls.data ?? {}}
          equipment={o.equipment_name}
          onIndex={setOpen}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </>
  );
}

function photoMeta(p: OrderPhoto): string {
  const source = p.source === 'camera' ? t('order.photo.camera') : t('order.photo.gallery');
  const at = p.captured_at ?? p.uploaded_at;
  return at ? `${source} · ${formatDateTime(at)}` : source;
}

interface PhotoTileProps {
  url: string | undefined;
  loading: boolean;
  large?: boolean;
  label: string;
  alt: string;
  onOpen: () => void;
}

function PhotoTile({ url, loading, large, label, alt, onOpen }: PhotoTileProps) {
  return (
    <button
      type="button"
      className={styles.photoTile}
      data-large={large || undefined}
      onClick={onOpen}
      aria-label={label}
      disabled={!url}
    >
      {url ? (
        <img src={url} alt={alt} loading="lazy" />
      ) : (
        <span className={styles.photoPlaceholder}>{loading ? '…' : t('order.photo.unavailable')}</span>
      )}
    </button>
  );
}

interface PhotoViewerProps {
  photos: readonly OrderPhoto[];
  index: number;
  urls: Readonly<Record<string, string>>;
  equipment: string;
  onIndex: (i: number) => void;
  onClose: () => void;
}

function PhotoViewer({ photos, index, urls, equipment, onIndex, onClose }: PhotoViewerProps) {
  const photo = photos[index];
  const sameKind = photos.filter((p) => p.kind === photo?.kind);
  const n = photo ? sameKind.indexOf(photo) + 1 : 0;
  const prev = () => onIndex((index - 1 + photos.length) % photos.length);
  const next = () => onIndex((index + 1) % photos.length);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') onIndex((index - 1 + photos.length) % photos.length);
      if (e.key === 'ArrowRight') onIndex((index + 1) % photos.length);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, photos.length, onIndex]);

  if (!photo) return null;
  const kind = t(KIND_LABEL[photo.kind]);
  const url = urls[photo.storage_path];
  return (
    <Dialog
      size="xl"
      eyebrow={equipment}
      title={t('order.photo.title', { kind, n, total: sameKind.length })}
      subtitle={photoMeta(photo)}
      onClose={onClose}
    >
      <div className={styles.viewer}>
        {photos.length > 1 ? (
          <button type="button" className={styles.viewerNav} onClick={prev} aria-label={t('order.photo.prev')}>
            ‹
          </button>
        ) : null}
        <div className={styles.viewerImage}>
          {url ? (
            <img src={url} alt={t('order.photo.alt', { kind, equipment })} />
          ) : (
            <span className={styles.photoPlaceholder}>{t('order.photo.unavailable')}</span>
          )}
        </div>
        {photos.length > 1 ? (
          <button type="button" className={styles.viewerNav} onClick={next} aria-label={t('order.photo.next')}>
            ›
          </button>
        ) : null}
      </div>
    </Dialog>
  );
}
