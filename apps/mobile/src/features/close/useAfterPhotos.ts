// «Фото после» while the form is filled (PHASE_2 §2.4): the upload starts the moment the photo is taken,
// each tile shows uploading, done or failed with a retry; submit waits for running uploads up to a limit.
import { useCallback, useEffect, useRef, useState } from 'react';
import * as Crypto from 'expo-crypto';

import { useApi } from '@/lib/api';
import { t } from '@/lib/i18n';
import { PhotoCancelled, PhotoPermissionDenied, takeAfterPhoto, type PreparedPhoto } from '@/lib/photo';
import { useHud } from '@/ui/Hud';
import type { PhotoTileItem } from '@/ui/PhotoTile';

export type UploadStatus = 'uploading' | 'done' | 'error';

export interface AfterPhoto {
  id: string;
  photo: PreparedPhoto;
  status: UploadStatus;
}

export interface SettleResult {
  done: number;
  /** Failed or still running when the wait ran out: these do not reach the report. */
  dropped: number;
}

export function useAfterPhotos(clientRef: string) {
  const api = useApi();
  const hud = useHud();
  const [items, setItems] = useState<AfterPhoto[]>([]);
  const [preparing, setPreparing] = useState(false);
  // Mirrors for the submit logic, which runs outside render.
  const statuses = useRef(new Map<string, UploadStatus>());
  const running = useRef(new Map<string, Promise<void>>());
  // An upload may finish after submit replaced the form with the review: keep the mirror, skip the render.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const setStatus = useCallback((id: string, status: UploadStatus) => {
    statuses.current.set(id, status);
    if (alive.current) setItems((list) => list.map((p) => (p.id === id ? { ...p, status } : p)));
  }, []);

  const upload = useCallback(
    (id: string, photo: PreparedPhoto) => {
      setStatus(id, 'uploading');
      const job = api.photos
        .upload({
          client_ref: clientRef,
          kind: 'after',
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
          () => setStatus(id, 'done'),
          () => setStatus(id, 'error'),
        )
        .finally(() => {
          running.current.delete(id);
        });
      running.current.set(id, job);
    },
    [api, clientRef, setStatus],
  );

  const add = useCallback(async () => {
    setPreparing(true);
    try {
      const photo = await takeAfterPhoto();
      const id = Crypto.randomUUID();
      statuses.current.set(id, 'uploading');
      setItems((list) => [...list, { id, photo, status: 'uploading' }]);
      upload(id, photo);
    } catch (e) {
      if (e instanceof PhotoCancelled || !alive.current) return;
      hud.show({
        message: e instanceof PhotoPermissionDenied ? t('close.photoPermission') : t('close.photoUnknown'),
        tone: 'critical',
      });
    } finally {
      if (alive.current) setPreparing(false);
    }
  }, [hud, upload]);

  const retry = useCallback(
    (id: string) => {
      const item = items.find((p) => p.id === id);
      if (item && statuses.current.get(id) === 'error') upload(id, item.photo);
    },
    [items, upload],
  );

  const retryFailed = useCallback(() => {
    for (const p of items) if (statuses.current.get(p.id) === 'error') upload(p.id, p.photo);
  }, [items, upload]);

  /** Waits for running uploads, at most `limitMs`, then counts what made it. */
  const settle = useCallback(async (limitMs: number): Promise<SettleResult> => {
    const jobs = [...running.current.values()];
    if (jobs.length) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        Promise.allSettled(jobs),
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, limitMs);
        }),
      ]);
      if (timer) clearTimeout(timer);
    }
    let done = 0;
    let dropped = 0;
    for (const s of statuses.current.values()) {
      if (s === 'done') done++;
      else dropped++;
    }
    return { done, dropped };
  }, []);

  const tiles: PhotoTileItem[] = items.map((p) => ({
    id: p.id,
    uri: p.photo.uri,
    uploading: p.status === 'uploading',
    error: p.status === 'error',
  }));

  return {
    items,
    tiles,
    preparing,
    add,
    retry,
    retryFailed,
    settle,
    /** Taken and not failed: uploading or uploaded. */
    usable: items.filter((p) => p.status !== 'error').length,
    failed: items.filter((p) => p.status === 'error').length,
    uploading: items.filter((p) => p.status === 'uploading').length,
  };
}
