import { useEffect, useState } from 'react';

/** The current time, refreshed every `intervalMs` (deadlines on cards, the shift window, overdue moves). */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
