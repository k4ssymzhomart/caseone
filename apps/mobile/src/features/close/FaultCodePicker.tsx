// «Шифр неисправности»: Segmented groups М Э Г П С, then the group's codes as 64 px rows with the code in
// monoM and a ✓ on the selected one (PHASE_0 §7.1 close).
import { FAULT_GROUPS, formatDuration, type FaultCode, type FaultGroup, type WorkNorm } from '@rota/shared';
import { useState } from 'react';
import { View } from 'react-native';

import { t } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { ListGroup } from '@/ui/ListGroup';
import { ListRow } from '@/ui/ListRow';
import { Segmented } from '@/ui/Segmented';
import { T } from '@/ui/T';

import { FormSection } from './FormSection';

/** Width of the code column, fits «М-07» in monoM. */
const CODE_COLUMN = 48;

export interface FaultCodePickerProps {
  codes: readonly FaultCode[];
  norms: readonly WorkNorm[];
  value: string | null;
  /** The order's suggested code, marked in its row. */
  suggested: string | null;
  onChange: (code: string) => void;
}

export function FaultCodePicker({ codes, norms, value, suggested, onChange }: FaultCodePickerProps) {
  const theme = useTheme();
  const [group, setGroup] = useState<FaultGroup>(
    () => codes.find((c) => c.code === (value ?? suggested))?.grp ?? 'М',
  );
  const selected = value ? codes.find((c) => c.code === value) : undefined;
  const list = codes.filter((c) => c.grp === group);

  return (
    <FormSection
      title={t('close.faultCode')}
      right={
        <T variant="monoM" tone={selected ? 'primary' : 'secondary'}>
          {selected ? selected.code : t('close.faultCodeNone')}
        </T>
      }
    >
      <Segmented
        items={FAULT_GROUPS.map((g) => ({
          key: g,
          label: g,
          ...(selected?.grp === g ? { count: '✓' } : {}),
          accessibilityLabel: t(`close.group.${g}`),
        }))}
        value={group}
        onChange={setGroup}
        accessibilityLabel={t('close.faultCode')}
      />
      <T variant="footnote" tone="secondary" style={{ paddingHorizontal: theme.space[4] }}>
        {t(`close.group.${group}`)}
      </T>
      <ListGroup separatorInset={theme.space[4] + CODE_COLUMN + theme.space[3]}>
        {list.map((c) => {
          const isSel = c.code === value;
          const norm = norms.find((n) => n.fault_code === c.code)?.norm_hours;
          const sub = [
            norm != null ? t('close.norm', { hours: formatDuration(norm * 60) }) : null,
            c.code === suggested ? t('close.suggested') : null,
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <ListRow
              key={c.code}
              density="worker"
              title={c.name}
              {...(sub ? { subtitle: sub } : {})}
              left={
                <View style={{ width: CODE_COLUMN }}>
                  <T variant="monoM" weight={isSel ? 'medium' : undefined}>
                    {c.code}
                  </T>
                </View>
              }
              right={
                isSel ? (
                  <T variant="headline" color={theme.color.bgAccent} importantForAccessibility="no">
                    ✓
                  </T>
                ) : undefined
              }
              showChevron={false}
              accessibilityLabel={isSel ? `${c.code} ${c.name}, ${t('close.selected')}` : `${c.code} ${c.name}`}
              onPress={() => onChange(c.code)}
              {...(isSel ? { style: { backgroundColor: theme.color.bgMuted } } : {})}
            />
          );
        })}
      </ListGroup>
    </FormSection>
  );
}
