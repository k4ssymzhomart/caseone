// The /kit gallery (PHASE_0 §7.1): tokens, type, every kit component in its states, mascots, brand, HUD.
// Sample domain copy below (equipment, statuses, names) is a design specimen and lives only here.
import {
  androidLogo,
  appleLogo,
  chromeLogo,
  claudeLogo,
  mascotNames,
  safariLogo,
  telegramLogo,
  windowsLogo,
  type StatusTone,
  type TypeVariant,
} from '@rota/design';
import { useRouter } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';

import { KIT_PHOTO_URIS } from '@/features/kit/photos';
import { t } from '@/lib/i18n';
import { RoleGate } from '@/lib/roleGate';
import { useTheme, useThemePreference, type ThemePreference } from '@/lib/theme';
import {
  ActionList,
  Avatar,
  Banner,
  Button,
  Card,
  Checkbox,
  CheckRow,
  Chip,
  Counter,
  EmptyState,
  Eyebrow,
  HudToast,
  Keycap,
  Keypad,
  ListGroup,
  ListRow,
  Lockup,
  LOGO_SIZE,
  LogoMark,
  Mascot,
  OrderCard,
  PhotoTile,
  Pill,
  PinDots,
  PlatformLogo,
  ScoreBadge,
  Screen,
  Segmented,
  SheetHeader,
  StatusDot,
  Stepper,
  Switch,
  T,
  TabBar,
  Tag,
  TapCounter,
  TextArea,
  TextField,
  Timeline,
  useHud,
  type ButtonVariant,
  type OrderCardProps,
  type PhotoTileItem,
  type PillTone,
  type SegmentedItem,
  type TagTone,
  type TimelineItem,
} from '@/ui';

// Placeholder photos from the app's own assets.
const PHOTO_URIS = KIT_PHOTO_URIS;

/** Mascot tiles stay at the smallest screen size of PHASE_0 §6.11 (96) or less on narrow phones. */
const MASCOT_MAX = 96;
const MASCOT_COLUMNS = 3;
const DEMO_PIN = '1111';
const PIN_LENGTH = 4;
/** The dots keep their fill while they shake (PinDots shakes for 400 ms), then clear. */
const PIN_CLEAR_MS = 450;
const LOADING_DEMO_MS = 1500;
/** The platform and service marks the app shows (docs/design.md §10), one row. */
const KIT_LOGOS = [
  telegramLogo,
  androidLogo,
  appleLogo,
  chromeLogo,
  safariLogo,
  windowsLogo,
  claudeLogo,
] as const;

export default function KitScreen() {
  // The root layout hosts the HudProvider (toasts at the top), so the kit uses it directly.
  // Linked from the master, manager and admin tools.
  return (
    <RoleGate allow={['master', 'manager', 'admin']}>
      <KitContent />
    </RoleGate>
  );
}

function KitContent() {
  const theme = useTheme();
  const router = useRouter();
  return (
    <Screen
      title={t('kit.title')}
      eyebrow={t('kit.eyebrow')}
      right={
        router.canGoBack() ? (
          <Button
            label={t('common.close')}
            variant="secondary"
            size="S"
            onPress={() => router.back()}
          />
        ) : undefined
      }
      bottomPadding={theme.size.tapMin + theme.space[4]}
    >
      <ThemeSection />
      <TokensSection />
      <TypeSection />
      <ButtonsSection />
      <ControlsSection />
      <ListsSection />
      <OrdersSection />
      <AiSection />
      <InputSection />
      <PhotosSection />
      <FeedbackSection />
      <BrandSection />
      <MascotsSection />
      <StatusSection />
    </Screen>
  );
}

/* ------------------------------------------------------------------ layout helpers */

function Section({ title, children }: { title: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ marginTop: theme.space[8], gap: theme.space[5] }}>
      <T variant="title2" accessibilityRole="header">
        {title}
      </T>
      {children}
    </View>
  );
}

function Sub({ label, children }: { label: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.space[3] }}>
      <Eyebrow>{label}</Eyebrow>
      {children}
    </View>
  );
}

function Wrap({ children, gap }: { children: ReactNode; gap?: number }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: gap ?? theme.space[2],
      }}
    >
      {children}
    </View>
  );
}

function useContentWidth(): number {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  return width - theme.size.gutter * 2;
}

function columnWidth(total: number, columns: number, gap: number): number {
  return Math.floor((total - gap * (columns - 1)) / columns);
}

/** Russian plural: 1 нажатие, 2 нажатия, 5 нажатий. */
function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

/* ------------------------------------------------------------------ theme */

function ThemeSection() {
  const [preference, setPreference] = useThemePreference();
  const items: SegmentedItem<ThemePreference>[] = [
    { key: 'dark', label: t('kit.themeDark') },
    { key: 'light', label: t('kit.themeLight') },
    { key: 'system', label: t('kit.themeSystem') },
  ];
  return (
    <Sub label={t('kit.theme')}>
      <Segmented
        items={items}
        value={preference}
        onChange={setPreference}
        scrollable
        accessibilityLabel={t('kit.theme')}
      />
    </Sub>
  );
}

/* ------------------------------------------------------------------ tokens */

