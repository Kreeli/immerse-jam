# Product requirements

Immerse Jam is an independently implemented local music-practice workspace. It uses familiar library/player/sidebar interactions with its own code. Do not contribute proprietary Audio Jam implementation code.

- Windows first, future Android using compatible project semantics.
- Private, automatically prepared inference runtime; CPU/NVIDIA paths, explicit verified downloads and custom model contracts.
- Six modes: four/six stems, lead/rhythm guitar, drums, bass, lead/backing vocals.
- Synchronized mixing, speed/pitch, editable chord charts, score/MIDI alignment, loops and bookmarks.
- Independent model results and plain WAV stems. Unlimited takes saved separately, max two mounted in practice; multitrack creation from empty projects.
- Manual instrument-only or hardware-mixed input choice. Select input/output/channels; reuse pan controls for comparison.
- Beat-aware metronome, count-in and follow-along timing estimation including human timing bias.
- Read-only migration, verified selected-project LAN/remote direct transfer, no required user-paid server.
- Chinese/English, configurable appearance, no membership gates, optional donations.
- Noncommercial original source; preserve third-party licensing.

Native Android, Bluetooth, remote resume and guaranteed cross-network connectivity remain future work. Musical accuracy and hardware routing require broader evaluation; see [validation](VALIDATION.md).

References: [Audio Jam behavior](https://audiojam.app/), [SpleeterGUI](https://github.com/boy1dr/SpleeterGui), [model catalog](https://github.com/ZFTurbo/Music-Source-Separation-Training/blob/main/docs/pretrained_models.md), [Beat This!](https://github.com/CPJKU/beat_this). Reference behavior does not grant implementation-source permissions.
