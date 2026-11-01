# Android components

The application code is PolyForm Noncommercial 1.0.0. Third-party licenses remain separate.

- Shared web UI: React, Radix UI (MIT), Lucide, alphaTab, Tone MIDI, SoundTouchJS, fflate and QRCode retain the licenses included under `assets/licenses/` and in the APK `legal/` directory. SoundTouchJS is MPL-2.0; upstream code is unchanged and the source/notice offer in the main repository applies.
- AndroidX Activity, Core and WebKit: Apache License 2.0, Android Open Source Project. See https://android.googlesource.com/platform/frameworks/support/.
- JourneyApps ZXing Android Embedded 4.3.0 and ZXing Core 3.4.1: Apache License 2.0. See https://github.com/journeyapps/zxing-android-embedded/tree/v4.3.0 and https://github.com/zxing/zxing/tree/zxing-3.4.1. Upstream code is unchanged; the Apache license and ZXing notice are included in the APK's legal directory.
- Java desugaring libraries: Apache License 2.0 and their upstream notices, https://github.com/google/desugar_jdk_libs.

The current player-only Android build contains no ONNX runtime, bundled separation models, or Beat This! weights. Historical model attributions and model conversion scripts remain available in Git history. Desktop model licenses remain separate. No third-party proprietary application code is included.