function Swatch({
  name,
  value,
  soft,
  width,
}: {
  name: string;
  value: string;
  soft?: string;
  width: number;
}) {
  const theme = useTheme();
  const chip = {
    flex: 1,
    backgroundColor: value,
  } as const;
  return (
    <View style={{ width, gap: theme.space[1] }}>
      <View
        style={{
          height: theme.space[12],
          flexDirection: 'row',
          borderRadius: theme.radius.sm,
          overflow: 'hidden',
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.color.borderStrong,
        }}
      >
        <View style={chip} />
        {soft ? <View style={{ flex: 1, backgroundColor: soft }} /> : null}
      </View>
      <T variant="monoM" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {name}
      </T>
      <T variant="monoM" tone="secondary" numberOfLines={1}>
        {value}
      </T>
    </View>
  );
}

function TokensSection() {
  const theme = useTheme();
  const total = useContentWidth();
  const gap = theme.space[3];
  const columns = total >= 600 ? 4 : 2;
  const w = columnWidth(total, columns, gap);
  const statusTones = Object.keys(theme.status) as StatusTone[];
  const radii = ['xs', 'sm', 'md', 'lg', 'xl', 'full'] as const;
  const spaces = Object.entries(theme.space);

  return (
    <Section title={t('kit.tokens')}>
      <Sub label={`color · ${theme.mode}`}>
        <Wrap gap={gap}>
          {Object.entries(theme.color).map(([name, value]) => (
            <Swatch key={name} name={name} value={value} width={w} />
          ))}
        </Wrap>
      </Sub>
      <Sub label="status · statusSoft">
        <Wrap gap={gap}>
          {statusTones.map((tone) => (
            <Swatch
              key={tone}
              name={tone}
              value={theme.status[tone]}
              soft={theme.statusSoft[tone]}
              width={w}
            />
          ))}
        </Wrap>
      </Sub>
      <Sub label="radius">
        <Wrap gap={theme.space[4]}>
          {radii.map((r) => (
            <View key={r} style={{ alignItems: 'center', gap: theme.space[1] }}>
              <View
                style={{
                  width: theme.size.tapMin,
                  height: theme.size.tapMin,
                  borderRadius: theme.radius[r],
                  backgroundColor: theme.color.bgMuted,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: theme.color.borderStrong,
                }}
              />
              <T variant="monoM" tone="secondary">
                {r}
              </T>
            </View>
          ))}
        </Wrap>
      </Sub>
      <Sub label="space">
        <View style={{ gap: theme.space[2] }}>
          {spaces.map(([k, v]) => (
            <View
              key={k}
              style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3] }}
            >
              <T variant="monoM" tone="secondary" style={{ width: theme.space[24] }}>
                {`${k} · ${v}`}
              </T>
              <View
                style={{
                  width: v,
                  height: theme.space[2],
                  borderRadius: theme.radius.full,
                  backgroundColor: theme.color.bgAccent,
                }}
              />
            </View>
          ))}
        </View>
      </Sub>
    </Section>
  );
}

/* ------------------------------------------------------------------ type */

function TypeSection() {
  const theme = useTheme();
  const variants = Object.keys(theme.type) as TypeVariant[];
  const sample = (v: TypeVariant) =>
    v === 'monoDisplay'
      ? '86'
      : v.startsWith('mono')
        ? '№147 · 11:30 · М-02'
        : t('kit.sample.typeSample');
  return (
    <Section title={t('kit.type')}>
      <Card style={{ gap: theme.space[5] }}>
        {variants.map((v) => (
          <View key={v} style={{ gap: theme.space[1] }}>
            <T variant="monoM" tone="secondary">
              {`${v} · ${theme.type[v].fontSize}/${theme.type[v].lineHeight}`}
            </T>
            <T variant={v}>{sample(v)}</T>
          </View>
        ))}
      </Card>
    </Section>
  );
}

/* ------------------------------------------------------------------ buttons */

const BUTTON_SAMPLES: readonly { variant: ButtonVariant; label: string }[] = [
  { variant: 'primary', label: 'Принять' },
  { variant: 'secondary', label: 'В очередь' },
  { variant: 'ghost', label: 'Позже' },
  { variant: 'danger', label: 'Отклонить' },
];

function ButtonsSection() {
  const theme = useTheme();
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const startLoading = () => {
    setLoading(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setLoading(false), LOADING_DEMO_MS);
  };

  return (
    <Section title={t('kit.buttons')}>
      {BUTTON_SAMPLES.map(({ variant, label }) => (
        <Sub key={variant} label={`${variant} · L M S`}>
          <Wrap gap={theme.space[4]}>
            <Button label={label} variant={variant} size="L" />
            <Button label={label} variant={variant} size="M" />
            <Button label={label} variant={variant} size="S" />
          </Wrap>
        </Sub>
      ))}
      <Sub label="full · loading · disabled">
        <View style={{ gap: theme.space[3] }}>
          <Button
            label="Отправить на проверку"
            size="L"
            full
            loading={loading}
            onPress={startLoading}
          />
          <Button label="Принять в работу" size="L" full loading />
          <Wrap gap={theme.space[4]}>
            <Button label="Начать" disabled />
            <Button label="В очередь" variant="secondary" disabled />
            <Button label="Отклонить" variant="danger" disabled />
          </Wrap>
        </View>
      </Sub>
      <Sub label="glyphs">
        <Wrap gap={theme.space[4]}>
          <Button label="Добавить материал" variant="secondary" left="+" />
          <Button label={t('common.next')} right="›" />
          <Button label={t('common.back')} variant="ghost" left="‹" />
        </Wrap>
      </Sub>
      <Sub label="onDanger · ghostOnDanger">
        <View
          style={{
            backgroundColor: theme.color.bgAccent,
            borderRadius: theme.radius.lg,
            padding: theme.space[6],
            gap: theme.space[2],
          }}
        >
          <Eyebrow tone="onAccent">№148 · ДО 11:30</Eyebrow>
          <T variant="title1" tone="onAccent">
            Аварийный наряд
          </T>
          <T variant="bodyL" tone="onAccent" style={{ marginBottom: theme.space[4] }}>
            Насос НШ-32 маслостанции, Участок обогащения
          </T>
          <Button label="Принять" variant="onDanger" size="L" full />
          <Button label="Отклонить" variant="ghostOnDanger" size="L" full />
          <Wrap gap={theme.space[4]}>
            <Button label="Принять" variant="onDanger" size="M" />
            <Button label="Отклонить" variant="ghostOnDanger" size="S" />
          </Wrap>
        </View>
      </Sub>
    </Section>
  );
}

