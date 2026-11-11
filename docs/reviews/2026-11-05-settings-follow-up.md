# Settings follow-up review

Date: 2026-11-05. This follows the initial [settings workspace review](2026-11-05-settings-workspace.md). The user approved all five follow-up items and actual Windows native playback, including available ASIO and exclusive devices. S3 custom shortcuts remains excluded.

## Result

| Request                         | Implemented behavior                                                                                                                                                                                                                                      |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Settings return and clicking    | One Back action replaces the duplicate settings close button. OS window controls are retained. Managed modal controls and underlying headers have explicit drag-region ownership; only the settings title area drags the window.                          |
| Preparation black strip         | ANSI/CR/blank output is cleaned. Non-empty logs appear under “查看准备记录”; empty logs render no strip. Checking or opening settings does not trigger installation.                                                                                      |
| Playback system and sample rate | Actual compatibility output, WASAPI shared/exclusive/low-latency shared, DirectSound and installed x64 ASIO. Processing rates: 44.1/48/88.2/96 kHz. Unavailable ASIO is disabled. Failed driver startup or preference persistence restores the old route. |
| Guide                           | Four workflow steps with code-native illustrations, a step rail, fixed actions, Skip and replay. Both themes and narrow layouts are supported.                                                                                                            |
| Waveform color                  | #66CCFF is the first preset. Existing saved colors and the original default are preserved.                                                                                                                                                                |

Native playback receives the existing player's final limited stereo mix through an AudioWorklet/IPC bridge. The browser sink is silent while native output is active. The host releases the output device while idle. Sample-rate changes rebuild the processing context and retain the current project and seek position. Playback, recording and calibration lock engine changes.

Recording input still uses the selected Windows/browser capture device. This implementation does not add native ASIO recording, a buffer-size editor, CPU/GPU tuning, MIDI input or shortcut customization. The UI distinguishes processing sample rate from the Windows device mix rate. DirectSound reports its device rate as unknown when the API cannot establish it.

Native output errors are isolated from background analysis jobs, pause playback and notify recording/calibration through the existing audio-route event. Calibration keys distinguish native backend/device/rate; explicit project correction remains authoritative.

## Build and distribution

The Windows host uses NAudio Core/Wasapi/Asio 2.2.1 with license notices. An E:-isolated .NET SDK 10.0.403 builds the managed host; a portable .NET runtime 10.0.14 is bundled beside it. No system .NET installation is required. The build script disables first-run certificate generation and places SDK/NuGet caches, objects and versioned host outputs below .runtime.

Development resolves an immutable host version through current.json. Packaging prepares the native host and includes its portable runtime as extra resources. This review covers source/build integration; a new installer or release was not produced.

## Validation

| Check                    | Evidence and result                                                                                                                                                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repository check         | Passed TypeScript, desktop syntax and 1,284 translation entries.                                                                                                                                                                                              |
| Unit suite               | 144 passed, 0 failed. Includes native caller/config validation, stream ownership, PCM bounds/backpressure, driver startup failure, rate preferences and persistence recovery.                                                                                 |
| Production UI build      | Passed. Existing dependency directive/chunk warnings remain.                                                                                                                                                                                                  |
| Existing UI regressions  | ci-ui-check, controls-check, interaction-check, preferences-check and settings-ui-check passed.                                                                                                                                                               |
| Follow-up desktop checks | Passed guide navigation, cleaned log disclosure, 44.1 kHz processing context, preserved 5 s seek position, non-zero final-mix PCM through the IPC bridge to a simulated endpoint, unavailable ASIO, driver/persistence rollback and bilingual/theme coverage. |
| Actual Windows pointer   | Passed at 150% and 100% after confirmed maximize/restore. Computer Use clicked the visible Back control; the harness independently checked that settings closed and the saved scale was unchanged.                                                            |
| Settings static UI audit | Strict mode: 0 findings in the configured settings scope. The initial whole-project scan's 34 legacy findings remain outside this scope.                                                                                                                      |
| Source audit             | Passed 559 files; generated/private runtime content stays outside source control.                                                                                                                                                                             |

Real hardware was also opened briefly with silence, without microphone capture or volume changes:

| System                    | Processing rate | Reported device rate      | Result                                                   |
| ------------------------- | --------------- | ------------------------- | -------------------------------------------------------- |
| WASAPI shared             | 48 kHz          | 48 kHz                    | Opened, wrote silence, closed                            |
| WASAPI low-latency shared | 48 kHz          | 48 kHz                    | Opened, wrote silence, closed                            |
| WASAPI exclusive          | 48 kHz          | 48 kHz                    | Opened, wrote silence, closed                            |
| DirectSound               | 48 kHz          | Unknown                   | Opened, wrote silence, closed                            |
| Realtek ASIO              | 48 kHz          | 48 kHz; 480-sample buffer | Opened, wrote silence, closed                            |
| WASAPI shared             | 44.1 kHz        | 48 kHz                    | Opened, wrote silence, closed; rate distinction verified |

Hardware evidence establishes short host/device lifecycle checks. Audible music quality, long-run synchronization, physical input recording, Bluetooth behavior and 88.2/96 kHz hardware support were not validated. Driver-specific rate support is checked when a user applies the selection.

Both guide themes, native audio settings, cyan ordering, log disclosure and narrow 150% layouts were visually inspected. Logs, screenshots and structured results are under .runtime/settings-followup-20261105 and are excluded from source control. Tests use disposable profiles and synthetic audio; the installed application and private music library are preserved.

## Delivery

Source changes and an updated development build, prepared for a separate settings/native-playback PR based on the installation/data-integrity branch. No installer, release or installed-application replacement is included. The earlier audit PR remains a separate dependency.
