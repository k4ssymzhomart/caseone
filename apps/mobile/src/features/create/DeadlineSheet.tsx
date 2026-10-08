// Deadline presets (CLAUDE.md §10b): by norm (or by priority), 1, 2, 4, 8 h, end of shift, and «1 мин»
// in demo mode (due_in_min: 1). Rows show the resulting time «до 11:30».
import { formatDuration, hhmm } from '@rota/shared';
import { ScrollView } from 'react-native';

import { t } from '@/lib/i18n';
import { ActionList, type ActionListItem } from '@/ui/ActionList';

import { BottomSheet } from './BottomSheet';
import {
  DEMO_MINUTES,
  HOUR_PRESETS,
  autoHours,
  choiceKey,
  deadlineDue,
  type DeadlineChoice,
  type DeadlineContext,
} from './deadline';

export interface DeadlineSheetProps {
  visible: boolean;
  value: DeadlineChoice;
  context: DeadlineContext;
  /** Shows «1 мин». */
  demoMode: boolean;
  now: Date;
  onSelect: (choice: DeadlineChoice) => void;
  onClose: () => void;
}

export function DeadlineSheet({ visible, value, context, demoMode, now, onSelect, onClose }: DeadlineSheetProps) {
  const choices: { choice: DeadlineChoice; label: string; sublabel: string }[] = [];
  const until = (c: DeadlineChoice) => t('create.deadline.untilTime', { time: hhmm(deadlineDue(c, context, now)) });

  const auto: DeadlineChoice = { kind: 'auto' };
  choices.push({
    choice: auto,
    label: context.codeNormHours != null ? t('create.deadline.byNorm') : t('create.deadline.byPriority'),
    sublabel: `${formatDuration(autoHours(context) * 60)} · ${until(auto)}`,
  });
  if (demoMode) {
    const demo: DeadlineChoice = { kind: 'minutes', minutes: DEMO_MINUTES };
    choices.push({
      choice: demo,
      label: formatDuration(DEMO_MINUTES),
      sublabel: `${t('create.deadline.demo')} · ${until(demo)}`,
    });
  }
  for (const hours of HOUR_PRESETS) {
    const c: DeadlineChoice = { kind: 'hours', hours };
    choices.push({ choice: c, label: formatDuration(hours * 60), sublabel: until(c) });
  }
  const end: DeadlineChoice = { kind: 'shiftEnd' };
  choices.push({ choice: end, label: t('create.deadline.shiftEnd'), sublabel: until(end) });

  const items: ActionListItem[] = choices.map((c) => ({
    key: choiceKey(c.choice),
    label: c.label,
    sublabel: c.sublabel,
  }));

  return (
    <BottomSheet visible={visible} title={t('create.deadline.sheetTitle')} onClose={onClose}>
      <ScrollView bounces={false}>
        <ActionList
          items={items}
          value={choiceKey(value)}
          onSelect={(key) => {
            const found = choices.find((c) => choiceKey(c.choice) === key);
            if (found) onSelect(found.choice);
          }}
        />
      </ScrollView>
    </BottomSheet>
  );
}
