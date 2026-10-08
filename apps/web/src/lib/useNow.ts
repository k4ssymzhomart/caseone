import { useEffect, useState } from 'react';

/** The current time, re-rendering every `intervalMs` (default 30 s): pass it to OrderCard and time formatters so
 *  «осталось 24 мин» and «просрочен на 12 мин» move without a refetch. */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
