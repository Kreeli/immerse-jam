import { t as tr } from '../../i18n';
export default function AnalysisNote() {
  return (
    <p className="analysis-note">
      {tr(
        '复杂曲目中，智能节拍器与和弦识别可能不够准确。技术仍有局限，感谢乐手们的理解；可按听感手动校准节拍和和弦。',
      )}
    </p>
  );
}
