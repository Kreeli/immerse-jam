# Contributing

Contributions are welcome for noncommercial development under the repository's PolyForm Noncommercial 1.0.0 license. By submitting a contribution, you confirm that you have the right to license your original contribution under those same terms. This does not relicense third-party files or give the maintainer rights you do not hold.

Keep third-party provenance and licenses intact. Do not copy proprietary reference-application source code, upload private music/recordings, or commit model weights, credentials, local runtime folders or generated installers.

Use the shared project schema and IPC method contract. Keep audio timing calculations independent of UI rendering. Add meaningful regression coverage for timing, format validation, file safety and migration changes; avoid tests that simply repeat implementation details.

Before submitting:

```text
npm ci
npm run check
npm test
npm run build
```

Audio-device behavior needs Windows testing. Use generated fixtures for automated tests. Describe actual devices separately when reporting latency or routing results, and distinguish measured hardware behavior from simulated-input tests.

请先阅读 `docs/ARCHITECTURE.md` 和 `docs/LICENSING.md`。新界面文案需要同时加入中英文词典，颜色使用主题变量。不要提交私人曲库、录音、调查缓存、模型或安装产物。
