// Strings for the create screens. Russian, sentence case, short, no hyphens or dashes (PHASE_0 §6.12).
export const createRu: Record<string, string> = {
  'create.title': 'Новый наряд',
  'create.close': 'Закрыть',
  'create.discard.title': 'Закрыть без выдачи?',
  'create.discard.message': 'Заполненные поля не сохранятся.',
  'create.discard.confirm': 'Закрыть',

  // Tap counter (demo mode): «5 нажатий · 0:38»
  'create.taps': '{count} {word} · {time}',
  'create.tap.one': 'нажатие',
  'create.tap.few': 'нажатия',
  'create.tap.many': 'нажатий',

  // Presets
  'create.section.preset': 'Тип наряда',
  'create.preset.emergency': 'Аварийный',
  'create.preset.unplanned': 'Внеплановый',
  'create.preset.planned': 'Плановый',

  // Equipment
  'create.section.equipment': 'Оборудование',
  'create.area.all': 'Все участки',
  'create.equipment.more': 'Ещё {n}',
  'create.equipment.other': 'Другое оборудование',
  'create.equipment.openOrders': 'Открытых нарядов: {n}',

  // Problem
  'create.section.problem': 'Неисправность',
  'create.problem.label': 'Описание',
  'create.problem.placeholder': 'Опишите неисправность',
  'create.problem.hint': 'Выберите оборудование, чтобы увидеть типовые неисправности',
  'create.problem.norm': 'норматив {duration}',

  // Assignee
  'create.section.assignee': 'Исполнитель',
  'create.assignee.needEquipment': 'Выберите оборудование, и ИИ предложит исполнителя',
  'create.assignee.loading': 'ИИ подбирает исполнителя',
  'create.assignee.none': 'ИИ не нашёл подходящего исполнителя на смене',
  'create.assignee.error': 'Не удалось получить предложение ИИ',
  'create.assignee.manual': 'Выбран вручную',
  'create.assignee.brigadeLeader': 'Бригадир {name}',
  'create.assignee.other': 'Другой исполнитель',
  'create.assignee.pick': 'Выбрать исполнителя',

  // Deadline
  'create.section.deadline': 'Срок',
  'create.deadline.pill': '{duration} · до {time}',
  'create.deadline.shiftEndPill': 'Конец смены · до {time}',
  'create.deadline.sheetTitle': 'Срок выполнения',
  'create.deadline.byNorm': 'По нормативу',
  'create.deadline.byPriority': 'По приоритету',
  'create.deadline.shiftEnd': 'Конец смены',
  'create.deadline.untilTime': 'до {time}',
  'create.deadline.demo': 'Демо режим',

  // Equipment stopped
  'create.stopped': 'Оборудование остановлено',
  'create.stopped.hint': 'Простой учитывается с момента выдачи',

  // Photos
  'create.section.photos': 'Фото до',
  'create.photos.add': 'Снять фото',
  'create.photos.library': 'Из галереи',
  'create.photos.photo': 'Фото',
  'create.photos.remove': 'Удалить фото',
  'create.photos.removeTitle': 'Удалить фото?',
  'create.photos.removeConfirm': 'Удалить',
  'create.photos.retry': 'Повторить',
  'create.photos.permission': 'Нет доступа к камере или галерее. Разрешите его в настройках телефона',
  'create.photos.failed': 'Фото не обработано. Попробуйте ещё раз',
  'create.photos.uploadFailed': 'Фото не загрузилось. Нажмите на него, чтобы повторить',
  'create.photos.simulator': 'Симулятор: фото из галереи',

  // Comment
  'create.comment': 'Комментарий',
  'create.comment.add': 'Добавить',
  'create.comment.placeholder': 'Что важно знать исполнителю',

  // Submit
  'create.submit': 'Выдать',
  'create.missing': 'Осталось выбрать: {list}',
  'create.missing.equipment': 'оборудование',
  'create.missing.description': 'неисправность',
  'create.missing.assignee': 'исполнителя',
  'create.hud.issued': 'Наряд выдан',
  'create.hud.issuedDemo': 'Выдан за {taps}',

  // Loading the form
  'create.loading': 'Загружаем справочники',
  'create.loadError.title': 'Справочники не загрузились',
  'create.loadError.body': 'Проверьте связь и повторите',

  // Assignee picker
  'create.picker.title': 'Исполнитель',
  'create.picker.workers': 'Исполнители',
  'create.picker.brigades': 'Бригады',
  'create.picker.suggested': 'Предлагает ИИ',
  'create.picker.onShift': 'На смене',
  'create.picker.offShift': 'Не на смене',
  'create.picker.grade': '{specialty} {grade} разряда',
  'create.picker.free': 'Свободно {n}',
  'create.picker.busy': 'Занято {n}',
  'create.picker.noneOnShift': 'Никого на смене',
  'create.picker.leader': 'Бригадир {name}',
  'create.picker.noLeader': 'Бригадир не назначен',
  'create.picker.selected': 'Выбран',
  'create.picker.empty': 'Список пуст',
  'create.picker.error': 'Список не загрузился',
};
