# Multi Record feature mapping

The Android Multi Record project was used as a read-only behavioral reference. Its source project is unchanged. Immerse Jam reimplements the shared recording workflow in its Windows audio engine.

| Multi Record capability                 | Immerse Jam Windows                                                                                                   |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| First recording in an empty project     | New creation → choose input → record                                                                                  |
| Overdub during existing playback        | Recording starts at the current shared clock position                                                                 |
| Independent takes and arbitrary imports | Project recording library; creation includes all takes                                                                |
| Gain, mute, listen, rename and delete   | Existing track controls and recording library                                                                         |
| Position and latency adjustment         | Start seconds, per-take offset, per-device correction and follow-along estimate                                       |
| Timeline and individual/mix waveforms   | Centered draggable waveform; click a track to switch, plus live input envelope/meter while recording                  |
| Multiple projects and automatic save    | Workspace library with named creation projects                                                                        |
| Interrupted recording recovery          | Pending PCM recovery when opening its recording library                                                               |
| Mixed WAV export                        | Stereo WAV/MP3 export with current mix, pan, offsets, speed/pitch; complete project archive separately                |
| Android foreground service/audio focus  | Platform-specific; Windows capture continues while the app remains running, lost input stops and saves received audio |

Windows retains stereo inputs and pan instead of copying the Android app's mono import/export restriction. Practice additionally limits mounted takes to two while retaining unlimited saved attempts. Android animations and background-service implementation are not transplanted into Electron. Physical USB/AUX routing and timing still need the user's device check.
