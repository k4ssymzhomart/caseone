// EXIF capture time (CLAUDE.md §17): pure, shared by the native and the web photo modules.

const KZ_OFFSET = '+05:00'; // Asia/Qostanay, UTC+5 all year

/** EXIF «2026:10:09 10:42:13» (camera local time) plus an optional «+05:00» → ISO UTC. */
export function exifTimeToIso(
  value: unknown,
  offset: unknown,
): string | null {
  if (typeof value !== 'string') return null;
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(value.trim());
  if (!m) return null;
  const tz = typeof offset === 'string' && /^[+-]\d{2}:\d{2}$/.test(offset.trim()) ? offset.trim() : KZ_OFFSET;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${tz}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
