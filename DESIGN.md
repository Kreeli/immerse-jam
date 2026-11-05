---
name: Immerse Jam
version: 1
token_ownership: existing-runtime-canonical
register: product
locales: [zh-CN, en]
colors:
  ground: '#0d0c11'
  surface: '#14131a'
  panel: '#1b1a22'
  text: '#eeecf3'
  secondary: '#aba7b9'
  accent: '#ff5c7a'
typography:
  body: Noto Sans SC, HarmonyOS Sans SC, PingFang SC, Microsoft YaHei UI, system-ui
  display: Bricolage Grotesque, Noto Sans SC, HarmonyOS Sans SC, Microsoft YaHei UI
  mono: JetBrains Mono, Cascadia Mono, Consolas, monospace
spacing:
  settings_navigation: 220px
  settings_gap: 24px
rounded:
  control: 7px
  panel: 14px
elevation:
  page: none
  popup: var(--shadow-pop)
motion:
  fast: 120ms
  medium: 200ms
---

# Immerse Jam design context

A local music practice and recording workspace. Preserve the existing rehearsal-room visual language and its user-selected light/dark theme and accent. Settings are an instrument panel: fixed categories, readable controls, and visible paths/status. SV2 reference screenshots inform grouping and order, not product-specific audio/synthesis features.

The approved 2026-11-05 scope is S1, S2, S4, S5, S6, S7; S3 custom key bindings is excluded.

## Runtime ownership and mapping

Model B: existing CSS is canonical. src/styles/rehearsal-design.css is generated from docs/design/prototype.html; do not hand-edit that generated file. src/styles/themes.css maps original palette tokens. src/styles/rehearsal.css integrates light/dark/accent semantics. New settings styles live in src/styles/settings.css in the integration layer and consume the existing semantic properties.

| Role              | Runtime source                         | Consumers                               |
| ----------------- | -------------------------------------- | --------------------------------------- |
| Ground and panels | --ground, --surface-1, --surface-2     | settings page, navigation, fields       |
| Text hierarchy    | --text, --text-2, --text-3             | headings, descriptions, path captions   |
| Action/focus      | --accent, --accent-soft, --accent-line | selected category, buttons, focus ring  |
| Status            | --ok, --warn, --danger                 | runtime state, errors, cleanup feedback |
| Type              | --font-ui, --font-display, --font-mono | settings labels, headings, paths        |
| Shape             | --r-s, --r-l                           | controls and panels                     |
| Motion            | --t-fast, --t-med                      | hover and popup transitions             |

The exact dark/rose values above mirror the existing runtime seed. Other accents and the light theme retain their existing mappings; settings never hard-code these seed colors.

## Layout and components

Settings use a full-window page with a single Back action in the fixed heading and a persistent category rail. Only the content pane scrolls. At narrow widths, a shared Select replaces the rail. Search results group matched settings by category and keep the clear action available. Storage paths wrap; long model sources are folded behind details.

Use the existing Select owner, ModalFrame/Radix focus management for the settings page and confirmations, app notify status for action results, and Lucide icons. Body text stays at least the existing 14px body role. Paths and byte counts use the mono role. Focus is visible and active categories expose aria-current. Busy and failure states keep their controls in place.

The distinctive element is useful technical information: actual device state, readable data paths and explicit resource categories. No decorative hero, replacement logo, marketing slogan, or telemetry is introduced.

## Follow-up interaction and guide direction

Native desktop drag regions are disabled beneath managed modals and explicitly excluded on their surfaces and controls. Verify actual Windows mouse input after zoom/restore, rather than relying solely on DOM-injected clicks. Runtime preparation logs appear only when non-empty and are folded behind a disclosure.

The onboarding guide uses a compact step rail, persistent footer actions and restrained code-native workflow illustrations (import, stems, loop recording and export). Illustrations are labelled as examples and do not pretend to be live controls. The existing palette/type tokens remain canonical. #66CCFF is the first waveform swatch; existing saved colors and the original default remain intact.

Native playback settings expose real Windows systems and enumerated devices, processing vs device sample rate, explicit unavailability and safe rollback. Capture input remains the Windows recording device selected in the recording section. No shortcut editor is introduced.

## Motion and verification

Honor prefers-reduced-motion. Tooltips appear after two seconds of pointer hover and on keyboard focus; Escape dismisses them. All new text uses the shared Chinese/English dictionary. Preserve the unrelated existing music and recording screen contracts.

Check the built settings page in both themes, English/Chinese, narrow and short windows, and after restart. Storage cleanup needs synthetic filesystem regression tests; test profiles, screenshots and all caches stay on the selected development drive.
