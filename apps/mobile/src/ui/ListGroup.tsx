import { Children, Fragment, isValidElement, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/lib/theme';

import { T } from './T';

export interface ListGroupProps {
  /** Eyebrow above the group (mono caps, text secondary). */
  header?: string;
  /** Footnote below the group (text secondary). */
  footer?: string;
  /** Rows (ListRow, CheckRow or any view). Hairline separators are inserted between them. */
  children?: ReactNode;
  /** Left inset of the separators, 16 by default (PHASE_0 §6.5). */
  separatorInset?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Rota Settings group (PHASE_0 §6.9): header, a `bgSubtle` container with inset hairlines, footer. */
export function ListGroup({
  header,
  footer,
  children,
  separatorInset,
  style,
  testID,
}: ListGroupProps) {
  const theme = useTheme();
  const rows = Children.toArray(children);
  const inset = separatorInset ?? theme.space[4];

  return (
    <View style={style} testID={testID}>
      {header ? (
        <T
          variant="monoCaps"
          tone="secondary"
          accessibilityRole="header"
          style={{ paddingHorizontal: theme.space[4], marginBottom: theme.space[2] }}
        >
          {header}
        </T>
      ) : null}
      <View
        style={{
          backgroundColor: theme.color.bgSubtle,
          borderRadius: theme.radius.md,
          overflow: 'hidden',
          borderWidth: theme.mode === 'light' ? StyleSheet.hairlineWidth : 0,
          borderColor: theme.color.borderDefault,
        }}
      >
        {rows.map((row, i) => (
          // Children.toArray gives every element a stable key (its own key, or its position for static rows).
          <Fragment key={isValidElement(row) && row.key != null ? row.key : i}>
            {i > 0 ? (
              <View
                importantForAccessibility="no"
                style={{
                  height: StyleSheet.hairlineWidth,
                  marginLeft: inset,
                  backgroundColor: theme.color.borderDefault,
                }}
              />
            ) : null}
            {row}
          </Fragment>
        ))}
      </View>
      {footer ? (
        <T
          variant="footnote"
          tone="secondary"
          style={{ paddingHorizontal: theme.space[4], marginTop: theme.space[2] }}
        >
          {footer}
        </T>
      ) : null}
    </View>
  );
}
