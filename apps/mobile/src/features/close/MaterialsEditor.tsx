// «Материалы»: one Stepper row per line (unit from the directory), «Добавить материал» with a search sheet,
// «Добавить обычные для Г-01» for the norm's typical set, and an explicit «Без материалов» (CLAUDE.md §11 R1, R3).
import { formatNumber, type Material, type MaterialLine, type WorkNorm } from '@rota/shared';
import { useState } from 'react';
import { View } from 'react-native';

import { t } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { Button } from '@/ui/Button';
import { Checkbox } from '@/ui/Checkbox';
import { ListGroup } from '@/ui/ListGroup';
import { Stepper } from '@/ui/Stepper';
import { T } from '@/ui/T';

import { FormSection } from './FormSection';
import { MaterialSearchSheet } from './MaterialSearchSheet';

/** Stepper step by unit: whole pieces and sets, half kilograms, whole litres and metres. */
const STEP_BY_UNIT: Record<string, number> = { шт: 1, компл: 1, кг: 0.5, л: 1, м: 1 };

export function stepFor(unit: string | undefined): number {
  return (unit ? STEP_BY_UNIT[unit] : undefined) ?? 1;
}

export interface MaterialsEditorProps {
  lines: readonly MaterialLine[];
  onChange: (lines: MaterialLine[]) => void;
  noMaterials: boolean;
  onNoMaterials: (value: boolean) => void;
  materials: readonly Material[];
  norm: WorkNorm | undefined;
  faultCode: string | null;
}

const fmt = (v: number) => formatNumber(v, 2);

export function MaterialsEditor({
  lines,
  onChange,
  noMaterials,
  onNoMaterials,
  materials,
  norm,
  faultCode,
}: MaterialsEditorProps) {
  const theme = useTheme();
  const [picking, setPicking] = useState(false);
  const byId = new Map(materials.map((m) => [m.id, m]));
  const typical = norm?.typical ?? [];
  const addedIds = new Set(lines.map((l) => l.material_id));

  const setQty = (materialId: number, qty: number) =>
    onChange(lines.map((l) => (l.material_id === materialId ? { ...l, qty } : l)));

  const add = (materialId: number) => {
    setPicking(false);
    if (addedIds.has(materialId)) return;
    const usual = typical.find((x) => x.material_id === materialId)?.qty;
    onChange([...lines, { material_id: materialId, qty: usual ?? stepFor(byId.get(materialId)?.unit) }]);
  };

  const addTypical = () =>
    onChange([
      ...lines,
      ...typical.filter((x) => !addedIds.has(x.material_id)).map((x) => ({ material_id: x.material_id, qty: x.qty })),
    ]);

  return (
    <FormSection title={t('close.materials')}>
      {!noMaterials && lines.length ? (
        <ListGroup>
          {lines.map((l) => {
            const m = byId.get(l.material_id);
            const unit = m?.unit ?? '';
            const norm1 = typical.find((x) => x.material_id === l.material_id);
            let hint: string | null = null;
            let tone: 'secondary' | 'critical' = 'secondary';
            if (l.qty === 0) hint = t('close.zeroQty');
            else if (norm1 && l.qty > norm1.qty_max) {
              hint = t('close.overNorm', { max: fmt(norm1.qty_max), unit });
              tone = 'critical';
            } else if (norm1) hint = t('close.typicalHint', { qty: fmt(norm1.qty), max: fmt(norm1.qty_max), unit });
            else if (norm && faultCode) hint = t('close.notTypical', { code: faultCode });
            return (
              <View key={l.material_id} style={{ padding: theme.space[4], gap: theme.space[2] }}>
                <T variant="bodyL" tone={l.qty === 0 ? 'secondary' : 'primary'}>
                  {m?.name ?? String(l.material_id)}
                </T>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3] }}>
                  <T variant="footnote" tone={tone} style={{ flex: 1 }}>
                    {hint ?? ''}
                  </T>
                  <Stepper
                    value={l.qty}
                    onChange={(q) => setQty(l.material_id, q)}
                    min={0}
                    step={stepFor(unit)}
                    unit={unit}
                    format={fmt}
                    accessibilityLabel={m?.name ?? t('close.materials')}
                  />
                </View>
              </View>
            );
          })}
        </ListGroup>
      ) : null}

      {!noMaterials && lines.length === 0 && typical.length && faultCode ? (
        <Button
          variant="secondary"
          size="L"
          full
          left="+"
          label={t('close.addTypical', { code: faultCode })}
          onPress={addTypical}
        />
      ) : null}

      <Button
        variant="secondary"
        size="L"
        full
        left="+"
        label={t('close.addMaterial')}
        disabled={noMaterials}
        onPress={() => setPicking(true)}
      />

      <Checkbox
        label={t('common.no_materials')}
        {...(noMaterials ? { sublabel: t('close.noMaterialsHint') } : {})}
        checked={noMaterials}
        onChange={onNoMaterials}
      />

      <MaterialSearchSheet
        visible={picking}
        onClose={() => setPicking(false)}
        materials={materials}
        typicalIds={typical.map((x) => x.material_id)}
        faultCode={faultCode}
        addedIds={addedIds}
        onPick={add}
      />
    </FormSection>
  );
}
