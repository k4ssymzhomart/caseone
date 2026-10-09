// Values that belong to one take of the demo script. They match the recorded footage in public/footage: take 2 of
// 09.10.2026 on the iOS simulators (A iPhone 17 Pro, master 1001; B iPhone 16, worker 2001, then 2002 for the rework),
// Release build against the live database. Times are Asia/Qostanay as the phones show them. The measured intervals of
// the same take are in docs/live-loop-timings.md. After a new recording session (RECORDING.md) set them again, so
// captions never disagree with the footage.
export const TAKE = {
  emergencyNo: 660,
  deadlineNo: 661,
  /** Second order of step 4: unit, area, the moment it went to the queue (HH:MM, as the overdue message prints it) and
   * its deadline in UTC (orders.due_at 04:02:14.150Z; the phones show «до 09:02»). */
  deadlineOrder: {
    equipment: "Насос водоотлива ЦНС-300 №2",
    area: "Карьер",
    queuedAt: "09:01",
    dueUtc: "2026-10-09T04:02:14Z",
  },
  /** The issue of №660 as the app's own toast reports it: «Выдан за 6 нажатий · 0:15». The sixth tap is the optional
   * «Фото до» (the library pick is not counted); without the photo the required fields take 5. */
  issue: { taps: 6, seconds: 15, withBeforePhoto: true },
  /** AI review of №660 (claude-sonnet-5-5, model call 6,4 s). */
  verdict: { score: 84, label: "Принято", confidencePct: 85 },
  /** The checks and the worker report of №660 word for word, for captions that quote them. */
  verdictDetails: {
    checks: [
      { id: "R1", title: "Полнота отчёта", points: 20, max: 20, status: "pass", note: "отчёт заполнен, шифр и материалы указаны" },
      { id: "R2", title: "Подлинность фото", points: 7, max: 10, status: "warn", note: "фото после загружено из галереи" },
      { id: "R3", title: "Материалы", points: 15, max: 15, status: "pass", note: "материалы в пределах нормы" },
      { id: "R4", title: "Время и срок", points: 10, max: 20, status: "warn", note: "время 5 мин при нормативе 3 мин" },
      { id: "L1", title: "Работы и шифр", points: 20, max: 20, status: "pass", note: "" },
      { id: "L2", title: "Фото после", points: 12, max: 15, status: "pass", note: "" },
    ],
    good: ["Течь устранена, пол после работ чистый.", "Шифр Г-01 выбран верно, материалы списаны в пределах нормы."],
    improve: [
      "Делайте фото после работ в приложении, а не из галереи.",
      "Опишите работы подробнее: какие кольца и где заменены, сколько масла долито.",
    ],
    workerTime: "Время: 5 мин при нормативе 3 мин",
  },
  rework: { score: 45, bearings: 6, normMax: 2, bearing: "подшипник 3626" },
  /** Phone to phone intervals measured on this take's recordings (docs/live-loop-timings.md), seconds. */
  live: {
    issueToRedScreen: 0.72,
    acceptToMaster: 1.39,
    startToMaster: 1.15,
    submitToVerdict: 8.49,
    submitToMasterToast: 8.63,
    closeToWorker: 0.71,
    reworkSubmitToVerdict: 8.32,
  },
} as const;
