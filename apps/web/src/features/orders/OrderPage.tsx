// /orders/:id (master, manager): the master report layout (CLAUDE.md §12, PHASE_2 §2.6). Main column: the order card,
// the AI verdict with every check, works and fault code, materials against the norm, before and after photos side by
// side. Side column: status and deadline, the master's actions (close, override, return, reassign with
// suggest_assignees and the brigades tab, priority, cancel), the timeline with «Признать обоснованным» on refusals.
// `?reassign={employee_id}` comes from an escalation notification: a one tap «Переназначить на …» on top.
// Managers see the same page without actions. Live sync refreshes it through ['order', id].
import {
  allowedActions,
  formatDateTime,
  formatDue,
  formatDuration,
  formatLeft,
  formatNorm,
  formatQty,
  formatScore,
  isActive,
  isOverdue,
  isRotaError,
  ORDER_TYPE_LABEL,
  PRIORITY_LABEL,
  priorityTone,
  STATUS_LABEL,
  statusTone,
  VERDICT_LABEL,
  verdictTone,
  type Directories,
  type OrderAction,
  type OrderDetail,
  type OrderEvent,
} from '@rota/shared';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useDocumentTitle } from '@/components/layout';
import { Button } from '@/components/rota';
import { Card, EmptyState, ErrorState, Loading, Page, Pill, Section, Table, Tag, type Column } from '@/components/ui';
import { newActionId, useRequiredSession } from '@/lib/api';
import { useRouteId } from '@/lib/params';
import { orderBadge, orderEyebrow } from '@/lib/present';
import { useDirectories, useOrder, useWorkerStatuses } from '@/lib/queries';
import { paths } from '@/lib/routes';
import { useNow } from '@/lib/useNow';
import { CancelDialog, OverrideDialog, PriorityDialog, ReturnDialog } from './ActionDialogs';
import { PhotoCompare } from './PhotoCompare';
import { ReassignDialog } from './ReassignDialog';
import {
  MATERIAL_TONE,
  materialRows,
  normFor,
  normHours,
  orderDowntimeMinutes,
  shownReview,
  workMinutes,
  type MaterialRow,
} from './review';
import { ReviewPanel } from './ReviewPanel';
import { t } from './strings';
import { Timeline } from './Timeline';
import { errorText, useActionRunner } from './useActionRunner';
import styles from './order.module.css';

type DialogKind = 'reassign' | 'priority' | 'cancel' | 'return' | 'override';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function OrderPage() {
  const id = useRouteId();
  const q = useOrder(id);
  const now = useNow(15_000);
  useDocumentTitle(q.data ? t('order.title', { number: q.data.order.number }) : null);

  if (id == null) return <NotFound />;
  if (q.data) return <OrderReport detail={q.data} now={now} />;
  if (q.isError) {
    // orders.get answers BAD_INPUT for an id that does not exist (or was removed by the demo reset)
    if (isRotaError(q.error) && q.error.code === 'BAD_INPUT') return <NotFound />;
    return (
      <Page title={t('page.order_loading')}>
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      </Page>
    );
  }
  return (
    <Page title={t('page.order_loading')}>
      <Loading />
    </Page>
  );
}

function NotFound() {
  const navigate = useNavigate();
  return (
    <Page title={t('page.order_loading')}>
      <EmptyState
        mascot="oops"
        title={t('order.not_found_title')}
        text={t('order.not_found_text')}
        action={
          <Button variant="secondary" onClick={() => navigate(paths.board)}>
            {t('order.to_board')}
          </Button>
        }
      />
    </Page>
  );
}

// ---------------------------------------------------------------------------- the report

