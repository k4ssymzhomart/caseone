// /admin/settings (admin): the watchdog thresholds and the AI check settings as Rota Settings Rows (CLAUDE.md §9,
// §11). Data: useSettings(); «Сохранить» writes the changed keys through useUpdateSettings() (set_setting per key,
// admins may change every key). The demo switches live on /demo; this page links there.
import { formatDuration, formatNumber, settings as DEFAULT_SETTINGS, type Settings } from '@rota/shared';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useHud } from '@/components/HudHost';
import { Button, SettingsGroup, SettingsRow } from '@/components/rota';
import { Page, Pill, QueryState } from '@/components/ui';
import { t } from '@/lib/i18n';
import { useUpdateSettings } from '@/lib/mutations';
import { useSettings } from '@/lib/queries';
import { paths } from '@/lib/routes';
import type { WebKey } from '@/lib/strings';
import styles from './admin.module.css';

type NumericKey = Exclude<keyof Settings, 'demo_mode'>;

interface Spec {
  key: NumericKey;
  /** 'min' minutes, divided by demo_time_scale in the watchdog; 'share' 0..1; 'bits' dHash Hamming distance. */
  unit: 'min' | 'share' | 'bits';
  min: number;
  max: number;
  integer: boolean;
}

const WATCHDOG: readonly Spec[] = [
  { key: 'remind_before_min', unit: 'min', min: 1, max: 240, integer: true },
  { key: 'accept_timeout_min', unit: 'min', min: 1, max: 120, integer: true },
  { key: 'accept_timeout_emergency_min', unit: 'min', min: 1, max: 60, integer: true },
  { key: 'overdue_repeat_min', unit: 'min', min: 1, max: 240, integer: true },
  { key: 'manager_overdue_min', unit: 'min', min: 5, max: 1440, integer: true },
];

const AI: readonly Spec[] = [
  { key: 'ai_confidence_threshold', unit: 'share', min: 0.05, max: 0.95, integer: false },
  { key: 'duplicate_hamming_max', unit: 'bits', min: 0, max: 16, integer: true },
];

const SPECS = [...WATCHDOG, ...AI];

/** «0,6» or «0.6» → 0.6; null when it is not a number in range. */
function parse(spec: Spec, text: string): number | null {
  const trimmed = text.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < spec.min || n > spec.max) return null;
  if (spec.integer && !Number.isInteger(n)) return null;
  return n;
}

const show = (spec: Spec, value: number) => (spec.integer ? String(value) : formatNumber(value, 2));

/** A watchdog threshold as the watchdog applies it at time scale s: «18 с», «3 мин». */
function scaled(minutes: number, scale: number): string {
  const seconds = Math.round((minutes * 60) / scale);
  return seconds < 120 ? t('admin.settings.seconds', { value: seconds }) : formatDuration(seconds / 60);
}

export function SettingsPage() {
  const query = useSettings();
  if (query.data) return <SettingsForm settings={query.data} />;
  return (
    <Page title={t('page.admin_settings')} eyebrow={t('admin.settings.eyebrow')}>
      <QueryState query={query}>{() => null}</QueryState>
    </Page>
  );
}

/** A dot plus a word: «Вкл» in the free tone, «Выкл» in gray (red stays for critical states). */
function OnOff({ on }: { on: boolean }) {
  return <Pill tone={on ? 'free' : 'off'}>{on ? t('admin.settings.on') : t('admin.settings.off')}</Pill>;
}

