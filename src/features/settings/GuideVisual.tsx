import { t as tr } from '../../i18n';
const levels = [
  8, 16, 24, 14, 30, 40, 23, 34, 16, 26, 42, 31, 18, 12, 28, 36, 22, 40, 48, 28, 18, 30, 38, 22, 14,
  26, 44, 32, 18, 10, 24, 16,
];
export default function GuideVisual({ step }: { step: number }) {
  return (
    <figure className={'onboarding-visual guide-scene-' + step}>
      <svg viewBox="0 0 520 180" aria-hidden="true">
        {step === 0 ? (
          <>
            <rect className="guide-sheet" x="36" y="27" width="114" height="124" rx="10" />
            <path className="guide-line" d="M63 60h60M63 75h40M63 118h60" />
            <text x="93" y="102" textAnchor="middle">
              WAV
            </text>
            <path className="guide-accent" d="M187 90h93m-12-12 12 12-12 12" />
            <rect className="guide-panel" x="320" y="30" width="162" height="122" rx="12" />
            {[0, 1, 2].map((i) => (
              <g key={i} transform={'translate(337 ' + (48 + i * 31) + ')'}>
                <rect className="guide-sheet" width="24" height="22" rx="4" />
                <path className="guide-line" d="M38 5h75M38 15h50" />
              </g>
            ))}
          </>
        ) : step === 1 ? (
          <>
            {[tr('人声'), tr('鼓'), tr('贝斯')].map((label, row) => (
              <g key={row} transform={'translate(22 ' + (25 + row * 48) + ')'}>
                <text x="0" y="23">
                  {label}
                </text>
                <rect className="guide-panel" x="78" y="0" width="397" height="38" rx="6" />
                {levels.map((v, i) => (
                  <line
                    className={row === 0 ? 'guide-accent' : 'guide-line'}
                    key={i}
                    x1={91 + i * 11.8}
                    x2={91 + i * 11.8}
                    y1={19 - v * (row === 1 ? 0.26 : 0.32)}
                    y2={19 + v * (row === 1 ? 0.26 : 0.32)}
                  />
                ))}
              </g>
            ))}
          </>
        ) : step === 2 ? (
          <>
            <rect className="guide-panel" x="28" y="24" width="464" height="123" rx="12" />
            <rect className="guide-loop" x="143" y="46" width="248" height="76" rx="5" />
            {levels.map((v, i) => (
              <line
                className="guide-line"
                key={i}
                x1={59 + i * 13}
                x2={59 + i * 13}
                y1={84 - v * 0.5}
                y2={84 + v * 0.5}
              />
            ))}
            <path className="guide-accent" d="M143 40v90m248-90v90M267 36v103" />
            <text x="143" y="164" textAnchor="middle">
              A
            </text>
            <text x="391" y="164" textAnchor="middle">
              B
            </text>
            <circle className="guide-record" cx="463" cy="48" r="5" />
          </>
        ) : (
          <>
            {[tr('分轨'), tr('混音'), tr('完整工程')].map((label, i) => (
              <g key={i} transform={'translate(' + (42 + i * 162) + ' 22)'}>
                <rect className="guide-sheet" width="112" height="133" rx="10" />
                <path className="guide-accent" d="M56 25v35m-11-11 11 11 11-11M37 68v7h38v-7" />
                <text x="56" y="107" textAnchor="middle">
                  {label}
                </text>
              </g>
            ))}
          </>
        )}
      </svg>
      <figcaption>{tr('操作示意')}</figcaption>
    </figure>
  );
}