/* ------------------------------------------------------------------ controls */

const BOARD_COLUMNS = [
  { key: 'issued', label: 'Выданы', count: 3 },
  { key: 'accepted', label: 'Приняты', count: 1 },
  { key: 'queued', label: 'В очереди', count: 2 },
  { key: 'working', label: 'В работе', count: 4 },
  { key: 'done', label: 'Выполнены', count: 7 },
  { key: 'overdue', label: 'Просрочены', count: 2, tone: 'critical' },
] as const satisfies readonly SegmentedItem[];
type BoardColumn = (typeof BOARD_COLUMNS)[number]['key'];

const FAULT_GROUPS = [
  { key: 'М', label: 'М' },
  { key: 'Э', label: 'Э' },
  { key: 'Г', label: 'Г' },
  { key: 'П', label: 'П' },
  { key: 'С', label: 'С' },
] as const satisfies readonly SegmentedItem[];
type FaultGroup = (typeof FAULT_GROUPS)[number]['key'];

type Preset = 'emergency' | 'unplanned' | 'planned';

function ControlsSection() {
  const theme = useTheme();
  const [demo, setDemo] = useState(true);
  const [speed, setSpeed] = useState(false);
  const [noMaterials, setNoMaterials] = useState(true);
  const [stopped, setStopped] = useState(false);
  const [column, setColumn] = useState<BoardColumn>('working');
  const [group, setGroup] = useState<FaultGroup>('Г');
  const [picker, setPicker] = useState<'workers' | 'brigades'>('workers');
  const [preset, setPreset] = useState<Preset>('emergency');
  const [area, setArea] = useState(true);
  const [rings, setRings] = useState(2);
  const [oil, setOil] = useState(2);
  const [tabNo, setTabNo] = useState('');
  const [reason, setReason] = useState('');
  const [deadline, setDeadline] = useState('120');
  const [works, setWorks] = useState('');

  return (
    <Section title={t('kit.controls')}>
      <Sub label="Switch · on off disabled">
        <Wrap gap={theme.space[6]}>
          <Switch value={demo} onValueChange={setDemo} accessibilityLabel="Демо режим" />
          <Switch
            value={speed}
            onValueChange={setSpeed}
            accessibilityLabel="Ускорение времени ×10"
          />
          <Switch value disabled accessibilityLabel="Недоступно" />
          <Switch value={false} disabled accessibilityLabel="Недоступно" />
        </Wrap>
      </Sub>

      <Sub label="Checkbox">
        <Card padded={false} style={{ paddingHorizontal: theme.space[4] }}>
          <Checkbox label="Без материалов" checked={noMaterials} onChange={setNoMaterials} />
          <Checkbox
            label="Оборудование остановлено"
            sublabel="Агрегат попадёт в простой"
            checked={stopped}
            onChange={setStopped}
          />
          <Checkbox label="Недоступно" checked disabled />
        </Card>
      </Sub>

      <Sub label="Segmented · scrollable · counts">
        <Segmented items={BOARD_COLUMNS} value={column} onChange={setColumn} scrollable />
        <Segmented items={FAULT_GROUPS} value={group} onChange={setGroup} />
        <Segmented
          items={[
            { key: 'workers', label: 'Исполнители', count: 9 },
            { key: 'brigades', label: 'Бригады', count: 3 },
          ]}
          value={picker}
          onChange={setPicker}
        />
      </Sub>

      <Sub label="Chip · critical · count · sublabel · disabled">
        <Wrap>
          <Chip
            label="Аварийный"
            variant="critical"
            selected={preset === 'emergency'}
            onPress={() => setPreset('emergency')}
          />
          <Chip
            label="Внеплановый"
            selected={preset === 'unplanned'}
            onPress={() => setPreset('unplanned')}
          />
          <Chip
            label="Плановый"
            selected={preset === 'planned'}
            onPress={() => setPreset('planned')}
          />
        </Wrap>
        <Wrap>
          <Chip
            label="Участок дробления"
            count={7}
            selected={area}
            onPress={() => setArea(!area)}
          />
          <Chip label="Насос НШ-32" sublabel="Участок обогащения" onPress={() => undefined} />
          <Chip label="Течь масла" disabled />
        </Wrap>
      </Sub>

      <Sub label="Stepper">
        <ListGroup>
          <ListRow
            title="Кольцо уплотнительное"
            subtitle="Норма до 4 шт"
            right={
              <Stepper
                value={rings}
                onChange={setRings}
                max={4}
                unit="шт"
                accessibilityLabel="Кольцо уплотнительное"
              />
            }
          />
          <ListRow
            title="Масло ВМГЗ"
            subtitle="Норма до 6 л"
            right={
              <Stepper
                value={oil}
                onChange={setOil}
                step={0.5}
                max={6}
                unit="л"
                accessibilityLabel="Масло ВМГЗ"
              />
            }
          />
          <ListRow
            title="Ветошь"
            right={
              <Stepper
                value={1}
                onChange={() => undefined}
                unit="кг"
                disabled
                accessibilityLabel="Ветошь"
              />
            }
          />
        </ListGroup>
      </Sub>

      <Sub label="TextField · TextArea">
        <TextField
          label="Табельный номер"
          placeholder="2001"
          keyboardType="number-pad"
          value={tabNo}
          onChangeText={setTabNo}
        />
        <TextField
          label="Причина"
          placeholder="Опишите причину"
          value={reason}
          onChangeText={setReason}
          error={reason.length === 0 ? 'Укажите причину' : undefined}
        />
        <TextField
          label="Срок"
          keyboardType="number-pad"
          value={deadline}
          onChangeText={setDeadline}
          right={
            <T variant="monoM" tone="secondary">
              мин
            </T>
          }
        />
        <TextField label="Мастер" value="Жумабаев Н." editable={false} />
        <TextArea
          label="Что сделано"
          placeholder="Заменил кольцо уплотнительное, долил масло"
          value={works}
          onChangeText={setWorks}
          maxLength={500}
          counter
        />
      </Sub>
    </Section>
  );
}

