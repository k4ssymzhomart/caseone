// /kit: the Rota web kit as a page (copied from Rota's Kit and adapted): tokens, type, space and shape, kit
// components, forms and tables, page states, the industrial status pills, worker rows and order cards, the chart
// style, HUD toasts, mascots and brand.
// Public: it shows no data.
import { tokens } from '@rota/design';
import appIcon from '@rota/design/assets/app-icon/app-icon-256.png';
import {
  PRIORITIES,
  PRIORITY_LABEL,
  priorityTone,
  STATUS_LABEL,
  STATUSES,
  statusTone,
  VERDICT_LABEL,
  VERDICTS,
  verdictTone,
  WORKER_STATE_LABEL,
  workerStateText,
  workerStateTone,
  type WorkerState,
} from '@rota/shared';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartCard, ChartTooltip } from '@/components/chart';
import { useHud } from '@/components/HudHost';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { OrderCard } from '@/components/orders';
import {
  Button,
  Checkbox,
  Chip,
  Hud,
  Keycap,
  Lockup,
  LogoMark,
  Mascot,
  mascotNames,
  SettingsGroup,
  SettingsRow,
  StatusPill,
  Switch,
} from '@/components/rota';
import {
  Card,
  EmptyState,
  Field,
  FormError,
  Grid,
  Input,
  Kpi,
  Loading,
  Pill,
  Segmented,
  Select,
  StatusDot,
  Table,
  Tag,
  type Column,
} from '@/components/ui';
import { gridProps, series, stackedBarProps, tooltipProps, xAxisProps, yAxisProps } from '@/lib/chart';
import type { OrderCardOrder } from '@/lib/present';
import styles from './Kit.module.css';

const kebab = (name: string) => name.replace(/[/\s]+/g, '-').replace(/\./g, '_').toLowerCase();
const WORKER_STATES: readonly WorkerState[] = ['free', 'working', 'queue', 'off'];
const MIN = 60_000;

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {children}
    </section>
  );
}

function sampleOrders(now: number): OrderCardOrder[] {
  const base = {
    brigade_name: null,
    last_reason: null,
    ai_verdict: null,
    ai_needs_master_review: null,
    final_verdict: null,
    final_score: null,
    done_at: null,
    closed_at: null,
    cancelled_at: null,
    rejected_at: null,
  } as const;
  return [
    {
      ...base,
      id: 1,
      number: 148,
      type: 'unplanned',
      priority: 'emergency',
      status: 'issued',
      description: 'Течь масла',
      equipment_name: 'Насос НШ-32 маслостанции',
      area_name: 'Участок обогащения',
      assignee_short_name: 'Ахметов Е.',
      due_at: new Date(now + 110 * MIN).toISOString(),
      is_overdue: false,
    },
    {
      ...base,
      id: 2,
      number: 147,
      type: 'unplanned',
      priority: 'high',
      status: 'in_progress',
      description: 'Шум подшипника',
      equipment_name: 'Конвейер К-2',
      area_name: 'Участок дробления',
      assignee_short_name: 'Иванов С.',
      due_at: new Date(now - 12 * MIN).toISOString(),
      is_overdue: true,
    },
    {
      ...base,
      id: 3,
      number: 146,
      type: 'planned',
      priority: 'planned',
      status: 'paused',
      last_reason: 'waiting_parts',
      description: 'Замена подшипника по ППР',
      equipment_name: 'Конвейер К-1',
      area_name: 'Участок дробления',
      assignee_short_name: 'Абенов Т.',
      due_at: new Date(now + 300 * MIN).toISOString(),
      is_overdue: false,
    },
    {
      ...base,
      id: 4,
      number: 145,
      type: 'unplanned',
      priority: 'normal',
      status: 'ai_review',
      ai_verdict: 'accepted',
      description: 'Не запускается',
      equipment_name: 'Упаковочная машина УМ-50',
      area_name: 'Участок отгрузки',
      assignee_short_name: 'Ким Д.',
      due_at: new Date(now + 60 * MIN).toISOString(),
      is_overdue: false,
      done_at: new Date(now - 4 * MIN).toISOString(),
    },
  ];
}

