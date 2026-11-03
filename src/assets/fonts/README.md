# Prototype typography

The fonts specified by wweiyi2004's PR #6 are bundled locally. The application does not load Google Fonts or contact a font CDN at runtime. Chinese text uses the installed Noto Sans SC / system CJK fallback.

- [Bricolage Grotesque](https://github.com/google/fonts/tree/main/ofl/bricolagegrotesque): `BricolageGrotesque[opsz,wdth,wght].ttf`, original unmodified variable font. License: `BricolageGrotesque-OFL.txt`.
- [JetBrains Mono](https://github.com/google/fonts/tree/main/ofl/jetbrainsmono): `JetBrainsMono[wght].ttf`, original unmodified variable font. License: `JetBrainsMono-OFL.txt`.

The build copies both license files into the application's third-party notices. The original font names and copyright statements are retained.