/* ------------------------------------------------------------------ lists */

function ListsSection() {
  const theme = useTheme();
  const hud = useHud();
  const [onShift, setOnShift] = useState(true);
  const backdrop = theme.color.bgSubtle;

  return (
    <Section title={t('kit.lists')}>
      <ListGroup header="Профиль" footer="Push приходит и на заблокированный телефон">
        <ListRow
          title="На смене"
          right={
            <Switch value={onShift} onValueChange={setOnShift} accessibilityLabel="На смене" />
          }
        />
        <ListRow title="Уведомления" right={<Pill label={t('notif.pushReady')} tone="success" />} />
        <ListRow title="Участок" value="Участок обогащения" />
        <ListRow title="Шифр" value="М-02" mono />
        <ListRow
          title="История оборудования"
          onPress={() => hud.show({ message: 'История оборудования' })}
        />
        <ListRow title="Подключить Telegram" onPress={() => undefined} disabled />
        <ListRow title="Выйти" destructive onPress={() => hud.show({ message: 'Выйти' })} />
      </ListGroup>

      <ListGroup
        header="Смена"
        separatorInset={theme.space[4] + theme.size.avatar + theme.space[3]}
      >
        <ListRow
          density="worker"
          left={<Avatar name="Ахметов Ерлан" status="free" backdropColor={backdrop} />}
          title="Ахметов Е."
          subtitle="Слесарь 5 разряда"
          right={<Pill label="Свободен" tone="free" />}
          onPress={() => hud.show({ message: 'Ахметов Е.' })}
        />
        <ListRow
          density="worker"
          left={<Avatar name="Иванов Сергей" status="working" backdropColor={backdrop} />}
          title="Иванов С."
          subtitle="Выполняет наряд №147"
          right={<Pill label="В работе" tone="working" />}
        />
        <ListRow
          density="worker"
          left={<Avatar name="Сериков Данияр" status="queue" backdropColor={backdrop} />}
          title="Сериков Д."
          subtitle="Слесарь 4 разряда"
          right={<Pill label="В очереди 2" tone="queue" />}
        />
        <ListRow
          density="worker"
          left={<Avatar name="Литвиненко Олег" status="off" backdropColor={backdrop} />}
          title="Литвиненко О."
          subtitle="Сварщик 5 разряда"
          right={<Pill label="Не на смене" tone="off" />}
        />
      </ListGroup>

      <Sub label="Card">
        <Card style={{ gap: theme.space[1] }}>
          <Eyebrow>Сводка смены</Eyebrow>
          <T variant="headline">12 нарядов выдано</T>
          <T variant="callout" tone="secondary">
            7 выполнено, 2 просрочено
          </T>
        </Card>
        <Card
          onPress={() => hud.show({ message: 'Карточка нажата' })}
          accessibilityLabel="Конвейер К-3"
          style={{ gap: theme.space[1] }}
        >
          <T variant="headline">Конвейер К-3</T>
          <T variant="callout" tone="secondary">
            История ремонтов и простой ›
          </T>
        </Card>
      </Sub>
    </Section>
  );
}

/* ------------------------------------------------------------------ orders */