function SettingsForm({ settings }: { settings: Settings }) {
  const hud = useHud();
  const navigate = useNavigate();
  const update = useUpdateSettings();
  const [draft, setDraft] = useState<Partial<Record<NumericKey, string>>>({});

  const textOf = (spec: Spec) => draft[spec.key] ?? show(spec, Number(settings[spec.key]));
  const invalid = SPECS.filter((s) => draft[s.key] !== undefined && parse(s, draft[s.key]!) === null);
  const patch: Partial<Settings> = {};
  for (const s of SPECS) {
    const text = draft[s.key];
    if (text === undefined) continue;
    const value = parse(s, text);
    if (value !== null && value !== Number(settings[s.key])) patch[s.key] = value;
  }
  const changed = Object.keys(patch).length;
  const dirty = changed > 0 || invalid.length > 0;
  const atDefaults = SPECS.every((s) => {
    const value = parse(s, textOf(s));
    return value !== null && value === DEFAULT_SETTINGS[s.key];
  });
  const scale = Number(settings.demo_time_scale) || 1;

  const save = () => {
    if (changed === 0 || invalid.length > 0 || update.isPending) return;
    update.mutate(patch, {
      onSuccess: () => {
        setDraft({});
        hud.show({ message: t('admin.settings.saved') });
      },
      onError: () => hud.show({ message: t('admin.settings.save_error'), tone: 'critical' }),
    });
  };

  const defaults = () =>
    setDraft(Object.fromEntries(SPECS.map((s) => [s.key, show(s, DEFAULT_SETTINGS[s.key])])) as typeof draft);

  const row = (spec: Spec) => {
    const text = textOf(spec);
    const value = parse(spec, text);
    const isDirty = draft[spec.key] !== undefined && value !== Number(settings[spec.key]);
    const errorText =
      value === null
        ? t(spec.integer ? 'admin.settings.invalid_int' : 'admin.settings.invalid_share', {
            min: show(spec, spec.min),
            max: show(spec, spec.max),
          })
        : null;
    const title = t(`admin.settings.key.${spec.key}` as WebKey);
    const unit = t(`admin.settings.unit.${spec.unit}` as WebKey);
    const fallback = `${show(spec, DEFAULT_SETTINGS[spec.key])} ${spec.unit === 'share' ? '' : unit}`.trim();
    return (
      <SettingsRow key={spec.key} title={title} subtitle={t(`admin.settings.hint.${spec.key}` as WebKey)}>
        <div className={styles.control}>
          <div className={styles.controlRow}>
            <input
              className={styles.number}
              type="text"
              inputMode={spec.integer ? 'numeric' : 'decimal'}
              aria-label={title}
              aria-invalid={value === null}
              data-dirty={isDirty || undefined}
              value={text}
              onChange={(e) => setDraft((d) => ({ ...d, [spec.key]: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') save();
              }}
            />
            <span className={styles.unit}>{unit}</span>
          </div>
          {errorText ? (
            <span className={styles.controlError} role="alert">
              {errorText}
            </span>
          ) : spec.unit === 'min' && scale > 1 && value !== null ? (
            <span className={styles.controlNote}>{t('admin.settings.scaled', { value: scaled(value, scale) })}</span>
          ) : value !== DEFAULT_SETTINGS[spec.key] ? (
            <span className={styles.controlNote}>{t('admin.settings.default', { value: fallback })}</span>
          ) : null}
        </div>
      </SettingsRow>
    );
  };

  return (
    <Page
      title={t('page.admin_settings')}
      eyebrow={t('admin.settings.eyebrow')}
      actions={
        <>
          {dirty ? <span className={styles.dirty}>{t('admin.settings.dirty')}</span> : null}
          <Button variant="quiet" onClick={defaults} disabled={atDefaults || update.isPending}>
            {t('admin.settings.defaults')}
          </Button>
          {dirty ? (
            <Button variant="secondary" onClick={() => setDraft({})} disabled={update.isPending}>
              {t('admin.settings.discard')}
            </Button>
          ) : null}
          <Button onClick={save} disabled={changed === 0 || invalid.length > 0 || update.isPending}>
            {update.isPending ? t('admin.settings.saving') : t('common.save')}
          </Button>
        </>
      }
    >
      {scale > 1 ? (
        <p className={styles.notice} role="status">
          {t('admin.settings.scale_note', { scale: formatNumber(scale) })}
        </p>
      ) : null}

      <div className={styles.groups}>
        <section className={styles.group} aria-labelledby="settings-watchdog">
          <h2 id="settings-watchdog" className={styles.groupTitle}>
            {t('admin.settings.watchdog')}
          </h2>
          <SettingsGroup>{WATCHDOG.map(row)}</SettingsGroup>
          <p className={styles.footnote}>{t('admin.settings.watchdog_note')}</p>
        </section>

        <section className={styles.group} aria-labelledby="settings-ai">
          <h2 id="settings-ai" className={styles.groupTitle}>
            {t('admin.settings.ai')}
          </h2>
          <SettingsGroup>{AI.map(row)}</SettingsGroup>
          <p className={styles.footnote}>{t('admin.settings.ai_note')}</p>
        </section>

        <section className={styles.group} aria-labelledby="settings-demo">
          <h2 id="settings-demo" className={styles.groupTitle}>
            {t('admin.settings.demo')}
          </h2>
          <SettingsGroup>
            <SettingsRow title={t('demo.mode')} subtitle={t('demo.mode_hint')}>
              <OnOff on={settings.demo_mode} />
            </SettingsRow>
            <SettingsRow title={t('demo.scale')} subtitle={t('demo.scale_hint')}>
              <OnOff on={scale > 1} />
            </SettingsRow>
          </SettingsGroup>
          <div className={styles.footRow}>
            <p className={styles.footnote}>{t('admin.settings.demo_row_hint')}</p>
            <Button variant="secondary" onClick={() => navigate(paths.demo)}>
              {t('admin.settings.open_demo')}
            </Button>
          </div>
        </section>
      </div>
    </Page>
  );
}
