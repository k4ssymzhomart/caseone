// «До» photos of a draft order (CLAUDE.md §17, PHASE_2 §2.4): each upload starts the moment the photo is
// taken, under the draft's client_ref; create_order then links every photo of that client_ref.
// Clients cannot delete uploaded photos, so removing one that is already uploaded moves the draft to a fresh
// client_ref and uploads the remaining photos again: the removed photo stays unlinked.
import type { PreparedPhoto } from '@/lib/photo';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { newActionId, useApi } from '@/lib/api';
import type { PhotoTileItem } from '@/ui/PhotoTile';

export type BeforePhotoStatus = 'uploading' | 'done' | 'error';

interface Item {
  id: string;
  photo: PreparedPhoto;
  status: BeforePhotoStatus;
  /** client_ref of the latest upload of this photo. */
  ref: string;
}

export interface BeforePhotos {
  tiles: PhotoTileItem[];
  count: number;
  uploading: boolean;
  failed: number;
  /** The draft's client_ref right now (it changes after removing an uploaded photo). */
  clientRef: () => string;
  add: (photo: PreparedPhoto) => void;
  remove: (id: string) => void;
  retry: (id: string) => void;
  isFailed: (id: string) => boolean;
  /** Waits for running uploads, at most `ms`. */
  waitForUploads: (ms: number) => Promise<void>;
}

export function useBeforePhotos(initialRef: string): BeforePhotos {
  const api = useApi();
  const refRef = useRef(initialRef);
  const itemsRef = useRef<Item[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const pending = useRef(new Map<string, Promise<void>>());
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const update = useCallback((fn: (prev: Item[]) => Item[]) => {
    itemsRef.current = fn(itemsRef.current);
    if (alive.current) setItems(itemsRef.current);
  }, []);

  const upload = useCallback(
    (id: string, photo: PreparedPhoto, ref: string) => {
      update((prev) => prev.map((p) => (p.id === id ? { ...p, status: 'uploading', ref } : p)));
      const settle = (status: BeforePhotoStatus) =>
        update((prev) => prev.map((p) => (p.id === id && p.ref === ref ? { ...p, status } : p)));
      const job: Promise<void> = api.photos
        .upload({
          client_ref: ref,
          kind: 'before',
          data: photo.data,
          uri: photo.uri,
          source: photo.source,
          captured_at: photo.capturedAt,
          dhash: photo.dhash,
          sha256: photo.sha256,
          width: photo.width,
          height: photo.height,
          bytes: photo.bytes,
          exif: photo.exif,
        })
        .then(
          () => settle('done'),
          () => settle('error'),
        )
        .finally(() => {
          if (pending.current.get(id) === job) pending.current.delete(id);
        });
      pending.current.set(id, job);
    },
    [api, update],
  );

  const add = useCallback(
    (photo: PreparedPhoto) => {
      const id = newActionId();
      const ref = refRef.current;
      update((prev) => [...prev, { id, photo, status: 'uploading', ref }]);
      upload(id, photo, ref);
    },
    [update, upload],
  );

  const remove = useCallback(
    (id: string) => {
      const item = itemsRef.current.find((p) => p.id === id);
      if (!item) return;
      update((prev) => prev.filter((p) => p.id !== id));
      pending.current.delete(id);
      // A failed upload never became a photo row; anything else may already be stored under the old ref.
      if (item.status === 'error') return;
      const next = newActionId();
      refRef.current = next;
      for (const p of itemsRef.current) upload(p.id, p.photo, next);
    },
    [update, upload],
  );

  const retry = useCallback(
    (id: string) => {
      const item = itemsRef.current.find((p) => p.id === id);
      if (item && item.status === 'error') upload(id, item.photo, refRef.current);
    },
    [upload],
  );

  const waitForUploads = useCallback(async (ms: number) => {
    const jobs = [...pending.current.values()];
    if (jobs.length === 0) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      Promise.allSettled(jobs),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, ms);
      }),
    ]);
    if (timer) clearTimeout(timer);
  }, []);

  const clientRef = useCallback(() => refRef.current, []);
  const isFailed = useCallback((id: string) => itemsRef.current.some((p) => p.id === id && p.status === 'error'), []);

  const tiles = useMemo<PhotoTileItem[]>(
    () =>
      items.map((p) => ({
        id: p.id,
        uri: p.photo.uri,
        uploading: p.status === 'uploading',
        error: p.status === 'error',
      })),
    [items],
  );

  return {
    tiles,
    count: items.length,
    uploading: items.some((p) => p.status === 'uploading'),
    failed: items.filter((p) => p.status === 'error').length,
    clientRef,
    add,
    remove,
    retry,
    isFailed,
    waitForUploads,
  };
}
