// One export at a time per page: the button that runs shows «Готовим файл», the HUD says when the file is saved or
// that it failed (the library chunk did not load, the browser refused the download).
import { useCallback, useState } from 'react';
import { useHud } from '@/components/HudHost';
import { t } from '@/lib/i18n';

export type ExportKind = 'pdf' | 'xlsx';

export function useExport() {
  const hud = useHud();
  const [busy, setBusy] = useState<ExportKind | null>(null);
  const run = useCallback(
    async (kind: ExportKind, job: () => Promise<string | void>) => {
      if (busy) return;
      setBusy(kind);
      try {
        const note = await job();
        hud.show({ message: note || t('export.done') });
      } catch (e) {
        console.error('export failed', e);
        hud.show({ message: t('export.failed'), tone: 'critical' });
      } finally {
        setBusy(null);
      }
    },
    [busy, hud],
  );
  return { busy, run };
}
