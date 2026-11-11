# Settings UX contract

Applies to the settings workspace introduced 2026-11-05. Existing product flows remain governed by docs/ARCHITECTURE.md, shared project schema, and their tests.

## Scope and ownership

Approved: S1, S2, S4, S5, S6, S7 and the subsequent Windows native playback follow-up. S3 remains excluded: no shortcut editor or changes to existing key bindings. No path migration, MIDI hardware input or CPU/GPU tuning is introduced.

| Capability        | Canonical owner                          | Source of truth                          | Allowed variants                                                                           | Verification                          |
| ----------------- | ---------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------- |
| Select/Listbox    | src/shared/Select.tsx                    | DESIGN.md and this contract              | desktop native where platform geometry is accepted; authored menu=true for app-owned popup | keyboard and popup                    |
| Form              | labelled shared controls in settings     | This contract and validated preferences  | local validation and inline error; no native validation bubbles                            | invalid values and persistence        |
| Scrollbar         | src/styles/settings.css global baseline  | DESIGN.md                                | content-pane geometry                                                                      | narrow layout and computed styles     |
| Toast             | useWorkspace.notify / .toast role=status | This contract                            | success and error                                                                          | failure/retry result                  |
| Dialog            | ModalFrame / Radix managedFocus          | This contract                            | full-window settings, local cleanup confirmation                                           | Escape, focus trap/restoration        |
| Tooltip           | src/shared/HelpTooltips.tsx              | This contract                            | delayed pointer / immediate focus                                                          | delay, Escape, disabled preference    |
| Storage lifecycle | desktop/settings-storage.cjs             | Approved cleanup scope and this contract | opaque preview token, bounded cleanup                                                      | path, race, busy, expired token tests |

No date picker or table selection is introduced. Settings search is transient local state; it is not a shareable URL.

## Flow decisions

- Open settings from any route without unmounting the player or losing the current project. Model management opens the model category directly.
- General appearance changes take effect immediately and persist. Restoring a category resets only that category, not projects, devices, key bindings or data paths.
- A fresh empty library receives the guide once; it is skippable and may be reopened. Existing preference/profile data migrates without forcing a repeated guide.
- Audio defaults are separate from an explicit project recording override. The user may apply defaults to the current project. Device switching saves only after routing succeeds and is disabled while recording or calibrating. Compatibility capture calibration retains its existing input/output pair key; native playback adds backend, output device and processing rate to the route key. Explicit project corrections retain precedence.
- Settings use one Back action; operating-system window controls retain their normal meaning. Managed modal surfaces and controls are not draggable. Underlying page headers lose their drag regions while a managed modal is open; only the settings title region can drag the window. Native pointer testing must cover zoom changes and maximize/restore.
- Windows playback exposes compatibility output, WASAPI shared/exclusive/low-latency shared, DirectSound and installed x64 ASIO drivers. Unavailable drivers are not selectable. Processing rates are 44.1, 48, 88.2 and 96 kHz; shared-device mix rate is reported separately. Driver support determines whether a selection opens successfully.
- Engine changes preserve the project and playback position, stop output before rebuilding the processing context, and commit preferences only after the new route succeeds. Failure restores the previous engine and saved settings; failed recovery requests output selection. Active playback, recording or calibration prevents switching. Native errors do not clear unrelated analysis tasks.
- Native playback sends only the final stereo mix through a bounded PCM bridge. It silences the browser output and releases the device when idle. Recording input continues to use the selected Windows/browser capture device; native playback does not imply native ASIO input.
- Showing settings, checking environment state, or changing selected installation mode never installs anything. Installation/repair is a separate explicit action. Preparation logs are cleaned and folded behind a disclosure; an empty log never creates a strip.
- Storage statistics include actual locations, incomplete scans and unknown free space. Cache, installed models and original media are different categories.
- Cleanup begins with a preview describing file count, size and age rule. The backend returns an opaque five-minute token, checks current busy state and revalidates every candidate. It never follows links, accepts caller-provided paths, recursively removes unknown content, or deletes resumable downloads. Partial results are reported accurately.
- Diagnostics stay local: open an allowlisted application folder or copy a bounded status summary. No log upload, private music upload or telemetry.
- First-run guide, search, errors, status and confirmations support zh-CN/en, visible focus, keyboard use and theme changes. The settings heading and Back action remain visible throughout scrolling. The guide retains visible step progress, Skip and replay, and labels its illustrations as examples.

## Recovery

Failed saves retain the previous value. Failed storage scans expose retry. Changed/stale cleanup candidates survive and are reported as skipped. An active task prevents maintenance cleanup. Returning from settings restores focus to its trigger; ongoing music playback is preserved.
