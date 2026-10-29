import { Crosshair, Music2, Pencil, Plus, Trash2, Undo2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { t as tr } from '../../i18n';
import { time, type ChartBar, type ChordChart, type Project } from '../../shared/types';
import {
  activeBar,
  calibrateBar,
  createChart,
  placeChord,
  retimeChart,
  slotTime,
  updateSlot,
  type Timing,
} from './chart';
type Selection = {
  barId: string;
  slotId: string | null;
};
export default function ChordSheet({
  project,
  position,
  playing,
  onSeek,
  onProject,
  onAnalyze,
  busy,
  formatLabel,
}: {
  project: Project;
  position: number;
  playing: boolean;
  onSeek: (time: number) => void;
  onProject: (project: Project) => void;
  onAnalyze: () => void;
  busy: boolean;
  formatLabel: (label: string) => string;
}) {
  const host = useRef<HTMLElement>(null),
    barElements = useRef(new Map<string, HTMLDivElement>()),
    dragging = useRef(false);
  const [follow, setFollow] = useState(true),
    [deleting, setDeleting] = useState(false),
    [selected, setSelected] = useState<Selection | null>(null),
    [editing, setEditing] = useState<
      | (Selection & {
          label: string;
        })
      | null
    >(null),
    [history, setHistory] = useState<ChordChart[]>([]),
    [message, setMessage] = useState(''),
    [bankInput, setBankInput] = useState('');
  const [timing, setTiming] = useState<Timing>({
    bpm: 120,
    meter: 4,
    firstDownbeat: 0,
    timingSource: 'fixed',
  });
  const automatic = useMemo(
    () =>
      project.analysis && project.duration > 0
        ? createChart(project.analysis, project.duration)
        : null,
    [project.analysis, project.duration],
  );
  const charts = project.chordCharts || [];
  const chart =
    charts.find((item) => item.id === project.activeChordChartId) ||
    (project.activeChordChartId === 'auto' ? automatic : null) ||
    charts[0] ||
    automatic;
  const current = chart ? activeBar(chart, position) : null;
  useEffect(() => {
    setSelected(null);
    setHistory([]);
    setEditing(null);
    setFollow(true);
  }, [project.id]);
  useEffect(() => {
    if (chart)
      setTiming({
        bpm: chart.bpm,
        meter: chart.meter,
        firstDownbeat: chart.firstDownbeat,
        timingSource: chart.timingSource,
      });
  }, [chart?.id, chart?.bpm, chart?.meter, chart?.firstDownbeat, chart?.timingSource]);
  useEffect(() => {
    if (!follow || !current || editing || dragging.current) return;
    const element = barElements.current.get(current.id),
      container = host.current?.closest('.practice-area');
    if (!element || !container) return;
    const focus = document.activeElement;
    if (focus && host.current?.contains(focus) && focus.matches('input,select,textarea')) return;
    const rect = element.getBoundingClientRect(),
      bounds = container.getBoundingClientRect(),
      header = host.current?.querySelector('.chart-header')?.getBoundingClientRect().height || 100;
    if (rect.top < bounds.top + header + 8 || rect.bottom > bounds.bottom - 25)
      container.scrollTo({
        top: Math.max(
          0,
          container.scrollTop + rect.top - bounds.top - header - (bounds.height - header) * 0.35,
        ),
        behavior: playing ? 'smooth' : 'instant',
      });
  }, [current?.id, chart?.id, follow, playing, editing]);
  const commit = (next: ChordChart, remember = true) => {
    if (chart && remember) setHistory((list) => [...list.slice(-39), structuredClone(chart)]);
    const saved = next.id === 'auto' ? { ...next, id: crypto.randomUUID() } : next;
    onProject({
      ...project,
      chordCharts: [...charts.filter((item) => item.id !== saved.id), saved],
      activeChordChartId: saved.id,
    });
    setMessage('');
  };
  const newChart = () => {
    if (!(project.duration > 0)) return;
    const next = createChart(project.analysis, project.duration, true, crypto.randomUUID());
    next.name = tr('自制和弦谱 {0}', [
      charts.filter((item) => item.source === 'manual').length + 1,
    ]);
    setHistory([]);
    setSelected(null);
    setEditing(null);
    commit(next, false);
  };
  if (!chart)
    return (
      <section className="empty">
        <Music2 size={40} />
        <h2>{tr('创建自己的和弦谱')}</h2>
        <p>{tr('先设置节拍和小节，再把和弦放进任意空位。每小节最多两个和弦。')}</p>
        <div className="remote-actions">
          <button className="primary" disabled={!(project.duration > 0)} onClick={newChart}>
            {tr('新建自制和弦谱')}
          </button>
          <button disabled={busy} onClick={onAnalyze}>
            {tr('识别和弦与节拍')}
          </button>
        </div>
      </section>
    );
  const choose = (id: string) => {
    onProject({ ...project, activeChordChartId: id });
    setHistory([]);
    setEditing(null);
    setSelected(null);
  };
  const edit = (barId: string, slotId: string, label: string | null) => {
    setSelected({ barId, slotId });
    setEditing({ barId, slotId, label: label || '' });
  };
  const addSlot = (bar: ChartBar) => {
    if (bar.slots.length >= 2) return;
    const slot = { id: crypto.randomUUID(), label: null };
    commit({
      ...chart,
      bars: chart.bars.map((item) =>
        item.id === bar.id ? { ...item, slots: [...item.slots, slot] } : item,
      ),
    });
    setSelected({ barId: bar.id, slotId: slot.id });
  };
  const drop = (event: React.DragEvent, barId: string, slotId: string | null) => {
    event.preventDefault();
    event.stopPropagation();
    dragging.current = false;
    try {
      const data = JSON.parse(event.dataTransfer.getData('application/x-immerse-chord'));
      if (typeof data.label !== 'string') return;
      const next = placeChord(chart, barId, slotId, data.label, data.source);
      if (next === chart) {
        setMessage(tr('每小节最多两个位置；拖到已有和弦上可以互换。'));
        return;
      }
      commit(next);
      setSelected({ barId, slotId });
    } catch {
      /* Ignore drops that are not chords. */
    }
  };
  const sections: ChartBar[][] = [];
  const regular = chart.bars.filter((bar) => !bar.pickup);
  for (let i = 0; i < regular.length; i += chart.barsPerRow)
    sections.push(regular.slice(i, i + chart.barsPerRow));
  const renderBar = (bar: ChartBar) => {
    const number = bar.pickup
      ? tr('前奏')
      : String(regular.findIndex((item) => item.id === bar.id) + 1);
    return (
      <div
        key={bar.id}
        ref={(element) => {
          if (element) barElements.current.set(bar.id, element);
          else barElements.current.delete(bar.id);
        }}
        data-bar-id={bar.id}
        data-start={bar.start}
        data-end={bar.end}
        className={
          'chart-measure ' +
          (current?.id === bar.id ? 'playing-measure ' : '') +
          (selected?.barId === bar.id ? 'selected-measure' : '')
        }
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => drop(event, bar.id, null)}
      >
        <div className="measure-heading">
          <button
            className="measure-number"
            onClick={() => {
              setSelected({ barId: bar.id, slotId: null });
              onSeek(Math.min(project.duration, bar.start));
            }}
          >
            {bar.pickup ? tr('前奏') : tr('第 {0} 小节', [number])}
          </button>
          <small>
            {time(bar.start)}
            {bar.start >= project.duration ? tr(' \u00B7 音频结束后') : ''}
          </small>
        </div>
        <div
          className="chart-slots"
          style={{
            gridTemplateColumns:
              bar.slots.length === 2
                ? `${bar.splitAt ?? 0.5}fr ${1 - (bar.splitAt ?? 0.5)}fr`
                : 'minmax(0,1fr)',
          }}
        >
          {bar.slots.map((slot, index) => (
            <div
              key={slot.id}
              data-slot-id={slot.id}
              className={
                'chord-slot ' +
                (selected?.slotId === slot.id ? 'selected-slot ' : '') +
                (current?.id === bar.id &&
                position >= slotTime(bar, index) &&
                position < (index + 1 < bar.slots.length ? slotTime(bar, index + 1) : bar.end)
                  ? 'active-slot'
                  : '')
              }
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect =
                  event.dataTransfer.effectAllowed === 'copy' ? 'copy' : 'move';
              }}
              onDrop={(event) => drop(event, bar.id, slot.id)}
            >
              <button
                className={'chord-token ' + (!slot.label ? 'empty-slot' : '')}
                aria-label={tr('{0}第 {1} 个{2}', [
                  bar.pickup ? tr('前奏') : tr('第 {0} 小节', [number]),
                  index + 1,
                  slot.label ? tr('和弦') : tr('空位'),
                ])}
                draggable={!!slot.label}
                onDragStart={(event) => {
                  dragging.current = true;
                  event.dataTransfer.setData(
                    'application/x-immerse-chord',
                    JSON.stringify({
                      label: slot.label,
                      source: { barId: bar.id, slotId: slot.id },
                    }),
                  );
                  event.dataTransfer.effectAllowed = 'move';
                }}
                onDragEnd={() => {
                  dragging.current = false;
                }}
                onClick={() => {
                  setSelected({ barId: bar.id, slotId: slot.id });
                  if (slot.label) onSeek(Math.min(project.duration, slotTime(bar, index)));
                  else edit(bar.id, slot.id, null);
                }}
                onDoubleClick={() => edit(bar.id, slot.id, slot.label)}
              >
                {slot.label ? formatLabel(slot.label) : <Plus size={18} />}
              </button>
              <div className="slot-actions">
                {slot.label ? (
                  <>
                    <button
                      aria-label={tr('编辑第 {0} 小节第 {1} 个和弦', [number, index + 1])}
                      onClick={() => edit(bar.id, slot.id, slot.label)}
                    >
                      <Pencil size={11} />
                    </button>
                    <button
                      aria-label={tr('删除第 {0} 小节第 {1} 个和弦', [number, index + 1])}
                      onClick={() => commit(updateSlot(chart, bar.id, slot.id))}
                    >
                      <Trash2 size={11} />
                    </button>
                  </>
                ) : (
                  <button
                    aria-label={tr('删除第 {0} 小节第 {1} 个空位', [number, index + 1])}
                    onClick={() => commit(updateSlot(chart, bar.id, slot.id, true))}
                  >
                    <Trash2 size={11} />
                  </button>
                )}
              </div>
            </div>
          ))}
          {!bar.slots.length && (
            <button className="no-chord-slots" onClick={() => addSlot(bar)}>
              {tr('＋ 添加空位 / 拖入和弦')}
            </button>
          )}
        </div>
        <div className="chart-measure-footer">
          <div className="measure-beats">
            {Array.from({ length: chart.meter }, (_, i) => (
              <span key={i}>{i + 1}</span>
            ))}
          </div>
          <button
            className="add-chord-slot"
            aria-label={tr('第 {0} 小节添加空位', [number])}
            disabled={bar.slots.length >= 2}
            onClick={() => addSlot(bar)}
            title={tr('每小节最多两个位置')}
          >
            <Plus size={12} />
          </button>
        </div>
      </div>
    );
  };
  return (
    <section className="chord-sheet chart-workspace" ref={host}>
      <div className="chart-header">
        <div className="chart-toolbar">
          <select
            aria-label={tr('当前和弦谱')}
            value={chart.id}
            onChange={(event) => choose(event.target.value)}
          >
            {automatic && <option value="auto">{tr('最新识别结果')}</option>}
            {charts.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <button className="small" onClick={newChart}>
            <Plus size={14} />
            {tr('新建自制谱')}
          </button>
          <button
            className="small"
            disabled={chart.id === 'auto'}
            onClick={() => setDeleting(true)}
          >
            <Trash2 size={14} />
            {tr('删除和弦谱')}
          </button>
          <button
            className={'small ' + (follow ? 'follow-active' : '')}
            aria-pressed={follow}
            onClick={() => setFollow(!follow)}
          >
            <Crosshair size={14} />
            {tr('跟随播放')}
          </button>
          <button
            className="small"
            disabled={!history.length}
            onClick={() => {
              const previous = history.at(-1)!;
              setHistory((list) => list.slice(0, -1));
              commit({ ...previous, id: chart.id }, false);
            }}
          >
            <Undo2 size={14} />
            {tr('撤销')}
          </button>
          <button className="small" disabled={busy} onClick={onAnalyze}>
            {tr('重新识别')}
          </button>
        </div>
        <div className="chart-name-line">
          <input
            aria-label={tr('和弦谱名称')}
            value={chart.name}
            onChange={(event) => commit({ ...chart, name: event.target.value.slice(0, 80) }, false)}
          />
          <label>
            {tr('每行')}
            <select
              aria-label={tr('每行小节数')}
              value={chart.barsPerRow}
              onChange={(event) => commit({ ...chart, barsPerRow: +event.target.value })}
            >
              {[2, 4, 8].map((value) => (
                <option key={value} value={value}>
                  {value}
                  {tr('小节')}
                </option>
              ))}
            </select>
          </label>
          <details className="chart-timing">
            <summary>
              {tr('小节校准 \u00B7')}
              {chart.bpm} BPM · {chart.meter}
              {tr('拍')}
            </summary>
            <div className="timing-fields">
              <label>
                BPM
                <input
                  aria-label={tr('和弦谱 BPM')}
                  type="number"
                  min="20"
                  max="350"
                  step=".01"
                  value={timing.bpm}
                  onChange={(event) =>
                    setTiming({ ...timing, bpm: +event.target.value, timingSource: 'fixed' })
                  }
                />
              </label>
              <label>
                {tr('每小节拍数')}
                <select
                  aria-label={tr('每小节拍数')}
                  value={timing.meter}
                  onChange={(event) => setTiming({ ...timing, meter: +event.target.value })}
                >
                  {[2, 3, 4, 6].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {tr('首拍（秒）')}
                <input
                  aria-label={tr('第一小节首拍秒数')}
                  type="number"
                  step=".01"
                  min="0"
                  value={timing.firstDownbeat}
                  onChange={(event) => setTiming({ ...timing, firstDownbeat: +event.target.value })}
                />
              </label>
              <label>
                {tr('时间依据')}
                <select
                  aria-label={tr('小节时间依据')}
                  value={timing.timingSource}
                  onChange={(event) =>
                    setTiming({
                      ...timing,
                      timingSource: event.target.value as Timing['timingSource'],
                    })
                  }
                >
                  <option value="detected" disabled={!project.analysis?.beats.length}>
                    {tr('识别的节拍')}
                  </option>
                  <option value="fixed">{tr('固定 BPM')}</option>
                </select>
              </label>
              {selected &&
                chart.bars.find((bar) => bar.id === selected.barId)?.slots.length === 2 && (
                  <label>
                    {tr('所选小节第二和弦起拍')}
                    <select
                      aria-label={tr('第二和弦起拍')}
                      value={
                        Math.round(
                          (chart.bars.find((bar) => bar.id === selected.barId)!.splitAt ?? 0.5) *
                            chart.meter,
                        ) + 1
                      }
                      onChange={(event) =>
                        commit({
                          ...chart,
                          bars: chart.bars.map((bar) =>
                            bar.id === selected.barId
                              ? { ...bar, splitAt: (+event.target.value - 1) / chart.meter }
                              : bar,
                          ),
                        })
                      }
                    >
                      {Array.from({ length: chart.meter - 1 }, (_, index) => (
                        <option key={index} value={index + 2}>
                          {tr('第')}
                          {index + 2}
                          {tr('拍')}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              <button
                className="small"
                onClick={() => {
                  try {
                    commit(retimeChart(chart, timing, project.duration, project.analysis?.beats));
                  } catch (error) {
                    setMessage((error as Error).message);
                  }
                }}
              >
                {tr('应用小节线')}
              </button>
              <button
                className="small"
                disabled={!selected}
                onClick={() => {
                  try {
                    commit(calibrateBar(chart, selected!.barId, position));
                  } catch (error) {
                    setMessage((error as Error).message);
                  }
                }}
              >
                {tr('将所选小节起点对齐到当前播放位置')}
              </button>
            </div>
          </details>
        </div>
        <div className="chord-bank">
          <span>{tr('和弦库')}</span>
          <div className="bank-chords">
            {chart.bank.map((label) => (
              <button
                key={label}
                draggable
                onDragStart={(event) => {
                  dragging.current = true;
                  event.dataTransfer.setData(
                    'application/x-immerse-chord',
                    JSON.stringify({ label }),
                  );
                  event.dataTransfer.effectAllowed = 'copy';
                }}
                onDragEnd={() => {
                  dragging.current = false;
                }}
                onClick={() => {
                  if (selected) {
                    commit(placeChord(chart, selected.barId, selected.slotId, label));
                    setEditing(null);
                  } else setMessage(tr('先选一个空位，或直接把和弦拖到任意小节。'));
                }}
              >
                {formatLabel(label)}
              </button>
            ))}
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const label = bankInput.trim().slice(0, 40);
              if (label) {
                commit({ ...chart, bank: [...new Set([...chart.bank, label])] });
                setBankInput('');
              }
            }}
          >
            <input
              aria-label={tr('添加到和弦库')}
              placeholder={tr('例如 F♯m7')}
              maxLength={40}
              value={bankInput}
              onChange={(event) => setBankInput(event.target.value)}
            />
            <button className="small" type="submit">
              <Plus size={13} />
            </button>
          </form>
        </div>
        {editing && (
          <form
            className="chord-editor"
            onSubmit={(event) => {
              event.preventDefault();
              commit(placeChord(chart, editing.barId, editing.slotId, editing.label));
              setEditing(null);
            }}
          >
            <label>
              {tr('和弦')}
              <input
                aria-label={tr('和弦名称')}
                autoFocus
                maxLength={40}
                value={editing.label}
                onChange={(event) => setEditing({ ...editing, label: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setEditing(null);
                }}
              />
            </label>
            <button className="primary small" type="submit">
              {tr('保存和弦')}
            </button>
            <button className="small" type="button" onClick={() => setEditing(null)}>
              {tr('取消')}
            </button>
          </form>
        )}
        <p className="chart-help">
          {tr(
            '和弦可拖入任意空位，放到已有和弦上会互换；删除和弦保留空位，删除空位合并位置。每小节最多两个和弦。',
          )}
        </p>
        {message && (
          <p className="chart-message" role="status">
            {message}
          </p>
        )}
      </div>
      {chart.bars
        .filter((bar) => bar.pickup)
        .map((bar) => (
          <div className="chart-row pickup-row" key={bar.id}>
            {renderBar(bar)}
          </div>
        ))}
      {sections.map((bars, index) => (
        <div className="chart-row-section" key={bars[0].id}>
          <div className="chord-row-heading">
            <span>{String(index + 1).padStart(2, '0')}</span>
            <input
              aria-label={tr('第 {0} 行名称', [index + 1])}
              placeholder={tr('段落名称，例如主歌 / 副歌')}
              value={chart.sections[bars[0].id] || ''}
              onChange={(event) =>
                commit(
                  { ...chart, sections: { ...chart.sections, [bars[0].id]: event.target.value } },
                  false,
                )
              }
            />
          </div>
          <div
            className="chart-row"
            style={{ gridTemplateColumns: `repeat(${chart.barsPerRow},minmax(145px,1fr))` }}
          >
            {bars.map(renderBar)}
          </div>
        </div>
      ))}
      {deleting && (
        <div className="modal-backdrop">
          <section className="modal" role="dialog" aria-label={tr('删除和弦谱')}>
            <h2>{tr('删除和弦谱')}</h2>
            <p>{tr('确定删除和弦谱“{0}”吗？歌曲和其他和弦谱会保留。', [chart.name])}</p>
            <div className="header-actions">
              <button onClick={() => setDeleting(false)}>{tr('取消')}</button>
              <button
                className="primary"
                onClick={() => {
                  const remaining = charts.filter((item) => item.id !== chart.id);
                  onProject({
                    ...project,
                    chordCharts: remaining,
                    activeChordChartId: remaining[0]?.id || (automatic ? 'auto' : undefined),
                  });
                  setDeleting(false);
                  setSelected(null);
                  setEditing(null);
                  setHistory([]);
                }}
              >
                {tr('删除')}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
