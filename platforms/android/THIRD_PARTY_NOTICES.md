# Android components and models

The application code is PolyForm Noncommercial 1.0.0. Third-party licenses remain separate.

- Shared web UI: React, Lucide, alphaTab, Tone MIDI, SoundTouchJS, fflate and QRCode retain the licenses included under `assets/licenses/` and in the APK `legal/` directory. SoundTouchJS is MPL-2.0; upstream code is unchanged and the source/notice offer in the main repository applies.
- AndroidX Activity, Core and WebKit: Apache License 2.0, Android Open Source Project. See https://android.googlesource.com/platform/frameworks/support/.
- ONNX Runtime Android 1.23.2: MIT, Microsoft Corporation. See https://github.com/microsoft/onnxruntime/tree/v1.23.2.
- Java desugaring libraries: Apache License 2.0 and their upstream notices, https://github.com/google/desugar_jdk_libs.
- Bundled `UVR-MDX-NET-Inst_HQ_3.onnx`: credit to Ultimate Vocal Remover and its developers, Anjok07 and aufr33. Their model MIT attribution grant is stated in https://github.com/Anjok07/ultimatevocalremovergui#license. Original model: https://github.com/TRvlvr/model_repo/releases/tag/all_public_uvr_models. Parameters: https://github.com/TRvlvr/application_data/blob/main/mdx_model_data/model_data.json. The upstream tail fingerprint matches `55657dd70583b0fedfba5f67df11d711`; the complete downloaded file is pinned by SHA-256 in `model-catalog.json`.
- Optional SCNet ONNX: SCNet authors (MIT), https://github.com/starrytong/SCNet; deployment export by Demixr (MIT), https://github.com/demixr/scnet-executorch. The release v0.1.2 provides the pinned SHA-256. Research: SCNet, Sparse Compression Network for Real-Time Music Source Separation, https://arxiv.org/abs/2401.13276.

Model weights are downloaded from their authors; only the designated bundled model is embedded in APK builds. Android model artifacts are separate from desktop PyTorch checkpoints. No third-party proprietary application code is included.
