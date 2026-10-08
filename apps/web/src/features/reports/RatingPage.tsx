// /reports/rating (master, manager): rpc rating (CLAUDE.md §13) for the FilterBar period (demo step 8 uses «Месяц»),
// with workers and brigades tabs (?kind=brigade), a stacked bar chart of what each component adds to the score, and
// the table with Q T F V D, closed orders and the score. Workers without closed orders stay in the table with
// «нет закрытых нарядов» and no score. «Скачать PDF» and «Скачать Excel» export both tabs.
import {
  formatInt,
  formatNumber,
  RATING_COMPONENTS,
  RATING_WEIGHTS,
  ratingContributions,
  type RatingComponent,
  type RatingRow,
} from '@rota/shared';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { Button } from '@/components/rota';
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartCard, ChartTooltip } from '@/components/chart';
import {
  EmptyState,
  Page,
  QueryState,
  Section,
  Segmented,
  Table,
  type Column,
} from '@/components/ui';
import {
  gridProps,
  series,
  stackedBarProps,
  tooltipProps,
  xAxisProps,
  yAxisProps,
} from '@/lib/chart';
import { useReportFilter } from '@/lib/filters';
import { t } from '@/lib/i18n';
import { useDirectories, useRating } from '@/lib/queries';
import { downloadPdf, downloadXlsx, fileStamp } from './export/files';
import { ratingPdf, ratingSheets, type RatingExportInput } from './export/ratingExport';
import { useExport } from './export/useExport';
import { filterText, num, periodEyebrow, scoreText, shareText } from './format';
import { Stale } from './kit';
import s from './reports.module.css';

type Kind = RatingRow['kind'];
const ROW_HEIGHT = 30;

export function RatingPage() {
  const { preset, period, filters, fromDay, toDay } = useReportFilter();
  const rating = useRating(period, filters);
  const dirs = useDirectories();
  const eyebrow = periodEyebrow(preset, period, fromDay, toDay);
  const exp = useExport();
  const exportInput = (rows: RatingRow[]): RatingExportInput => ({
    rows,
    brigadeNames: new Map((dirs.data?.brigades ?? []).map((b) => [b.id, b.name])),
    periodText: eyebrow,
    filterText: filterText(filters, dirs.data),
    generatedAt: new Date(),
  });
  const fileName = (ext: string) => `rota-rating-${fileStamp(period.to)}.${ext}`;
  const ready = !!rating.data && exp.busy == null;
  const [params, setParams] = useSearchParams();
  const kind: Kind = params.get('kind') === 'brigade' ? 'brigade' : 'worker';
  const setKind = (next: Kind) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next === 'brigade') p.set('kind', 'brigade');
        else p.delete('kind');
        return p;
      },
      { replace: true },
    );

  return (
    <Page
      title={t('page.reports_rating')}
      eyebrow={eyebrow}
      actions={
        <>
          <Segmented<Kind>
            label={t('rating.tabs')}
            value={kind}
            onChange={setKind}
            options={[
              { value: 'worker', label: t('rating.tab.workers') },
              { value: 'brigade', label: t('rating.tab.brigades') },
            ]}
          />
          <Button
            variant="secondary"
            disabled={!ready}
            onClick={() => {
              const rows = rating.data;
              if (rows) void exp.run('pdf', () => downloadPdf(ratingPdf(exportInput(rows)), fileName('pdf')));
            }}
          >
            {exp.busy === 'pdf' ? t('export.busy') : t('report.export_pdf')}
          </Button>
          <Button
            variant="secondary"
            disabled={!ready}
            onClick={() => {
              const rows = rating.data;
              if (rows) void exp.run('xlsx', () => downloadXlsx(ratingSheets(exportInput(rows)), fileName('xlsx')));
            }}
          >
            {exp.busy === 'xlsx' ? t('export.busy') : t('report.export_excel')}
          </Button>
        </>
      }
    >
      <QueryState query={rating}>
        {(all) => (
          <RatingBody
            rows={all.filter((r) => r.kind === kind)}
            kind={kind}
            stale={rating.isPlaceholderData}
          />
        )}
      </QueryState>
    </Page>
  );
}

