// The worker's closing report (CLAUDE.md §6 complete, PHASE_0 §7.1 close, PHASE_2 §2.3, §2.4).
// Missing fields and a missing photo are allowed: the AI judges completeness. After a rework the form starts
// from the previous attempt (works, code, materials). Submit: confirm a missing «после» photo on an unplanned
// order, wait for running uploads (up to 15 s), resume a paused or reworked order, `complete`, start the AI
// check without awaiting it, then replace the screen with the review.
import type { Directories, MaterialLine, OrderDetail } from '@rota/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';

import { orderEyebrow } from '@/features/orders/present';
import { useOrderAction } from '@/features/orders/useOrderAction';
import { TopBar } from '@/features/review/TopBar';
import { useApi } from '@/lib/api';
import { t } from '@/lib/i18n';
import { qk } from '@/lib/keys';
import { useTheme } from '@/lib/theme';
import { Button } from '@/ui/Button';
import { useConfirm } from '@/ui/ConfirmSheet';
import { useHud } from '@/ui/Hud';
import { Screen } from '@/ui/Screen';
import { TextArea } from '@/ui/TextArea';

import { AfterPhotosSection } from './AfterPhotosSection';
import { FaultCodePicker } from './FaultCodePicker';
import { FormSection } from './FormSection';
import { MaterialsEditor } from './MaterialsEditor';
import { useAfterPhotos } from './useAfterPhotos';
import { WorksSection } from './WorksSection';

/** PHASE_2 §2.4: submit waits for running uploads at most this long. */
const UPLOAD_WAIT_MS = 15_000;

export interface CloseFormProps {
  /** Mount the form once the order is loaded: the initial state comes from it (prefill after a rework). */
  detail: OrderDetail;
  dirs: Directories;
}

export function CloseForm({ detail, dirs }: CloseFormProps) {
  const router = useRouter();
  const theme = useTheme();
  const api = useApi();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const hud = useHud();
  const { run } = useOrderAction();
  const o = detail.order;

  const [works, setWorks] = useState(() => o.works_done ?? '');
  const [code, setCode] = useState<string | null>(() => o.fault_code ?? o.suggested_fault_code ?? null);
  const [lines, setLines] = useState<MaterialLine[]>(() =>
    detail.materials.map((m) => ({ material_id: m.material_id, qty: m.qty })),
  );
  // A previous attempt that reported works without any material line was an explicit «без материалов».
  const [noMaterials, setNoMaterials] = useState(
    () => o.rework_count > 0 && !!o.works_done && detail.materials.length === 0,
  );
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const photos = useAfterPhotos(o.client_ref);

  const previousAfter = detail.photos.filter((p) => p.kind === 'after');
  const hasAfter = previousAfter.length > 0 || photos.usable > 0;
  const unplanned = o.type === 'unplanned';
  const norm = code ? dirs.work_norms.find((n) => n.fault_code === code) : undefined;

  const submit = async () => {
    if (submitting) return;
    if (unplanned && !hasAfter) {
      const ok = await confirm({
        title: t('close.noPhoto.title'),
        message: t('close.noPhoto.message'),
        confirmLabel: t('close.noPhoto.confirm'),
      });
      if (!ok) return;
    }
    setSubmitting(true);
    try {
      const { dropped } = await photos.settle(UPLOAD_WAIT_MS);
      if (dropped > 0) {
        hud.show({ message: t('close.photoDropped', { n: dropped }), tone: 'critical', duration: 4000 });
      }

      // complete is allowed from in_progress only: bring a paused or reworked order back first.
      const status = detail.order.status;
      if (status === 'paused' && !(await run(o.id, 'resume'))) return;
      if (status === 'rework' && !(await run(o.id, 'resume_rework'))) return;

      const text = comment.trim();
      const done = await run(
        o.id,
        'complete',
        {
          works_done: works.trim(),
          fault_code: code,
          materials: noMaterials ? [] : lines.filter((l) => l.qty > 0),
          no_materials: noMaterials,
          ...(text ? { comment: text } : {}),
        },
        { success: t('close.sent'), number: o.number },
      );
      if (!done) return;

      // The review screen waits for the result (realtime plus polling), so the check is not awaited here.
      const refresh = () => void qc.invalidateQueries({ queryKey: qk.order(o.id) });
      api.ai.verify(o.id).then(refresh, refresh);
      router.replace(`/order/${o.id}/review` as Href);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen
      footer={
        <Button
          label={t('close.submit')}
          size="L"
          full
          loading={submitting}
          onPress={() => void submit()}
        />
      }
    >
      <TopBar
        eyebrow={orderEyebrow(o)}
        eyebrowTone={o.priority === 'emergency' ? 'critical' : 'secondary'}
        title={t('close.title')}
        subtitle={o.equipment_name}
        caption={`${o.area_name} · ${o.description}`}
      />

      <WorksSection value={works} onChange={setWorks} />

      <FaultCodePicker
        codes={dirs.fault_codes}
        norms={dirs.work_norms}
        value={code}
        suggested={o.suggested_fault_code}
        onChange={setCode}
      />

      <MaterialsEditor
        lines={lines}
        onChange={setLines}
        noMaterials={noMaterials}
        onNoMaterials={setNoMaterials}
        materials={dirs.materials}
        norm={norm}
        faultCode={code}
      />

      <AfterPhotosSection photos={photos} previous={previousAfter} warnMissing={unplanned && !hasAfter} />

      <FormSection title={t('close.comment')}>
        <TextArea
          value={comment}
          onChangeText={setComment}
          placeholder={t('close.commentPlaceholder')}
          accessibilityLabel={t('close.comment')}
          inputStyle={{ fontSize: theme.type.bodyL.fontSize, lineHeight: theme.type.bodyL.lineHeight }}
        />
      </FormSection>
    </Screen>
  );
}
