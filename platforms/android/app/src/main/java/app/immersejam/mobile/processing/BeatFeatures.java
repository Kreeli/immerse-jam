package app.immersejam.mobile.processing;

import app.immersejam.mobile.inference.SignalMath;
import java.util.*;

/** Beat This! log-mel convention: 22050 Hz, 1024 periodic Hann, hop 441, Slaney 128 bands. */
public final class BeatFeatures {
  public static float[] frame(double[] mono, float[] mel) {
    if (mono.length != 1024 || mel.length != 513 * 128)
      throw new IllegalArgumentException("Beat feature dimensions");
    double[] real = new double[1024], imag = new double[1024];
    for (int i = 0; i < 1024; i++) real[i] = mono[i] * (.5 - .5 * Math.cos(2 * Math.PI * i / 1024));
    SignalMath.fft(real, imag, false);
    double[] bands = new double[128];
    for (int k = 0; k <= 512; k++) {
      double magnitude = Math.hypot(real[k], imag[k]) / 32;
      for (int m = 0; m < 128; m++) bands[m] += magnitude * mel[k * 128 + m];
    }
    float[] result = new float[128];
    for (int m = 0; m < 128; m++) result[m] = (float) Math.log1p(1000 * bands[m]);
    return result;
  }

  public static double[] peaks(float[] logits, double duration) {
    List<Double> output = new ArrayList<>();
    double mean = 0;
    int count = 0;
    for (int i = 0; i < logits.length; i++) {
      if (!Float.isFinite(logits[i])) throw new IllegalArgumentException("Invalid beat logits");
      if (logits[i] <= 0) continue;
      boolean maximum = true;
      for (int j = Math.max(0, i - 3); j <= Math.min(logits.length - 1, i + 3); j++)
        if (logits[j] > logits[i]) maximum = false;
      if (!maximum) continue;
      if (count > 0 && i - mean <= 1) {
        mean += (i - mean) / ++count;
      } else {
        if (count > 0 && mean / 50 < duration) output.add(mean / 50);
        mean = i;
        count = 1;
      }
    }
    if (count > 0 && mean / 50 < duration) output.add(mean / 50);
    return output.stream().mapToDouble(Double::doubleValue).toArray();
  }

  public static double[] snapDownbeats(double[] beats, double[] downbeats) {
    if (beats.length == 0) return new double[0];
    TreeSet<Double> result = new TreeSet<>();
    for (double d : downbeats) {
      int i = Arrays.binarySearch(beats, d);
      if (i < 0) {
        i = -i - 1;
        if (i == beats.length || i > 0 && d - beats[i - 1] <= beats[i] - d) i--;
      }
      result.add(beats[i]);
    }
    return result.stream().mapToDouble(Double::doubleValue).toArray();
  }
}
