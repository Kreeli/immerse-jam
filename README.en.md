# Immerse Jam

[简体中文](README.md) · [Architecture](docs/ARCHITECTURE.md) · [Project format](docs/DATA_FORMAT.md)

**0.1.8**, Windows 10/11 x64. Local stem separation, music practice and multitrack recording. Analysis runs on your computer, with no subscription or separation quota.

## Install

Get the installer from [Releases](https://github.com/Kreeli/immerse-jam/releases). Choose the program folder and a separate data folder, acceleration (automatic/CPU/NVIDIA) and optional models. Setup prepares and verifies private Python, inference dependencies, FFmpeg and selected models before finishing. A non-system fixed drive is preferred; system-drive storage requires explicit confirmation. Music, recordings, models, runtime and download caches stay in that data folder, which uninstall preserves. Six-stem BS RoFormer SW and Beat This! are selected by default. Vocal/guitar add-ons also install the six-stem base. Setup needs internet and several GB; NVIDIA requires a compatible driver. Failed preparation can be retried and never reports successful installation. Settings retains repair/download controls and displays storage locations. No private media or model weights are bundled.

## Practice and recording

The music library is separate from practice/creation projects. The Practice / Create workspace shows a list filtered by All/Practice/Creation. The ordinary music player offers Create from this song at the top right; recording controls appear in practice/creation. Create an independent project from a library song and selected stem result, or start an empty creation. Cancelling creates nothing. Browsing keeps the active project playing through an integrated bottom transport; click its name to return to the player. Deletion moves only the selected song/project into the system Recycle Bin, without deleting independent source copies elsewhere.

Practice modes switch between Stem backing and Mixed recording. The former combines independent performance takes with adjustable stems; the latter reviews mounted recordings without doubled backing. During either recording mode, stem controls operate the backing while previous practice attempts are quiet. Creation continues to support overdubbing existing takes.

- Synchronized stems, speed/pitch, gain, pan, meters and presets. Combine tracks with Listen; Mute clears Listen on that track. Click a track name for its waveform, then again for the actual mixed waveform.
- Centered draggable waveform, named loops and bookmarks. Quick actions sit above the workspace; the fixed right panel switches between Mixer, Loops and Markers with independent scrolling. Space plays/pauses, arrows seek, L marks loop boundaries, M adds bookmarks.
- Beat-aware metronome, independent volume, count-in and nearest-beat start. Manual BPM and tap correction remain available.
- Choose input, backing output and channels. No software mic monitoring; use interface direct monitoring. Instrument-only saves selected input without internal backing. Already-mixed mode captures hardware AUX/backing input and mutes the new take by default to avoid doubled backing.
- Unlimited saved takes; **up to two mounted takes in practice**, both audible. Unmount keeps files. Takes support names, start positions, offsets and batch import with independent lengths.
- **Creation** uses a collapsible track list instead of one large waveform. Library songs and external `.ijam`/`.aum` stem projects stay in single outer groups with internal stem controls and scoped listening. Start empty or from a song, overdub at the current playback position, import audio, mix and export without the two-take limit.
- Recording sits beside Play in the bottom transport; saved device settings allow one-click capture. Practice shows the main mix and live input/mounted take waveforms in aligned time windows.

Follow-along calibration plays four listening beats then asks for eight short strums/claps. Keep the click out of the input. It estimates **human timing bias plus the audio path**, not pure hardware latency. Save a correction per input/output pair, then fine-tune it globally or per take. Raw recordings are preserved; normalized files map performances back through speed/pitch changes.

## Analysis and projects

Six separation modes: four stems, six stems, lead/rhythm guitar, drums, bass, lead/backing vocals. BS RoFormer SW is the default six-stem model (~667 MiB), with HT Demucs and other options. Specialized modes use extra models. Independent results can be switched/renamed; [custom model](docs/CUSTOM_MODELS.md) contracts are validated.

Chord charts follow playback, with blank slots, moves/swaps, sections, bar calibration and up to two chords per bar. Guitar Pro/MusicXML/MIDI support score following, automatic alignment and manual corrections. Recognition needs listening checks; MIDI has basic synthesized sounds and not every Guitar Pro technique.

Full `.ijam` projects retain independent model results, creation groups, takes, scores and practice state. Grouped creation archives require 0.1.6 or newer. Export mixes as WAV/MP3 or copy ordinary stems. Read-only Audio Jam migration copies local media; cloud-only files cannot be recovered. See [project format](docs/DATA_FORMAT.md).

LAN/hotspot QR transfer works with phone browsers. Remote WebRTC uses exchanged connection codes and public STUN, without a configured TURN relay; some networks cannot connect. Cross-carrier and physical mobile-device testing remains limited. Native Android, Bluetooth, remote resume and conflict merging are future work.

Switch Chinese/English, dark/light/system and rose/blue/green/purple accents. User text is preserved.

Project folders can hold music/separation, practice and creation projects together. Create, rename and move items through folder menus; deleting a folder returns items to Default folder and keeps media. Feedback opens an email to `meowmeowneko999@gmail.com` or GitHub Issues; nothing is sent automatically. Buy the author an iced cola crops the supplied image to show its original QR pixels.

## Develop and license

Node.js 24 and Windows x64: `npm ci`, `npm run check`, `npm test`, `npm run build`, `npm run dev`. Prepare backend with `npm run prepare:runtime`, test with `npm run test:backend`, build installer with `npm run package`. UI tests generate isolated fixtures; see [validation](docs/VALIDATION.md).

Original code uses [PolyForm Noncommercial 1.0.0](LICENSE): **source-available with a noncommercial restriction**, not an OSI-approved open-source license. This is broader than a ban on reselling installers. Contact the author for commercial use. Third-party components/models keep their own terms; see [license scope](docs/LICENSING.md) and [contributing](CONTRIBUTING.md). Sidebar donations are optional.
