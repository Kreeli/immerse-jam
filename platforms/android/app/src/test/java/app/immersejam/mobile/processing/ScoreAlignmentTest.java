package app.immersejam.mobile.processing;

import static org.junit.Assert.*;

import java.io.*;
import java.nio.*;
import java.util.*;
import org.junit.Test;

public class ScoreAlignmentTest {
  static void delta(DataOutputStream out, int value) throws Exception {
    int buffer = value & 127;
    while ((value >>= 7) > 0) buffer = (buffer << 8) | 128 | (value & 127);
    for (; ; ) {
      out.writeByte(buffer);
      if ((buffer & 128) == 0) break;
      buffer >>= 8;
    }
  }

  static void event(DataOutputStream out, int wait, int... bytes) throws Exception {
    delta(out, wait);
    for (int b : bytes) out.writeByte(b);
  }

  static File midi(byte[] track) throws Exception {
    File file = File.createTempFile("immerse-score-", ".mid");
    try (DataOutputStream out = new DataOutputStream(new FileOutputStream(file))) {
      out.writeBytes("MThd");
      out.writeInt(6);
      out.writeShort(0);
      out.writeShort(1);
      out.writeShort(480);
      out.writeBytes("MTrk");
      out.writeInt(track.length);
      out.write(track);
    }
    return file;
  }

  @Test
  public void midiTempoChangesProgramsAndRunningStatusArePreserved() throws Exception {
    ByteArrayOutputStream track = new ByteArrayOutputStream();
    DataOutputStream out = new DataOutputStream(track);
    event(out, 0, 0xc0, 17);
    event(out, 0, 0x90, 60, 100);
    event(out, 480, 60, 0);
    event(out, 0, 0xff, 0x51, 3, 0x0f, 0x42, 0x40);
    event(out, 0, 0x90, 64, 90);
    event(out, 480, 0x80, 64, 0);
    event(out, 0, 0xff, 47, 0);
    File file = midi(track.toByteArray());
    try {
      MidiScore score = MidiScore.read(file);
      assertEquals(2, score.notes.size());
      assertEquals(.5, score.notes.get(0).end, 1e-9);
      assertEquals(.5, score.notes.get(1).start, 1e-9);
      assertEquals(1.5, score.duration, 1e-9);
      assertEquals(17, score.notes.get(1).program);
    } finally {
      file.delete();
    }
  }

  @Test
  public void malformedMidiAndExcessiveDtwMemoryAreBounded() throws Exception {
    File file = midi(new byte[] {0, (byte) 0x90, 60});
    try {
      try {
        MidiScore.read(file);
        fail();
      } catch (IOException expected) {
      }
    } finally {
      file.delete();
    }
    int step = ScoreAlignment.step(26402, 26402);
    assertTrue(
        (long) ((26402 + step - 1) / step) * ((26402 + step - 1) / step)
            <= ScoreAlignment.MAX_CELLS);
  }

  @Test
  public void variableTempoAudioAlignsAndCancellationPreservesInputs() throws Exception {
    int[] pitches = {60, 64, 67, 62, 65, 69, 59, 63, 66, 61, 65, 68};
    double[] durations = {.8, .8, .8, 1.1, 1.1, 1.1, .65, .65, .65, .9, .9, .9};
    MidiScore score = new MidiScore();
    double total = .3;
    for (int i = 0; i < pitches.length; i++) {
      MidiScore.Note note = new MidiScore.Note();
      note.start = i;
      note.end = i + .9;
      note.pitch = pitches[i];
      note.velocity = 100;
      score.notes.add(note);
      score.duration = note.end;
      total += durations[i];
    }
    int rate = 44100, frames = (int) (total * rate);
    File file = File.createTempFile("immerse-alignment-", ".wav");
    try {
      try (FileOutputStream output = new FileOutputStream(file)) {
        output.write(new byte[44]);
        ByteBuffer pcm = ByteBuffer.allocate(8192).order(ByteOrder.LITTLE_ENDIAN);
        int index = 0;
        double start = .3;
        for (int frame = 0; frame < frames; frame++) {
          double time = frame / (double) rate;
          while (index < pitches.length - 1 && time >= start + durations[index])
            start += durations[index++];
          double t = time - start, v = 0;
          if (t >= 0) {
            for (int harmonic = 1; harmonic <= 3; harmonic++)
              v +=
                  .1
                      * Math.sin(
                          2
                              * Math.PI
                              * 440
                              * Math.pow(2, (pitches[index] - 69) / 12.0)
                              * harmonic
                              * t)
                      / harmonic;
            v *= Math.min(1, t / .02) * Math.max(0, Math.min(1, (durations[index] - t) / .04));
          }
          short sample = (short) (v * 32767);
          pcm.putShort(sample).putShort(sample);
          if (!pcm.hasRemaining()) {
            output.write(pcm.array());
            pcm.clear();
          }
        }
        output.write(pcm.array(), 0, pcm.position());
      }
      MusicAnalysis.Features features = MusicAnalysis.extract(file, p -> {});
      ScoreAlignment.Result result = ScoreAlignment.align(score, features, p -> {});
      double cursor = .3;
      List<Double> errors = new ArrayList<>();
      for (int i = 0; i < pitches.length; i++) {
        final double scoreTime = i;
        ScoreAlignment.Point nearest =
            result.points.stream()
                .min(Comparator.comparingDouble(p -> Math.abs(p.scoreTime - scoreTime)))
                .orElseThrow();
        if (i > 0 && i < pitches.length - 1) errors.add(Math.abs(nearest.audioTime - cursor));
        cursor += durations[i];
      }
      Collections.sort(errors);
      assertTrue(
          "Median error " + errors.get(errors.size() / 2), errors.get(errors.size() / 2) < .45);
      assertEquals(0, result.transpose);
      for (int i = 1; i < result.points.size(); i++)
        assertTrue(result.points.get(i).audioTime >= result.points.get(i - 1).audioTime);
      try {
        ScoreAlignment.align(
            score,
            features,
            p -> {
              throw new IOException("cancel");
            });
        fail();
      } catch (IOException expected) {
        assertEquals("cancel", expected.getMessage());
      }
      System.out.println("ANDROID_ALIGNMENT_MEDIAN_SECONDS=" + errors.get(errors.size() / 2));
    } finally {
      file.delete();
    }
  }
}
