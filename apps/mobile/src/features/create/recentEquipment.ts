// Recently used units on this phone, newest first (CLAUDE.md §10b step 3). Per device, AsyncStorage.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

const KEY = 'rota.recentEquipment';
const MAX = 6;

export async function loadRecentEquipment(): Promise<number[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const value: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(value)) return [];
    return value.filter((v): v is number => typeof v === 'number' && Number.isFinite(v)).slice(0, MAX);
  } catch {
    return [];
  }
}

/** Puts the unit first and keeps the last 6. */
export async function rememberEquipment(id: number): Promise<void> {
  const prev = await loadRecentEquipment();
  const next = [id, ...prev.filter((x) => x !== id)].slice(0, MAX);
  await AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => undefined);
}

/** The recent unit ids, loaded once when the screen opens. */
export function useRecentEquipment(): number[] {
  const [ids, setIds] = useState<number[]>([]);
  useEffect(() => {
    let alive = true;
    loadRecentEquipment().then((v) => {
      if (alive) setIds(v);
    });
    return () => {
      alive = false;
    };
  }, []);
  return ids;
}
