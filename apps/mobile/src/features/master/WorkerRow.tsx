// One worker in a ListGroup: Avatar with the state dot, name, an optional «ИИ» tag, a subtitle (specialty and
// grade, or the AI reasons), then the state Pill (dot plus word: status is never color alone) and a detail
// such as the unit being repaired. Master density: at least 56 high. Used by the shift panel and the
// reassign picker.
import { workerStateTone, type WorkerState } from '@rota/shared';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { pillTone } from '@/features/orders/present';
import { useTheme } from '@/lib/theme';
import { Avatar } from '@/ui/Avatar';
import { Pill } from '@/ui/Pill';
import { PressableScale } from '@/ui/PressableScale';
import { T } from '@/ui/T';
import { Tag } from '@/ui/Tag';

/** Disabled rows dim like disabled buttons (PHASE_0 §6.9). */
const DISABLED_OPACITY = 0.4;

export interface WorkerRowProps {
  name: string;
  /** «Слесарь · 5 разряд · Бригада 1», or the AI reasons line. */
  subtitle?: string;
  state: WorkerState;
  /** workerStateText(): «Свободен», «Выполняет наряд №147», «В очереди 2», «Не на смене». */
  stateText: string;
  /** Short mono tag after the name, the «ИИ» of a suggestion. */
  tag?: string;
  /** Callout secondary text after the pill, e.g. the unit in work. */
  detail?: string | null;
  onPress?: () => void;
  /** Highlighted row with a red ✓ (the escalation's proposed worker). */
  selected?: boolean;
  disabled?: boolean;
  /** Shows a spinner instead of the chevron while an action for this row runs. */
  busy?: boolean;
  /** Color around the avatar dot: the surface the row sits on (bgSubtle inside a ListGroup). */
  backdropColor?: string;
  accessibilityHint?: string;
  testID?: string;
}

export function WorkerRow({
  name,
  subtitle,
  state,
  stateText,
  tag,
  detail,
  onPress,
  selected = false,
  disabled = false,
  busy = false,
  backdropColor,
  accessibilityHint,
  testID,
}: WorkerRowProps) {
  const theme = useTheme();
  const [pressed, setPressed] = useState(false);
  const tone = pillTone(workerStateTone(state));
  // On a dark sheet bgMuted equals the surface, so a selected row takes the next gray (as ActionList does).
  const selectedBg = theme.mode === 'dark' ? theme.color.borderDefault : theme.color.bgMuted;
  const bg = pressed ? theme.color.bgMuted : selected ? selectedBg : 'transparent';

  const content = (
    <View style={{ flexDirection: 'row', alignItems: 'center', opacity: disabled ? DISABLED_OPACITY : 1 }}>
      <Avatar
        name={name}
        status={tone}
        backdropColor={pressed || selected ? bg : (backdropColor ?? theme.color.bgSubtle)}
        style={{ marginRight: theme.space[3] }}
      />
      <View style={{ flex: 1, minWidth: 0, gap: theme.space.half }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[2] }}>
          <T variant="body" weight="medium" numberOfLines={1} style={{ flexShrink: 1 }}>
            {name}
          </T>
          {tag ? <Tag label={tag} tone="accent" /> : null}
        </View>
        {subtitle ? (
          <T variant="callout" tone="secondary" numberOfLines={2}>
            {subtitle}
          </T>
        ) : null}
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: theme.space[2],
            marginTop: theme.space[1],
          }}
        >
          <Pill label={stateText} tone={tone} />
          {detail ? (
            <T variant="callout" tone="secondary" numberOfLines={1} style={{ flexShrink: 1 }}>
              {detail}
            </T>
          ) : null}
        </View>
      </View>
      {busy ? (
        <ActivityIndicator color={theme.color.textSecondary} style={{ marginLeft: theme.space[3] }} />
      ) : selected ? (
        <T variant="headline" color={theme.color.bgAccent} style={{ marginLeft: theme.space[3] }}>
          ✓
        </T>
      ) : onPress ? (
        <T variant="body" tone="secondary" style={{ marginLeft: theme.space[2] }}>
          ›
        </T>
      ) : null}
    </View>
  );

  const rowStyle = {
    minHeight: theme.size.rowMaster,
    justifyContent: 'center' as const,
    paddingHorizontal: theme.space[4],
    paddingVertical: theme.space[3],
    backgroundColor: bg,
  };

  const label = [name, tag, subtitle, stateText, detail].filter(Boolean).join(', ');

  if (!onPress) {
    return (
      <View accessible accessibilityLabel={label} style={rowStyle} testID={testID}>
        {content}
      </View>
    );
  }

  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled || busy}
      scaleTo={1}
      pressedOpacity={1}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: disabled || busy, selected, busy }}
      style={rowStyle}
      testID={testID}
    >
      {content}
    </PressableScale>
  );
}
