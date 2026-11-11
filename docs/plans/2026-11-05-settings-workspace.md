# Settings workspace implementation

Historical initial plan. Native Windows playback was subsequently approved; see [the follow-up plan](2026-11-05-settings-follow-up.md) and its review for the final scope.

Approved: S1, S2, S4, S5, S6, S7. S3 is excluded. Existing key bindings remain unchanged.

Work in E:/Development/immerse-jam on feat/settings-workspace-20261105. Preserve the installed application, private library, model assets, existing license status and previous local audit documents. Put all generated output, test profiles and caches below .runtime on E:.

1. Add canonical settings structure and design/behavior contracts grounded in existing runtime tokens.
2. Add bounded storage/diagnostic services and test their path, concurrency and stale-preview protections with synthetic files.
3. Add validated appearance/help preferences, delayed shared tooltips and first-run onboarding.
4. Share audio defaults and device-pair calibration with recording, preserving project overrides and recording locks.
5. Compose the categorized searchable settings workspace; model entry opens its category, runtime checks do not install, diagnostic actions remain local.
6. Run formatting, type/i18n/IPC checks, unit tests and build. Exercise the built UI with isolated synthetic fixtures: first run, persistence, navigation, search, audio failures, cleanup preview, protected downloads, busy state, theme/language, keyboard and narrow layout. Capture screenshots on E:.

Storage cleanup is explicit and previewed. It targets expired temporary contents and inactive old UUID job logs only, checks all path components and revalidates file identity. It never traverses links or deletes resumable downloads, project media, recordings, models, Python environments or unknown task contents. No production cleanup is performed while developing or testing this feature.

Not included: custom key bindings, path migration, independent monitor volume, backend/ASIO selection, exact sample-buffer control, CPU/GPU tuning, MIDI hardware input, changes to music analysis quality, app installation/deployment or publication.