function RatingBody({ rows, kind, stale }: { rows: RatingRow[]; kind: Kind; stale: boolean }) {
  const scored = rows.filter((r) => num(r.score) != null);
  if (scored.length === 0) {
    return (
      <EmptyState mascot="read" title={t('rating.empty_title')} text={t('rating.empty_text')} />
    );
  }
  return (
    <Stale stale={stale}>
      <RatingChart rows={scored} />
      <Section
        title={t('rating.table_title')}
        aside={<span className={s.note}>{formatInt(rows.length)}</span>}
      >
        <RatingTable rows={rows} kind={kind} />
        <p className={s.note}>{t('rating.formula')}</p>
      </Section>
    </Stale>
  );
}

function RatingChart({ rows }: { rows: RatingRow[] }) {
  const data = useMemo(
    () =>
      rows.map((r) => ({
        name: r.name,
        ...ratingContributions({ q: num(r.q), t: num(r.t), f: num(r.f), v: num(r.v), d: num(r.d) }),
      })),
    [rows],
  );
  const longest = rows.reduce((max, r) => Math.max(max, r.name.length), 0);
  return (
    <ChartCard
      title={t('rating.chart.title')}
      subtitle={t('rating.chart.subtitle')}
      legend={RATING_COMPONENTS.map((k, i) => ({ label: t(`rating.${k}`), color: series(i) }))}
      height={Math.max(160, rows.length * ROW_HEIGHT + 40)}
    >
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid {...gridProps} horizontal={false} vertical />
        <XAxis {...xAxisProps} type="number" domain={[0, 100]} ticks={[0, 20, 40, 60, 80, 100]} />
        <YAxis
          {...yAxisProps}
          type="category"
          dataKey="name"
          width={Math.min(220, Math.max(110, longest * 8 + 24))}
          tick={{ ...yAxisProps.tick, fontFamily: 'var(--font-sans)' }}
        />
        <Tooltip
          {...tooltipProps}
          content={(p) => (
            <ChartTooltip
              {...p}
              format={(v) => formatNumber(v)}
              totalLabel={t('rating.chart.total')}
            />
          )}
        />
        {RATING_COMPONENTS.map((k, i) => (
          <Bar
            key={k}
            dataKey={k}
            name={t(`rating.${k}`)}
            {...stackedBarProps(i, RATING_COMPONENTS.length, 'horizontal')}
          />
        ))}
      </BarChart>
    </ChartCard>
  );
}

function ComponentHeader({ k }: { k: RatingComponent }) {
  return (
    <span className={s.headerCell}>
      <span>{t(`rating.${k}`)}</span>
      <span className={s.headerKey}>
        {k.toUpperCase()} · {formatNumber(RATING_WEIGHTS[k] * 100)}%
      </span>
    </span>
  );
}

function RatingTable({ rows, kind }: { rows: RatingRow[]; kind: Kind }) {
  const dirs = useDirectories();
  const brigadeName = useMemo(
    () => new Map((dirs.data?.brigades ?? []).map((b) => [b.id, b.name])),
    [dirs.data],
  );

  const columns: Column<RatingRow>[] = [
    {
      key: 'rank',
      header: t('rating.col.rank'),
      mono: true,
      width: 64,
      render: (r) => (num(r.score) != null ? r.rank : ''),
    },
    {
      key: 'name',
      header: kind === 'worker' ? t('rating.col.worker') : t('rating.col.brigade'),
      render: (r) => {
        const brigade =
          kind === 'worker' && r.brigade_id != null ? brigadeName.get(r.brigade_id) : undefined;
        return (
          <span className={s.cellStack}>
            <span>{r.name}</span>
            {brigade ? <span className={s.cellSub}>{brigade}</span> : null}
          </span>
        );
      },
    },
    {
      key: 'closed',
      header: t('rating.col.closed'),
      align: 'right',
      mono: true,
      render: (r) => formatInt(num(r.closed) ?? 0),
    },
    ...RATING_COMPONENTS.map((k): Column<RatingRow> => ({
      key: k,
      header: <ComponentHeader k={k} />,
      align: 'right',
      mono: true,
      render: (r) => (num(r[k]) == null ? '' : shareText(r[k])),
    })),
    {
      key: 'score',
      header: t('rating.col.score'),
      align: 'right',
      render: (r) => {
        const score = num(r.score);
        if (score == null) return <span className={s.note}>{r.note ?? t('rating.no_closed')}</span>;
        return <strong className={s.mono}>{scoreText(score)}</strong>;
      },
    },
  ];

  return (
    <Table
      columns={columns}
      rows={rows}
      rowKey={(r) => `${r.kind}:${r.id}`}
      caption={t('rating.table_title')}
    />
  );
}
