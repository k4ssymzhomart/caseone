// Signed URLs for order photos (the bucket is private, CLAUDE.md §5 Storage).
import type { OrderPhoto } from '@rota/shared';
import { useQuery } from '@tanstack/react-query';

import { useApi } from '@/lib/api';
import { qk } from '@/lib/keys';

/** Signed URLs live an hour; refetch a little before that. */
const URL_STALE_MS = 50 * 60_000;

export function usePhotoUrls(photos: readonly Pick<OrderPhoto, 'storage_path'>[]): Record<string, string> {
  const api = useApi();
  const paths = [...new Set(photos.map((p) => p.storage_path))].sort();
  const q = useQuery({
    queryKey: qk.photoUrls(paths),
    queryFn: () => api.photos.urls(paths),
    enabled: paths.length > 0,
    staleTime: URL_STALE_MS,
  });
  return q.data ?? {};
}
