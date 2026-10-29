# Project format / 项目格式

```text
library/projects/<project-id>/
  project.json
  media/                         original audio/video
  results/<name>--<id>/
    result.json
    tracks/*.wav
  groups/<group-id>/             independent copies of imported creation stems
    <index>-<filename>
  recordings/<take-id>/
    raw.wav                      captured input, before normalization
    source.<ext>                 imported original (imported takes)
    track.wav                    normalized playback file
    take.json                    commit-time snapshot
    pending.json                 unfinished capture only
  attachments/                   scores, MIDI, images and other files
```

All paths are project-relative. **`project.json` is the authoritative editable state**; result/take sidecars are descriptive snapshots that may precede later name/mix edits. WAV files are directly usable outside the app.

The library root also holds `folders.json`: `{schemaVersion: 1, folders: [{id, name, projectIds}]}`. Membership is local organization metadata, may mix all project kinds, and never changes audio paths. Moving a project removes prior membership. Deleting a category removes only its metadata and returns projects to Unfiled. Empty categories persist. Named old playlists migrate once, excluding the former default “未分类项目”. Individual project archives do not replace a receiver's folder catalog.

`results[]` contains independent model runs, names, model/mode metadata and tracks. `activeResultId` selects a result; `tracks` retains the current compatible view. Switching must not delete other results or takes. Stem identity comes from the validated contract, not output count/order.

`takes[]` holds the recording library: ID, name, file/rawFile, start/duration in original song seconds, offsetMs, gain/pan/mute/solo, mode, recordedTempo/Pitch, inputLabel, latencyMs and timestamps. Silence outside a take remains empty timeline. Captured raw PCM is stereo Float32 WAV; normalized playback is standard WAV. Imported original files remain beside it.

Practice `selectedTakeIds[]` contains at most two distinct known takes; unselecting preserves files. `kind: "creation"` projects use their take collection without that limit. Empty creations have an original placeholder until takes establish duration.

Music library entries have no `kind`. `kind: "practice"` and `kind: "creation"` belong to the separate practice workspace. `sessionSource` records the source project ID/title/result for provenance; all required media and the selected result are copied into the new project's own folder. It is not a live file dependency, and source deletion does not break existing sessions. Creation can include source stems when `sessionSource` exists.

Practice `practiceMode` is `instrument` (stem backing) or `mixed` (recording already includes backing). Mixed review with mounted takes gates the backing stems; practice capture restores backing and gates previous takes. This routing never overwrites stored per-track mix controls. Creation keeps overdub routing. Deletion moves the selected entire project folder to the system Recycle Bin.

Creation `sourceGroups[]` holds independently copied audio objects: ID, name/sourceTitle, tracks, gain/mute/solo, start and optional label. The original `sessionSource` object uses `tracks`/`originalMix` plus optional `sourceMix` for its outer controls. A group is one outer object; inner stem listening applies only inside that group, while outer group/take listening selects among outer objects. Effective timing and gain combine group and stem values. Playback and mix export apply the same routing. Ordinary edits cannot replace group file identities; dedicated import handlers copy and validate files transactionally. Removing or changing the library source cannot alter those copies.

`pending.json` retains the capture clock anchor, sample rate, speed/pitch, correction and identity. Ordered PCM chunks stream to disk; recovery rebuilds the WAV header from saved frames before normalization. Completed state updates atomically. Failed recovery leaves its source available.

`practice` stores transport/count-in/metronome settings; `recordingSettings` stores device/channel/mode/correction. Per-device profiles and UI preferences live in browser storage separately from transferred projects. Beat/downbeat times, loops and bookmarks use original-song seconds. Chord charts retain measures with up to two slots independently of row placement; recognition preserves user charts. Score synchronization uses monotone mapping points.

Full `.ijam` archives include independent results, take library, scores and settings. Default lightweight transfers focus on original/stems. Import checks paths, declared files, integrity and size before exposing a project; repeated IDs/content deduplicate. Old indexes migrate with original media and upgrade snapshots preserved. Future Android clients should retain these semantics with platform-specific audio/runtime adapters.

Creation exports with a source group use `schemaVersion: 2`, including the legacy `sessionSource` group. Group files and creation takes are included even in lightweight creation transfers. Version 0.1.6 accepts versions 1 and 2; older clients reject version 2 rather than silently losing grouped mix semantics. Ordinary music exports remain version 1.