const ORDER_SAMPLES: readonly (Omit<OrderCardProps, 'onPress'> & { key: string; n: string })[] = [
  {
    key: 'emergency',
    n: '№148',
    eyebrow: '№148 · АВАРИЙНЫЙ · ДО 11:30',
    equipment: 'Насос НШ-32 маслостанции',
    subtitle: 'Участок обогащения · Течь масла',
    priority: 'emergency',
    timeLeft: '−12 мин',
    overdue: true,
    statusLabel: 'В работе',
    statusTone: 'working',
    badge: 'Просрочен на 12 мин',
    badgeTone: 'critical',
    person: 'Ахметов Е.',
  },
  {
    key: 'high',
    n: '№147',
    eyebrow: '№147 · ВНЕПЛАНОВЫЙ · ДО 14:30',
    equipment: 'Конвейер К-1',
    subtitle: 'Участок дробления · Шум подшипника',
    priority: 'high',
    timeLeft: '1:20',
    statusLabel: 'Приостановлен',
    statusTone: 'off',
    badge: 'Пауза: Ожидание запчастей',
    badgeTone: 'warning',
    person: 'Абенов Т.',
  },
  {
    key: 'normal',
    n: '№146',
    eyebrow: '№146 · ВНЕПЛАНОВЫЙ',
    equipment: 'Конвейер К-2',
    subtitle: 'Участок дробления · Шум подшипника',
    priority: 'normal',
    statusLabel: 'Проверка ИИ',
    statusTone: 'info',
    badge: 'Ждёт подтверждения',
    badgeTone: 'info',
    person: 'Иванов С.',
  },
  {
    key: 'rejected',
    n: '№145',
    eyebrow: '№145 · ВНЕПЛАНОВЫЙ · ДО 16:00',
    equipment: 'Грохот ГИЛ-52',
    subtitle: 'Участок дробления · Вибрация',
    priority: 'normal',
    timeLeft: '3:40',
    statusLabel: 'Отклонён',
    statusTone: 'critical',
    badge: 'Нет допуска',
    badgeTone: 'neutral',
    person: 'Сериков Д.',
  },
  {
    key: 'planned',
    n: '№152',
    eyebrow: '№152 · ПЛАНОВЫЙ · ДО 20:00',
    equipment: 'Дробилка КМД-1750 №2',
    subtitle: 'Участок дробления · Смазка узлов',
    priority: 'planned',
    timeLeft: '6:00',
    statusLabel: 'В очереди',
    statusTone: 'queue',
    person: 'Касымов Б.',
  },
];

function OrdersSection() {
  const theme = useTheme();
  const hud = useHud();
  return (
    <Section title={t('kit.orders')}>
      <View style={{ gap: theme.space[3] }}>
        {ORDER_SAMPLES.map(({ key, n, ...card }) => (
          <OrderCard
            key={key}
            {...card}
            rightTop={key === 'normal' ? <Tag label="М-02" /> : undefined}
            onPress={() =>
              hud.show({
                monoPrefix: n,
                message: card.statusLabel,
                tone: card.priority === 'emergency' ? 'critical' : 'default',
              })
            }
          />
        ))}
      </View>
    </Section>
  );
}

/* ------------------------------------------------------------------ AI */

const CHECKS = [
  {
    status: 'pass',
    title: 'Полнота',
    message: 'Все поля заполнены, фото после есть',
    points: '20 из 20',
    statusLabel: 'Пройдено',
  },
  {
    status: 'warn',
    title: 'Материалы',
    message: 'Масло ВМГЗ выше среднего по шифру Г-01',
    points: '12 из 15',
    statusLabel: 'Замечание',
  },
  {
    status: 'fail',
    title: 'Фото',
    message: 'Нет фото после: обязательно для внеплановых работ',
    points: '0 из 10',
    statusLabel: 'Не пройдено',
  },
  {
    status: 'info',
    title: 'Работы и фото',
    message: 'ИИ не уверен в оценке, нужна проверка мастером',
    statusLabel: 'Информация',
  },
  {
    status: 'skipped',
    title: 'Соответствие шифра',
    message: 'Не выполнено',
    statusLabel: 'Пропущено',
  },
] as const;

const TIMELINE: readonly TimelineItem[] = [
  { id: '1', time: '08:12', title: 'Жумабаев Н.', subtitle: 'Выдал наряд' },
  { id: '2', time: '08:14', title: 'Ахметов Е.', subtitle: 'Принял в работу', tone: 'info' },
  { id: '3', time: '08:15', title: 'Ахметов Е.', subtitle: 'Начал исполнение', tone: 'working' },
  {
    id: '4',
    time: '09:02',
    title: 'Ахметов Е.',
    subtitle: 'Приостановил: ожидание запчастей',
    tone: 'warning',
  },
  { id: '5', time: '10:05', title: 'Система', subtitle: 'Просрочен на 12 мин', tone: 'critical' },
  { id: '6', time: '10:40', title: 'Ахметов Е.', subtitle: 'Исполнено', tone: 'queue' },
  { id: '7', time: '10:41', title: 'ИИ', subtitle: 'Принято, 86 баллов', tone: 'success' },
];

function AiSection() {
  const theme = useTheme();
  return (
    <Section title={t('kit.ai')}>
      <Sub label="ScoreBadge">
        <View style={{ gap: theme.space[3] }}>
          <Card>
            <ScoreBadge
              score={86}
              outOfLabel="из 100"
              verdictLabel="Принято"
              verdictTone="success"
              secondary="4 из 5 · 86%"
            />
          </Card>
          <Card>
            <ScoreBadge
              score={72}
              outOfLabel="из 100"
              verdictLabel="Принято с замечаниями"
              verdictTone="warning"
              secondary="4 из 5"
            />
          </Card>
          <Card>
            <ScoreBadge
              score={42}
              outOfLabel="из 100"
              verdictLabel="Требует доработки"
              verdictTone="critical"
              align="center"
            />
          </Card>
          <Card>
            <ScoreBadge
              score="…"
              outOfLabel="из 100"
              verdictLabel="Нужна проверка мастером"
              verdictTone="info"
              align="center"
            />
          </Card>
        </View>
      </Sub>
      <ListGroup
        header="CheckRow"
        separatorInset={theme.space[4] + theme.space[6] + theme.space[3]}
      >
        {CHECKS.map((c) => (
          <CheckRow key={c.status} {...c} />
        ))}
      </ListGroup>
      <Sub label="Timeline">
        <Card>
          <Timeline items={TIMELINE} />
        </Card>
      </Sub>
    </Section>
  );
}

