# Rota screenshots for the presentation

Real data: Supabase project «rota» with 3 months of history (540 orders, plus the 19 orders of the Demo Day start state). Release build on iPhone 17 Pro (master, 1001) and iPhone 16 (workers 2001, 2002); web panel at 1440 × 900.

## Hero (`hero/`)

The landing hero for the title slide, captured from the production build of `/` in headless Chrome: signed out, dark scheme, reduced motion (the HUD capsule shows its static last state, «ИИ проверил №661 · 84 из 100»). Lossless PNG; the 4K capture is four 1920 × 1080 tiles stitched pixel exact.

| File | What it shows |
| --- | --- |
| `hero-3840x2160.png` | Первый экран лендинга, 1920 × 1080 при 2× (4K, 16:9) |
| `hero-2880x1800.png` | Первый экран лендинга, 1440 × 900 при 2× (16:10) |
| `hero-mobile-1170x2532.png` | Первый экран на телефоне, 390 × 844 при 3× |
| `background-3840x2160.jpg` | Фон героя без текста и телефона: красный шёлк, 4K (`npm run landing:hero-bg`) |

## Mobile (`mobile/`)

| File | What it shows |
| --- | --- |
| `01-login.png` | Вход: табельный номер, ПИН, демо аккаунты |
| `02-master-shift.png` | Мастер: смена, кто свободен, кто работает, счётчики |
| `03-master-board.png` | Мастер: доска нарядов, колонка «В работе» |
| `04-master-board-done.png` | Доска: «Выполнены», ждут подтверждения мастера |
| `05-master-order.png` | Наряд глазами мастера: переназначить, приоритет, отменить |
| `06-master-equipment-history.png` | История оборудования: наряды, сбои, простой |
| `07-master-create.png` | Новый наряд: «Аварийный», участок, оборудование |
| `08-master-create-ai-suggestion.png` | ИИ предлагает исполнителя с причинами |
| `09-worker-emergency.png` | Исполнитель: красный экран аварийного наряда с сиреной |
| `10-live-issue-to-emergency.png` | Два телефона: мастер выдал, исполнитель получил за 3 с |
| `11-worker-order-in-progress.png` | Наряд в работе у исполнителя |
| `12-worker-close-form.png` | Отчёт о работе: шифр Г-01, материалы по норме |
| `13-worker-close-photo.png` | Фото после: сжатие, хеш, загрузка во время заполнения |
| `14-worker-ai-report-toast.png` | Отчёт ИИ приходит уведомлением в приложении |
| `15-worker-ai-report.png` | Проверка ИИ: «Принято», 84 из 100 |
| `16-live-master-closes.png` | Мастер «Согласен, закрыть», исполнитель видит сразу |
| `17-worker-order-closed.png` | Наряд закрыт |
| `18-worker-home.png` | Исполнитель Иванов: наряд К-2 в работе |
| `19-worker-order.png` | Наряд исполнителя: «Исполнено», «Приостановить» |
| `20-worker-close-overuse.png` | 6 подшипников при норме 2: форма предупреждает |
| `21-worker-ai-rework.png` | ИИ вернул на доработку: 40 из 100 |
| `22-worker-ai-rework-feedback.png` | Что улучшить, что хорошо |
| `23-master-rework-reasons.png` | Мастер видит причины: нет фото после, перерасход |
| `24-worker-rating.png` | Рейтинг исполнителя за 30 дней по пяти компонентам |
| `25-worker-rating-explained.png` | «Из чего сложился рейтинг» |
| `26-worker-closed.png` | Закрытые наряды и средняя оценка |
| `27-master-demo.png` | Демо режим, ускорение, сброс демо |
| `28-master-ai-report-sonnet.png` | Отчёт ИИ от Claude Sonnet 5.5: вывод модели, 87 из 100, уверенность 80% |
| `29-master-ai-checks-sonnet.png` | Проверки ИИ по пунктам: правила и оценка модели по фото |
| `30-master-shift-light.png` | Мастер: смена в светлой теме (для светлого героя лендинга), статус бар 9:41 |

## Web panel (`web/`)

| File | What it shows |
| --- | --- |
| `w00-landing.png` | Лендинг на `/`, вся страница 1440 px (`npm run landing:screens`) |
| `w01-login.png` | Вход в веб панель |
| `w02-shift.png` | Смена: исполнители по статусу и живые наряды |
| `w03-board.png` | Доска нарядов, шесть колонок |
| `w04-shift-report.png` | Отчёт смены: счётчики, время, загрузка, простой |
| `w05-rating.png` | Рейтинг исполнителей за месяц с компонентами |
| `w06-analytics.png` | Аналитика ИИ: выводы и рекомендации по истории |
| `w07-equipment-k3.png` | Конвейер К-3: история и простой |
| `w08-order-report.png` | Отчёт по наряду: таймлайн, проверки ИИ |
| `w09-demo.png` | Демо управление |
| `w10-kit.png` | Дизайн кит Rota |
| `w11-dashboard.png` | Дашборд руководителя |
| `w12-admin-directories.png` | Справочники |
| `w13-admin-settings.png` | Пороги наблюдателя сроков |
| `w14-admin-what-ai-sees.png` | «Что видит ИИ»: обезличенные запросы |

## Design (`design/`)

| File | What it shows |
| --- | --- |
| `design-kit-dark.png` | Мобильный кит, тёмная тема |
| `design-kit-light.png` | Мобильный кит, светлая тема |

`old-mock/` holds the first shots from mock mode (no real data); safe to delete.
