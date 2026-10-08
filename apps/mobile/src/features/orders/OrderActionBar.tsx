// The sticky action bar of order/[id] (glove mode, PHASE_0 §6.13): the primary move as a 64 px full width
// inverse pill on top, the other moves as 64 px secondary pills below. Two short ones share a row; a long
// label wraps to its own full width row, so no label is ever cut.
import { View } from 'react-native';

import { useTheme } from '@/lib/theme';
import { Button } from '@/ui/Button';

import type { UiAction, UiActionId } from './actions';

export interface OrderActionBarProps {
  actions: readonly UiAction[];
  /** The button whose request is in flight shows a spinner; every button is disabled meanwhile. */
  pending?: UiActionId | null;
  onPress: (action: UiAction) => void;
}

export function OrderActionBar({ actions, pending = null, onPress }: OrderActionBarProps) {
  const theme = useTheme();
  if (actions.length === 0) return null;
  const primary = actions.filter((a) => a.variant === 'primary');
  const rest = actions.filter((a) => a.variant !== 'primary');
  const busy = pending !== null;

  return (
    <View style={{ gap: theme.space[2] }}>
      {primary.map((a) => (
        <Button
          key={a.id}
          label={a.label}
          variant="primary"
          size="L"
          full
          loading={pending === a.id}
          disabled={busy && pending !== a.id}
          onPress={() => onPress(a)}
          testID={`order-action-${a.id}`}
        />
      ))}
      {rest.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}>
          {rest.map((a) => (
            <Button
              key={a.id}
              label={a.label}
              variant="secondary"
              size="L"
              loading={pending === a.id}
              disabled={busy && pending !== a.id}
              onPress={() => onPress(a)}
              style={{ flexGrow: 1, flexBasis: rest.length === 1 ? '100%' : 'auto' }}
              testID={`order-action-${a.id}`}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}