const WORKER_SAMPLE = [
  { name: 'Ахметов Е.', role: 'Слесарь 5 разряда', status: 'free', current_order_number: null, queue_count: 0 },
  { name: 'Иванов С.', role: 'Слесарь 4 разряда', status: 'working', current_order_number: 147, queue_count: 0 },
  { name: 'Сериков Д.', role: 'Слесарь 4 разряда', status: 'queue', current_order_number: null, queue_count: 2 },
  { name: 'Литвиненко О.', role: 'Сварщик 5 разряда', status: 'off', current_order_number: null, queue_count: 0 },
] as const;

interface MaterialSample {
  name: string;
  qty: string;
  norm: string;
  over: boolean;
}

const MATERIAL_SAMPLE: readonly MaterialSample[] = [
  { name: 'Кольцо уплотнительное', qty: '2 шт', norm: '4 шт', over: false },
  { name: 'Масло гидравлическое ВМГЗ', qty: '2 л', norm: '6 л', over: false },
  { name: 'Подшипник 22320', qty: '6 шт', norm: '2 шт', over: true },
];

const MATERIAL_COLUMNS: readonly Column<MaterialSample>[] = [
  { key: 'name', header: 'Материал' },
  { key: 'qty', header: 'Факт', mono: true, align: 'right', render: (m) => <span className={styles.nowrap}>{m.qty}</span> },
  {
    key: 'norm',
    header: 'Норма до',
    mono: true,
    align: 'right',
    render: (m) => <span className={styles.nowrap}>{m.norm}</span>,
  },
  {
    key: 'state',
    header: 'Проверка',
    render: (m) => (m.over ? <Pill tone="critical">Перерасход</Pill> : <Pill tone="success">В норме</Pill>),
  },
];

const RATING_SAMPLE = [
  { name: 'Ахметов Е.', q: 31, t: 22, f: 18, v: 8, d: 10 },
  { name: 'Петренко В.', q: 30, t: 21, f: 17, v: 9, d: 9 },
  { name: 'Иванов С.', q: 28, t: 19, f: 16, v: 7, d: 10 },
  { name: 'Сериков Д.', q: 24, t: 18, f: 9, v: 7, d: 9 },
];
const RATING_PARTS = [
  { key: 'q', label: 'Качество' },
  { key: 't', label: 'Срок' },
  { key: 'f', label: 'С первого раза' },
  { key: 'v', label: 'Объём' },
  { key: 'd', label: 'Дисциплина' },
] as const;

