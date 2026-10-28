# Project format / 项目格式

```text
library/projects/<project-id>/
  project.json
  media/                         original audio/video
  results/<name>--<id>/
    result.json
    tracks/*.wav
  recordings/<take-id>/
    raw.wav                      captured input, before normalization
    source.<ext>                 imported original (imported takes)
    track.wav                    normalized playback file
    take.json                    commit-time snapshot
    pending.json                 unfinished capture only
  attachments/                   scores, MIDI, images and other files
```

All paths are project-relative. **`project.json` is the authoritative editable state**; result/take sidecars are descriptive snapshots that may precede later name/mix edits. WAV files are directly usable outside the app.

`results[]` contains independent model runs, names, model/mode metadata and tracks. `activeResultId` selects a result; `tracks` retains the current compatible view. Switching must not delete other results or takes. Stem identity comes from the validated contract, not output count/order.

`takes[]` holds the recording library: ID, name, file/rawFile, start/duration in original song seconds, offsetMs, gain/pan/mute/solo, mode, recordedTempo/Pitch, inputLabel, latencyMs and timestamps. Silence outside a take remains empty timeline. Captured raw PCM is stereo Float32 WAV; normalized playback is standard WAV. Imported original files remain beside it.

Practice `selectedTakeIds[]` contains at most two distinct known takes; unselecting preserves files. `kind: "creation"` projects use their take collection without that limit. Empty creations have an original placeholder until takes establish duration.

`pending.json` retains the capture clock anchor, sample rate, speed/pitch, correction and identity. Ordered PCM chunks stream to disk; recovery rebuilds the WAV header from saved frames before normalization. Completed state updates atomically. Failed recovery leaves its source available.

`practice` stores transport/count-in/metronome settings; `recordingSettings` stores device/channel/mode/correction. Per-device profiles and UI preferences live in browser storage separately from transferred projects. Beat/downbeat times, loops and bookmarks use original-song seconds. Chord charts retain measures with up to two slots independently of row placement; recognition preserves user charts. Score synchronization uses monotone mapping points.

Full `.ijam` archives include independent results, take library, scores and settings. Default lightweight transfers focus on original/stems. Import checks paths, declared files, integrity and size before exposing a project; repeated IDs/content deduplicate. Old indexes migrate with original media and upgrade snapshots preserved. Future Android clients should retain these semantics with platform-specific audio/runtime adapters.
