// Route and query params. Path ids: const id = useRouteId(); // /orders/:id → 147, or undefined when not a number.
// The report filter has its own hook (lib/filters.ts useReportFilter). Other query params: useSearchParams() from
// react-router, e.g. the escalation link /orders/{id}?reassign={employee_id} → useSearchParam('reassign').
import { useParams, useSearchParams } from 'react-router';

/** A positive integer path param (default `:id`), or undefined. */
export function useRouteId(name = 'id'): number | undefined {
  const value = useParams()[name];
  if (value == null || !/^\d+$/.test(value)) return undefined;
  const n = Number(value);
  return n > 0 ? n : undefined;
}

/** A query param as text, or undefined when absent or empty. */
export function useSearchParam(name: string): string | undefined {
  const [params] = useSearchParams();
  const value = params.get(name);
  return value ? value : undefined;
}