/* ------------------------------------------------------------------ input */

const REASONS = [
  { key: 'no_materials', label: 'Нет материалов' },
  { key: 'no_permit', label: 'Нет допуска' },
  { key: 'busy_emergency', label: 'Занят аварийным', sublabel: 'Наряд №148' },
  { key: 'equipment_running', label: 'Оборудование работает' },
  { key: 'other', label: 'Другое', sublabel: 'Откроется поле для комментария' },
  { key: 'locked', label: 'Недоступно', disabled: true },
] as const;

const WORKER_TABS = [
  { name: 'index', title: 'Наряды' },
  { name: 'closed', title: 'Закрытые' },
  { name: 'profile', title: 'Профиль' },
] as const;

const MASTER_TABS = [
  { name: 'index', title: 'Смена' },
  { name: 'board', title: 'Доска' },
  { name: 'create-tab', title: 'Выдать' },
  { name: 'profile', title: 'Профиль' },
] as const;

function InputSection() {
  const theme = useTheme();
  const hud = useHud();
  const [pin, setPin] = useState('');
  const [errorKey, setErrorKey] = useState<number | null>(null);
  const [reason, setReason] = useState<string | null>('no_permit');
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (clearTimer.current) clearTimeout(clearTimer.current);
    },
    [],
  );

  const check = () => {
    if (pin.length < PIN_LENGTH) return;
    if (pin === DEMO_PIN) {
      hud.show({ message: 'ПИН принят' });
      setPin('');
      return;
    }
    setErrorKey((k) => (k ?? 0) + 1);
    if (clearTimer.current) clearTimeout(clearTimer.current);
    clearTimer.current = setTimeout(() => setPin(''), PIN_CLEAR_MS);
  };

  return (
    <Section title={t('kit.input')}>
      <Sub label={`PinDots · Keypad · ${DEMO_PIN}`}>
        <View style={{ gap: theme.space[6], paddingVertical: theme.space[2] }}>
          <PinDots
            filled={pin.length}
            length={PIN_LENGTH}
            errorKey={errorKey}
            accessibilityLabel={`Введено ${pin.length} из ${PIN_LENGTH}`}
          />
          <Keypad
            onDigit={(d) => setPin((p) => (p.length < PIN_LENGTH ? p + d : p))}
            onErase={() => setPin((p) => p.slice(0, -1))}
            onNext={check}
            eraseLabel={t('common.erase')}
            nextLabel={t('common.next')}
            eraseDisabled={pin.length === 0}
            nextDisabled={pin.length < PIN_LENGTH}
          />
        </View>
      </Sub>

      <Sub label="Keycap · inverse · disabled">
        <Wrap>
          <Keycap label="7" />
          <Keycap label={t('common.erase')} />
          <Keycap label={t('common.next')} variant="inverse" />
          <Keycap label="0" disabled />
        </Wrap>
        <PinDots filled={2} tone="critical" accessibilityLabel="Введено 2 из 4" />
      </Sub>

      <Sub label="SheetHeader · ActionList">
        <View
          style={[
            {
              backgroundColor: theme.color.bgElevated,
              borderRadius: theme.radius.lg,
              overflow: 'hidden',
              paddingBottom: theme.space[4],
              borderWidth: theme.mode === 'light' ? StyleSheet.hairlineWidth : 0,
              borderColor: theme.color.borderDefault,
            },
            theme.shadow.float,
          ]}
        >
          <SheetHeader
            title="Причина отказа"
            subtitle="Мастер получит уведомление"
            closeLabel={t('common.close')}
            onClose={() => setReason(null)}
          />
          <ActionList items={REASONS} value={reason} onSelect={setReason} />
          <View style={{ paddingHorizontal: theme.size.gutter, paddingTop: theme.space[4] }}>
            <Button label={t('common.confirm')} size="L" full disabled={!reason} />
          </View>
        </View>
      </Sub>

      <Sub label="TabBar">
        <TabBarPreview tabs={WORKER_TABS} />
        <TabBarPreview
          tabs={MASTER_TABS}
          center="create-tab"
          onCenterPress={() => hud.show({ message: 'Выдать' })}
        />
      </Sub>
    </Section>
  );
}

/** The real TabBar driven by a stand-in navigator state, so the kit can show both role bars. */
function TabBarPreview({
  tabs,
  center,
  onCenterPress,
}: {
  tabs: readonly { name: string; title: string }[];
  center?: string;
  onCenterPress?: () => void;
}) {
  const theme = useTheme();
  const [index, setIndex] = useState(0);
  const props = useMemo(() => {
    const routes = tabs.map((tab) => ({ key: tab.name, name: tab.name, params: undefined }));
    const descriptors = Object.fromEntries(
      tabs.map((tab) => [tab.name, { options: { title: tab.title } }]),
    );
    const navigation = {
      emit: () => ({ defaultPrevented: false }),
      navigate: (name: string) =>
        setIndex(
          Math.max(
            0,
            tabs.findIndex((tab) => tab.name === name),
          ),
        ),
    };
    const insets = { top: 0, right: 0, bottom: 0, left: 0 };
    // A stand-in for the navigator's props: only the fields TabBar reads are filled.
    return {
      state: { index, routes },
      descriptors,
      navigation,
      insets,
    } as unknown as BottomTabBarProps;
  }, [tabs, index]);

  return (
    <View
      style={{
        height: theme.size.tabBar,
        borderRadius: theme.radius.md,
        overflow: 'hidden',
        backgroundColor: theme.color.bgSubtle,
      }}
    >
      <TabBar {...props} centerRouteName={center} onCenterPress={onCenterPress} />
    </View>
  );
}

