package app.immersejam.mobile.processing;

import static org.junit.Assert.*;

import java.io.*;
import java.nio.*;
import org.junit.Test;

public class MusicAnalysisTest {
  @Test
  public void silentAndSparseInputsDoNotInventTempo() {
    assertEquals(0, MusicAnalysis.trackBeats(new double[1000], 40).length);
    double[] single = new double[1000];
    single[100] = 1;
    assertEquals(0, MusicAnalysis.trackBeats(single, 40).length);
  }

  @Test
  public void followsClicksAtSeveralTemposAndKeepsTimesInBounds() {
    for (double bpm : new double[] {80, 120, 165}) {
      double duration = 35, fps = (double) MusicAnalysis.RATE / MusicAnalysis.HOP;
      double[] onset = new double[(int) (duration * fps)];
      for (double t = .3; t < duration; t += 60 / bpm) {
        double f = (t * MusicAnalysis.RATE - MusicAnalysis.FFT / 2.0) / MusicAnalysis.HOP;
        int k = (int) Math.round(f);
        for (int d = -2; d <= 2; d++)
          if (k + d >= 0 && k + d < onset.length)
            onset[k + d] += Math.exp(-Math.pow(k + d - f, 2) / .5);
      }
      MusicAnalysis.Features features = new MusicAnalysis.Features();
      features.onset = onset;
      features.chroma = new float[onset.length][12];
      features.energy = new double[onset.length];
      features.duration = duration;
      MusicAnalysis.Result result;
      try {
        result = MusicAnalysis.analyze(features, p -> {});
      } catch (Exception e) {
        throw new AssertionError(e);
      }
      assertEquals(bpm, result.bpm, 2);
      assertTrue(result.beats.length > 30);
      for (int i = 0; i < result.beats.length; i++) {
        assertTrue(result.beats[i] >= 0 && result.beats[i] < duration);
        if (i > 0) assertTrue(result.beats[i] > result.beats[i - 1]);
      }
    }
  }

  @Test
  public void readsRealPcmAndFindsSustainedCMajor() throws Exception {
    File file = File.createTempFile("immerse-harmony-", ".wav");
    try {
      try (FileOutputStream out = new FileOutputStream(file)) {
        out.write(new byte[44]);
        ByteBuffer bytes = ByteBuffer.allocate(44100 * 4).order(ByteOrder.LITTLE_ENDIAN);
        for (int second = 0; second < 6; second++) {
          bytes.clear();
          for (int i = 0; i < 44100; i++) {
            double t = second + i / 44100.0, v = 0;
            for (int pitch : new int[] {60, 64, 67})
              v += .12 * Math.sin(2 * Math.PI * 440 * Math.pow(2, (pitch - 69) / 12.0) * t);
            short pcm = (short) (v * 32767);
            bytes.putShort(pcm).putShort(pcm);
          }
          out.write(bytes.array());
        }
      }
      MusicAnalysis.Result result =
          MusicAnalysis.analyze(MusicAnalysis.extract(file, p -> {}), p -> {});
      assertTrue(result.chords.stream().anyMatch(c -> c.label.equals("C") && c.end - c.start > 2));
      assertEquals("C", result.key);
      try {
        MusicAnalysis.extract(
            file,
            p -> {
              throw new IOException("cancel");
            });
        fail("cancellation must propagate");
      } catch (IOException expected) {
        assertEquals("cancel", expected.getMessage());
      }
    } finally {
      file.delete();
    }
  }
}
