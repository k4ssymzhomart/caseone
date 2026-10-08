import { useState, type Ref } from 'react';
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

export interface TextAreaProps extends Omit<TextInputProps, 'style' | 'multiline' | 'placeholderTextColor'> {
  /** Footnote label above the area. */
  label?: string;
  /** Error text below the area (critical footnote); also tints the border. */
  error?: string;
  /** Shows a character counter under the area: «42» or «42/500» when maxLength is set. */
  counter?: boolean;
  /** Style of the outer column (label, area, footer). */
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
  ref?: Ref<TextInput>;
}

// PHASE_0 §6.9 TextArea: min height 120; red focus border drawn as an overlay so the area does not shift.
const AREA_MIN_HEIGHT = 120;
const FOCUS_RING = 1.5;

/** Multiline field (PHASE_0 §6.9): label above, min height 120, text from the top, optional counter. */
export function TextArea({
  label,
  error,
  counter = false,
  containerStyle,
  inputStyle,
  ref,
  value,
  defaultValue,
  maxLength,
  editable,
  onChangeText,
  onFocus,
  onBlur,
  accessibilityLabel,
  accessibilityHint,
  ...rest
}: TextAreaProps) {
  const theme = useTheme();
  const { color, space, radius } = theme;
  const [focused, setFocused] = useState(false);
  const [typed, setTyped] = useState(defaultValue?.length ?? 0);

  const length = value !== undefined ? value.length : typed;
  const atLimit = maxLength !== undefined && length >= maxLength;
  const ringColor = focused ? color.borderFocus : error ? theme.status.critical : null;
  const body = theme.type.body;
  const foot = theme.type.footnote;
  const hw = StyleSheet.hairlineWidth;

  return (
    <View style={containerStyle}>
      {label ? (
        <T variant="footnote" tone="secondary" style={{ marginBottom: space[2] }}>
          {label}
        </T>
      ) : null}
      <View
        style={{
          minHeight: AREA_MIN_HEIGHT,
          borderRadius: radius.md,
          borderWidth: hw,
          borderColor: color.borderDefault,
          backgroundColor: color.bgSubtle,
        }}
      >
        <TextInput
          ref={ref}
          {...rest}
          value={value}
          defaultValue={defaultValue}
          maxLength={maxLength}
          editable={editable}
          multiline
          textAlignVertical="top"
          placeholderTextColor={color.textSecondary}
          selectionColor={color.borderFocus}
          cursorColor={color.borderFocus}
          underlineColorAndroid="transparent"
          maxFontSizeMultiplier={1.4}
          accessibilityLabel={accessibilityLabel ?? label}
          accessibilityHint={error ?? accessibilityHint}
          onChangeText={(text) => {
            setTyped(text.length);
            onChangeText?.(text);
          }}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[
            {
              minHeight: AREA_MIN_HEIGHT,
              paddingHorizontal: space[4],
              paddingTop: space[3],
              paddingBottom: space[3],
              fontFamily: body.fontFamily,
              fontSize: body.fontSize,
              lineHeight: body.lineHeight,
              letterSpacing: body.letterSpacing,
              color: editable === false ? color.textSecondary : color.textPrimary,
            },
            inputStyle,
          ]}
        />
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
      {error || counter ? (
        <View style={[styles.footer, { marginTop: space[1], gap: space[3] }]}>
          <View style={styles.error}>
            {error ? (
              <T variant="footnote" tone="critical">
                {error}
              </T>
            ) : null}
          </View>
          {counter ? (
            <T
              variant="monoM"
              tone={atLimit ? 'critical' : 'secondary'}
              style={{ fontSize: foot.fontSize, lineHeight: foot.lineHeight }}
            >
              {maxLength !== undefined ? `${length}/${maxLength}` : String(length)}
            </T>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { position: 'absolute', pointerEvents: 'none' },
  footer: { flexDirection: 'row', alignItems: 'flex-start' },
  error: { flex: 1 },
});