/* ------------------------------------------------------------------ photos */

function PhotosSection() {
  const hud = useHud();
  const [photos, setPhotos] = useState<PhotoTileItem[]>([
    { id: 'p1', uri: PHOTO_URIS[0] },
    { id: 'p2', uri: PHOTO_URIS[1], uploading: true },
    { id: 'p3', uri: PHOTO_URIS[2], error: true },
  ]);
  const seq = useRef(photos.length);

  return (
    <Section title={t('kit.photos')}>
      <Sub label="PhotoTile · add · uploading · error">
        <PhotoTile
          photos={photos}
          addLabel={t('common.takePhoto')}
          onAdd={() => {
            seq.current += 1;
            const uri = PHOTO_URIS[seq.current % PHOTO_URIS.length] ?? PHOTO_URIS[0];
            setPhotos((list) => [...list, { id: `p${seq.current}`, uri }]);
          }}
          onRemove={(id) => setPhotos((list) => list.filter((p) => p.id !== id))}
          onOpen={(id) => hud.show({ message: `Фото ${id}` })}
          photoLabel="Фото"
          removeLabel="Удалить фото"
          errorLabel="Ошибка"
        />
      </Sub>
      <Sub label="PhotoTile · readOnly">
        <PhotoTile
          readOnly
          photos={[
            { id: 'r1', uri: PHOTO_URIS[0] },
            { id: 'r2', uri: PHOTO_URIS[1] },
          ]}
          onOpen={(id) => hud.show({ message: `Фото ${id}` })}
          photoLabel="Фото"
        />
      </Sub>
    </Section>
  );
}

/* ------------------------------------------------------------------ feedback and HUD */

function FeedbackSection() {
  const theme = useTheme();
  const hud = useHud();
  return (
    <Section title={t('kit.feedback')}>
      <Sub label="Banner · warning critical info">
        <Banner text="Без фото после ИИ может вернуть наряд" />
        <Banner
          tone="critical"
          text="Наряд №148 просрочен на 12 мин"
          actionLabel="Открыть"
          onAction={() => hud.show({ monoPrefix: '№148', message: 'Открыть', tone: 'critical' })}
        />
        <Banner tone="info" text="ИИ проверяет наряд, это займёт около 10 секунд" />
      </Sub>

      <Sub label="EmptyState">
        <Card>
          <EmptyState
            mascot="peek"
            title="Пока нарядов нет"
            body="Новые наряды приходят со звуком"
            action={
              <Button
                label={t('common.retry')}
                variant="secondary"
                onPress={() => hud.show({ message: t('common.loading') })}
              />
            }
          />
        </Card>
      </Sub>

      <Sub label={t('kit.hud')}>
        <View style={{ gap: theme.space[2], alignItems: 'center' }}>
          <HudToast monoPrefix="№147" message="В работе" />
          <HudToast monoPrefix="№148" message="Аварийный наряд" tone="critical" />
          <HudToast message="Наряд передан" actionLabel="Открыть" onAction={() => undefined} />
        </View>
        <Wrap gap={theme.space[4]}>
          <Button
            label={t('kit.showHud')}
            variant="secondary"
            onPress={() => hud.show({ monoPrefix: '№147', message: 'В работе' })}
          />
          <Button
            label="Аварийный"
            variant="danger"
            onPress={() =>
              hud.show({
                monoPrefix: '№148',
                message: 'Аварийный наряд',
                tone: 'critical',
                actionLabel: 'Открыть',
                onAction: () => hud.show({ message: 'Открыт наряд №148' }),
              })
            }
          />
          <Button
            label="Три подряд"
            variant="secondary"
            onPress={() => {
              hud.show({ monoPrefix: '№149', message: 'Новый наряд' });
              hud.show({ monoPrefix: '№147', message: 'Скоро срок' });
              hud.show({ monoPrefix: '№146', message: 'Проверка ИИ: принято' });
            }}
          />
          <Button label={t('common.close')} variant="ghost" onPress={() => hud.hide()} />
        </Wrap>
      </Sub>

      <Sub label="TapCounter">
        <TapCounterDemo />
      </Sub>
    </Section>
  );
}

function TapCounterDemo() {
  const theme = useTheme();
  const [taps, setTaps] = useState(0);
  const [start, setStart] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const sec = Math.max(0, Math.floor((now - start) / 1000));
  const clock = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  const text = `${taps} ${plural(taps, 'нажатие', 'нажатия', 'нажатий')} · ${clock}`;
  return (
    <View style={{ gap: theme.space[4] }}>
      <TapCounter text={text} />
      <Wrap gap={theme.space[4]}>
        <Button label="Нажать" variant="secondary" size="S" onPress={() => setTaps((n) => n + 1)} />
        <Button
          label="Сбросить"
          variant="ghost"
          size="S"
          onPress={() => {
            setTaps(0);
            setStart(Date.now());
            setNow(Date.now());
          }}
        />
      </Wrap>
    </View>
  );
}

/* ------------------------------------------------------------------ brand */

