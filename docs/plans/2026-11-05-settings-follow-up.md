# Settings follow-up and native audio

User-confirmed scope: remove the settings close button in favor of Back; fix native mouse input after UI zoom/window restore; remove empty runtime log bars; implement genuine Windows audio backend and sample-rate switching, including available ASIO/exclusive devices; redesign onboarding; put #66CCFF first in waveform presets. S3 custom shortcuts remains excluded.

1. Reproduce native hit testing, harden modal drag-region ownership, and make Back the single settings return action.
2. Fold non-empty cleaned preparation logs into a disclosure; do not render blank log strips.
3. Build an isolated native Windows audio host using pinned NAudio and a bundled portable .NET runtime. Keep all SDKs, NuGet caches, build intermediates and binaries below .runtime on E:.
4. Route the existing final stereo mix through a bounded PCM bridge to WASAPI shared/exclusive, low-latency shared, DirectSound and installed x64 ASIO drivers. Keep browser compatibility output available. Validate devices/rates and restore the previous engine on failure. Recording/capture locks prevent mid-session switching.
5. Add actual sample-rate configuration by rebuilding the processing context while preserving project, position and saved device settings. Reuse the current input capture; label output backend vs recording input accurately.
6. Redesign the guide with workflow illustrations, a readable step rail and persistent actions. Preserve skip/replay and the legacy reference diagram.
7. Test native host lifecycle/IPC/PCM bounds, engine rollback, rates, preferences, guide, blank logs, and settings Back after zoom/restore. Visually inspect both themes and narrow layouts; use actual Windows pointer input for drag-region regressions.

Do not overwrite the installed application or private music library. Preserve the manual test profile and relaunch the updated development application after acceptance. Physical ASIO/exclusive success depends on installed drivers/device support; enumerate capabilities honestly and report the exact hardware coverage.
