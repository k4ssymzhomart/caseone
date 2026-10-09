// /demo (master, admin): the same controls as the mobile «Демо» screen (CLAUDE.md §20): «Демо режим» and
// «Ускорение времени ×10» (useUpdateSettings; masters may change exactly these two keys), «Сбросить демо»
// (useDemoReset, red with a confirm sheet), the shift readiness after a reset (useWorkerStatuses), the Demo Day
// script and the link to «Что видит ИИ» (admins only; llm_audit is closed to masters).
import { androidLogo } from '@rota/design';
import { isRotaError, workerStateTone, type Settings, type WorkerStatusView } from '@rota/shared';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useHud } from '@/components/HudHost';
import { Button, SettingsGroup, SettingsRow, Switch } from '@/components/rota';
import { Page, StatusDot, WithMark } from '@/components/ui';
import { apiMode, useRequiredSession } from '@/lib/api';
import { t } from '@/lib/i18n';
import { useDemoReset, useUpdateSettings } from '@/lib/mutations';
import { useSettings, useWorkerStatuses } from '@/lib/queries';
import { paths } from '@/lib/routes';
import type { WebKey } from '@/lib/strings';
import { ConfirmDialog } from './ConfirmDialog';
import styles from './demo.module.css';

type DemoKey = 'demo_mode' | 'demo_time_scale';

const STEPS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

const errorText = (e: unknown) => (isRotaError(e) ? e.message : t('error.UNKNOWN'));

export function DemoPage() {
  const session = useRequiredSession();
  const navigate = useNavigate();
  const hud = useHud();
  const settings = useSettings();
  const update = useUpdateSettings();
  const reset = useDemoReset();
  const [saving, setSaving] = useState<DemoKey | null>(null);
  const [optimistic, setOptimistic] = useState<Partial<Settings>>({});
  const [confirming, setConfirming] = useState(false);

  const ready = settings.isSuccess;
  const demoMode = optimistic.demo_mode ?? settings.data?.demo_mode ?? false;
  const fast = (optimistic.demo_time_scale ?? settings.data?.demo_time_scale ?? 1) > 1;

  const save = (key: DemoKey, patch: Partial<Settings>) => {
    if (saving) return;
    setSaving(key);
    setOptimistic(patch);
    update.mutate(patch, {
      onError: () => hud.show({ message: t('demo.save_error'), tone: 'critical' }),
      onSettled: () => {
        setSaving(null);
        setOptimistic({});
      },
    });
  };

  const runReset = () => {
    if (reset.isPending) return;
    reset.mutate(undefined, {
      onSuccess: () => {
        setConfirming(false);
        hud.show({ message: t('demo.reset_done') });
      },
      onError: (e) => {
        setConfirming(false);
        hud.show({ message: errorText(e), tone: 'critical' });
      },
    });
  };

  return (
    <Page title={t('page.demo')} eyebrow={t('demo.eyebrow')}>
      {apiMode === 'mock' ? <p className={styles.notice}>{t('demo.mock_note')}</p> : null}
      {settings.isError ? (
        <div className={styles.error} role="alert">
          <span>{t('demo.settings_error')}</span>
          <Button variant="secondary" onClick={() => void settings.refetch()}>
            {t('common.retry')}
          </Button>
        </div>
      ) : null}

      <div className={styles.columns}>
        <div className={styles.stack}>
          <section className={styles.group} aria-labelledby="demo-settings">
            <h2 id="demo-settings" className={styles.groupTitle}>
              {t('demo.settings')}
            </h2>
            <SettingsGroup>
              <SettingsRow title={t('demo.mode')} subtitle={t('demo.mode_hint')}>
                <Switch
                  checked={demoMode}
                  onChange={(v) => save('demo_mode', { demo_mode: v })}
                  disabled={!ready || saving !== null}
                  label={t('demo.mode')}
                />
              </SettingsRow>
              <SettingsRow title={t('demo.scale')} subtitle={t('demo.scale_hint')}>
                <Switch
                  checked={fast}
                  onChange={(v) => save('demo_time_scale', { demo_time_scale: v ? 10 : 1 })}
                  disabled={!ready || saving !== null}
                  label={t('demo.scale')}
                />
              </SettingsRow>
              <SettingsRow title={t('demo.reset')} subtitle={t('demo.reset_hint')}>
                <Button variant="danger" onClick={() => setConfirming(true)} disabled={reset.isPending}>
                  {reset.isPending ? t('demo.resetting') : t('demo.reset_confirm')}
                </Button>
              </SettingsRow>
            </SettingsGroup>
          </section>

          <section className={styles.group} aria-label={t('demo.ai')}>
            <SettingsGroup>
              {session.role === 'admin' ? (
                <SettingsRow title={t('demo.ai')} subtitle={t('demo.ai_hint')}>
                  <Button variant="secondary" onClick={() => navigate(paths.adminAi)}>
                    {t('demo.open')}
                  </Button>
                </SettingsRow>
              ) : (
                <SettingsRow title={t('demo.ai')} subtitle={t('demo.ai_master_hint')} />
              )}
            </SettingsGroup>
          </section>

          <Readiness />
        </div>

        <section className={styles.group} aria-labelledby="demo-script">
          <h2 id="demo-script" className={styles.groupTitle}>
            {t('demo.script')}
          </h2>
          <ol className={styles.steps}>
            {STEPS.map((n) => (
              <li key={n} className={styles.step}>
                {t(`demo.step.${n}` as WebKey)}
              </li>
            ))}
          </ol>
          <p className={styles.footnote}>
            <WithMark logo={androidLogo} size={14}>
              {t('demo.script_note')}
            </WithMark>
          </p>
        </section>
      </div>

      <ConfirmDialog
        open={confirming}
        title={t('demo.reset_title')}
        body={t('demo.reset_body')}
        confirmLabel={t('demo.reset_confirm')}
        busyLabel={t('demo.resetting')}
        busy={reset.isPending}
        onConfirm={runReset}
        onCancel={() => setConfirming(false)}
      />
    </Page>
  );
}

