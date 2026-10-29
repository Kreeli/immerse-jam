package app.immersejam.mobile.inference;

import static org.junit.Assert.*;

import ai.onnxruntime.*;
import app.immersejam.mobile.processing.*;
import java.io.*;
import java.nio.*;
import java.nio.file.*;
import java.util.*;
import org.junit.*;

public class BeatParityTest {
  @Test
  public void minimalPostprocessingKeepsStrongPeaksAndSnapsDownbeats() {
    float[] logits = new float[100];
    Arrays.fill(logits, -4);
    logits[20] = 3;
    logits[21] = 3;
    logits[45] = 2;
    logits[46] = 1;
    double[] beats = BeatFeatures.peaks(logits, 2);
    assertArrayEquals(new double[] {.41, .9}, beats, 1e-9);
    assertArrayEquals(
        new double[] {.41, .9},
        BeatFeatures.snapDownbeats(beats, new double[] {.42, .43, .88}),
        1e-9);
  }

  static float[] floats(File file) throws Exception {
    byte[] bytes = Files.readAllBytes(file.toPath());
    float[] values = new float[bytes.length / 4];
    ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN).asFloatBuffer().get(values);
    return values;
  }

  @Test
  public void fftMelAndNativeInferenceMatchDesktopOnSyntheticMusic() throws Exception {
    File root = new File("../../../.runtime/android");
    File fixture = new File(root, "beat-parity");
    Assume.assumeTrue(new File(fixture, "beats.txt").isFile());
    float[] mel = floats(new File(root, "models/beat-this-mel.bin"));
    double[] window = new double[1024];
    for (int i = 0; i < 1024; i++)
      window[i] =
          Math.sin(2 * Math.PI * 440 * i / 22050) + .3 * Math.sin(2 * Math.PI * 1760 * i / 22050);
    float[] expected = floats(new File(fixture, "frame.bin")),
        actual = BeatFeatures.frame(window, mel);
    double maxFeatureError = 0;
    for (int i = 0; i < 128; i++)
      maxFeatureError = Math.max(maxFeatureError, Math.abs(expected[i] - actual[i]));
    assertTrue("Float FFT feature error " + maxFeatureError, maxFeatureError < .002);
    System.out.println("BEAT_FEATURE_MAX_ERROR=" + maxFeatureError);
    try (WaveReader reader = new WaveReader(new File(fixture, "input.wav"))) {
      int total = (int) (Math.ceil(reader.duration() * 22050) / 441) + 1, covered = 0;
      float[] beat = new float[total], down = new float[total];
      Arrays.fill(beat, -1000);
      Arrays.fill(down, -1000);
      List<Integer> starts = new ArrayList<>();
      for (int start = -6; start < total - 6; start += 1488) starts.add(start);
      if (total > 1488) starts.set(starts.size() - 1, total - 1494);
      for (int start : starts) {
        int length = Math.min(1500, total - start + 6);
        float[] spect = BeatEngine.spectrum(reader, start, length, total, mel, p -> {});
        ByteBuffer bytes = ByteBuffer.allocate(spect.length * 4).order(ByteOrder.LITTLE_ENDIAN);
        bytes.asFloatBuffer().put(spect);
        Files.write(
            new File(fixture, "native-" + starts.indexOf(start) + ".bin").toPath(), bytes.array());
      }
      Files.writeString(new File(fixture, "native-frames.txt").toPath(), String.valueOf(total));
      File workspace = new File(root, "../..").getCanonicalFile();
      Process process =
          new ProcessBuilder(
                  new File(workspace, ".runtime/venv/Scripts/python.exe").getPath(),
                  new File(workspace, "scripts/android-beat-parity.py").getPath())
              .inheritIO()
              .start();
      if (!process.waitFor(120, java.util.concurrent.TimeUnit.SECONDS)) {
        process.destroyForcibly();
        fail("Beat parity comparison timed out");
      }
      assertEquals(0, process.exitValue());
      beat = floats(new File(fixture, "native-beat-logits.bin"));
      down = floats(new File(fixture, "native-downbeat-logits.bin"));
      double[] result = BeatFeatures.peaks(beat, reader.duration()),
          downs = BeatFeatures.snapDownbeats(result, BeatFeatures.peaks(down, reader.duration()));
      double[] reference =
          Files.readAllLines(new File(fixture, "beats.txt").toPath()).stream()
              .mapToDouble(Double::parseDouble)
              .toArray();
      double[] referenceDown =
          Files.readAllLines(new File(fixture, "downbeats.txt").toPath()).stream()
              .mapToDouble(Double::parseDouble)
              .toArray();
      assertEquals(reference.length, result.length);
      assertEquals(referenceDown.length, downs.length);
      for (int i = 0; i < result.length; i++) assertEquals(reference[i], result[i], .021);
      for (int i = 0; i < downs.length; i++) assertEquals(referenceDown[i], downs[i], .021);
      System.out.println(
          "BEAT_PARITY_PASSED beats="
              + result.length
              + " downbeats="
              + downs.length
              + " boundary=30s tolerance=21ms");
    }
  }
}
