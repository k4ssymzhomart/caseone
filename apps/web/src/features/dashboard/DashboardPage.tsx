// /dashboard (manager): the case's tiles on rpc dashboard: наряды в работе, просрочки, среднее время реакции и
// выполнения, простой оборудования, топ 5 проблемного оборудования, лучшие исполнители. The period switch смена,
// неделя, месяц and the area select are the FilterBar in the top bar (the route handle limits it to those).
import { formatCount, formatInt, ORDER_FORMS, type Dashboard } from '@rota/shared';
import { Link, useNavigate } from 'react-router';
import { Kpi, Page, QueryState, Section, Table, type Column } from '@/components/ui';
import { useReportFilter } from '@/lib/filters';
import { t } from '@/lib/i18n';
import { useDashboard } from '@/lib/queries';
import { paths } from '@/lib/routes';
import {
  hoursText,
  minutesText,
  num,
  periodEyebrow,
  scoreText,
  shareText,
} from '@/features/reports/format';
import { Meter, NoData, Stale } from '@/features/reports/kit';
import s from '@/features/reports/reports.module.css';

export function DashboardPage() {
  const { preset, period, filters, fromDay, toDay } = useReportFilter();
  const dashboard = useDashboard(period, filters);
  // carry the period and area to the detailed pages
  const query = new URLSearchParams({ period: preset });
  if (filters.area_id != null) query.set('area', String(filters.area_id));

  return (
    <Page
      title={t('page.dashboard')}
      eyebrow={periodEyebrow(preset, period, fromDay, toDay)}
      actions={
        <span className={s.inline}>
          <Link className={s.link} to={`${paths.reportsShift}?${query.toString()}`}>
            {t('dashboard.link.report')}
          </Link>
          <Link className={s.link} to={`${paths.analytics}?${query.toString()}`}>
            {t('dashboard.link.analytics')}
          </Link>
        </span>
      }
    >
      <QueryState query={dashboard}>
        {(d) => (
          <Stale stale={dashboard.isPlaceholderData}>
            <div className={s.kpis}>
              <Kpi
                label={t('dashboard.kpi.in_progress')}
                value={formatInt(num(d.in_progress_now) ?? 0)}
                hint={t('dashboard.kpi.in_progress_hint')}
              />
              <Kpi
                label={t('dashboard.kpi.overdue')}
                value={formatInt(num(d.overdue_now) ?? 0)}
                tone={(num(d.overdue_now) ?? 0) > 0 ? 'critical' : 'default'}
                hint={t('dashboard.kpi.overdue_hint')}
              />
              <Kpi
                label={t('report.kpi.reaction')}
                value={minutesText(d.reaction_avg_min)}
                hint={t('report.kpi.reaction_hint')}
              />
              <Kpi
                label={t('report.kpi.execution')}
                value={minutesText(d.execution_avg_min)}
                hint={t('dashboard.kpi.execution_hint')}
              />
              <Kpi
                label={t('report.kpi.downtime')}
                value={hoursText(d.downtime_hours)}
                hint={t('dashboard.kpi.downtime_hint')}
              />
              <Kpi
                label={t('report.kpi.on_time')}
                value={shareText(d.on_time_share)}
                hint={t('dashboard.kpi.closed_hint', {
                  orders: formatCount(num(d.closed) ?? 0, ORDER_FORMS),
                })}
              />
            </div>
            <div className={s.split}>
              <TopEquipment rows={d.top_equipment} />
              <BestWorkers
                rows={d.best_workers}
                ratingLink={`${paths.reportsRating}?${query.toString()}`}
              />
            </div>
          </Stale>
        )}
      </QueryState>
    </Page>
  );
}

type EquipmentRow = Dashboard['top_equipment'][number];

function TopEquipment({ rows }: { rows: EquipmentRow[] }) {
  const navigate = useNavigate();
  const max = rows.reduce((m, r) => Math.max(m, num(r.unplanned) ?? 0), 0);
  const columns: Column<EquipmentRow>[] = [
    {
      key: 'name',
      header: t('report.downtime.equipment'),
      render: (r) => (
        <Link
          className={s.link}
          to={paths.equipment(r.equipment_id)}
          onClick={(e) => e.stopPropagation()}
        >
          {r.name}
        </Link>
      ),
    },
    {
      key: 'unplanned',
      header: t('dashboard.top.unplanned'),
      render: (r) => {
        const n = num(r.unplanned) ?? 0;
        return <Meter share={max > 0 ? n / max : 0} label={formatInt(n)} />;
      },
    },
    {
      key: 'downtime_h',
      header: t('dashboard.top.downtime'),
      align: 'right',
      mono: true,
      render: (r) => hoursText(r.downtime_h),
    },
  ];
  return (
    <Section title={t('dashboard.top.title')}>
      <Table
        columns={columns}
        rows={rows}
        rowKey={(r) => r.equipment_id}
        onRowClick={(r) => navigate(paths.equipment(r.equipment_id))}
        empty={<NoData>{t('dashboard.top.empty')}</NoData>}
        caption={t('dashboard.top.title')}
      />
    </Section>
  );
}

type WorkerRow = Dashboard['best_workers'][number];

function BestWorkers({ rows, ratingLink }: { rows: WorkerRow[]; ratingLink: string }) {
  const columns: Column<WorkerRow>[] = [
    {
      key: 'rank',
      header: t('rating.col.rank'),
      mono: true,
      width: 64,
      render: (r) => rows.indexOf(r) + 1,
    },
    { key: 'short_name', header: t('rating.col.worker') },
    {
      key: 'closed',
      header: t('rating.col.closed'),
      align: 'right',
      mono: true,
      render: (r) => formatInt(num(r.closed) ?? 0),
    },
    {
      key: 'score',
      header: t('rating.col.score'),
      align: 'right',
      render: (r) => <strong className={s.mono}>{scoreText(r.score)}</strong>,
    },
  ];
  return (
    <Section
      title={t('dashboard.best.title')}
      aside={
        <Link className={s.link} to={ratingLink}>
          {t('dashboard.best.all')}
        </Link>
      }
    >
      <Table
        columns={columns}
        rows={rows}
        rowKey={(r) => r.employee_id}
        empty={<NoData>{t('dashboard.best.empty')}</NoData>}
        caption={t('dashboard.best.title')}
      />
    </Section>
  );
}
