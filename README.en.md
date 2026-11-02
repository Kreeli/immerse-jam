# Immerse Jam

[Website](https://kreeli.github.io/immerse-jam/) · [Download](https://github.com/Kreeli/immerse-jam/releases/latest) · [简体中文](README.md)

Free local stem separation, music practice and multitrack recording. Mute the part you play, slow down difficult passages, loop them and record your progress. No subscription or separation quotas.

Current versions: **Windows 0.1.11 / Android 0.1.0-preview.3**. This release improves first-time installation, adds recording recovery and update checks, and cleans up the shared settings page.

## Platforms

- **Windows 10/11 x64:** local stem separation, beat analysis and score alignment; playback, practice and multitrack recording. CPU and compatible NVIDIA acceleration are supported.
- **Android 9+:** playback, practice, recording, external stem import and export. **No local inference or bundled separation models.** Separate on your computer and import a complete `.ijam` project on mobile. Normal phones/tablets use the `arm64.apk`; `x86_64.apk` is for compatible emulators. Preview APKs retain their debug signature; do not uninstall to update.

## Installation

Download Setup from the official release page. You do not need Python, Node.js or development tools. Choose separate program and data folders; allow at least 10 GB of disk space. Uninstalling retains the data folder, including music, recordings, models and caches.

The first installation still needs internet. Expect about **1–2 GB for CPU or 3–5 GB for NVIDIA**, plus selected separation models (the default six-stem model is about 667 MiB). Setup includes uv and Beat This!. After model selection, the native wizard shows the current component, file, bytes, speed and download progress. Preparation commonly takes **5–30 minutes**; slow networks take longer, and existing caches are reused. Failed preparation can be retried. Read `installation.log` in the data folder for the specific failure.

The installer uses Windows system proxies, with explicit HTTP/HTTPS proxy environment variables supported. It measures wheel download throughput, chooses between SJTU/official PyTorch and Tsinghua/PyPI, and tries the other source after a failure or stall. Settings lets you choose automatic, prefer mainland China mirrors, or prefer official sources. All model sources use the same pinned SHA-256. A cold environment check is shown as a check, rather than immediately asking for reinstallation.

Settings offers **Check for updates**. Windows downloads and verifies Setup before you choose to install it, retaining the data folder. Android opens the appropriate APK download and uses the normal system installation confirmation. If the GitHub API is unavailable, the check falls back to the website's release catalog.

## First practice

Import a song → Separate stems → Choose a model and mode → Create a practice project → Mute your instrument → Loop a passage → Record and listen back. Analysis runs locally. Prepared models work offline.

- Centered, scrolling waveform with bookmarks, timestamps, comments and loop brackets. Drag to seek; a click does not seek. Pinch to zoom on Android, Ctrl + wheel on Windows.
- Independent track volume/pan, combined listening, mute, tempo/pitch, metronome and count-in. Creation has collapsible stem groups with group volume.
- Practice can mount up to two takes; all attempts remain in the recording library. Creation supports overdubbing and external stem imports.
- **Recording protection:** confirm deletion, immediate Undo and a persistent project recording recycle bin. Original files are retained. Exported projects exclude deleted recordings.
- Editable chord charts, Guitar Pro/MusicXML/MIDI, playback following and sync corrections. Complex arrangements and changing meters need listening and manual correction.

Projects save automatically. Library songs and practice/creation projects are independent copies. On Android, returning to the app list stops playback; system background/lock-screen playback is available. An interrupted recording saves the received audio.

Tap-based latency calibration includes human timing error, rather than measuring pure hardware latency. Use headphones and short percussive sounds, compare the preview and fine-tune if needed. Recalibrate after changing devices.

## Projects and sharing

Complete `.ijam` projects include results, takes, groups, charts, attachments and practice settings. WAV/MP3 export and `.aum` import are supported. Audio Jam migration reads and copies the local library without modifying it.

Devices must share a **LAN, Wi-Fi or hotspot**. Browser QR transfers and encrypted app-to-app connection codes are supported. There is no TURN relay or guaranteed cross-network connection. Use a personal hotspot or a project file when access-point isolation blocks peers.

QR transfer uses HTTP on a trusted LAN. The application binds to one local interface and replaces a two-minute, single-use invitation with a short-lived session; API credentials are kept out of URLs. Do not publish pairing links/screenshots. Project transfer does not merge concurrent edits.

Large projects remain hardware-dependent. Android uses bounded audio windows; seeking with tempo/pitch processing can still briefly pause on some devices. Model weights retain their own terms. Only clearly licensed installer/beat resources are publicly mirrored; see [resource sources and backups](docs/DOWNLOAD_RESOURCES.md).

## Development and checks

Use Windows x64 and Node.js 24:

```powershell
npm ci
npm run check
npm test
npm run build
npm run dev
```

`npm run prepare:runtime` prepares the private analysis environment. `npm run package` builds Setup from verified local uv and Beat This! caches. [Android build instructions](platforms/android/README.md) are separate.

`Start-Immerse-Jam.cmd` launches an existing `release/win-unpacked` build using `.runtime/data`; a fresh clone does not contain that build or a private library. Distribute Setup to users.

CI runs source/unit/shared UI checks and maintained Electron smoke checks. They generate isolated audio fixtures. Real-model, microphone and ADB checks are opt-in and have additional prerequisites; see [validation guide](docs/VALIDATION.md). Run relevant checks rather than every historical E2E on each change.

[Architecture](docs/ARCHITECTURE.md) · [Project format](docs/DATA_FORMAT.md) · [Custom models](docs/CUSTOM_MODELS.md)

## License and feedback

Original code uses [PolyForm Noncommercial 1.0.0](LICENSE). It is source-available for permitted noncommercial use, not an OSI open-source license. Dependencies and models retain their own licenses; see [licensing](docs/LICENSING.md). Optional donations do not affect functionality.

Report reproducible problems through [Issues](https://github.com/Kreeli/immerse-jam/issues). Please remove private paths/media before sharing logs.
