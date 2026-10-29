# License scope / 许可范围

Immerse Jam's original source files are available under **PolyForm Noncommercial 1.0.0**. See the repository's `LICENSE` and its required copyright notice for Kreeli.

个人非商业练习、学习、研究、修改和符合协议的分享可以使用这些源码。未经另行许可，不得把本项目原创代码或其衍生软件用于协议未许可的商业用途，包括售卖应用、收费提供其功能等。该协议的范围比单纯“禁止倒卖安装包”更广；商业用途请先联系作者。

This is **source-available software with a noncommercial restriction**, not an OSI-approved open-source license. The restriction applies to Immerse Jam's original work; it does not replace or narrow any third-party license.

## Third-party components

- `backend/vendor/beat_this/`: CPJKU Beat This! 1.1.0, MIT. Its license and pinned source provenance are included in that directory. Model weights are downloaded separately with a pinned checksum.
- `backend/vendor/scnet/`: retains its included MIT license. This code is not relicensed under PolyForm.
- alphaTab 1.8.4 and SoundTouchJS 2.1.1: MPL-2.0. They are used without source modifications. Their covered source files remain available under MPL-2.0, including its commercial-use permissions; the noncommercial restriction on Immerse Jam does not apply to those files.
- React, Tone MIDI, QRCode, compression/transfer libraries and other dependencies: retain their package licenses and notices. See `assets/licenses/THIRD_PARTY_NOTICES.txt` and the adjacent license texts.
- Electron, Python, PyTorch and other separately installed runtime components: retain their upstream licenses. Python package licenses are installed with the packages in the app's private runtime.
- Model weights: downloaded separately from the catalog's upstream URLs. Each model's own terms apply. No permission over someone else's model weights is granted by Immerse Jam's license.

Android builds embed the designated UVR and converted Beat This! models listed in `platforms/android/model-catalog.json`; see that platform's third-party notices and bundled license texts. The Beat This! conversion uses the same pinned final0 weights as Windows.

## FFmpeg

The Windows installer does **not** bundle the GPL-licensed FFmpeg executable or the `ffmpeg-static` JavaScript module. When audio processing is first needed, the app downloads the independent executable directly from its upstream release, verifies SHA-256, and runs it through its command-line interface. It does not link FFmpeg libraries into the application's original code.

- Binary provider and release: <https://github.com/eugeneware/ffmpeg-static/releases/tag/b6.1.1>
- Upstream FFmpeg source: <https://github.com/FFmpeg/FFmpeg/tree/e38092ef93>
- Binary license/build information: `assets/licenses/ffmpeg-static/ffmpeg.exe.LICENSE` and `ffmpeg.exe.README`.
- Verified executable SHA-256: `04e1307997530f9cf2fe35cba2ca7e8875ca91da02f89d6c7243df819c94ad00`.

The upstream executable retains its own GPL rights. The noncommercial license does not restrict independent use or redistribution of that executable under its own license. Developers who choose to redistribute different binaries are responsible for meeting the corresponding upstream distribution terms.

## Branding and content

The app's name, supplied icon and donation graphic identify this project and its author. The software license does not grant rights to impersonate the author or present another person's payment account as the original author's account.

音乐、乐谱、模型及用户录音的权利由各自权利人决定；本项目的软件许可证不代替这些内容的授权，也不会把用户音频自动改成某种软件许可证。

## Sources and interpretation

The unmodified PolyForm license text governs the original source. The explanations above describe its scope; they do not amend third-party licenses or add restrictions to them.

- PolyForm official text: <https://polyformproject.org/licenses/noncommercial/1.0.0>
- Mozilla MPL FAQ, especially questions 8, 11 and 16: <https://www.mozilla.org/en-US/MPL/2.0/FAQ/>
- OSI Open Source Definition: <https://opensource.org/osd>

Contribution terms are described in `CONTRIBUTING.md`. Do not contribute proprietary Audio Jam implementation code or third-party code without compatible permission.
