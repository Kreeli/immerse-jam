package app.immersejam.mobile.inference;

import static org.junit.Assert.*;

import org.junit.Test;

public class SignalMathTest {
  @Test
  public void mobileDurationBoundary() throws Exception {
    app.immersejam.mobile.AudioFiles.checkDuration(2640);
    for (double value : new double[] {2640.001, Double.NaN, Double.POSITIVE_INFINITY, -1}) {
      assertThrows(
          java.io.IOException.class, () -> app.immersejam.mobile.AudioFiles.checkDuration(value));
    }
  }

  @Test
  public void mixedRadixRoundTrip() {
    int n = 6144;
    double[] re = new double[n], im = new double[n];
    for (int i = 0; i < n; i++)
      re[i] = Math.sin(2 * Math.PI * 227 * i / n) + Math.cos(2 * Math.PI * 1800 * i / n) * .2;
    double[] original = re.clone();
    SignalMath.fft(re, im, false);
    SignalMath.fft(re, im, true);
    for (int i = 0; i < n; i++) assertEquals(original[i], re[i], 1e-9);
  }

  @Test
  public void spectralRoundTripPreservesAudioAndLength() {
    int length = 255 * 1024;
    float[][] wave = new float[2][length];
    for (int i = 0; i < length; i++) {
      wave[0][i] = (float) Math.sin(2 * Math.PI * 220 * i / 44100) * .2f;
      wave[1][i] = (float) Math.sin(2 * Math.PI * 440 * i / 44100) * .1f;
    }
    float[] spectrum = SignalMath.spectrum(wave, 6144, 1024, 3072, 256);
    float[][] restored = SignalMath.inverse(spectrum, 6144, 1024, 3072, 256);
    assertEquals(length, restored[0].length);
    double error = 0;
    for (int c = 0; c < 2; c++)
      for (int i = 6144; i < length - 6144; i++) error += Math.pow(restored[c][i] - wave[c][i], 2);
    assertTrue(error / length < 1e-8);
  }
}
