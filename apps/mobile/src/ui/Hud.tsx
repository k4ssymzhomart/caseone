import { BlurView } from 'expo-blur';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  AccessibilityInfo,
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/lib/theme';

import { LogoMark } from './LogoMark';
import { PressableScale } from './PressableScale';
import { T } from './T';
import { WindowOverlay } from './WindowOverlay';

// PHASE_0 §6.9 HudToast: LogoMark 16, auto hide after 2.5 s, 12 above the tab bar.
const MARK_SIZE = 16;
const DEFAULT_DURATION_MS = 2500;
/** When another toast waits, the current one stays at least this long before it yields. */
const MIN_VISIBLE_MS = 1200;
/** Waiting toasts beyond this are dropped (oldest first). */
const MAX_QUEUE = 4;
/** Spring timings (PHASE_0 §6.8). A duration based spring settles in about 1.5 × its duration. */
const SPRING_IN = { duration: 320, dampingRatio: 0.8 } as const;
const SPRING_OUT = { duration: 200, dampingRatio: 1 } as const;
const OUT_SETTLE_MS = 320;
const FADE_REDUCED_MS = 150;
/** The capsule grows from 0.96 as it rises. */
const FROM_SCALE = 0.96;

export type HudTone = 'default' | 'critical';

export interface HudToastProps {
  message: string;
  /** Number or code shown in mono before the message, for example «№147». */
  monoPrefix?: string;
  /** Short verb after a divider, for example «Открыть». */
  actionLabel?: string;
  onAction?: () => void;
  /** `critical` paints the prefix and the edge red (the message still says what happened). */
  tone?: HudTone;
  style?: StyleProp<ViewStyle>;
}

/**
 * The Rota HUD capsule: glass, 44 high, the mark, a mono prefix, the message, an optional action.
 * The layout box is `size.tapMin` (56) high so the action keeps a glove sized target on Android
 * too; the visible capsule inside it is `size.hud` (44).
 */
export function HudToast({ message, monoPrefix, actionLabel, onAction, tone = 'default', style }: HudToastProps) {
  const theme = useTheme();
  const critical = tone === 'critical';
  const ios = Platform.OS === 'ios';
  const inset = (theme.size.tapMin - theme.size.hud) / 2;

  return (
    <View
      style={[
        {
          height: theme.size.tapMin,
          flexDirection: 'row',
          alignItems: 'center',
          alignSelf: 'center',
          gap: theme.space[2],
          paddingLeft: theme.space[4],
          paddingRight: actionLabel ? theme.space[2] : theme.space[4],
          maxWidth: '100%',
        },
        style,
      ]}
    >
      <View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            left: 0,
            right: 0,
            top: inset,
            height: theme.size.hud,
            borderRadius: theme.radius.full,
          },
          theme.shadow.soft,
        ]}
      >
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius: theme.radius.full,
              overflow: 'hidden',
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: critical ? theme.status.critical : theme.glass.stroke,
              backgroundColor: ios ? undefined : theme.glass.fillStrong,
            },
          ]}
        >
          {ios ? (
            <>
              <BlurView
                intensity={theme.glass.blurIntensity}
                tint={theme.mode === 'dark' ? 'dark' : 'light'}
                style={StyleSheet.absoluteFill}
              />
              <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.glass.fill }]} />
            </>
          ) : null}
        </View>
      </View>

      <LogoMark size={MARK_SIZE} />
      {monoPrefix ? (
        <>
          <T variant="monoM" color={critical ? theme.color.textAccent : undefined} numberOfLines={1}>
            {monoPrefix}
          </T>
          <T variant="callout" tone="secondary" importantForAccessibility="no" accessibilityElementsHidden>
            ·
          </T>
        </>
      ) : null}
      <T
        variant="callout"
        numberOfLines={1}
        accessibilityLiveRegion="polite"
        style={{ flexShrink: 1 }}
      >
        {message}
      </T>
      {actionLabel ? (
        <>
          <View
            style={{
              width: StyleSheet.hairlineWidth,
              height: theme.space[4],
              backgroundColor: theme.color.borderStrong,
            }}
          />
          <PressableScale
            onPress={onAction}
            disabled={!onAction}
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
            accessibilityState={{ disabled: !onAction }}
            style={{
              height: theme.size.tapMin,
              minWidth: theme.size.tapMin,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: theme.space[2],
            }}
          >
            <T variant="callout" weight="semibold" tone="accent" numberOfLines={1}>
              {actionLabel}
            </T>
          </PressableScale>
        </>
      ) : null}
    </View>
  );
}

export interface HudShowOptions {
  message: string;
  monoPrefix?: string;
  actionLabel?: string;
  /** Runs on tap; the toast then hides. */
  onAction?: () => void;
  tone?: HudTone;
  /** Milliseconds on screen, 2500 by default. */
  duration?: number;
}

export interface HudApi {
  /** Shows a toast, or queues it behind the current one. A repeat of the visible toast restarts its timer. */
  show: (options: HudShowOptions) => void;
  /** Hides the current toast and drops the queue. */
  hide: () => void;
}

const HudContext = createContext<HudApi | null>(null);

export interface HudProviderProps {
  children: ReactNode;
  /** Distance from the bottom edge. Default: safe area bottom + `size.tabBar` + 12. */
  /** Distance from the top edge. Default: safe area top + 8. The HUD sits at the top so it never covers
   *  the sticky footer buttons of pushed screens or the tab bar. */
  topOffset?: number;
  /** Default time on screen for every toast, 2500 ms. */
  duration?: number;
}

interface HudItem extends HudShowOptions {
  key: number;
}

type Phase = 'idle' | 'showing' | 'leaving';