function BrandSection() {
  const theme = useTheme();
  const marks = [theme.space[4], theme.space[5], theme.space[8], theme.space[12]];
  return (
    <Section title={t('kit.brand')}>
      <Sub label="LogoMark">
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: theme.space[6] }}>
          {marks.map((s) => (
            <View key={s} style={{ alignItems: 'center', gap: theme.space[2] }}>
              <LogoMark size={s} />
              <T variant="monoM" tone="secondary">
                {String(s)}
              </T>
            </View>
          ))}
        </View>
      </Sub>
      <Sub label="Lockup">
        <View style={{ gap: theme.space[5] }}>
          <Lockup height={theme.space[6]} accessibilityLabel={t('app.name')} />
          <Lockup height={theme.space[8]} />
          <Lockup height={theme.space[12]} />
          <Lockup height={theme.space[8]} color={theme.color.textSecondary} />
        </View>
      </Sub>
      <Sub label="PlatformLogo">
        <Wrap gap={theme.space[5]}>
          {KIT_LOGOS.map((logo) => (
            <PlatformLogo
              key={logo.title}
              logo={logo}
              size={LOGO_SIZE.row}
              accessibilityLabel={logo.title}
            />
          ))}
        </Wrap>
      </Sub>
    </Section>
  );
}

/* ------------------------------------------------------------------ mascots */

function MascotsSection() {
  const theme = useTheme();
  const total = useContentWidth();
  const gap = theme.space[2];
  const w = columnWidth(total, MASCOT_COLUMNS, gap);
  const size = Math.min(MASCOT_MAX, w - theme.space[4] * 2);
  return (
    <Section title={t('kit.mascots')}>
      <Wrap gap={gap}>
        {mascotNames.map((name) => (
          <Card key={name} style={{ width: w, alignItems: 'center', gap: theme.space[2] }}>
            <Mascot name={name} size={size} still />
            <T variant="monoM" tone="secondary" numberOfLines={1}>
              {name}
            </T>
          </Card>
        ))}
      </Wrap>
    </Section>
  );
}

/* ------------------------------------------------------------------ status */

const PILL_SAMPLES: readonly { tone: PillTone; label: string }[] = [
  { tone: 'free', label: 'Свободен' },
  { tone: 'working', label: 'Выполняет наряд №147' },
  { tone: 'queue', label: 'В очереди 2' },
  { tone: 'off', label: 'Не на смене' },
  { tone: 'critical', label: 'Просрочен' },
  { tone: 'success', label: 'Принято' },
  { tone: 'warning', label: 'Принято с замечаниями' },
  { tone: 'info', label: 'Проверка ИИ' },
  { tone: 'neutral', label: 'Выдан' },
];

const TAG_SAMPLES: readonly { tone: TagTone; label: string }[] = [
  { tone: 'neutral', label: 'М-02' },
  { tone: 'critical', label: 'Аварийный' },
  { tone: 'warning', label: 'Высокий' },
  { tone: 'info', label: 'Плановый' },
  { tone: 'accent', label: 'ИИ' },
];

function StatusSection() {
  const theme = useTheme();
  const hud = useHud();
  return (
    <Section title={t('kit.status')}>
      <Sub label="Pill · M">
        <Wrap>
          {PILL_SAMPLES.map((p) => (
            <Pill key={p.tone} label={p.label} tone={p.tone} />
          ))}
        </Wrap>
      </Sub>
      <Sub label="Pill · L">
        <Wrap>
          <Pill size="L" label="Свободен" tone="free" />
          <Pill size="L" label="В работе" tone="working" />
          <Pill size="L" label="На доработку" tone="critical" />
        </Wrap>
      </Sub>
      <Sub label="StatusDot">
        <Wrap gap={theme.space[4]}>
          {PILL_SAMPLES.map((p) => (
            <View
              key={p.tone}
              style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[2] }}
            >
              <StatusDot tone={p.tone} />
              <T variant="callout">{p.tone}</T>
            </View>
          ))}
        </Wrap>
      </Sub>
      <Sub label="Tag">
        <Wrap>
          {TAG_SAMPLES.map((tag) => (
            <Tag
              key={tag.tone}
              label={tag.tone === 'accent' ? t('common.ai') : tag.label}
              tone={tag.tone}
            />
          ))}
        </Wrap>
      </Sub>
      <Sub label="Avatar · dot · ring · sizes">
        <Wrap gap={theme.space[4]}>
          <Avatar name="Ахметов Ерлан" />
          <Avatar name="Иванов С." status="working" />
          <Avatar name="Сериков Данияр" status="queue" statusVariant="ring" />
          <Avatar initials="ЖН" size={theme.size.tapMin} status="free" />
          <Avatar name="Ким Денис" size={theme.size.buttonL} status="off" statusVariant="ring" />
        </Wrap>
      </Sub>
      <Sub label="Counter">
        <Card style={{ gap: theme.space[4] }}>
          <View style={{ flexDirection: 'row', gap: theme.space[4] }}>
            <Counter value={12} label="Выдано" style={{ flex: 1 }} />
            <Counter value={7} label="Выполнено" style={{ flex: 1 }} />
          </View>
          <View style={{ flexDirection: 'row', gap: theme.space[4] }}>
            <Counter value={2} label="Просрочено" bad style={{ flex: 1 }} />
            <Counter
              value={1}
              label="В простое"
              bad
              onPress={() => hud.show({ message: 'Оборудование в простое' })}
              style={{ flex: 1 }}
            />
          </View>
        </Card>
      </Sub>
    </Section>
  );
}
