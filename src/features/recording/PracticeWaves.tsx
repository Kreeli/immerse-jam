import type { LiveEnvelope } from '../../audio/live-envelope';
import { activeTakes } from '../../audio/performance';
import { t as tr } from '../../i18n';
import type { Project } from '../../shared/types';
import TrackWave, { LiveWave, type TimelineProps } from './TrackWave';
export default function PracticeWaves({
  project,
  live,
  ...timeline
}: TimelineProps & { project: Project; live: LiveEnvelope | null }) {
  const takes = activeTakes(project);
  return (
    <div className="practice-recording-waves">
      {live ? (
        <section className="comparison-lane live-lane">
          <h4>
            <i className="record-dot" />
            {tr('正在录音')}
          </h4>
          <LiveWave {...timeline} live={live} />
        </section>
      ) : takes.length ? (
        takes.map((take) => (
          <section className="comparison-lane" key={take.id}>
            <h4>{take.label || take.name}</h4>
            <TrackWave
              {...timeline}
              source={take.id}
              signature={String(take.start) + '|' + take.offsetMs}
            />
          </section>
        ))
      ) : (
        <section className="comparison-lane recording-wave-empty">
          <h4>{tr('录音波形')}</h4>
          <p>{tr('点击下方录音，演奏波形将在这里与总波形同步显示。')}</p>
        </section>
      )}
    </div>
  );
}
