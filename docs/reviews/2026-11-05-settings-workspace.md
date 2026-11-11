# Settings workspace implementation review

Historical first-pass review. The later user-approved changes, including the single Back action, redesigned guide and native Windows playback, are covered by [the settings follow-up review](2026-11-05-settings-follow-up.md). Validation counts and hardware boundaries below describe this first pass.

Date: 2026-11-05. Scope approved before implementation: S1, S2, S4, S5, S6 and S7. S3 (custom key bindings) is excluded.

## Result

The desktop settings dialog is now a full-window workspace with five categories: General and appearance, Audio and recording, Models and runtime, Storage and cache, and About and diagnostics. Search accepts Chinese and English terms. The heading and return controls remain visible while content scrolls. Small windows use the shared category Select.

| Scope | Implemented behavior                                                                                                                                                                                                                                     |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1    | Categorized navigation, search/empty results, fixed return/close controls and category-specific defaults. Player and project remain mounted.                                                                                                             |
| S2    | Native 80–150% interface scale, delayed hover help, first-run guide that can be skipped and replayed, existing theme/accent/waveform preferences.                                                                                                        |
| S4    | Shared input/output/channel/latency defaults, explicit application to the current project, per-device calibration and device refresh. Explicit project settings take priority over later global changes, including calibration for the same device pair. |
| S5    | Data locations, category sizes, incomplete-scan state, available disk space, folder actions and previewed cleanup of expired temporary files and old known task records.                                                                                 |
| S6    | Separate runtime check and confirmed prepare/repair actions, installation mode selection, model filters and direct model-management entry. Existing download/import/verification flows are reused.                                                       |
| S7    | Version/manual update entry, local log access, local diagnostic summary copy and license notices.                                                                                                                                                        |

SV2 screenshots informed grouping and information hierarchy. Synthesis-specific controls, recording-note rules, MIDI devices, ASIO/backend selection, buffer tuning, CPU/GPU tuning, independent monitor gain and path migration are outside this change. Existing key bindings are preserved.

## Recovery and data handling

- Appearance and audio preferences publish only after persistence succeeds. Output-routing failures preserve the saved device. A failed global-default write restores the previous device-pair calibration.
- New projects inherit audio defaults. An existing project's explicit device, channel and latency stay in force until the user applies defaults to that project.
- Settings search and category navigation do not install dependencies. Runtime preparation requires a separate confirmation.
- Cleanup uses an opaque five-minute preview token. It rechecks busy state, containment, links and file identity before removal. It unlinks only known files and removes only empty known directories; it never performs recursive deletion.
- Resumable downloads, music, takes, stems, model weights, Python environments and unknown task contents are outside cleanup. Partial cleanup reports removed, skipped and failed file counts.
- Diagnostic summaries stay on the local clipboard. No telemetry or log/media upload is introduced.

## Validation

| Check                                              | Result                                                                                                                                                                                                                         |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TypeScript, translation catalog and desktop syntax | Passed; 1,246 translation entries.                                                                                                                                                                                             |
| Unit suite                                         | 134 passed, 0 failed. Covers audio defaults/project precedence, failed persistence, cleanup path/link/race/busy/expiry handling and settings IPC validation.                                                                   |
| Production build                                   | Passed. Existing dependency directive/chunk warnings remain.                                                                                                                                                                   |
| Browser UI regression                              | `scripts/ci-ui-check.cjs` passed.                                                                                                                                                                                              |
| Native playback controls                           | `scripts/controls-check.cjs` passed.                                                                                                                                                                                           |
| Native waveform/chord/project interactions         | `scripts/interaction-check.cjs` passed.                                                                                                                                                                                        |
| Native appearance and recording preferences        | `scripts/preferences-check.cjs` passed, including a project correction surviving a subsequent global calibration change.                                                                                                       |
| Native settings acceptance                         | `scripts/settings-ui-check.cjs` passed: onboarding, bilingual search, zoom, themes, tooltip timing, audio failures, calibration, model check/install separation, cleanup preservation, keyboard focus and restart persistence. |
| Settings scoped UI audit                           | Strict scan passed with 0 findings using `docs/reviews/settings-ui-audit.json`. Dialog/tooltip behavior is documented and checked by native tests because those capability names are unsupported by the static scanner.        |

Native UI acceptance uses disposable application data, mocked devices and synthetic audio. A simulated 180 ms delayed signal produced a 199 ms estimate, within the existing 35 ms tolerance. The clipboard action is stubbed in the native acceptance script; the real handler is tested with an injected clipboard in the unit suite. No private library or real microphone is used.

Screenshots and detailed logs are local artifacts under `.runtime/settings-validation-20261105/` and are excluded from source control. Chinese/dark, English/light, cleanup confirmation/result, diagnostics, onboarding and narrow 150% layouts were visually inspected.

The separate whole-project static UI scan still reports 34 findings (17 unresolved native-control ownership prompts and 17 legacy control/style pattern findings). This change's strict scope is the settings feature; the rest of the product has not been brought under a new component ownership policy.

## Delivery boundary

Source implementation only. No installed application was replaced, no runtime/model downloads or production cleanup were performed, and no new release or PR was published. Real sound-card, Bluetooth and physical microphone behavior still needs hardware validation. The Android settings layout retains its existing flow; no Android build/device validation is claimed.
