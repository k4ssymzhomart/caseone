// Web panel chrome strings. Domain strings (statuses, reasons, verdicts, errors) live in @rota/shared ru.ts; t()
// reads both. Sentence case, short, no emoji, no hyphens or dashes in copy. Add page strings here under the page's
// prefix (shift., board., order., report., rating., analytics., dashboard., equipment., admin., demo.).
export const webRu = {
  // roles
  'role.master': 'Мастер',
  'role.manager': 'Руководитель',
  'role.admin': 'Администратор',
  'role.worker': 'Исполнитель',

  // navigation (sidebar)
  'nav.group.work': 'Работа',
  'nav.group.reports': 'Отчёты',
  'nav.group.admin': 'Администрирование',
  'nav.shift': 'Смена',
  'nav.board': 'Доска нарядов',
  'nav.dashboard': 'Сводка',
  'nav.reports_shift': 'Отчёт смены',
  'nav.reports_rating': 'Рейтинг',
  'nav.analytics': 'Аналитика ИИ',
  'nav.admin_directories': 'Справочники',
  'nav.admin_settings': 'Настройки',
  'nav.admin_ai': 'Что видит ИИ',
  'nav.demo': 'Демо',
  'nav.kit': 'Дизайн кит',
  'nav.version': 'Rota 0.1',

  // page titles (document title and page header)
  'page.login': 'Вход',
  'page.shift': 'Смена',
  'page.board': 'Доска нарядов',
  'page.order': 'Наряд №{number}',
  'page.order_loading': 'Наряд',
  'page.reports_shift': 'Отчёт смены',
  'page.reports_rating': 'Рейтинг исполнителей',
  'page.analytics': 'Аналитика ИИ',
  'page.dashboard': 'Сводка',
  'page.equipment': 'История оборудования',
  'page.admin_directories': 'Справочники',
  'page.admin_settings': 'Настройки',
  'page.admin_ai': 'Что видит ИИ',
  'page.demo': 'Демо',
  'page.kit': 'Дизайн кит',
  'page.not_found': 'Страница не найдена',

  // top bar
  'topbar.theme': 'Тема',
  'topbar.theme_dark': 'Тёмная',
  'topbar.theme_light': 'Светлая',
  'topbar.live': 'В сети',
  'topbar.connecting': 'Подключение',
  'topbar.offline': 'Нет связи',
  'topbar.mode_mock': 'Демо данные',
  'topbar.sign_out': 'Выйти',

  // filter bar (CLAUDE.md §14)
  'filter.label': 'Фильтр отчёта',
  'filter.period': 'Период',
  'filter.preset.shift': 'Смена',
  'filter.preset.day': 'Сутки',
  'filter.preset.week': 'Неделя',
  'filter.preset.month': 'Месяц',
  'filter.preset.custom': 'Период',
  'filter.from': 'С',
  'filter.to': 'По',
  'filter.area': 'Участок',
  'filter.equipment': 'Оборудование',
  'filter.assignee': 'Исполнитель',
  'filter.brigade': 'Бригада',
  'filter.all_areas': 'Все участки',
  'filter.all_equipment': 'Всё оборудование',
  'filter.all_assignees': 'Все исполнители',
  'filter.all_brigades': 'Все бригады',
  'filter.reset': 'Сбросить',

  // login
  'login.title': 'Вход в панель',
  'login.subtitle': 'Табельный номер и ПИН, как в приложении',
  'login.tab_placeholder': 'Например, 1001',
  'login.pin_placeholder': '4 цифры',
  'login.submit': 'Войти',
  'login.submitting': 'Входим',
  'login.demo': 'Демо доступ',
  'login.demo_master': 'Мастер 1001',
  'login.demo_manager': 'Главный механик 3001',
  'login.demo_admin': 'Администратор 9001',
  'login.worker_blocked': 'Исполнители работают в мобильном приложении',
  'login.need_both': 'Введите табельный номер и ПИН',
  'login.mock_note': 'Демо данные в этом браузере',

  // shared page states
  'state.loading': 'Загружаем',
  'state.error_title': 'Не получилось загрузить',
  'state.empty_title': 'Пока пусто',
  'state.placeholder_title': 'Раздел готовится',
  'state.placeholder_text': 'Здесь появятся данные этого раздела.',
  'state.not_found_text': 'Такой страницы нет. Вернитесь на главную.',
  'state.go_home': 'На главную',

  // toasts
  'hud.open': 'Открыть',
  'hud.offline': 'Нет связи. Данные обновятся сами',
  'hud.online': 'Связь восстановлена',
} as const satisfies Record<string, string>;

export type WebKey = keyof typeof webRu;
