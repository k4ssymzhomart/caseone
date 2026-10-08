import { useState, type ReactNode, type Ref } from 'react';
import {
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { useTheme } from '@/lib/theme';

import { T } from './T';

export interface TextFieldProps extends Omit<TextInputProps, 'style' | 'multiline' | 'placeholderTextColor'> {
  /** Footnote label above the field. */
  label?: string;
  /** Error text below the field (critical footnote); also tints the border. */
  error?: string;
  /** Right accessory slot inside the field (a unit, a ghost button). */
  right?: ReactNode;
  /** Style of the outer column (label, field, error). */
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
  ref?: Ref<TextInput>;
}

// PHASE_0 §6.9 TextField: red focus border, drawn as an overlay so the field does not shift.
const FOCUS_RING = 1.5;

/** Single line field (PHASE_0 §6.9): label above, min height 56, subtle fill, hairline, red focus border. */
export function TextField({
  label,
  error,
  right,
  containerStyle,
  inputStyle,
  ref,
  editable,
  onFocus,
  onBlur,
  accessibilityLabel,
  accessibilityHint,
  ...rest
}: TextFieldProps) {
  const theme = useTheme();
  const { color, space, radius } = theme;
  const [focused, setFocused] = useState(false);

  const ringColor = focused ? color.borderFocus : error ? theme.status.critical : null;
  const body = theme.type.body;
  const hw = StyleSheet.hairlineWidth;

  return (
    <View style={containerStyle}>
      {label ? (
        <T variant="footnote" tone="secondary" style={{ marginBottom: space[2] }}>
          {label}
        </T>
      ) : null}
      <View
        style={[
          styles.field,
          {
            minHeight: theme.size.tapMin,
            paddingLeft: space[4],
            paddingRight: right ? space[2] : space[4],
            borderRadius: radius.md,
            borderWidth: hw,
            borderColor: color.borderDefault,
            backgroundColor: color.bgSubtle,
          },
        ]}
      >
        <TextInput
          ref={ref}
          {...rest}
          editable={editable}
          multiline={false}
          placeholderTextColor={color.textSecondary}
          selectionColor={color.borderFocus}
          cursorColor={color.borderFocus}
          underlineColorAndroid="transparent"
          maxFontSizeMultiplier={1.4}
          accessibilityLabel={accessibilityLabel ?? label}
          accessibilityHint={error ?? accessibilityHint}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[
            styles.input,
            {
              minHeight: theme.size.tapMin,
              fontFamily: body.fontFamily,
              fontSize: body.fontSize,
              letterSpacing: body.letterSpacing,
              color: editable === false ? color.textSecondary : color.textPrimary,
            },
            inputStyle,
          ]}
        />
        {right ? <View style={{ marginLeft: space[2] }}>{right}</View> : null}
        {ringColor ? (
          <View
            style={[
              styles.ring,
              {
                top: -hw,
                left: -hw,
                right: -hw,
                bottom: -hw,
                borderRadius: radius.md,
                borderWidth: FOCUS_RING,
                borderColor: ringColor,
              },
            ]}
          />
        ) : null}
      </View>
      {error ? (
        <T variant="footnote" tone="critical" style={{ marginTop: space[1] }}>
          {error}
        </T>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center' },
  input: { flex: 1, paddingVertical: 0, paddingHorizontal: 0 },
  ring: { position: 'absolute', pointerEvents: 'none' },
});
