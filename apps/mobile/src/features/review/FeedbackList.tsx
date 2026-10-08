// «Что хорошо» and «Что улучшить» bullets for the worker report: bodyL text, a tinted glyph per line.
import { View } from 'react-native';

import { useTheme } from '@/lib/theme';
import { ListGroup } from '@/ui/ListGroup';
import { T } from '@/ui/T';

const GLYPH_CIRCLE = 28;

export interface FeedbackListProps {
  title: string;
  items: readonly string[];
  kind: 'good' | 'improve';
  /** Shown as the only row when the list is empty. */
  emptyText?: string;
}

export function FeedbackList({ title, items, kind, emptyText }: FeedbackListProps) {
  const theme = useTheme();
  const tone = kind === 'good' ? 'success' : 'warning';
  const glyph = kind === 'good' ? '✓' : '!';
  const rows = items.length ? items : emptyText ? [emptyText] : [];
  if (rows.length === 0) return null;

  return (
    <ListGroup header={title}>
      {rows.map((text, i) => (
        <View
          key={`${i}-${text}`}
          accessible
          accessibilityLabel={text}
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: theme.space[3],
            minHeight: theme.size.rowWorker,
            paddingHorizontal: theme.space[4],
            paddingVertical: theme.space[4],
          }}
        >
          <View
            style={{
              width: GLYPH_CIRCLE,
              height: GLYPH_CIRCLE,
              borderRadius: theme.radius.full,
              backgroundColor: items.length ? theme.statusSoft[tone] : theme.color.bgMuted,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <T
              variant="callout"
              weight="bold"
              color={items.length ? theme.status[tone] : theme.color.textSecondary}
              importantForAccessibility="no"
            >
              {items.length ? glyph : '·'}
            </T>
          </View>
          <T variant="bodyL" style={{ flex: 1 }}>
            {text}
          </T>
        </View>
      ))}
    </ListGroup>
  );
}
