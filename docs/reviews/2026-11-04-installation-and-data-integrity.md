# Installation and data integrity review

Baseline: v0.1.12 (4de23eed70cac720acaa9bd918f6f76061dc0e63).
Validation snapshot: 2026-11-04.

## Installer and runtime changes

- Preserve an explicit /D= program directory, including spaces, using electron-builder's full-command-line helper. NSIS removes this option from its regular parameter string.
- Choose the fixed non-system drive with the most available space instead of the first drive. Normalize new folders without requiring them to exist; check writability and reject program/data directory nesting in either direction.
- Require system-drive consent only for system-drive data. An isolated non-system-drive install without consent succeeds.
- Return a nonzero status once on silent preparation failure instead of displaying retry dialogs. Interactive preparation has an explicit Stop/Retry action and retains downloaded data.
- Check conservative space budgets before dependency preparation. Preserve disk-full, permission, path and I/O causes rather than treating them as mirror/network failures.
- Pin matching CPU or CUDA 12.8 wheel flavors. Include the flavor in readiness markers and require a real GPU matrix operation before reporting CUDA readiness.
- Refuse packaging through linked output folders. Allow a separate candidate output inside .runtime and disable publication during packaging.

## Data integrity changes

| Trigger                                                                   | Result after this change                                                                                                       |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| A project manifest contains another project's ID                          | Reject the mismatch before any normalization or save can overwrite the other project                                           |
| A project path passes lexical checks but escapes through a directory link | Check physical containment, including the nearest existing ancestor of a future path; preserve valid whole-library entry links |
| A synchronous write consumes fewer bytes than requested                   | Write the remaining bytes before advancing recording, transfer, download or archive state; reject zero-progress writes         |
| The final recording header cannot be written                              | Close the descriptor and preserve the raw recording and pending manifest for recovery                                          |
| A later item in an outgoing batch fails                                   | Remove files and close descriptors owned by that attempt                                                                       |
| A connection closes during outgoing hashing                               | Reject stale work before registering a new outgoing descriptor                                                                 |
| An outgoing file is truncated                                             | Fail on premature EOF instead of returning zero-padded data                                                                    |
| Cancelling a download probe never settles                                 | Abort the response and let progress/fallback handling continue without awaiting cancellation indefinitely                      |
| Copying a bundled component fails because local storage is unavailable    | Preserve and propagate the storage failure instead of starting network fallback                                                |
| FFmpeg fails after producing partial output                               | Remove only the temporary output and preserve the previous playback file                                                       |
| Prepared audio exceeds four hours                                         | Reject it before replacing playback; bound decoding and use RF64 for large WAV output                                          |
| Custom-model metadata is malformed or disagrees with its directory        | Skip the invalid entry without breaking the model list or deleting its files; keep valid long names compatible                 |

The Android storage entry point mirrors the project-ID and project-directory checks. Its Java changes have static review only.

## Validation

Local Windows checks:

- npm run check, node scripts/audit-source.cjs and npm run format:check passed.
- npm test: 120 tests passed.
- npm run test:backend: 13 tests passed, including a real short FFmpeg decode and synthetic ONNX/audio cases.
- npm run build passed; existing upstream module-directive warnings remain.
- node scripts/ci-ui-check.cjs passed with generated fixtures.
- node scripts/network-check.cjs passed against a loopback proxy in background Electron.

The new regressions inject partial/zero writes, transport cancellation that never resolves, invalid project/model metadata, decoder failures, directory links and transfer-close races. They verify persisted bytes and rollback behavior.

The Windows-only scripts/installer-audit-check.cjs compiles production NSIS functions into a private fixture. Registry operations are redirected and runtime/model services are synthetic. Six automated scenarios passed: non-system data without consent, system data rejection/consent, terminal silent failure, explicit paths with spaces, and default non-system drive selection. The script also opens an interactive fixture for manual inspection.

These checks do not constitute a fresh full installation, physical audio-device acceptance, Android build/device validation, long-session testing, or inference/quality testing for every community model.

## Open acceptance items

This is an initial review batch. Keep the pull request in draft until the remaining installer acceptance work is resolved:

- Confirm Back/Cancel state and the full Stop, change-folder, Retry and Finish sequence.
- Correct/verify the sixth model option being obscured by the footer at the default native window size.
- Test a complete packaged installation and launch on a clean Windows environment.
- Compile and validate the Android storage changes on a configured Android toolchain/device.

No installer binaries, runtime caches, model weights, recordings or local investigation logs belong in this change.
