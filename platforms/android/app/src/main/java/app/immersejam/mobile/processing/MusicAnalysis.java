package app.immersejam.mobile.processing;

import app.immersejam.mobile.inference.SignalMath;
import java.io.*;
import java.nio.*;
import java.util.*;

/** Bounded CPU analysis of decoded 44.1 kHz stereo PCM16. No model or Android dependency. */
public final class MusicAnalysis {
  public interface Progress {
    void update(double progress) throws Exception;
  }

  public static final int RATE = 11025, HOP = 512, FFT = 2048;

  public static final class Features {
    public float[][] chroma;
    public double[] onset, energy;
    public double duration;
  }

  public static final class Chord {
    public double start, end, confidence;
    public String label;

    Chord(double s, double e, String l, double c) {
      start = s;
      end = e;
      label = l;
      confidence = c;
    }
  }

  public static final class Result {
    public double bpm, stability;
    public double[] beats;
    public List<Chord> chords = new ArrayList<>();
    public String key = "—";
  }

  public static Features extract(File file, Progress progress) throws Exception {
    long frames = (file.length() - 44) / 16;
    if (frames < FFT || frames > RATE * 2640L) throw new IOException("音频太短或超过 44 分钟");
    int count = (int) ((frames - 1) / HOP) + 1;
    Features f = new Features();
    f.chroma = new float[count][12];
    f.onset = new double[count];
    f.energy = new double[count];
    f.duration = (file.length() - 44) / 176400.0;
    double[] wave = new double[FFT],
        real = new double[FFT],
        imag = new double[FFT],
        previous = new double[FFT / 2 + 1],
        window = new double[FFT];
    int[] pitch = new int[FFT / 2 + 1];
    Arrays.fill(pitch, -1);
    for (int i = 0; i < FFT; i++) window[i] = .5 - .5 * Math.cos(2 * Math.PI * i / (FFT - 1));
    for (int k = 1; k < pitch.length; k++) {
      double hz = (double) k * RATE / FFT;
      if (hz >= 65 && hz <= 2093)
        pitch[k] = Math.floorMod((int) Math.round(69 + 12 * Math.log(hz / 440) / Math.log(2)), 12);
    }
    byte[] bytes = new byte[FFT * 16];
    try (RandomAccessFile in = new RandomAccessFile(file, "r")) {
      in.seek(44);
      for (int frame = 0; frame < count; frame++) {
        int keep = frame == 0 ? 0 : FFT - HOP, need = FFT - keep;
        if (keep > 0) System.arraycopy(wave, HOP, wave, 0, keep);
        int n = in.read(bytes, 0, need * 16);
        if (n < 0) n = 0;
        ByteBuffer b = ByteBuffer.wrap(bytes, 0, n).order(ByteOrder.LITTLE_ENDIAN);
        for (int j = 0; j < need; j++) {
          double v = 0;
          if (b.remaining() >= 16) for (int c = 0; c < 8; c++) v += b.getShort() / 262144.0;
          wave[keep + j] = v;
        }
        double rms = 0;
        for (int j = 0; j < FFT; j++) {
          real[j] = wave[j] * window[j];
          imag[j] = 0;
          rms += wave[j] * wave[j];
        }
        SignalMath.fft(real, imag, false);
        f.energy[frame] = Math.sqrt(rms / FFT);
        for (int k = 1; k < previous.length; k++) {
          double magnitude = Math.log1p(10 * Math.hypot(real[k], imag[k]));
          f.onset[frame] += Math.max(0, magnitude - previous[k]);
          previous[k] = magnitude;
          if (pitch[k] >= 0)
            f.chroma[frame][pitch[k]] += (float) Math.pow(Math.hypot(real[k], imag[k]), .65);
        }
        double norm = 0;
        for (float v : f.chroma[frame]) norm += v * v;
        if (norm > 1e-12)
          for (int k = 0; k < 12; k++) f.chroma[frame][k] /= (float) Math.sqrt(norm);
        if (frame % 32 == 0) progress.update(.1 + .55 * frame / count);
      }
    }
    return f;
  }

