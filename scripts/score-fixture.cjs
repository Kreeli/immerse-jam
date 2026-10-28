const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');
function attachScoreFixture(store, p) {
  const alphaTab = require('@coderline/alphatab');
  const measures = Array.from(
    { length: 20 },
    (_, bar) =>
      `<measure number="${bar + 1}">${bar === 0 ? '<attributes><divisions>4</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><direction><sound tempo="120"/></direction>' : ''}${['C', 'E', 'G', 'A'].map((step) => `<note><pitch><step>${step}</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note>`).join('')}</measure>`,
  ).join('');
  const xml = `<?xml version="1.0" encoding="utf-8"?><score-partwise version="4.0"><work><work-title>Generated timing fixture</work-title></work><part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list><part id="P1">${measures}</part></score-partwise>`;
  const relative = 'attachments/generated.musicxml';
  fs.mkdirSync(path.dirname(store.asset(p.id, relative)), { recursive: true });
  fs.writeFileSync(store.asset(p.id, relative), xml);
  const settings = new alphaTab.Settings(),
    score = alphaTab.importer.ScoreLoader.loadScoreFromBytes(
      new Uint8Array(Buffer.from(xml)),
      settings,
    ),
    midi = new alphaTab.midi.MidiFile(),
    handler = new alphaTab.midi.AlphaSynthMidiFileHandler(midi, true);
  new alphaTab.midi.MidiFileGenerator(score, settings, handler).generate();
  p.scoreMidi = 'attachments/alignment.mid';
  fs.writeFileSync(store.asset(p.id, p.scoreMidi), midi.toBinary());
  p.attachments.push({ id: crypto.randomUUID(), name: 'generated.musicxml', file: relative });
  p.alignment = {
    points: [
      { scoreTime: 0, audioTime: 0, confidence: 1 },
      { scoreTime: 40, audioTime: 40, confidence: 1 },
    ],
    notes: [],
    duration: 40,
    confidence: 1,
    needsReview: false,
    transpose: 0,
    uncertain: [],
  };
  return store.save(p);
}
module.exports = { attachScoreFixture };