function OrderReport({ detail, now }: { detail: OrderDetail; now: Date }) {
  const o = detail.order;
  const session = useRequiredSession();
  const dirs = useDirectories();
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const actions = useMemo(() => allowedActions(o, session, { events: detail.events }), [o, session, detail.events]);
  const can = (a: OrderAction) => actions.includes(a);
  const review = shownReview(detail);
  const runner = useActionRunner();

  const brigades = useMemo(
    () => new Map((dirs.data?.brigades ?? []).map((b) => [b.id, b.name])),
    [dirs.data],
  );

  const justify = (e: OrderEvent) =>
    runner.run(
      {
        id: o.id,
        number: o.number,
        action: 'mark_reject_justified',
        payload: { reject_event_id: e.id },
        clientActionId: newActionId(),
      },
      { success: t('order.done.justified') },
    );

  const closeAsAi = () =>
    runner.run({ id: o.id, number: o.number, action: 'close', payload: {}, clientActionId: newActionId() });

  const eyebrow = isActive(o.status)
    ? `${orderEyebrow(o)} · ${formatDue(o.due_at, now)}`
    : orderEyebrow(o);

  return (
    <Page
      eyebrow={eyebrow}
      title={o.equipment_name}
      actions={<StatusPills detail={detail} now={now} />}
    >
      {can('reassign') ? <EscalationBanner detail={detail} /> : null}

      <div className={styles.layout}>
        <div className={styles.main}>
          <Section title={t('order.section.card')} aside={<span className={styles.mono}>№{o.number}</span>}>
            <InfoCard detail={detail} now={now} dirs={dirs.data} />
          </Section>

          <Section title={t('order.section.review')}>
            <ReviewPanel detail={detail} />
          </Section>

          <Section title={t('order.section.works')}>
            <WorksCard detail={detail} dirs={dirs.data} />
          </Section>

          <Section
            title={t('order.section.materials')}
            aside={
              o.fault_code ? (
                <span className={styles.muted}>{t('order.mat.norm_for', { code: o.fault_code })}</span>
              ) : null
            }
          >
            <MaterialsCard detail={detail} dirs={dirs.data} />
          </Section>

          <Section title={t('order.section.photos')}>
            <PhotoCompare detail={detail} />
          </Section>
        </div>

        <aside className={styles.side}>
          <StatusCard detail={detail} now={now} />

          <Card>
            <div className={styles.actions}>
              <span className={styles.label}>{t('order.section.actions')}</span>
              {actions.length === 0 ? (
                <p className={styles.muted}>
                  {session.role === 'manager' ? t('order.actions.watch') : t('order.actions.none')}
                </p>
              ) : (
                <>
                  {can('close') && review && o.status === 'ai_review' ? (
                    <Button className={styles.wide} onClick={closeAsAi} disabled={runner.pending}>
                      {t('action.close')}
                    </Button>
                  ) : null}
                  {can('close') ? (
                    <Button
                      className={styles.wide}
                      variant={review && o.status === 'ai_review' ? 'secondary' : 'primary'}
                      onClick={() => setDialog('override')}
                      disabled={runner.pending}
                    >
                      {review && o.status === 'ai_review' ? t('action.override') : t('order.action.close_rated')}
                    </Button>
                  ) : null}
                  {can('return') ? (
                    <Button
                      className={styles.wide}
                      variant="secondary"
                      onClick={() => setDialog('return')}
                      disabled={runner.pending}
                    >
                      {t('action.return')}
                    </Button>
                  ) : null}
                  {can('reassign') ? (
                    <Button
                      className={styles.wide}
                      variant={o.status === 'rejected' ? 'primary' : 'secondary'}
                      onClick={() => setDialog('reassign')}
                      disabled={runner.pending}
                    >
                      {t('action.reassign')}
                    </Button>
                  ) : null}
                  {can('set_priority') ? (
                    <Button
                      className={styles.wide}
                      variant="secondary"
                      onClick={() => setDialog('priority')}
                      disabled={runner.pending}
                    >
                      {t('action.set_priority')}
                    </Button>
                  ) : null}
                  {can('cancel') ? (
                    <Button
                      className={styles.wide}
                      variant="quiet"
                      onClick={() => setDialog('cancel')}
                      disabled={runner.pending}
                    >
                      {t('action.cancel')}
                    </Button>
                  ) : null}
                </>
              )}
            </div>
          </Card>

          <Section title={t('order.section.timeline')}>
            <Card>
              <Timeline
                events={detail.events}
                employees={dirs.data?.employees ?? []}
                brigades={brigades}
                now={now}
                onJustify={can('mark_reject_justified') ? justify : undefined}
                justifying={runner.pending}
              />
            </Card>
          </Section>
        </aside>
      </div>

      {dialog === 'reassign' ? <ReassignDialog order={o} onClose={() => setDialog(null)} /> : null}
      {dialog === 'priority' ? <PriorityDialog order={o} onClose={() => setDialog(null)} /> : null}
      {dialog === 'cancel' ? <CancelDialog order={o} onClose={() => setDialog(null)} /> : null}
      {dialog === 'return' ? <ReturnDialog order={o} onClose={() => setDialog(null)} /> : null}
      {dialog === 'override' ? <OverrideDialog order={o} review={review} onClose={() => setDialog(null)} /> : null}
    </Page>
  );
}