  public static double[] trackBeats(double[] raw, double duration) {
    int n = raw.length;
    if (n < 8) return new double[0];
    double[] x = new double[n];
    double max = 0;
    for (int i = 0; i < n; i++) {
      double mean = 0;
      int a = Math.max(0, i - 10), b = Math.min(n, i + 11);
      for (int j = a; j < b; j++) mean += raw[j];
      x[i] = Math.max(0, raw[i] - mean / (b - a));
      max = Math.max(max, x[i]);
    }
    if (max < 1e-5) return new double[0];
    for (int i = 0; i < n; i++) x[i] /= max;
    double fps = (double) RATE / HOP, best = -1;
    int period = 0;
    for (int lag = (int) Math.floor(fps * 60 / 210); lag <= Math.ceil(fps * 60 / 45); lag++) {
      double value = 0, normal = 0;
      for (int i = lag; i < n; i++) {
        value += x[i] * x[i - lag];
        normal += x[i] * x[i] + x[i - lag] * x[i - lag];
      }
      value =
          value
              / (normal + 1e-12)
              * Math.exp(-.12 * Math.pow(Math.log((60 * fps / lag) / 120) / Math.log(2), 2));
      if (value > best) {
        best = value;
        period = lag;
      }
    }
    if (best < .015) return new double[0];
    double[] score = new double[n];
    int[] previous = new int[n];
    Arrays.fill(previous, -1);
    int last = 0;
    for (int i = 0; i < n; i++) {
      double prior = 0;
      for (int j = Math.max(0, i - (int) (period * 1.5)); j <= i - (int) (period * .65); j++) {
        double candidate = score[j] - 4 * Math.pow(Math.log((double) (i - j) / period), 2);
        if (candidate > prior) {
          prior = candidate;
          previous[i] = j;
        }
      }
      score[i] = prior + x[i];
      if (score[i] > score[last]) last = i;
    }
    List<Double> beats = new ArrayList<>();
    for (int i = last; i >= 0; i = previous[i]) {
      int peak = i;
      for (int j = Math.max(0, i - 1); j <= Math.min(n - 1, i + 1); j++)
        if (x[j] > x[peak]) peak = j;
      // Frames describe centred windows; interpolate a local peak to reduce grid quantization.
      double delta = 0;
      if (peak > 0 && peak < n - 1) {
        double den = x[peak - 1] - 2 * x[peak] + x[peak + 1];
        if (Math.abs(den) > 1e-10)
          delta = Math.max(-.5, Math.min(.5, .5 * (x[peak - 1] - x[peak + 1]) / den));
      }
      double time = ((peak + delta) * HOP + FFT / 2.0) / RATE;
      if (time < duration) beats.add(time);
      if (previous[i] < 0) break;
    }
    Collections.reverse(beats);
    return beats.stream().mapToDouble(Double::doubleValue).toArray();
  }

  static double median(double[] values) {
    Arrays.sort(values);
    return values.length == 0 ? 0 : values[values.length / 2];
  }

  public static Result analyze(Features f, Progress progress) throws Exception {
    return analyze(f, progress, null);
  }