function clearTimer(timer: { current: ReturnType<typeof setTimeout> | null }) {
  if (timer.current) clearTimeout(timer.current);
  timer.current = null;
}

/** Renders the app plus the HUD toast host above the tab bar. Put it inside `ThemeProvider`. */
export function HudProvider({ children, topOffset, duration = DEFAULT_DURATION_MS }: HudProviderProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const [current, setCurrent] = useState<HudItem | null>(null);

  const progress = useSharedValue(0);
  const queue = useRef<HudItem[]>([]);
  const phase = useRef<Phase>('idle');
  const visible = useRef<HudItem | null>(null);
  const shownAt = useRef(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);
  const reduceRef = useRef(reduce);
  const durationRef = useRef(duration);

  useEffect(() => {
    reduceRef.current = reduce;
    durationRef.current = duration;
  }, [reduce, duration]);

  const animateTo = useCallback(
    (to: 0 | 1) => {
      if (reduceRef.current) {
        progress.set(
          withTiming(to, { duration: FADE_REDUCED_MS, easing: Easing.out(Easing.quad), reduceMotion: ReduceMotion.Never }),
        );
      } else {
        progress.set(withSpring(to, { ...(to === 1 ? SPRING_IN : SPRING_OUT), reduceMotion: ReduceMotion.Never }));
      }
    },
    [progress],
  );

  // The state machine lives in refs so `show` and `hide` keep one identity for the app's lifetime.
  const machine = useMemo(() => {
    const scheduleHide = (ms: number) => {
      clearTimer(hideTimer);
      hideTimer.current = setTimeout(() => leave(), Math.max(0, ms));
    };

    const present = (item: HudItem) => {
      phase.current = 'showing';
      visible.current = item;
      shownAt.current = Date.now();
      setCurrent(item);
      progress.set(0);
      animateTo(1);
      AccessibilityInfo.announceForAccessibility(
        item.monoPrefix ? `${item.monoPrefix} ${item.message}` : item.message,
      );
      const ms = item.duration ?? durationRef.current;
      scheduleHide(queue.current.length > 0 ? Math.min(ms, MIN_VISIBLE_MS) : ms);
    };

    const leave = () => {
      if (phase.current !== 'showing') return;
      phase.current = 'leaving';
      clearTimer(hideTimer);
      animateTo(0);
      clearTimer(advanceTimer);
      advanceTimer.current = setTimeout(() => {
        const next = queue.current.shift();
        if (next) {
          present(next);
        } else {
          phase.current = 'idle';
          visible.current = null;
          setCurrent(null);
        }
      }, reduceRef.current ? FADE_REDUCED_MS : OUT_SETTLE_MS);
    };

    const show = (options: HudShowOptions) => {
      const shown = visible.current;
      if (
        phase.current === 'showing' &&
        shown &&
        shown.message === options.message &&
        shown.monoPrefix === options.monoPrefix &&
        queue.current.length === 0
      ) {
        // The same news again (realtime often repeats itself): keep it up a little longer.
        shownAt.current = Date.now();
        scheduleHide(options.duration ?? shown.duration ?? durationRef.current);
        return;
      }
      seq.current += 1;
      const item: HudItem = { ...options, key: seq.current };
      if (phase.current === 'idle') {
        present(item);
        return;
      }
      queue.current.push(item);
      if (queue.current.length > MAX_QUEUE) queue.current.shift();
      if (phase.current === 'showing') {
        const elapsed = Date.now() - shownAt.current;
        scheduleHide(MIN_VISIBLE_MS - elapsed);
      }
    };

    const hide = () => {
      queue.current = [];
      leave();
    };

    const act = (item: HudItem) => {
      item.onAction?.();
      if (visible.current?.key === item.key) leave();
    };

    return { show, hide, act };
  }, [animateTo, progress]);

  useEffect(
    () => () => {
      clearTimer(hideTimer);
      clearTimer(advanceTimer);
    },
    [],
  );

  const api = useMemo<HudApi>(() => ({ show: machine.show, hide: machine.hide }), [machine]);

  const lift = theme.space[6];
  const animated = useAnimatedStyle(() => {
    const p = progress.get();
    return {
      opacity: Math.min(1, Math.max(0, p)),
      transform: reduce ? [] : [{ translateY: -(1 - p) * lift }, { scale: FROM_SCALE + (1 - FROM_SCALE) * p }],
    };
  });

  const top = topOffset ?? insets.top + theme.space[2];

  return (
    <HudContext.Provider value={api}>
      <View style={{ flex: 1 }}>
        {children}
        {/* Mounted per toast: on iOS the overlay joins the window when it mounts, so it lands above any
            native modal or sheet presented since (WindowOverlay). */}
        {current ? (
          <WindowOverlay>
            <View
              pointerEvents="box-none"
              style={{
                position: 'absolute',
                left: theme.size.gutter,
                right: theme.size.gutter,
                top: top - (theme.size.tapMin - theme.size.hud) / 2,
                alignItems: 'center',
              }}
            >
              <Animated.View
                key={current.key}
                style={[{ maxWidth: '100%' }, animated]}
                pointerEvents="box-none"
              >
                <HudToast
                  message={current.message}
                  monoPrefix={current.monoPrefix}
                  actionLabel={current.actionLabel}
                  tone={current.tone}
                  onAction={current.onAction ? () => machine.act(current) : undefined}
                />
              </Animated.View>
            </View>
          </WindowOverlay>
        ) : null}
      </View>
    </HudContext.Provider>
  );
}

/** `show({ message, monoPrefix?, actionLabel?, onAction?, tone?, duration? })` and `hide()`. */
export function useHud(): HudApi {
  const ctx = useContext(HudContext);
  if (!ctx) throw new Error('useHud outside HudProvider');
  return ctx;
}