/** The design kit as a page: tokens, type, components, industrial pieces, HUD, mascots and brand assets. */
export function Kit() {
  const hud = useHud();
  const [switchOn, setSwitchOn] = useState(true);
  const [checks, setChecks] = useState({ demo: true, scale: false });
  const [segment, setSegment] = useState<'shift' | 'week' | 'month'>('week');
  const [tabNo, setTabNo] = useState('1001');
  const [area, setArea] = useState('');
  const [now] = useState(() => Date.now());
  const orders = sampleOrders(now);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link to="/" className={styles.home} aria-label="Rota">
          <Lockup height={22} color="var(--color-text-primary)" />
        </Link>
        <span className={styles.badge}>Дизайн кит</span>
        <div className={styles.headerRight}>
          <ThemeToggle />
        </div>
      </header>

      <main className={styles.main}>
        <p className={styles.intro}>
          Токены приходят из <code>@rota/design</code> (Rota <code>variables.json</code>), статусные цвета из{' '}
          <code>statusColors</code>, палитра графиков из <code>lib/chart.ts</code>. Тот же язык, что и в мобильном
          приложении.
        </p>

        <Section id="color" title="Цвет">
          <div className={styles.swatches}>
            {Object.keys(tokens.color.light).map((name) => (
              <div key={name} className={styles.swatch}>
                <span className={styles.chipColor} style={{ background: `var(--color-${kebab(name)})` }} />
                <span className={styles.swatchName}>{name}</span>
                <span className={styles.swatchValue}>
                  {tokens.color.light[name as keyof typeof tokens.color.light]} /{' '}
                  {tokens.color.dark[name as keyof typeof tokens.color.dark]}
                </span>
              </div>
            ))}
            {['free', 'working', 'queue', 'off', 'critical', 'success', 'warning', 'info'].map((tone) => (
              <div key={tone} className={styles.swatch}>
                <span className={styles.chipColor} style={{ background: `var(--status-${tone})` }} />
                <span className={styles.swatchName}>status/{tone}</span>
                <span className={styles.swatchValue}>var(--status-{tone})</span>
              </div>
            ))}
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className={styles.swatch}>
                <span className={styles.chipColor} style={{ background: series(i) }} />
                <span className={styles.swatchName}>chart/{i + 1}</span>
                <span className={styles.swatchValue}>series({i})</span>
              </div>
            ))}
          </div>
        </Section>

        <Section id="type" title="Шрифт">
          <div className={styles.typeList}>
            {Object.entries(tokens.typography).map(([name, style]) => (
              <div key={name} className={styles.typeRow}>
                <span className={styles.typeMeta}>
                  {name}
                  <br />
                  {style.size}/{style.lineHeight} {style.weight}
                </span>
                <span className={`t-${kebab(name)} ${styles.typeSample}`}>Наряд выдан, ИИ на контроле</span>
              </div>
            ))}
          </div>
        </Section>

        <Section id="space" title="Отступы и формы">
          <div className={styles.scale}>
            {Object.entries(tokens.space).map(([name, value]) => (
              <div key={name} className={styles.scaleItem}>
                <span className={styles.bar} style={{ width: value }} />
                <span className={styles.swatchName}>
                  space/{name} {value}
                </span>
              </div>
            ))}
          </div>
          <div className={styles.radii}>
            {Object.entries(tokens.shape)
              .filter(([name]) => name.startsWith('radius/'))
              .map(([name, value]) => (
                <div key={name} className={styles.radius} style={{ borderRadius: Math.min(value, 48) }}>
                  <span className={styles.swatchName}>
                    {name} {value}
                  </span>
                </div>
              ))}
          </div>
        </Section>

        <Section id="components" title="Компоненты">
          <div className={styles.grid}>
            <div className={styles.tile}>
              <span className={styles.tileLabel}>Кнопки</span>
              <div className={styles.inline}>
                <Button size="l">Согласен, закрыть</Button>
                <Button variant="secondary">Изменить оценку</Button>
                <Button variant="quiet">Отмена</Button>
                <Button variant="danger">Сбросить демо</Button>
                <Button disabled>Выдать</Button>
              </div>
            </div>
            <div className={styles.tile}>
              <span className={styles.tileLabel}>Клавиши</span>
              <div className={styles.inline}>
                <Keycap label="1" />
                <Keycap label="2" pressed />
                <Keycap label="0" />
                <Keycap label="Esc" name="Escape" />
                <Keycap label="5" size="l" />
              </div>
            </div>
            <div className={styles.tile}>
              <span className={styles.tileLabel}>Переключатель, флажок, чипы, статус</span>
              <div className={styles.inline}>
                <Switch checked={switchOn} onChange={setSwitchOn} label="Пример переключателя" />
                <Checkbox checked={checks.demo} onChange={(demo) => setChecks({ ...checks, demo })}>
                  Демо режим
                </Checkbox>
                <Chip label="М-02" current />
                <Chip label="Г-01" />
                <StatusPill on={false}>Выкл</StatusPill>
                <StatusPill on>Вкл</StatusPill>
              </div>
              <Segmented
                label="Период"
                value={segment}
                onChange={setSegment}
                options={[
                  { value: 'shift', label: 'Смена' },
                  { value: 'week', label: 'Неделя' },
                  { value: 'month', label: 'Месяц' },
                ]}
              />
            </div>
            <div className={styles.tile}>
              <span className={styles.tileLabel}>Строки настроек</span>
              <SettingsGroup>
                <SettingsRow title="Демо режим" subtitle="Новые наряды получают метку демо и срок «1 мин».">
                  <Switch checked={checks.demo} onChange={(demo) => setChecks({ ...checks, demo })} label="Демо режим" />
                </SettingsRow>
                <SettingsRow title="Ускорение времени ×10" subtitle="Только чтобы показать эскалацию.">
                  <Switch checked={checks.scale} onChange={(scale) => setChecks({ ...checks, scale })} label="Ускорение времени" />
                </SettingsRow>
              </SettingsGroup>
            </div>
          </div>
        </Section>

        <Section id="forms" title="Формы и таблицы">
          <div className={styles.grid}>
            <div className={styles.tile}>
              <span className={styles.tileLabel}>Поля</span>
              <Field label="Табельный номер">
                {(id) => (
                  <Input id={id} size="l" inputMode="numeric" value={tabNo} onChange={(e) => setTabNo(e.target.value)} />
                )}
              </Field>
              <Field label="Участок">
                {(id) => (
                  <Select
                    id={id}
                    value={area}
                    onChange={(e) => setArea(e.target.value)}
                    placeholder="Все участки"
                    options={[
                      { value: '1', label: 'Карьер' },
                      { value: '2', label: 'Участок дробления' },
                      { value: '3', label: 'Участок обогащения' },
                      { value: '4', label: 'Участок отгрузки' },
                    ]}
                  />
                )}
              </Field>
              <FormError>Неверный табельный номер или ПИН</FormError>
            </div>
            <div className={styles.tile}>
              <span className={styles.tileLabel}>Таблица</span>
              <Table columns={MATERIAL_COLUMNS} rows={MATERIAL_SAMPLE} rowKey={(m) => m.name} />
            </div>
          </div>
        </Section>

        <Section id="states" title="Состояния страницы">
          <div className={styles.grid}>
            <Card>
              <EmptyState mascot="peek" mascotSize={96} title="Пока нарядов нет" text="Новые наряды появятся здесь сами." />
            </Card>
            <Card>
              <Loading />
            </Card>
          </div>
        </Section>

        <Section id="status" title="Статусы">
          <div className={styles.grid}>
            <div className={styles.tile}>
              <span className={styles.tileLabel}>Исполнители</span>
              <div className={styles.pillRow}>
                {WORKER_STATES.map((s) => (
                  <Pill key={s} tone={workerStateTone(s)}>
                    {WORKER_STATE_LABEL[s]}
                  </Pill>
                ))}
              </div>
              <span className={styles.tileLabel}>Приоритет</span>
              <div className={styles.pillRow}>
                {PRIORITIES.map((p) => (
                  <Pill key={p} tone={priorityTone(p)}>
                    {PRIORITY_LABEL[p]}
                  </Pill>
                ))}
              </div>
              <span className={styles.tileLabel}>Вердикт ИИ</span>
              <div className={styles.pillRow}>
                {VERDICTS.map((v) => (
                  <Pill key={v} tone={verdictTone(v)}>
                    {VERDICT_LABEL[v]}
                  </Pill>
                ))}
              </div>
            </div>
            <div className={styles.tile}>
              <span className={styles.tileLabel}>Статусы наряда</span>
              <div className={styles.pillRow}>
                {STATUSES.map((s) => (
                  <Pill key={s} tone={statusTone(s)}>
                    {STATUS_LABEL[s]}
                  </Pill>
                ))}
              </div>
              <span className={styles.tileLabel}>Метки</span>
              <div className={styles.pillRow}>
                <Tag>М-02</Tag>
                <Tag>ИИ</Tag>
                <Tag tone="critical">Аварийный</Tag>
              </div>
            </div>
          </div>
        </Section>

        <Section id="cards" title="Карточки">
          <div className={styles.workers}>
            {WORKER_SAMPLE.map((w) => (
              <Card key={w.name}>
                <div className={styles.worker}>
                  <span className={styles.workerName}>{w.name}</span>
                  <span className={styles.workerState}>
                    <StatusDot tone={workerStateTone(w.status)} />
                    {workerStateText(w)}
                  </span>
                  <span className={styles.workerRole}>{w.role}</span>
                </div>
              </Card>
            ))}
          </div>
          <div className={styles.cards}>
            {orders.map((o) => (
              <OrderCard key={o.id} order={o} now={new Date(now)} />
            ))}
          </div>
          <div style={{ marginTop: 16 }}>
            <Grid min={180}>
              <Kpi label="Выдано" value="14" />
              <Kpi label="Выполнено" value="9" />
              <Kpi label="Просрочено" value="2" tone="critical" />
              <Kpi label="Оборудование в простое" value="1" hint="Насос НШ-32 маслостанции" />
            </Grid>
          </div>
        </Section>

        <Section id="chart" title="Графики">
          <ChartCard
            title="Рейтинг по компонентам"
            subtitle="Пример данных, баллы из 100"
            legend={RATING_PARTS.map((p, i) => ({ label: p.label, color: series(i) }))}
          >
            <BarChart data={RATING_SAMPLE} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid {...gridProps} horizontal={false} vertical />
              <XAxis {...xAxisProps} type="number" domain={[0, 100]} />
              <YAxis {...yAxisProps} type="category" dataKey="name" width={110} />
              <Tooltip {...tooltipProps} content={(p) => <ChartTooltip {...p} totalLabel="Итого" />} />
              {RATING_PARTS.map((part, i) => (
                <Bar
                  key={part.key}
                  dataKey={part.key}
                  name={part.label}
                  {...stackedBarProps(i, RATING_PARTS.length, 'horizontal')}
                />
              ))}
            </BarChart>
          </ChartCard>
        </Section>

        <Section id="hud" title="HUD">
          <div className={styles.hudGrid}>
            <div className={styles.hudTile}>
              <span className={styles.tileLabel}>Статус</span>
              <Hud monoPrefix="№147" message="В работе" />
            </div>
            <div className={styles.hudTile}>
              <span className={styles.tileLabel}>Уведомление</span>
              <Hud monoPrefix="№148" message="Аварийный наряд" actionLabel="Открыть" tone="critical" />
            </div>
            <div className={styles.hudTile}>
              <span className={styles.tileLabel}>Проверка ИИ</span>
              <Hud monoPrefix="№146" message="Проверка ИИ: принято" />
            </div>
            <div className={styles.hudTile}>
              <span className={styles.tileLabel}>Показать</span>
              <Button
                variant="secondary"
                onClick={() =>
                  hud.show({ monoPrefix: '№149', message: 'Новый наряд', actionLabel: 'Открыть', onAction: () => undefined })
                }
              >
                Показать уведомление
              </Button>
            </div>
          </div>
        </Section>

        <Section id="mascots" title="Маскоты">
          <div className={styles.mascots}>
            {mascotNames.map((name) => (
              <figure key={name} className={styles.mascotTile}>
                <Mascot name={name} size={104} />
                <figcaption>{name}</figcaption>
              </figure>
            ))}
          </div>
        </Section>

        <Section id="brand" title="Бренд">
          <div className={styles.brandRow}>
            <div className={styles.brandTile}>
              <LogoMark size={72} title="Знак Rota" />
              <span className={styles.tileLabel}>Знак</span>
            </div>
            <div className={styles.brandTile}>
              <Lockup height={40} color="var(--color-text-primary)" />
              <span className={styles.tileLabel}>Логотип</span>
            </div>
            <div className={styles.brandTile}>
              <img src={appIcon} width={96} height={96} alt="Иконка приложения Rota" />
              <span className={styles.tileLabel}>Иконка</span>
            </div>
          </div>
        </Section>
      </main>
    </div>
  );
}
