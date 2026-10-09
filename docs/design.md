# Rota Industrial: design system

The living design doc for the hackathon apps. It started as PHASE_0 §6 and is kept current as the kit evolves.
Rota's language, made for gloves, sunlight and night shifts: dark canvas, red as the signal, inverse pills as actions,
mono for numbers, mascots for feelings.

## Where things live

| What | Where |
| --- | --- |
| Tokens (generated, identical to Rota's) | `packages/design/web/tokens.css`, `packages/design/src/generated/tokens.ts`, from `packages/design/source/variables.json` via `npm run tokens` |
| Industrial status colors | `packages/design/src/extensions.ts` (Apple system colors) |
| Mobile type scale | `packages/design/src/typography.ts` (Inter for SF Pro, Geist Mono) |
| Typed theme | `packages/design/src/theme.ts`: `getTheme('dark' \| 'light')` → `color`, `status`, `statusSoft`, `space`, `radius`, `size`, `type`, `shadow`, `glass` |
| Brand data | `packages/design/src/brand/` (logo paths, 24 mascots, layer colors per mode) |
| Mobile kit | `apps/mobile/src/ui/`, gallery at the `/kit` route |
| Web kit | `apps/web/src/components/rota/`, gallery at `/kit` |
| References | `docs/design/reference/*.png` (Rota hero, onboarding, settings, HUD states) |
| Kit screenshots | `docs/screenshots/kit-dark.png`, `docs/screenshots/kit-light.png` |

## Implementation notes

- Theme preference is `system | dark | light`, stored under `rota.theme` in AsyncStorage, dark by default
  (`apps/mobile/src/lib/theme.tsx`). `ThemeScope` renders a subtree in a fixed mode.
- Soft fills for pills and badges are the status color at `softAlpha` (0.16 light, 0.22 dark) as `#RRGGBBAA`.
- Light mode shadows are React Native `boxShadow` strings (New Architecture); dark mode has none.
- Every tappable surface uses `PressableScale` (scale 0.98, opacity 0.92, 120 ms; reduce motion respected).
- Haptics come from `apps/mobile/src/lib/haptics.ts`, one function per moment.
- Copy goes through `t()` (`apps/mobile/src/lib/i18n.ts`): the shared domain dictionary from `@rota/shared` plus the
  mobile chrome strings in `apps/mobile/src/lib/strings.ts`.


Rota's language, made for gloves, sunlight and night shifts. Dark canvas, red as the signal, inverse pills as actions, mono for numbers, mascots for feelings. Never decoration on dense screens.

## 1. Sources

Tokens come from `@rota/design`. Visual references: `docs/design/reference/*.png` (Rota onboarding, settings, hero) and Rota's web kit page. When this section and the Rota references disagree, this section wins for the hackathon app.

## 2. Modes

- Dark by default (the Rota look, best on mirrored phones). Full light theme for sunlight; «Как в системе» as a third option in the profile.
- Text contrast at least 4.5:1 in both modes.
- Status is never color alone: always a dot plus a word.

## 3. Color usage

| Token | Use |
| --- | --- |
| `bgCanvas` | screen background |
| `bgSubtle` | cards, list groups, fields |
| `bgMuted` | pressed states, segmented track, stepper buttons |
| `bgElevated` | sheets and the emergency card in dark |
| `bgInverse` + `textInverse` | primary buttons, selected chips |
| `bgAccent` (red 500) | critical only: emergency, overdue, rework, destructive confirm, switch on, focus ring |
| `textPrimary`, `textSecondary`, `textDisabled` | text levels |
| `borderDefault`, `borderStrong` | hairlines, field borders, keycap edges |
| `glass*` | tab bar, HUD capsule, sheet header |
| `status.free` · `working` · `queue` · `off` | worker states (case 5.2.1: green, yellow, blue, gray) |
| `status.success` · `warning` · `critical` · `info` | AI verdicts: accepted, with remarks, rework, needs master review |

Priority: emergency → critical; high → warning; normal → no color; planned → info.

## 4. Type (mobile)

Inter stands in for SF Pro on Android, which the Rota rules require for interface text. SF Pro cannot be bundled. Geist Mono comes from Rota.

| Variant | Family per weight | Size / line | Letter spacing | Use |
| --- | --- | --- | --- | --- |
| `largeTitle` | Inter_700Bold | 34 / 40 | −0.68 | root tab titles |
| `title1` | Inter_700Bold | 28 / 34 | −0.56 | screen titles, emergency |
| `title2` | Inter_600SemiBold | 22 / 28 | −0.33 | sections, empty states |
| `headline` | Inter_600SemiBold | 19 / 24 | −0.19 | card titles (equipment) |
| `bodyL` | Inter_400Regular | 19 / 28 | −0.1 | worker screens body |
| `body` | Inter_400Regular | 17 / 24 | −0.03 | master screens body |
| `callout` | Inter_400Regular | 15 / 20 | 0 | subtitles, chips |
| `footnote` | Inter_400Regular | 13 / 18 | 0 | captions, tab labels |
| `buttonL` | Inter_600SemiBold | 18 / 22 | −0.09 | 64 px buttons |
| `buttonM` | Inter_600SemiBold | 16 / 20 | −0.08 | 52 px buttons |
| `monoDisplay` | GeistMono_500Medium | 48 / 56 | −0.96 | AI score |
| `monoL` | GeistMono_500Medium | 20 / 28 | 0 | order numbers, timers, counters |
| `monoM` | GeistMono_400Regular | 15 / 20 | 0 | codes (М-02), times in lists |
| `monoCaps` | GeistMono_500Medium | 12 / 16 | 0.72, uppercase | eyebrows: «№147 · АВАРИЙНЫЙ · ДО 11:30» |

## 5. Space and layout

- Screen gutters 16. Rota's 4 pt spacing scale only.
- List groups inset 16. Rows at least 64 high on worker screens, 56 on master screens.
- Section gaps 24 to 32.
- The bottom action bar sits in the thumb zone, with 16 padding plus the safe area.

## 6. Shape

| Radius | Use |
| --- | --- |
| `md` 12 | cards, list groups, fields, photo tiles |
| `lg` 24 | sheets, the emergency card |
| `full` | buttons, pills, tags, chips, segmented controls |

Hairline borders (`StyleSheet.hairlineWidth`) on dense lists.

## 7. Elevation and glass

- Dark mode: no shadows, only surfaces and hairlines.
- Light mode: `shadow-soft` for floating elements only.
- Glass only for the tab bar, the HUD capsule and sheet headers. iOS: `BlurView` with intensity 40 plus a `glass.fill` overlay. Android: solid `glass.fillStrong` (real blur there needs `blurMethod` and a `BlurTargetView`; skip it).

## 8. Motion and haptics

- Press: scale 0.98 for 120 ms. Springs (reanimated) for sheets and the HUD.
- Respect reduce motion.
- Haptics as in step 0.6.

## 9. Mobile kit (`apps/mobile/src/ui/`)

| Component | Spec |
| --- | --- |
| `T` | text with `variant` (6.4) and `tone` (primary, secondary, critical, inverse) |
| `Screen` | safe area, canvas background, optional large title with an eyebrow above it, scroll or static |
| `Button` | variants: `primary` (inverse pill), `secondary` (`bgMuted` with a hairline), `ghost` (text secondary), `danger` (red fill, white text), `onDanger` (white pill, red 700 text, for the emergency screen), `ghostOnDanger`. Sizes: L 64 (padding 24, buttonL), M 52 (padding 20, buttonM), S 40 (padding 16). `full`, `loading`, `disabled` (opacity 0.4); pressed scale 0.98 with opacity 0.92 |
| `Pill` | dot plus label; tones free, working, queue, off, success, warning, critical, info, neutral; height 28; fill at the soft alpha |
| `Tag` | mono caps capsule with a hairline border (Rota Layout Tag), height 22; fault codes, priority, «ИИ» |
| `StatusDot` | 10 px circle in a status tone |
| `Avatar` | initials circle, 40 px, `bgMuted`, footnote semibold («АЕ») |
| `Switch` | Rota capsule, red when on, 51 × 31 |
| `Checkbox` | 24 px box, red when checked, inside a 56 px row |
| `ListGroup`, `ListRow` | Rota Settings Row: title, optional subtitle, right accessory (value, chevron ›, `Switch`, `Pill`); hairline separators inset 16; radius md |
| `Card` | `bgSubtle`, radius md, hairline in light |
| `OrderCard` | 4 px priority bar on the left; eyebrow «№147 · ВНЕПЛАНОВЫЙ»; equipment as headline; «Участок обогащения · Течь масла» as callout secondary; time left in `monoL`, red when overdue; bottom row with a status `Pill` and a name (assignee for the master, master for the worker); min height 112 |
| `Counter` | `monoL` number with a footnote label; turns critical when the value is bad |
| `Segmented` | height 40, `bgMuted` track, selected segment `bgElevated` in dark and white with the thumb shadow in light; label plus a mono count |
| `Chip` | selectable, height 48, padding 16; unselected `bgSubtle` with a hairline, selected inverse; the critical variant fills red when selected («Аварийный») |
| `Stepper` | − value +, 48 px round buttons on `bgMuted`, value in `monoL` |
| `TextField`, `TextArea` | label (footnote secondary) above; min height 56 (area 120); `bgSubtle`, radius md, hairline; red focus border |
| `PhotoTile` | 104 px tiles: an add tile with a dashed `borderStrong` border and «Снять фото»; thumbnails with a «✕» capsule; up to 5 |
| `Keypad`, `Keycap` | 3 × 4 grid, keys about 104 × 72; Rota keycap: `bgControl`, `borderStrong`, a 2 px darker base line at the bottom instead of a shadow; digits in title1; «Стереть» and «Далее» as text keys, «Далее» inverse |
| `PinDots` | 4 dots of 14 px; filled `textPrimary`, empty `borderStrong`; shake and error haptic on a wrong PIN |
| `Sheet` | expo-router `formSheet` routes with an `ActionList` inside (64 px selectable rows). On Android a form sheet has no native header and no nested stack, and `flex: 1` inside breaks fit to contents: give the content its own header row and a natural height. If a sheet misbehaves on Android, present it as `modal` there |
| `HudToast`, `useHud()` | Rota HUD: glass capsule 44 high, LogoMark 16 + text (mono for numbers) + optional divider and action; above the tab bar; hides after 2.5 s («№147 · В работе») |
| `Banner` | inline row in warning or critical tone («Без фото после ИИ может вернуть наряд») |
| `EmptyState` | mascot 140, title2, callout secondary, optional secondary button |
| `Mascot` | react-native-svg: viewBox 240, translate dx dy, one path per layer colored by `mascotColors[mode]`; fades in at scale 0.9 to 1 |
| `LogoMark`, `Lockup` | from `@rota/design` brand data; the mark is always red |
| `Eyebrow` | monoCaps, text secondary |
| `ScoreBadge` | `monoDisplay` score, «из 100», verdict `Pill` |
| `CheckRow` | a glyph in a 24 px tinted circle (✓ success, ! warning, ✕ critical, … info), title, message |
| `Timeline` | time in `monoM`, dot, actor and action |
| `TapCounter` | demo only: mono capsule at top right, «5 нажатий · 0:38» |
| `TabBar` | glass, 64 high plus the safe area, text labels only; active label in `textPrimary` with a 4 px red dot above, inactive in `textSecondary`; the master's middle item «Выдать» is an inverse pill |

## 10. Glyphs and logos, no icon packs

Rota uses no icon sets: no Lucide, no SF Symbols, no emoji. Use text labels, brand images (the mark and the mascots) and only these glyphs: `› ‹ → ← ↑ ↓ ✓ ✕ + − · • ● ○ … №`. Digits on the PIN keypad are fine; Rota's rule against letter keycaps is about letters.

If a screen seems to need an icon, it needs a better label. If the user later approves a functional icon set for camera, mic and QR, it gets added in one place.

**Platform and service logos are the one exception** (the owner's request, 2026-10-09). Wherever a screen names a platform or a service (Telegram, Android, Apple, Windows, Chrome, Safari, Claude…), its real mark sits beside the name. Nothing else becomes an icon.

- Source: `packages/design/src/brand/platforms.ts` (Simple Icons paths; Windows drawn from its geometry; XLSX, PDF and 1С are neutral badges). Import single logos (`import { telegramLogo } from '@rota/design'`), never the `platformLogos` map.
- Draw them only through `PlatformLogo`: `apps/mobile/src/ui/PlatformLogo.tsx` (tone `theme` gives the brand color, white on dark where the brand is near black) and `apps/web/src/components/rota/PlatformLogo` (tones `dark`, `brand`, `mono`). Monochrome inside buttons, where a colored mark would clash.
- Sizes on mobile (`LOGO_SIZE`): `inline` 16 beside footnote, mono or caps text; `compact` 20 for a short row of marks at the end of a list row; `row` 28 as a list row's left accessory. Web: 16 to 24 inline, 28 to 40 in feature rows. Vertically centered on the text, 8 apart.
- One row of logos per block at most, no logo walls. The mark never replaces the word: status is still a dot plus a word, and the visible name stays.
- In a list group where one row leads with a mark, the rows under it keep to its text column (an empty 28 slot) and the separators inset to that column.

| Where (mobile) | Mark |
| --- | --- |
| Profile, «Подключить Telegram» and the linked «Telegram» row | Telegram, row accessory |
| Profile, the Push row | Android on Android, Apple on iOS, Chrome or Safari in the PWA (no mark for other browsers), with the name under «Push» |
| Master AI report, the model line and the «Вывод ИИ» header | Claude, inline, only when the review's model is `claude…` (never on a rules only or mock review) |
| Admin, «Windows или Mac» row about the web panel | Windows, Apple, Chrome, compact, at the row's end |
| Demo, «Что видит ИИ» | Claude, row accessory |
| Kit, Brand section | every mark the app uses, one row |

## 11. Mascots

Use them only on empty, success, error, waiting and onboarding screens, at 96 to 160 px, one per screen, always next to a title. Never on dense operational lists.

| Pose | Where |
| --- | --- |
| `wave` | login greeting |
| `key` | PIN entry |
| `mail` | notification permission onboarding |
| `peek` | empty queue, empty board column |
| `wrench` | order in progress, settings |
| `search` | «ИИ проверяет наряд» |
| `check`, `cheer` | AI accepted, order closed |
| `oops`, `dizzy` | rework, errors |
| `tired` | overdue |
| `sleep` | off shift |
| `juggle` | a queue of several orders |
| `point` | the AI suggestion card |
| `swap`, `flip` | reassignment |
| `carry` | materials |
| `read` | reports |
| `shield`, `shh` | privacy, «Что видит ИИ» |
| `globe` | language switch |
| `download` | export |

## 12. Copy (Russian)

- Sentence case. Short. No emoji. No hyphens or dashes in copy, including time ranges: write «с 08:00 до 20:00», not a dash range. Codes like «М-02» are data and keep theirs.
- Numbers as digits. Time «до 11:30»; durations «1 ч 20 мин»; «просрочен на 12 мин»; the order number with №.
- Buttons are verbs: «Принять», «В очередь», «Отклонить», «Начать», «Приостановить», «Продолжить», «Исполнено», «Отправить на проверку», «Выдать», «Согласен, закрыть», «Изменить оценку», «Вернуть на доработку».

## 13. Gloves

- Targets at least 56; primary actions 64, full width, at the bottom.
- Destructive actions go through a confirm sheet.
- No action is swipe only or long press only.
- At least 8 between targets.

---

