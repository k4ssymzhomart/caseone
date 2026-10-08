// Preset chips of the create screen (CLAUDE.md §10b step 2).
import type { OrderType, Priority } from '@rota/shared';

import type { ChipVariant } from '@/ui/Chip';

export type PresetKey = 'emergency' | 'unplanned' | 'planned';

export interface Preset {
  key: PresetKey;
  labelKey: string;
  type: OrderType;
  priority: Priority;
  /** «Оборудование остановлено» when the preset is picked. */
  equipmentStopped: boolean;
  variant: ChipVariant;
}

export const PRESETS: readonly Preset[] = [
  {
    key: 'emergency',
    labelKey: 'create.preset.emergency',
    type: 'unplanned',
    priority: 'emergency',
    equipmentStopped: true,
    variant: 'critical',
  },
  {
    key: 'unplanned',
    labelKey: 'create.preset.unplanned',
    type: 'unplanned',
    priority: 'high',
    equipmentStopped: false,
    variant: 'default',
  },
  {
    key: 'planned',
    labelKey: 'create.preset.planned',
    type: 'planned',
    priority: 'planned',
    equipmentStopped: false,
    variant: 'default',
  },
];

/** Most orders a master issues are unplanned, so that preset is on when the screen opens. */
export const DEFAULT_PRESET: PresetKey = 'unplanned';

export function presetByKey(key: PresetKey): Preset {
  return PRESETS.find((p) => p.key === key) ?? (PRESETS[1] as Preset);
}
