// Values that belong to one take of the demo script. They match the stills in docs/screenshots/presentation today;
// after a recording session (RECORDING.md) set them to what the recorded screens show, so captions never disagree
// with the footage.
export const TAKE = {
  emergencyNo: 661,
  deadlineNo: 662,
  /** Second order of step 4: unit, area, the moment it went to the queue (HH:MM) and its deadline in UTC. */
  deadlineOrder: {
    equipment: "Насос водоотлива ЦНС-300 №2",
    area: "Карьер",
    queuedAt: "10:36",
    dueUtc: "2026-10-16T05:37:00Z",
  },
  verdict: { score: 87, label: "Принято", confidencePct: 80 },
  rework: { score: 40, bearings: 6, normMax: 2, bearing: "подшипник 3626" },
} as const;
