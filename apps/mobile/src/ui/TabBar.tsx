import { BlurView } from 'expo-blur';
import {
  BottomTabBarHeightCallbackContext,
  type BottomTabBarProps,
  type BottomTabNavigationOptions,
} from 'expo-router/js-tabs';
import { useContext } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { haptic } from '@/lib/haptics';
import { useTheme } from '@/lib/theme';

import { PressableScale } from './PressableScale';
import { T } from './T';

/** The active tab carries a 4 px red dot above its label (PHASE_0 §6.9). */
const ACTIVE_DOT = 4;

export interface TabBarProps extends BottomTabBarProps {
  /** Route rendered as the inverse pill in the middle (the master's «Выдать»). */
  centerRouteName?: string;
  /** Replaces tab navigation for the center route, for example `router.push('/create')`. */
  onCenterPress?: () => void;
}

/** Total tab bar height (64 plus the bottom safe area). Screens pad their scroll content with it. */
export function useTabBarHeight(): number {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return theme.size.tabBar + insets.bottom;
}

function isHidden(options: BottomTabNavigationOptions): boolean {
  // expo-router turns `href: null` into tabBarItemStyle { display: 'none' } and a null tabBarButton.
  const item = StyleSheet.flatten(options.tabBarItemStyle);
  return item?.display === 'none' || (options as { href?: unknown }).href === null;
}

function labelOf(options: BottomTabNavigationOptions, routeName: string): string {
  if (typeof options.tabBarLabel === 'string') return options.tabBarLabel;
  return options.title ?? routeName;
}

/**
 * Glass tab bar for expo-router JS Tabs: `<Tabs tabBar={(p) => <TabBar {...p} />} />`.
 * Positioned absolutely at the bottom, so content scrolls under the glass; pad content with useTabBarHeight().
 * Text labels only; the active label is textPrimary semibold with a red dot above it.
 */
export function TabBar({
  state,
  descriptors,
  navigation,
  insets,
  centerRouteName,
  onCenterPress,
}: TabBarProps) {
  const theme = useTheme();
  const reportHeight = useContext(BottomTabBarHeightCallbackContext);
  const height = theme.size.tabBar + insets.bottom;
  const ios = Platform.OS === 'ios';
  // glass.stroke is white; in light mode it vanishes against light glass, so the hairline uses borderDefault there.
  const hairline = theme.mode === 'dark' ? theme.glass.stroke : theme.color.borderDefault;

  return (
    <View
      accessibilityRole="tablist"
      onLayout={(e) => reportHeight?.(e.nativeEvent.layout.height)}
      style={[
        styles.bar,
        {
          height,
          paddingBottom: insets.bottom,
          paddingHorizontal: Math.max(insets.left, insets.right, theme.space[2]),
          borderTopColor: hairline,
          backgroundColor: ios ? 'transparent' : theme.glass.fillStrong,
        },
        theme.mode === 'light' ? theme.shadow.soft : null,
      ]}
    >
      {ios ? (
        <>
          <BlurView
            intensity={theme.glass.blurIntensity}
            tint={
              theme.mode === 'dark' ? 'systemUltraThinMaterialDark' : 'systemUltraThinMaterialLight'
            }
            style={StyleSheet.absoluteFill}
          />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.glass.fill }]} />
        </>
      ) : null}
      <View style={[styles.items, { height: theme.size.tabBar }]}>
        {state.routes.map((route, index) => {
          const options = descriptors[route.key]?.options;
          if (!options || isHidden(options)) return null;
          const focused = state.index === index;
          const label = labelOf(options, route.name);
          const isCenter = route.name === centerRouteName;

          const onPress = () => {
            if (isCenter && onCenterPress) {
              haptic.light();
              onCenterPress();
              return;
            }
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              haptic.selection();
              navigation.navigate(route.name, route.params);
            }
          };
          const onLongPress = () => {
            navigation.emit({ type: 'tabLongPress', target: route.key });
          };

          return (
            <PressableScale
              key={route.key}
              testID={options.tabBarButtonTestID}
              accessibilityRole={isCenter ? 'button' : 'tab'}
              accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
              accessibilityState={isCenter ? undefined : { selected: focused }}
              onPress={onPress}
              onLongPress={onLongPress}
              style={[
                styles.item,
                { minHeight: theme.size.tapMin, paddingHorizontal: theme.space[1] },
              ]}
            >
              {isCenter ? (
                <View
                  style={[
                    styles.pill,
                    {
                      height: theme.size.hud,
                      paddingHorizontal: theme.space[5],
                      borderRadius: theme.radius.full,
                      backgroundColor: theme.color.bgInverse,
                    },
                  ]}
                >
                  <T
                    variant="buttonM"
                    tone="inverse"
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                  >
                    {label}
                  </T>
                </View>
              ) : (
                <>
                  <View
                    style={{
                      width: ACTIVE_DOT,
                      height: ACTIVE_DOT,
                      borderRadius: theme.radius.full,
                      marginBottom: theme.space[1],
                      backgroundColor: focused ? theme.color.bgAccent : 'transparent',
                    }}
                  />
                  <T
                    variant="footnote"
                    tone={focused ? 'primary' : 'secondary'}
                    weight={focused ? 'semibold' : undefined}
                    align="center"
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                  >
                    {label}
                  </T>
                  {/* Keeps the label optically centered against the dot above it. */}
                  <View style={{ height: ACTIVE_DOT + theme.space[1] }} />
                </>
              )}
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  items: { flexDirection: 'row', alignItems: 'center' },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' },
  pill: { maxWidth: '100%', alignItems: 'center', justifyContent: 'center' },
});