// ---------------------------------------------------------------------------- header and status

function StatusPills({ detail, now }: { detail: OrderDetail; now: Date }) {
  const o = detail.order;
  const badge = orderBadge(o);
  return (
    <div className={styles.pills}>
      <Pill tone={statusTone(o.status)}>{STATUS_LABEL[o.status]}</Pill>
      {isOverdue(o, now) ? <Pill tone="critical">{t('status.overdue')}</Pill> : null}
      {badge ? <Pill tone={badge.tone}>{badge.text}</Pill> : null}
    </div>
  );
}

function StatusCard({ detail, now }: { detail: OrderDetail; now: Date }) {
  const o = detail.order;
  const overdue = isOverdue(o, now);
  const downtime = orderDowntimeMinutes(o, now);
  const lines: { text: string; critical?: boolean; mono?: boolean }[] = [];

  if (isActive(o.status)) {
    lines.push({ text: formatLeft(o.due_at, now), critical: overdue, mono: true });
  } else if (o.done_at) {
    const lateMin = (Date.parse(o.done_at) - Date.parse(o.due_at)) / 60_000;
    lines.push(
      lateMin > 0
        ? { text: t('order.status.late', { duration: formatDuration(lateMin) }), critical: true }
        : { text: t('order.status.on_time') },
    );
  }
  if (o.status_since) lines.push({ text: t('order.status.since', { time: formatDateTime(o.status_since) }) });
  lines.push({ text: t('order.status.issued_at', { time: formatDateTime(o.issued_at) }) });
  if (o.status === 'closed' && o.final_verdict) {
    lines.push({
      text: t('order.status.final', {
        verdict: VERDICT_LABEL[o.final_verdict],
        score: o.final_score != null ? formatScore(o.final_score) : '',
      }),
    });
  }

  return (
    <Card>
      <div className={styles.statusCard}>
        <span className={styles.statusBig} data-critical={overdue || undefined}>
          {STATUS_LABEL[o.status]}
        </span>
        {lines.map((l, i) => (
          <span key={i} className={styles.statusLine} data-critical={l.critical || undefined} data-mono={l.mono || undefined}>
            {l.text}
          </span>
        ))}
        {downtime != null ? (
          <div className={styles.pills}>
            <Pill tone={o.done_at || o.cancelled_at ? 'warning' : 'critical'}>
              {o.done_at || o.cancelled_at
                ? t('order.status.downtime', { duration: formatDuration(downtime) })
                : t('order.status.downtime_running', { duration: formatDuration(downtime) })}
            </Pill>
          </div>
        ) : null}
        {o.status === 'closed' && o.final_verdict ? (
          <div className={styles.pills}>
            <Pill tone={verdictTone(o.final_verdict)}>{VERDICT_LABEL[o.final_verdict]}</Pill>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------- escalation one tap

function EscalationBanner({ detail }: { detail: OrderDetail }) {
  const o = detail.order;
  const [params, setParams] = useSearchParams();
  const raw = params.get('reassign');
  const candidate = raw && UUID.test(raw) && raw !== o.assignee_id ? raw : null;
  const workers = useWorkerStatuses();
  const dirs = useDirectories();
  const runner = useActionRunner();
  const caid = useRef(newActionId());
  const [ask, setAsk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!candidate) return null;

  const name =
    workers.data?.find((w) => w.id === candidate)?.short_name ??
    dirs.data?.employees.find((e) => e.id === candidate)?.short_name;
  if (!name) return null;

  const clear = () =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('reassign');
        return next;
      },
      { replace: true },
    );

  const go = (allowOffShift: boolean) => {
    setError(null);
    runner.run(
      {
        id: o.id,
        number: o.number,
        action: 'reassign',
        payload: { assignee_id: candidate, ...(allowOffShift ? { allow_off_shift: true } : {}) },
        clientActionId: caid.current,
      },
      {
        success: t('order.done.reassigned', { name }),
        onSuccess: clear,
        onError: (e) => {
          if (e?.code === 'NOT_ON_SHIFT') setAsk(true);
          else setError(errorText(e));
        },
      },
    );
  };

  return (
    <div className={styles.banner} role="region" aria-label={t('order.escalation.title')}>
      <div className={styles.bannerText}>
        <span className={styles.bannerTitle}>{ask ? t('error.NOT_ON_SHIFT', { name }) : t('order.escalation.title')}</span>
        {!ask ? <span className={styles.muted}>{t('order.escalation.text', { name })}</span> : null}
        {error ? <span className={styles.bannerError}>{error}</span> : null}
      </div>
      <div className={styles.bannerButtons}>
        <Button onClick={() => go(ask)} disabled={runner.pending}>
          {ask ? t('order.reassign.anyway') : t('action.reassign_to', { name })}
        </Button>
        <Button variant="quiet" onClick={clear} disabled={runner.pending}>
          {t('order.dialog.keep')}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------- info card

function InfoRow({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={styles.infoRow} data-wide={wide || undefined}>
      <dt className={styles.label}>{label}</dt>
      <dd className={styles.value}>{children}</dd>
    </div>
  );
}

function InfoCard({ detail, now, dirs }: { detail: OrderDetail; now: Date; dirs: Directories | undefined }) {
  const o = detail.order;
  const norms = dirs?.work_norms ?? [];
  const norm = normHours(o, norms);
  const suggested = o.suggested_fault_code
    ? dirs?.fault_codes.find((f) => f.code === o.suggested_fault_code)
    : undefined;
  const overdue = isOverdue(o, now);
  return (
    <Card>
      <dl className={styles.info}>
        <InfoRow label={t('order.f.equipment')}>
          <span>{o.equipment_name}</span>
          <Link className={styles.link} to={paths.equipment(o.equipment_id)}>
            {t('order.equipment_history')}
          </Link>
        </InfoRow>
        <InfoRow label={t('order.f.area')}>{o.area_name}</InfoRow>
        <InfoRow label={t('order.f.type')}>{ORDER_TYPE_LABEL[o.type]}</InfoRow>
        <InfoRow label={t('order.f.priority')}>
          <Pill tone={priorityTone(o.priority)}>{PRIORITY_LABEL[o.priority]}</Pill>
        </InfoRow>
        <InfoRow label={t('order.f.due')}>
          <span className={styles.mono} data-critical={overdue || undefined}>
            {formatDateTime(o.due_at)}
          </span>
          {isActive(o.status) ? (
            <span className={styles.muted} data-critical={overdue || undefined}>
              {formatLeft(o.due_at, now)}
            </span>
          ) : null}
        </InfoRow>
        {norm != null ? <InfoRow label={t('order.f.norm')}>{formatNorm(norm)}</InfoRow> : null}
        <InfoRow label={t('order.f.assignee')}>
          {o.brigade_name ? t('order.brigade_of', { name: o.assignee_short_name, brigade: o.brigade_name }) : o.assignee_short_name}
        </InfoRow>
        <InfoRow label={t('order.f.master')}>{o.master_short_name}</InfoRow>
        <InfoRow label={t('order.f.issued')}>
          <span className={styles.mono}>{formatDateTime(o.issued_at)}</span>
        </InfoRow>
        <InfoRow label={t('order.f.stopped')}>
          {o.equipment_stopped ? <Pill tone="critical">{t('order.stopped_yes')}</Pill> : t('order.stopped_no')}
        </InfoRow>
        {o.suggested_fault_code ? (
          <InfoRow label={t('order.f.suggested_code')}>
            <span className={styles.codeLine}>
              <Tag>{o.suggested_fault_code}</Tag>
              {suggested ? <span>{suggested.name}</span> : null}
            </span>
          </InfoRow>
        ) : null}
        {o.repeat_of_order_id != null ? (
          <InfoRow label={t('order.f.repeat')}>
            <span className={styles.muted}>{t('order.repeat_text')}</span>
            <Link className={styles.link} to={paths.order(o.repeat_of_order_id)}>
              {t('order.repeat_link')}
            </Link>
          </InfoRow>
        ) : null}
        <InfoRow label={t('order.f.description')} wide>
          {o.description}
        </InfoRow>
        {o.comment ? (
          <InfoRow label={t('order.f.comment')} wide>
            {o.comment}
          </InfoRow>
        ) : null}
        {o.last_comment && o.last_comment !== o.comment && o.last_comment !== o.closing_comment ? (
          <InfoRow label={t('order.f.last_comment')} wide>
            «{o.last_comment}»
          </InfoRow>
        ) : null}
      </dl>
    </Card>
  );
}

// ---------------------------------------------------------------------------- works

function WorksCard({ detail, dirs }: { detail: OrderDetail; dirs: Directories | undefined }) {
  const o = detail.order;
  if (!o.done_at && !o.works_done) {
    return (
      <Card>
        <p className={styles.muted}>{t('order.works.pending')}</p>
      </Card>
    );
  }
  const code = o.fault_code ? dirs?.fault_codes.find((f) => f.code === o.fault_code) : undefined;
  const minutes = workMinutes(o);
  const norm = normHours(o, dirs?.work_norms ?? []);
  return (
    <Card>
      <dl className={styles.info}>
        <InfoRow label={t('order.works.done')} wide>
          {o.works_done ?? <span className={styles.muted}>{t('order.works.empty')}</span>}
        </InfoRow>
        <InfoRow label={t('order.works.code')}>
          {o.fault_code ? (
            <span className={styles.codeLine}>
              <Tag>{o.fault_code}</Tag>
              {code ? <span>{code.name}</span> : null}
            </span>
          ) : (
            <span className={styles.muted}>{t('order.works.no_code')}</span>
          )}
        </InfoRow>
        {minutes != null ? (
          <InfoRow label={t('order.works.time')}>
            {norm != null
              ? t('order.works.time_norm', {
                  actual: formatDuration(Math.max(1, minutes)),
                  norm: formatDuration(norm * 60),
                })
              : formatDuration(Math.max(1, minutes))}
          </InfoRow>
        ) : null}
        {o.closing_comment ? (
          <InfoRow label={t('order.works.comment')} wide>
            «{o.closing_comment}»
          </InfoRow>
        ) : null}
      </dl>
    </Card>
  );
}

// ---------------------------------------------------------------------------- materials

function MaterialsCard({ detail, dirs }: { detail: OrderDetail; dirs: Directories | undefined }) {
  const o = detail.order;
  const norm = normFor(o.fault_code, dirs?.work_norms ?? []);
  const rows = materialRows(detail.materials, norm);
  if (rows.length === 0) {
    return (
      <Card>
        <p className={styles.muted}>{o.done_at ? t('order.mat.none') : t('order.mat.pending')}</p>
      </Card>
    );
  }
  const verdictText = (r: MaterialRow) => {
    switch (r.verdict) {
      case 'ok':
        return t('order.mat.ok');
      case 'over':
        return t('order.mat.over');
      case 'not_typical':
        return t('order.mat.not_typical', { code: o.fault_code ?? '' });
      case 'no_norm':
        return t('order.mat.no_norm');
    }
  };
  const columns: Column<MaterialRow>[] = [
    { key: 'name', header: t('order.mat.material'), render: (r) => r.line.material_name },
    {
      key: 'qty',
      header: t('order.mat.qty'),
      align: 'right',
      mono: true,
      render: (r) => (
        <span data-critical={r.verdict === 'over' || undefined} className={styles.qty}>
          {formatQty(r.line.qty, r.line.unit)}
        </span>
      ),
    },
    {
      key: 'max',
      header: t('order.mat.norm'),
      align: 'right',
      mono: true,
      render: (r) => (r.max != null ? formatQty(r.max, r.line.unit) : '·'),
    },
    {
      key: 'check',
      header: t('order.mat.check'),
      render: (r) => <Pill tone={MATERIAL_TONE[r.verdict]}>{verdictText(r)}</Pill>,
    },
  ];
  return <Table columns={columns} rows={rows} rowKey={(r) => r.line.id} caption={t('order.section.materials')} />;
}

