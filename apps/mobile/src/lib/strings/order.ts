// Strings for the order screens. Russian, sentence case, short, no hyphens or dashes (PHASE_0 §6.12).
// Keys avoid the chrome keys of lib/strings.ts (order.badge.*, order.due, order.lateShort), which win on a clash.
export const orderRu: Record<string, string> = {
  // order screen: info rows
  'order.detail.area': 'Участок',
  'order.detail.equipment': 'Оборудование',
  'order.detail.priority': 'Приоритет',
  'order.detail.due': 'Срок',
  'order.detail.dueActive': 'до {time} · {left}',
  'order.detail.dueDone': 'до {time}',
  'order.detail.dueLate': 'до {time} · срок нарушен на {duration}',
  'order.detail.master': 'Мастер',
  'order.detail.assignee': 'Исполнитель',
  'order.detail.description': 'Описание',
  'order.detail.comment': 'Комментарий',
  'order.detail.lastComment': 'Последний комментарий',
  'order.detail.stopped': 'Оборудование остановлено',
  'order.detail.info': 'Наряд',
  'order.detail.work': 'Выполненные работы',
  'order.detail.worksDone': 'Что сделано',
  'order.detail.faultCode': 'Шифр неисправности',
  'order.detail.materials': 'Материалы',
  'order.detail.materialLine': '{name} · {qty} {unit}',
  'order.detail.photosBefore': 'Фото до',
  'order.detail.photosAfter': 'Фото после',
  'order.detail.photo': 'Фото',
  'order.detail.timeline': 'История',
  'order.detail.loadError': 'Не удалось открыть наряд',
  'order.detail.badId': 'Наряд не найден',
  'order.detail.photoClose': 'Закрыть',

  // banners
  'order.banner.overdue': 'Наряд просрочен на {duration}',
  'order.banner.paused': 'Приостановлен: {reason}',
  'order.banner.rejected': 'Отклонён: {reason}',
  'order.banner.cancelled': 'Наряд отменён',
  'order.banner.waitsMaster': 'ИИ не уверен в оценке. Ждёт проверки мастером',
  'order.banner.aiReview': 'ИИ проверяет наряд',

  // rework card
  'order.rework.title': 'Нужно доработать',
  'order.rework.byMaster': 'Мастер вернул наряд',
  'order.rework.byAi': 'ИИ вернул наряд',
  'order.rework.noReasons': 'Причины в отчёте ИИ',

  // timeline
  'order.event.withReason': '{label} · {reason}',
  'order.event.verdict': '{label} · {verdict}, {score}',
  'order.event.reassignTo': '{label} · {name}',
  'order.event.priority': '{label} · {priority}',
  'order.event.comment': '“{comment}”',
  'order.event.actorUnknown': 'Сотрудник',

  // action bar
  'order.action.accept': 'Принять в работу',
  'order.action.queue': 'В очередь',
  'order.action.reject': 'Отклонить',
  'order.action.start': 'Начать исполнение',
  'order.action.complete': 'Исполнено',
  'order.action.pause': 'Приостановить',
  'order.action.resume': 'Продолжить',
  'order.action.resumeRework': 'Начать доработку',
  'order.action.review': 'Отчёт ИИ',
  'order.action.reassign': 'Переназначить',
  'order.action.priority': 'Приоритет',
  'order.action.cancel': 'Отменить',
  'order.action.justify': 'Отказ обоснован',

  // HUD after a successful action
  'order.hud.accepted': 'Принят в работу',
  'order.hud.queued': 'В очереди',
  'order.hud.started': 'В работе',
  'order.hud.resumed': 'Работа продолжена',
  'order.hud.reworkStarted': 'Доработка начата',
  'order.hud.paused': 'Приостановлен',
  'order.hud.rejected': 'Отклонён',
  'order.hud.priority': 'Приоритет изменён',
  'order.hud.cancelled': 'Наряд отменён',
  'order.hud.justified': 'Отказ признан обоснованным',

  // reason sheet
  'order.reason.rejectTitle': 'Причина отказа',
  'order.reason.pauseTitle': 'Причина паузы',
  'order.reason.close': 'Закрыть',
  'order.reason.otherLabel': 'Опишите причину',
  'order.reason.otherPlaceholder': 'Например, нужен второй человек',
  'order.reason.commentLabel': 'Комментарий',
  'order.reason.commentPlaceholder': 'Необязательно',
  'order.reason.confirmReject': 'Отклонить наряд',
  'order.reason.confirmPause': 'Приостановить',

  // priority sheet
  'order.priority.title': 'Приоритет наряда №{n}',
  'order.priority.save': 'Сохранить',

  // cancel sheet
  'order.cancel.title': 'Отменить наряд №{n}',
  'order.cancel.subtitle': 'Исполнитель получит уведомление',
  'order.cancel.reason': 'Причина отмены',
  'order.cancel.placeholder': 'Например, выдан по ошибке',
  'order.cancel.confirm': 'Отменить наряд',
  'order.cancel.keep': 'Не отменять',
  'order.cancel.confirmTitle': 'Отменить наряд №{n}?',

  // emergency screen
  'order.emergency.title': 'Аварийный наряд',
  'order.emergency.eyebrow': '№{n} · до {time}',
  'order.emergency.accept': 'Принять',
  'order.emergency.reject': 'Отклонить',
  'order.emergency.demoNumber': '148',
  'order.emergency.demoTime': '11:30',
  'order.emergency.demoEquipment': 'Насос НШ-32 маслостанции',
  'order.emergency.demoArea': 'Участок обогащения',
  'order.emergency.demoDescription': 'Течь масла',
  'order.emergency.loading': 'Загружаем наряд',
};
