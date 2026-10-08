import { ActivityIndicator, Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/lib/theme';

import { PressableScale } from './PressableScale';
import { T } from './T';

// PHASE_0 §6.9 PhotoTile: 104 px tiles, a dashed add tile, a «✕» capsule, up to 5 photos.
const TILE = 104;
/** Dashed edges need a real width to read as dashes; a hairline turns into dots. */
const DASH_WIDTH = 1.5;
/** The remove capsule is 32 visible inside a tapMin square in the tile's corner (Android clips hitSlop to the parent). */
const REMOVE_SIZE = 32;
/** Error edge on a failed upload. */
const ERROR_EDGE = 2;

export interface PhotoTileItem {
  id: string;
  uri: string;
  uploading?: boolean;
  error?: boolean;
}

export interface PhotoTileProps {
  photos: readonly PhotoTileItem[];
  /** The add tile hides once this many photos are attached. Default 5. */
  max?: number;
  /** Add tile caption, for example «Снять фото». */
  addLabel?: string;
  onAdd?: () => void;
  /** The screen opens its confirm sheet before removing (destructive, PHASE_0 §6.13). */
  onRemove?: (id: string) => void;
  /** Opens the photo full screen. */
  onOpen?: (id: string) => void;
  /** Screen reader label for a thumbnail, for example «Фото». */
  photoLabel?: string;
  /** Screen reader label for the «✕» capsule, for example «Удалить фото». */
  removeLabel?: string;
  /** Word shown on a failed upload, for example «Не загружено» (status is never color alone). */
  errorLabel?: string;
  /** Hides the add tile and the «✕» capsules. */
  readOnly?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** A wrapping row of 104 px photo tiles with an add tile, upload and error states. */
export function PhotoTile({
  photos,
  max = 5,
  addLabel,
  onAdd,
  onRemove,
  onOpen,
  photoLabel,
  removeLabel,
  errorLabel,
  readOnly = false,
  style,
}: PhotoTileProps) {
  const theme = useTheme();
  const canAdd = !readOnly && onAdd !== undefined && photos.length < max;
  const tileShape = { width: TILE, height: TILE, borderRadius: theme.radius.md } as const;

  return (
    <View style={[{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }, style]}>
      {photos.map((photo, index) => {
        const label = photoLabel ? `${photoLabel} ${index + 1}` : undefined;
        const body = (
          <>
            <Image
              source={{ uri: photo.uri }}
              style={[tileShape, { backgroundColor: theme.color.bgMuted }]}
              resizeMode="cover"
              accessibilityIgnoresInvertColors
            />
            {photo.uploading ? (
              <View
                style={[
                  StyleSheet.absoluteFill,
                  {
                    borderRadius: theme.radius.md,
                    backgroundColor: theme.glass.fillStrong,
                    alignItems: 'center',
                    justifyContent: 'center',
                  },
                ]}
              >
                <ActivityIndicator color={theme.color.textPrimary} />
              </View>
            ) : null}
            {photo.error ? (
              <View
                style={[
                  StyleSheet.absoluteFill,
                  {
                    borderRadius: theme.radius.md,
                    backgroundColor: theme.statusSoft.critical,
                    borderWidth: ERROR_EDGE,
                    borderColor: theme.status.critical,
                    justifyContent: 'flex-end',
                    alignItems: 'center',
                    padding: theme.space[2],
                  },
                ]}
              >
                {errorLabel ? (
                  <View
                    style={{
                      borderRadius: theme.radius.full,
                      backgroundColor: theme.color.bgAccent,
                      paddingHorizontal: theme.space[2],
                      paddingVertical: theme.space.half,
                    }}
                  >
                    <T variant="footnote" weight="semibold" tone="onAccent" numberOfLines={1}>
                      {errorLabel}
                    </T>
                  </View>
                ) : null}
              </View>
            ) : null}
          </>
        );

        return (
          <View key={photo.id} style={tileShape}>
            {onOpen ? (
              <PressableScale
                onPress={() => onOpen(photo.id)}
                accessibilityRole="imagebutton"
                accessibilityLabel={photo.error && errorLabel ? `${label ?? ''} ${errorLabel}`.trim() : label}
                accessibilityState={{ busy: photo.uploading ?? false }}
                style={tileShape}
              >
                {body}
              </PressableScale>
            ) : (
              <View
                style={tileShape}
                accessible={Boolean(label)}
                accessibilityRole="image"
                accessibilityLabel={label}
              >
                {body}
              </View>
            )}
            {!readOnly && onRemove ? (
              <PressableScale
                onPress={() => onRemove(photo.id)}
                accessibilityRole="button"
                accessibilityLabel={removeLabel ? (label ? `${removeLabel}, ${label}` : removeLabel) : undefined}
                style={{
                  position: 'absolute',
                  top: 0,
                  right: 0,
                  width: theme.size.tapMin,
                  height: theme.size.tapMin,
                  padding: theme.space[1],
                  alignItems: 'flex-end',
                  justifyContent: 'flex-start',
                }}
              >
                <View
                  style={{
                    width: REMOVE_SIZE,
                    height: REMOVE_SIZE,
                    borderRadius: theme.radius.full,
                    backgroundColor: theme.glass.fillStrong,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: theme.glass.stroke,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <T variant="callout" weight="semibold" importantForAccessibility="no">
                    ✕
                  </T>
                </View>
              </PressableScale>
            ) : null}
          </View>
        );
      })}

      {canAdd ? (
        <PressableScale
          onPress={onAdd}
          accessibilityRole="button"
          accessibilityLabel={addLabel}
          style={[
            tileShape,
            {
              borderWidth: DASH_WIDTH,
              borderStyle: 'dashed',
              borderColor: theme.color.borderStrong,
              backgroundColor: theme.color.bgSubtle,
              alignItems: 'center',
              justifyContent: 'center',
              gap: theme.space[1],
              paddingHorizontal: theme.space[2],
            },
          ]}
        >
          <T variant="title1" tone="secondary" importantForAccessibility="no">
            +
          </T>
          {addLabel ? (
            <T variant="footnote" tone="secondary" align="center" numberOfLines={2}>
              {addLabel}
            </T>
          ) : null}
        </PressableScale>
      ) : null}
    </View>
  );
}
