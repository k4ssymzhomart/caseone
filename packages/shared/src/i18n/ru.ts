// Russian strings. Sentence case, short, no emoji, no hyphens or dashes in copy
// (fault codes like «М-02» are data and keep theirs). Placeholders: {name}.
// Keys are flat: area.key. Add new keys here; t() only accepts known keys.

export const ru = {
  // product
  'app.name': 'Rota',
  'app.slogan': 'Наряд выдан, ИИ на контроле',

  // statuses (CLAUDE.md §6)
  'status.issued': 'Выдан',
  'status.accepted': 'Принят в работу',
  'status.queued': 'В очереди',
  'status.rejected': 'Отклонён',
  'status.in_progress': 'В работе',
  'status.paused': 'Приостановлен',
  'status.done': 'Исполнено',
  'status.ai_review': 'Проверка ИИ',
  'status.rework': 'На доработку',
  'status.closed': 'Закрыт',
  'status.cancelled': 'Отменён',
  'status.overdue': 'Просрочен',

  // board columns
  'board.issued': 'Выданы',
  'board.accepted': 'Приняты',
  'board.queued': 'В очереди',
  'board.in_progress': 'В работе',
  'board.done': 'Выполнены',
  'board.overdue': 'Просрочены',
  'board.badge.rejected': 'Отклонён: {reason}',
  'board.badge.paused': 'Пауза: {reason}',
  'board.badge.rework': 'Доработка',
  'board.badge.ai_review': 'Проверка ИИ',
  'board.badge.waiting_master': 'Ждёт подтверждения',
  'board.badge.needs_master_review': 'Нужна проверка мастером',

  // reject reasons
  'reject.no_materials': 'Нет материалов',
  'reject.no_permit': 'Нет допуска',
  'reject.busy_emergency': 'Занят аварийным',
  'reject.equipment_running': 'Оборудование работает',
  'reject.other': 'Другое',

  // pause reasons
  'pause.waiting_parts': 'Ожидание запчастей',
  'pause.waiting_stop': 'Ожидание остановки',
  'pause.waiting_permit': 'Ожидание допуска',
  'pause.other': 'Другое',

  // priorities and order types
  'priority.emergency': 'Аварийный',
  'priority.high': 'Высокий',
  'priority.normal': 'Обычный',
  'priority.planned': 'Плановый',
  'order_type.planned': 'Плановый',
  'order_type.unplanned': 'Внеплановый',

  // AI verdicts
  'verdict.accepted': 'Принято',
  'verdict.accepted_with_remarks': 'Принято с замечаниями',
  'verdict.rework': 'Требует доработки',
  'verdict.needs_master_review': 'Нужна проверка мастером',

  // worker states (CLAUDE.md §7)
  'worker_state.free': 'Свободен',
  'worker_state.working': 'Выполняет наряд №{number}',
  'worker_state.queue': 'В очереди {count}',
  'worker_state.off': 'Не на смене',

  // shifts
  'shift.day': 'Дневная смена',
  'shift.night': 'Ночная смена',
  'shift.on': 'На смене',
  'shift.off': 'Не на смене',

  // order actions (button labels)
  'action.accept': 'Принять',
  'action.queue': 'В очередь',
  'action.reject': 'Отклонить',
  'action.start': 'Начать',
  'action.pause': 'Приостановить',
  'action.resume': 'Продолжить',
  'action.complete': 'Завершить',
  'action.resume_rework': 'Начать доработку',
  'action.close': 'Согласен, закрыть',
  'action.override': 'Изменить оценку',
  'action.return': 'Вернуть на доработку',
  'action.reassign': 'Переназначить',
  'action.reassign_to': 'Переназначить на {name}',
  'action.cancel': 'Отменить наряд',
  'action.set_priority': 'Изменить приоритет',
  'action.mark_reject_justified': 'Отказ обоснован',
  'action.issue': 'Выдать',
  'action.open': 'Открыть',

  // event log (timeline)
  'event.create': 'Наряд выдан',
  'event.accept': 'Принят в работу',
  'event.queue': 'Поставлен в очередь',
  'event.reject': 'Отклонён',
  'event.start': 'Начата работа',
  'event.pause': 'Приостановлен',
  'event.resume': 'Работа продолжена',
  'event.complete': 'Работа завершена',
  'event.review_started': 'Проверка ИИ',
  'event.ai_result': 'Результат проверки ИИ',
  'event.close': 'Закрыт мастером',
  'event.return': 'Возвращён на доработку',
  'event.resume_rework': 'Начата доработка',
  'event.reassign': 'Переназначен',
  'event.cancel': 'Отменён',
  'event.set_priority': 'Изменён приоритет',
  'event.mark_reject_justified': 'Отказ признан обоснованным',
  'event.actor.system': 'Система',

  // AI checks
  'check.pass': 'Пройдено',
  'check.warn': 'Замечание',
  'check.fail': 'Нарушение',
  'check.skipped': 'Не выполнено',
  'review.score': '{score} из 100',
  'review.score5': '{score5} из 5',
  'review.good': 'Что хорошо',
  'review.improve': 'Что улучшить',
  'review.confidence': 'Уверенность {value}',
  'review.time': 'Время: {actual} при нормативе {norm}',

  // errors (RotaError codes; PHASE_1 §6)
  'error.FORBIDDEN': 'Нет прав на это действие',
  'error.BAD_TRANSITION': 'Статус уже изменился',
  'error.MISSING_REASON': 'Укажите причину',
  'error.ANOTHER_IN_PROGRESS': 'Приостановить наряд №{number} и начать этот?',
  'error.NOT_ON_SHIFT': '{name} не на смене. Всё равно выдать?',
  'error.NOT_ON_SHIFT_GENERIC': 'Исполнитель не на смене. Всё равно выдать?',
  'error.BAD_INPUT': 'Проверьте поля наряда',
  'error.BUDGET_EXCEEDED': 'Лимит ИИ исчерпан. Проверка только по правилам',
  'error.WRONG_PIN': 'Неверный табельный номер или ПИН',
  'error.NETWORK': 'Нет связи. Повторить?',
  'error.UNKNOWN': 'Не получилось. Повторите попытку',

  // common
  'common.retry': 'Повторить',
  'common.cancel': 'Отмена',
  'common.confirm': 'Подтвердить',
  'common.save': 'Сохранить',
  'common.back': 'Назад',
  'common.loading': 'Загрузка',
  'common.empty': 'Пока пусто',
  'common.no_connection': 'Нет связи',
  'common.minutes_short': 'мин',
  'common.hours_short': 'ч',
  'common.no_materials': 'Без материалов',

  // auth
  'auth.tab_no': 'Табельный номер',
  'auth.pin': 'ПИН',
  'auth.sign_in': 'Войти',
  'auth.sign_out': 'Выйти',
} as const satisfies Record<string, string>;

export type I18nKey = keyof typeof ru;
