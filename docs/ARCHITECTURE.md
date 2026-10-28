# Architecture / 开发结构

`src/app/App.tsx` composes views; `useWorkspace.ts` coordinates project selection, desktop events and playback. Features are split under `src/features/`: library, player, recording, chords, score, analysis, models, transfer, migration and settings. `src/shared/types.ts` defines the project contract.

`src/audio/Player.ts` owns the AudioContext, common source clock, mixing graph, SoundTouch DSP, metronome scheduling and cached waveforms. Reusable calculations live in `metronome.ts`, `performance.ts`, `envelope.ts` and `latency.ts`. `capture.ts` and its AudioWorklet collect timestamped stereo Float32 PCM with no software-monitor output. Peak extraction runs in a worker. Decoded audio and peaks are reused when mounted takes change.

Recording and backing share an AudioContext clock. Input frames map through speed and latency correction to the original song timeline; FFmpeg normalizes recorded speed/pitch while preserving raw input.

`desktop/main.cjs` composes windows, permissions, private paths and services. Modules separate store, takes (`ipc/recordings.cjs`), archives, export, models/runtime/jobs, migration, LAN and WebRTC transfer. `locale.cjs` translates native dialogs; `transfer-page.cjs` provides the LAN page.

`shared/ipc-methods.json` is the request allowlist. `prepare-preload.cjs` generates a static sandbox-compatible bridge. A contract test compares registered handlers against it. Calls are accepted only from the workspace window.

Python jobs run privately via `backend/worker.py`: JSON request, JSON progress/result output, diagnostic stderr. Separation, analysis, rhythm, alignment and validation have distinct modules. Validated results commit together; failure retains previous playable results. Vendor sources retain their own licenses.

`audio-tools.cjs` downloads pinned FFmpeg when needed. `runtime.cjs` prepares private Python; `models.cjs` validates model artifacts. No global Python/CUDA toolkit is required.

Chinese messages map through `src/i18n/index.ts` and `shared/locales/en.json`. `preferences.ts` stores language/theme/accent outside projects. Native dialogs/LAN share the catalog; user text is not translated. Themes use CSS tokens, and canvas listens for appearance/language changes.

Use `npm ci`, `npm run check`, `npm test`, `npm run build`. `npm run format` maintains formatting. Backend tests need `npm run prepare:runtime` first. `npm run package` creates NSIS. CI excludes large model downloads. Playwright tests create isolated synthetic fixtures and run muted.

Installed data defaults to the app user-data directory; development uses `.runtime/`. `IMMERSE_DATA_DIR`, `IMMERSE_RUNTIME_DIR` and `IMMERSE_PROFILE_DIR` allow isolated workspaces; `IMMERSE_LOCALE` initializes test language. These overrides are unnecessary for normal installed use.
