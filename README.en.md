# Immerse Jam

[简体中文](README.md) · [Architecture](docs/ARCHITECTURE.md) · [Project format](docs/DATA_FORMAT.md)

**0.1.4**, Windows 10/11 x64. Local stem separation, music practice and multitrack recording. Analysis runs on your computer, with no subscription or separation quota.

## Install

Get the installer from [Releases](https://github.com/Kreeli/immerse-jam/releases). Playback requires no preinstalled Python/Node.js. Audio import, recording normalization and mix export download a verified private FFmpeg when first needed. For analysis, choose NVIDIA or CPU in Settings & models and install the private environment. NVIDIA needs a compatible driver. Models download ahead of use or on demand. Initial setup needs internet and several GB of space; processing can then run offline. No private media or model weights are distributed.

## Practice and recording

- Synchronized stems, speed/pitch, gain, pan, meters and presets. Combine tracks with Listen; Mute clears Listen on that track. Click a track name for its waveform, then again for the actual mixed waveform.
- Centered draggable waveform, named loops and bookmarks. Space plays/pauses, arrows seek, L marks loop boundaries, M adds bookmarks.
- Beat-aware metronome, independent volume, count-in and nearest-beat start. Manual BPM and tap correction remain available.
- Choose input, backing output and channels. No software mic monitoring; use interface direct monitoring. Instrument-only saves selected input without internal backing. Already-mixed mode captures hardware AUX/backing input and mutes the new take by default to avoid doubled backing.
- Unlimited saved takes; **up to two mounted takes in practice**, both audible. Unmount keeps files. Takes support names, start positions, offsets and batch import with independent lengths.
- **Creation** starts empty and supports multiple overdubs, imports, mixing and export without the two-take limit.

Follow-along calibration plays four listening beats then asks for eight short strums/claps. Keep the click out of the input. It estimates **human timing bias plus the audio path**, not pure hardware latency. Save a correction per input/output pair, then fine-tune it globally or per take. Raw recordings are preserved; normalized files map performances back through speed/pitch changes.

## Analysis and projects

Six separation modes: four stems, six stems, lead/rhythm guitar, drums, bass, lead/backing vocals. BS RoFormer SW is the default six-stem model (~667 MiB), with HT Demucs and other options. Specialized modes use extra models. Independent results can be switched/renamed; [custom model](docs/CUSTOM_MODELS.md) contracts are validated.

Chord charts follow playback, with blank slots, moves/swaps, sections, bar calibration and up to two chords per bar. Guitar Pro/MusicXML/MIDI support score following, automatic alignment and manual corrections. Recognition needs listening checks; MIDI has basic synthesized sounds and not every Guitar Pro technique.

Full `.ijam` projects retain independent model results, takes, scores and practice state. Export mixes as WAV/MP3 or copy ordinary stems. Read-only Audio Jam migration copies local media; cloud-only files cannot be recovered. See [project format](docs/DATA_FORMAT.md).

LAN/hotspot QR transfer works with phone browsers. Remote WebRTC uses exchanged connection codes and public STUN, without a configured TURN relay; some networks cannot connect. Cross-carrier and physical mobile-device testing remains limited. Native Android, Bluetooth, remote resume and conflict merging are future work.

Switch Chinese/English, dark/light/system and rose/blue/green/purple accents. User text is preserved.

## Develop and license

Node.js 24 and Windows x64: `npm ci`, `npm run check`, `npm test`, `npm run build`, `npm run dev`. Prepare backend with `npm run prepare:runtime`, test with `npm run test:backend`, build installer with `npm run package`. UI tests generate isolated fixtures; see [validation](docs/VALIDATION.md).

Original code uses [PolyForm Noncommercial 1.0.0](LICENSE): **source-available with a noncommercial restriction**, not an OSI-approved open-source license. This is broader than a ban on reselling installers. Contact the author for commercial use. Third-party components/models keep their own terms; see [license scope](docs/LICENSING.md) and [contributing](CONTRIBUTING.md). Sidebar donations are optional.
