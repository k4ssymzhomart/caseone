// /admin/directories (admin): read only tables for every directory (areas, equipment, brigades, employees, fault
// codes, materials, work norms, problem templates, equipment type specialties). Data: useDirectories(). The open
// tab lives in ?tab= so a link can point at one directory; the search filters the rows of the open tab.
import {
  formatCount,
  formatInt,
  formatNorm,
  formatQty,
  ruNum,
  FAULT_GROUPS,
  SHIFT_LABEL,
  type Directories,
  type PluralForms,
} from '@rota/shared';
import { useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { EmptyState, Field, Input, Page, Pill, QueryState, Segmented, Table, Tag, type Column } from '@/components/ui';
import { t, tData } from '@/lib/i18n';
import { useDirectories } from '@/lib/queries';
import type { WebKey } from '@/lib/strings';
import styles from './admin.module.css';

const TABS = [
  'equipment',
  'areas',
  'brigades',
  'employees',
  'fault_codes',
  'work_norms',
  'materials',
  'problem_templates',
  'equipment_type_specialty',
] as const;
type Tab = (typeof TABS)[number];

const isTab = (value: string | null): value is Tab => value != null && (TABS as readonly string[]).includes(value);

const rowForms = (): PluralForms => [t('admin.dir.rows_one'), t('admin.dir.rows_few'), t('admin.dir.rows_many')];

/** Lower case, ё as е: «Литол» finds «литол», «ковалев» finds «Ковалёв». */
const norm = (text: string) => text.toLocaleLowerCase('ru').replace(/ё/g, 'е');

/** «нет» where the absence means something (no leader, no norm, Telegram not linked). */
const none = () => <span className={styles.muted}>{t('admin.none')}</span>;

/** Fault codes in the order of the case: М, Э, Г, П, С, then by number. */
const groupRank = (code: string) => {
  const i = (FAULT_GROUPS as readonly string[]).indexOf(code.charAt(0));
  return i < 0 ? FAULT_GROUPS.length : i;
};
const byFaultCode = (a: string, b: string) => groupRank(a) - groupRank(b) || a.localeCompare(b, 'ru');

/** One directory as a table: the rows, its columns and the text the search looks at. */
interface TabView<Row> {
  rows: readonly Row[];
  columns: readonly Column<Row>[];
  rowKey: (row: Row) => string | number;
  text: (row: Row) => string;
}

interface RenderedTab {
  total: number;
  render: (query: string) => { shown: number; node: ReactNode };
}

/** Erases the row type, so every directory fits in one record. */
function tab<Row>(view: TabView<Row>): RenderedTab {
  return {
    total: view.rows.length,
    render: (query) => {
      const q = norm(query.trim());
      const rows = q ? view.rows.filter((r) => norm(view.text(r)).includes(q)) : view.rows;
      return {
        shown: rows.length,
        node: (
          <Table
            columns={view.columns}
            rows={rows}
            rowKey={view.rowKey}
            empty={
              q ? (
                <EmptyState mascot="search" mascotSize={96} title={t('admin.dir.no_match_title')} text={t('admin.dir.no_match_text')} />
              ) : (
                <EmptyState mascot="peek" mascotSize={96} title={t('admin.dir.empty_title')} text={t('admin.dir.empty_text')} />
              )
            }
          />
        ),
      };
    },
  };
}

function buildTabs(d: Directories): Record<Tab, RenderedTab> {
  const areaById = new Map(d.areas.map((a) => [a.id, a]));
  const areaSort = (id: number) => areaById.get(id)?.sort ?? id;
  const brigadeById = new Map(d.brigades.map((b) => [b.id, b]));
  const employeeById = new Map(d.employees.map((e) => [e.id, e]));
  const materialById = new Map(d.materials.map((m) => [m.id, m]));
  const faultByCode = new Map(d.fault_codes.map((f) => [f.code, f]));
  const normByCode = new Map(d.work_norms.map((n) => [n.fault_code, n]));
  const areaName = (id: number) => areaById.get(id)?.name ?? String(id);
  const brigadeName = (id: number | null) => (id == null ? '' : (brigadeById.get(id)?.name ?? String(id)));
  const groupLabel = (grp: string) => tData(`admin.group.${grp}`);
  const typicalLine = (materialId: number, qty: number, max: number) => {
    const m = materialById.get(materialId);
    return t('admin.typical.line', {
      name: m?.name ?? `№${materialId}`,
      qty: m ? formatQty(qty, m.unit) : ruNum(qty),
      max: ruNum(max),
    });
  };

  const equipment = [...d.equipment].sort((a, b) => areaSort(a.area_id) - areaSort(b.area_id) || a.id - b.id);
  const areas = [...d.areas].sort((a, b) => a.sort - b.sort || a.id - b.id);
  const employees = [...d.employees].sort((a, b) => a.tab_no.localeCompare(b.tab_no));
  const templates = [...d.problem_templates].sort(
    (a, b) => a.equipment_type.localeCompare(b.equipment_type, 'ru') || a.sort - b.sort || a.id - b.id,
  );
  const specialties = [...d.equipment_type_specialty].sort((a, b) => a.type.localeCompare(b.type, 'ru'));
  const norms = [...d.work_norms].sort((a, b) => byFaultCode(a.fault_code, b.fault_code));
  const faultCodes = [...d.fault_codes].sort((a, b) => byFaultCode(a.code, b.code));

  return {
    equipment: tab({
      rows: equipment,
      rowKey: (e) => e.id,
      text: (e) => `${e.name} ${areaName(e.area_id)} ${e.type} ${e.inventory_no ?? ''} ${e.criticality}`,
      columns: [
        { key: 'name', header: t('admin.col.name'), render: (e) => <span className={styles.strong}>{e.name}</span> },
        { key: 'area', header: t('admin.col.area'), render: (e) => areaName(e.area_id) },
        { key: 'type', header: t('admin.col.type'), render: (e) => e.type },
        {
          key: 'criticality',
          header: t('admin.col.criticality'),
          align: 'center',
          render: (e) => <Tag>{e.criticality}</Tag>,
        },
        { key: 'inventory_no', header: t('admin.col.inventory_no'), mono: true, render: (e) => e.inventory_no ?? '' },
        {
          key: 'state',
          header: t('admin.col.state'),
          render: (e) =>
            e.is_stopped ? (
              <Pill tone="critical">{t('admin.equipment.stopped')}</Pill>
            ) : (
              <Pill tone="free">{t('admin.equipment.running')}</Pill>
            ),
        },
      ],
    }),
    areas: tab({
      rows: areas,
      rowKey: (a) => a.id,
      text: (a) => `${a.code} ${a.name}`,
      columns: [
        { key: 'code', header: t('admin.col.code'), mono: true, width: 120, render: (a) => a.code },
        { key: 'name', header: t('admin.col.name'), render: (a) => <span className={styles.strong}>{a.name}</span> },
        {
          key: 'units',
          header: t('admin.col.units'),
          align: 'right',
          mono: true,
          render: (a) => formatInt(d.equipment.filter((e) => e.area_id === a.id).length),
        },
        {
          key: 'stopped',
          header: t('admin.col.stopped'),
          align: 'right',
          mono: true,
          render: (a) => formatInt(d.equipment.filter((e) => e.area_id === a.id && e.is_stopped).length),
        },
      ],
    }),
    brigades: tab({
      rows: d.brigades,
      rowKey: (b) => b.id,
      text: (b) => `${b.name} ${b.leader_id ? (employeeById.get(b.leader_id)?.full_name ?? '') : ''}`,
      columns: [
        { key: 'name', header: t('admin.col.name'), render: (b) => <span className={styles.strong}>{b.name}</span> },
        {
          key: 'leader',
          header: t('admin.col.leader'),
          render: (b) => (b.leader_id ? (employeeById.get(b.leader_id)?.short_name ?? none()) : none()),
        },
        {
          key: 'members',
          header: t('admin.col.members'),
          align: 'right',
          mono: true,
          render: (b) => formatInt(d.employees.filter((e) => e.brigade_id === b.id).length),
        },
        {
          key: 'on_shift',
          header: t('admin.col.on_shift'),
          align: 'right',
          mono: true,
          render: (b) => formatInt(d.employees.filter((e) => e.brigade_id === b.id && e.on_shift).length),
        },
      ],
    }),
    employees: tab({
      rows: employees,
      rowKey: (e) => e.id,
      text: (e) =>
        `${e.tab_no} ${e.full_name} ${e.short_name} ${tData(`role.${e.role}`)} ${e.specialty ?? ''} ${brigadeName(e.brigade_id)} ${e.pseudonym}`,
      columns: [
        { key: 'tab_no', header: t('admin.col.tab_no'), mono: true, render: (e) => e.tab_no },
        { key: 'name', header: t('admin.col.employee'), render: (e) => <span className={styles.strong}>{e.full_name}</span> },
        { key: 'role', header: t('admin.col.role'), render: (e) => tData(`role.${e.role}`) },
        { key: 'specialty', header: t('admin.col.specialty'), render: (e) => e.specialty ?? '' },
        { key: 'grade', header: t('admin.col.grade'), align: 'right', mono: true, render: (e) => e.grade ?? '' },
        { key: 'brigade', header: t('admin.col.brigade'), render: (e) => brigadeName(e.brigade_id) },
        { key: 'shift', header: t('admin.col.shift'), render: (e) => (e.shift ? SHIFT_LABEL[e.shift] : '') },
        {
          key: 'on_shift',
          header: t('admin.col.on_shift'),
          render: (e) =>
            e.on_shift ? (
              <Pill tone="free">{t('admin.employee.on_shift')}</Pill>
            ) : (
              <Pill tone="off">{t('admin.employee.off_shift')}</Pill>
            ),
        },
        { key: 'pseudonym', header: t('admin.col.pseudonym'), mono: true, render: (e) => e.pseudonym },
        {
          key: 'telegram',
          header: t('admin.col.telegram'),
          render: (e) => (e.telegram_chat_id != null ? t('admin.telegram.linked') : none()),
        },
      ],
    }),
    fault_codes: tab({
      rows: faultCodes,
      rowKey: (f) => f.code,
      text: (f) => `${f.code} ${f.name} ${f.specialty} ${groupLabel(f.grp)}`,
      columns: [
        { key: 'code', header: t('admin.col.fault_code'), width: 96, render: (f) => <Tag>{f.code}</Tag> },
        { key: 'group', header: t('admin.col.group'), render: (f) => groupLabel(f.grp) },
        { key: 'name', header: t('admin.col.name'), render: (f) => f.name },
        { key: 'specialty', header: t('admin.col.specialty'), render: (f) => f.specialty },
        {
          key: 'norm',
          header: t('admin.col.norm'),
          align: 'right',
          mono: true,
          render: (f) => {
            const n = normByCode.get(f.code);
            return n ? <span className={styles.nowrap}>{formatNorm(n.norm_hours)}</span> : none();
          },
        },
      ],
    }),
    work_norms: tab({
      rows: norms,
      rowKey: (n) => n.fault_code,
      text: (n) =>
        `${n.fault_code} ${faultByCode.get(n.fault_code)?.name ?? ''} ${n.typical
          .map((m) => materialById.get(m.material_id)?.name ?? '')
          .join(' ')}`,
      columns: [
        { key: 'code', header: t('admin.col.fault_code'), width: 96, render: (n) => <Tag>{n.fault_code}</Tag> },
        { key: 'name', header: t('admin.col.name'), render: (n) => faultByCode.get(n.fault_code)?.name ?? none() },
        {
          key: 'norm',
          header: t('admin.col.norm'),
          mono: true,
          render: (n) => <span className={styles.nowrap}>{formatNorm(n.norm_hours)}</span>,
        },
        {
          key: 'typical',
          header: t('admin.col.typical'),
          render: (n) =>
            n.typical.length === 0 ? (
              none()
            ) : (
              <ul className={styles.lines}>
                {n.typical.map((m) => (
                  <li key={m.material_id}>{typicalLine(m.material_id, m.qty, m.qty_max)}</li>
                ))}
              </ul>
            ),
        },
      ],
    }),
    materials: tab({
      rows: d.materials,
      rowKey: (m) => m.id,
      text: (m) => `${m.sku} ${m.name} ${m.unit}`,
      columns: [
        { key: 'sku', header: t('admin.col.sku'), mono: true, width: 140, render: (m) => m.sku },
        { key: 'name', header: t('admin.col.name'), render: (m) => <span className={styles.strong}>{m.name}</span> },
        { key: 'unit', header: t('admin.col.unit'), render: (m) => m.unit },
        {
          key: 'cost',
          header: t('admin.col.cost'),
          align: 'right',
          mono: true,
          render: (m) => <span className={styles.nowrap}>{formatInt(Number(m.unit_cost_kzt))}</span>,
        },
      ],
    }),
    problem_templates: tab({
      rows: templates,
      rowKey: (p) => p.id,
      text: (p) => `${p.equipment_type} ${p.label} ${p.suggested_fault_code ?? ''}`,
      columns: [
        { key: 'type', header: t('admin.col.equipment_type'), render: (p) => p.equipment_type },
        { key: 'label', header: t('admin.col.problem'), render: (p) => <span className={styles.strong}>{p.label}</span> },
        {
          key: 'code',
          header: t('admin.col.suggested_code'),
          render: (p) => (p.suggested_fault_code ? <Tag>{p.suggested_fault_code}</Tag> : none()),
        },
        {
          key: 'code_name',
          header: t('admin.col.name'),
          render: (p) =>
            p.suggested_fault_code ? (
              <span className={styles.muted}>{faultByCode.get(p.suggested_fault_code)?.name ?? ''}</span>
            ) : null,
        },
      ],
    }),
    equipment_type_specialty: tab({
      rows: specialties,
      rowKey: (s) => s.type,
      text: (s) => `${s.type} ${s.specialty} ${s.label_plural_dat ?? ''}`,
      columns: [
        { key: 'type', header: t('admin.col.equipment_type'), render: (s) => <span className={styles.strong}>{s.type}</span> },
        { key: 'specialty', header: t('admin.col.specialty'), render: (s) => s.specialty },
        { key: 'plural', header: t('admin.col.plural'), render: (s) => s.label_plural_dat ?? none() },
      ],
    }),
  };
}

export function DirectoriesPage() {
  const query = useDirectories();
  const [search, setSearch] = useState('');
  return (
    <Page
      title={t('page.admin_directories')}
      eyebrow={t('admin.readonly')}
      actions={
        <div className={styles.search}>
          <Field label={t('admin.dir.search')} hideLabel>
            {(id) => (
              <Input
                id={id}
                type="search"
                value={search}
                placeholder={t('admin.dir.search_placeholder')}
                onChange={(e) => setSearch(e.target.value)}
                autoComplete="off"
              />
            )}
          </Field>
        </div>
      }
    >
      <QueryState query={query}>
        {(d) => <DirectoryTabs directories={d} search={search} onTab={() => setSearch('')} />}
      </QueryState>
    </Page>
  );
}

function DirectoryTabs({ directories, search, onTab }: { directories: Directories; search: string; onTab: () => void }) {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const current: Tab = isTab(raw) ? raw : 'equipment';
  const tabs = useMemo(() => buildTabs(directories), [directories]);
  const view = tabs[current].render(search);
  const total = tabs[current].total;

  const select = (next: Tab) => {
    onTab();
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.set('tab', next);
        return p;
      },
      { replace: true },
    );
  };

  return (
    <>
      <div className={styles.tabsScroll}>
        <Segmented
          label={t('admin.dir.tabs')}
          value={current}
          onChange={select}
          options={TABS.map((key) => ({
            value: key,
            label: `${t(`admin.dir.tab.${key}` as WebKey)} ${tabs[key].total}`,
          }))}
        />
      </div>
      {view.node}
      {total > 0 ? (
        <p className={styles.count}>
          {search.trim() && view.shown !== total
            ? `${view.shown} из ${formatCount(total, rowForms())}`
            : formatCount(total, rowForms())}
        </p>
      ) : null}
    </>
  );
}