  public static Result analyze(Features f, Progress progress, double[] beats) throws Exception {
    Result r = new Result();
    r.beats = beats == null ? trackBeats(f.onset, f.duration) : beats;
    int width = Math.min(16, Math.max(2, r.beats.length / 4));
    if (r.beats.length > width) {
      double[] intervals = new double[r.beats.length - width];
      for (int i = 0; i < intervals.length; i++)
        intervals[i] = (r.beats[i + width] - r.beats[i]) / width;
      double interval = median(intervals);
      r.bpm = 60 / interval;
      for (int i = 0; i < intervals.length; i++) intervals[i] = Math.abs(intervals[i] - interval);
      r.stability = Math.max(0, 1 - 5 * median(intervals) / interval);
    }
    String[] roots = {"C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"};
    String[] suffix = {"", "m", "7", "maj7", "m7", "dim", "sus2", "sus4"};
    int[][] notes = {
      {0, 4, 7},
      {0, 3, 7},
      {0, 4, 7, 10},
      {0, 4, 7, 11},
      {0, 3, 7, 10},
      {0, 3, 6},
      {0, 2, 7},
      {0, 5, 7}
    };
    double[][] templates = new double[96][12];
    String[] labels = new String[96];
    for (int root = 0; root < 12; root++)
      for (int q = 0; q < 8; q++) {
        int s = root * 8 + q;
        Arrays.fill(templates[s], -.1);
        for (int note : notes[q]) templates[s][(root + note) % 12] = 1;
        templates[s][root] = 1.15;
        double norm = 0;
        for (double v : templates[s]) norm += v * v;
        for (int k = 0; k < 12; k++) templates[s][k] /= Math.sqrt(norm);
        labels[s] = roots[root] + suffix[q];
      }
    List<Double> boundaries = new ArrayList<>();
    boundaries.add(0.0);
    for (double beat : r.beats) if (beat > .03 && beat < f.duration - .03) boundaries.add(beat);
    if (boundaries.size() == 1) for (double t = 2; t < f.duration; t += 2) boundaries.add(t);
    boundaries.add(f.duration);
    int segments = boundaries.size() - 1;
    double[][] scores = new double[segments][96];
    boolean[] silent = new boolean[segments];
    int[][] back = new int[segments][96];
    double[] value = new double[96];
    for (int i = 0; i < segments; i++) {
      double[] chroma = new double[12];
      double energy = 0;
      int a = Math.max(0, (int) ((boundaries.get(i) * RATE - FFT / 2) / HOP)),
          b =
              Math.min(
                  f.chroma.length,
                  Math.max(a + 1, (int) ((boundaries.get(i + 1) * RATE - FFT / 2) / HOP)));
      for (int j = a; j < b; j++) {
        for (int k = 0; k < 12; k++) chroma[k] += f.chroma[j][k];
        energy += f.energy[j];
      }
      silent[i] = energy / Math.max(1, b - a) < .003;
      double norm = 0;
      for (double v : chroma) norm += v * v;
      int best = 0;
      for (int s = 1; s < 96; s++) if (value[s] > value[best]) best = s;
      double[] next = new double[96];
      for (int s = 0; s < 96; s++) {
        for (int k = 0; k < 12; k++)
          scores[i][s] += templates[s][k] * chroma[k] / Math.max(1e-8, Math.sqrt(norm));
        scores[i][s] -= (s % 8 >= 2 ? .035 : 0);
        int prev = value[s] >= value[best] - .14 ? s : best;
        back[i][s] = prev;
        next[s] = scores[i][s] + (i == 0 ? 0 : prev == s ? value[s] : value[best] - .14);
      }
      value = next;
      if (i % 32 == 0) progress.update(.65 + .3 * i / segments);
    }
    int state = 0;
    for (int s = 1; s < 96; s++) if (value[s] > value[state]) state = s;
    int[] states = new int[segments];
    for (int i = segments - 1; i >= 0; i--) {
      states[i] = state;
      state = back[i][state];
    }
    double[] keyScores = new double[24];
    for (int i = 0; i < segments; i++) {
      int s = states[i];
      String label = silent[i] ? "N" : labels[s];
      double start = boundaries.get(i),
          end = boundaries.get(i + 1),
          confidence = Math.max(0, Math.min(1, scores[i][s]));
      if (!silent[i]) keyScores[(s / 8) * 2 + (s % 8 == 1 ? 1 : 0)] += end - start;
      if (!r.chords.isEmpty() && r.chords.get(r.chords.size() - 1).label.equals(label)) {
        Chord c = r.chords.get(r.chords.size() - 1);
        c.confidence =
            (c.confidence * (c.end - c.start) + confidence * (end - start)) / (end - c.start);
        c.end = end;
      } else r.chords.add(new Chord(start, end, label, confidence));
    }
    int key = 0;
    for (int i = 1; i < 24; i++) if (keyScores[i] > keyScores[key]) key = i;
    if (keyScores[key] > 0) r.key = roots[key / 2] + (key % 2 == 1 ? "m" : "");
    progress.update(1);
    return r;
  }
}