/** Who is where right now: after «Сбросить демо» 9 on shift, Ахметов, Ким and Касымов free. */
const STATES = ['free', 'working', 'queue', 'off'] as const satisfies readonly WorkerStatusView['status'][];

function Readiness() {
  const workers = useWorkerStatuses();
  const rows: readonly WorkerStatusView[] = workers.data ?? [];
  const count = (state: WorkerStatusView['status']) => rows.filter((w) => w.status === state).length;
  const free = rows.filter((w) => w.status === 'free').map((w) => w.short_name);
  const loaded = workers.isSuccess;

  return (
    <section className={styles.group} aria-labelledby="demo-state">
      <h2 id="demo-state" className={styles.groupTitle}>
        {t('demo.state')}
      </h2>
      <ul className={styles.states}>
        <li className={styles.stateRow}>
          <span className={styles.stateLabel}>{t('demo.kpi.on_shift')}</span>
          <span className={styles.stateCount}>{loaded ? rows.filter((w) => w.on_shift).length : '…'}</span>
        </li>
        {STATES.map((state) => (
          <li key={state} className={styles.stateRow}>
            <span className={styles.stateLabel}>
              <StatusDot tone={workerStateTone(state)} />
              {t(`demo.kpi.${state}`)}
            </span>
            <span className={styles.stateCount}>{loaded ? count(state) : '…'}</span>
          </li>
        ))}
      </ul>
      {loaded ? (
        <p className={styles.names}>
          {free.length > 0 ? t('demo.free_list', { names: free.join(', ') }) : t('demo.nobody_free')}
        </p>
      ) : null}
      <p className={styles.footnote}>{t('demo.state_note')}</p>
    </section>
  );
}
