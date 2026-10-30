package app.immersejam.mobile.processing;

import java.io.*;
import java.util.*;

/** Bounded chroma DTW with explicit source-time anchors and transposition search. */
public final class ScoreAlignment {
  public static final int MAX_CELLS = 2_000_000;

  public static final class Point {
    public double scoreTime, audioTime, confidence;

    Point(double s, double a, double c) {
      scoreTime = s;
      audioTime = a;
      confidence = c;
    }
  }

  public static final class Result {
    public List<Point> points = new ArrayList<>();
    public MidiScore score;
    public double confidence;
    public int transpose;
  }

  public static int step(int rows, int columns) {
    int step = Math.max(1, (int) Math.ceil(Math.sqrt((double) rows * columns / MAX_CELLS)));
    while ((long) ((rows + step - 1) / step) * ((columns + step - 1) / step) > MAX_CELLS) step++;
    return step;
  }

  static float[][] smooth(float[][] values) {
    float[][] out = new float[values.length][12];
    for (int i = 0; i < values.length; i++)
      for (int k = 0; k < 12; k++) {
        float a = values[Math.max(0, i - 1)][k],
            b = values[i][k],
            c = values[Math.min(values.length - 1, i + 1)][k];
        out[i][k] = Math.max(Math.min(a, b), Math.min(Math.max(a, b), c));
      }
    return out;
  }

  static float[][] thin(float[][] values, int step) {
    float[][] result = new float[(values.length + step - 1) / step][12];
    for (int i = 0; i < result.length; i++) {
      result[i] = values[i * step].clone();
      double norm = 0;
      for (float v : result[i]) norm += v * v;
      if (norm > 1e-12) for (int k = 0; k < 12; k++) result[i][k] /= (float) Math.sqrt(norm);
    }
    return result;
  }

  static double similarity(float[] score, float[] audio, int transpose) {
    double v = 0;
    for (int k = 0; k < 12; k++) v += score[k] * audio[(k + transpose) % 12];
    return Math.max(0, Math.min(1, v));
  }

  public static Result align(
      MidiScore score, MusicAnalysis.Features features, MusicAnalysis.Progress progress)
      throws Exception {
    int length = (int) (score.duration * 10) + 2;
    float[][] source = new float[length][12],
        audio = new float[(int) (features.duration * 10) + 2][12];
    boolean harmonic = false;
    for (MidiScore.Note note : score.notes) {
      if (note.drum) continue;
      harmonic = true;
      int start = Math.min(length - 1, (int) (note.start * 10)),
          end = Math.min(length - 1, Math.max(start + 1, (int) (note.end * 10)));
      source[start][note.pitch % 12] += note.velocity / 127f;
      source[end][note.pitch % 12] -= note.velocity / 127f;
    }
    if (!harmonic) throw new IOException("此 MIDI 只有打击乐，请添加旋律或和声轨道进行对齐");
    // Range additions keep dense or sustained scores linear in notes plus frames.
    for (int i = 1; i < length; i++) for (int k = 0; k < 12; k++) source[i][k] += source[i - 1][k];
    for (int i = 0; i < audio.length; i++) {
      int frame =
          Math.max(
              0,
              Math.min(
                  features.chroma.length - 1,
                  (int)
                      Math.round(
                          (i * .1 * MusicAnalysis.RATE - MusicAnalysis.FFT / 2.0)
                              / MusicAnalysis.HOP)));
      audio[i] = features.chroma[frame].clone();
    }
    int step = step(source.length, audio.length);
    source = thin(smooth(source), step);
    audio = thin(smooth(audio), step);
    int rows = source.length, cols = audio.length;
    int offset = 0;
    double best = -1;
    for (int shift = 0; shift < 12; shift++) {
      double value = 0;
      for (int k = 0; k < 12; k++) {
        double s = 0, a = 0;
        for (float[] frame : source) s += frame[k];
        for (float[] frame : audio) a += frame[(k + shift) % 12];
        value += s * a;
      }
      if (value > best) {
        best = value;
        offset = shift;
      }
    }
    boolean subsequence = rows < cols * .8;
    byte[] back = new byte[rows * cols];
    Arrays.fill(back, (byte) -1);
    float[] older = new float[cols], previous = new float[cols];
    Arrays.fill(older, Float.POSITIVE_INFINITY);
    Arrays.fill(previous, Float.POSITIVE_INFINITY);
    for (int i = 0; i < rows; i++) {
      float[] current = new float[cols];
      Arrays.fill(current, Float.POSITIVE_INFINITY);
      for (int j = 0; j < cols; j++) {
        double cost = 1 - similarity(source[i], audio[j], offset);
        if (!subsequence)
          cost +=
              Math.max(
                      0,
                      Math.abs(
                              (double) i / Math.max(1, rows - 1)
                                  - (double) j / Math.max(1, cols - 1))
                          - .12)
                  * 1.5;
        if (i == 0 && (j == 0 || subsequence)) {
          current[j] = (float) cost;
          continue;
        }
        float value = Float.POSITIVE_INFINITY;
        byte move = -1;
        if (i > 0 && j > 0) {
          value = previous[j - 1];
          move = 0;
        }
        if (i > 0 && j > 1 && previous[j - 2] + .15 < value) {
          value = previous[j - 2] + .15f;
          move = 1;
        }
        if (i > 1 && j > 0 && older[j - 1] + .15 < value) {
          value = older[j - 1] + .15f;
          move = 2;
        }
        if (Float.isFinite(value)) {
          current[j] = (float) (cost + value);
          back[i * cols + j] = move;
        }
      }
      older = previous;
      previous = current;
      if (i % 16 == 0) progress.update(.25 + .65 * i / rows);
    }
    int end = cols - 1;
    if (subsequence) for (int j = 0; j < cols; j++) if (previous[j] < previous[end]) end = j;
    if (!Float.isFinite(previous[end])) throw new IOException("无法找到同步路径，请检查乐谱反复段或手动添加同步点");
    List<Point> path = new ArrayList<>();
    for (int i = rows - 1, j = end; i >= 0 && j >= 0; ) {
      path.add(
          new Point(
              i * step / 10.0,
              Math.min(features.duration, j * step / 10.0),
              similarity(source[i], audio[j], offset)));
      if (i == 0) break;
      byte move = back[i * cols + j];
      if (move < 0) throw new IOException("同步路径不完整");
      i -= move == 2 ? 2 : 1;
      j -= move == 1 ? 2 : 1;
    }
    Collections.reverse(path);
    Result result = new Result();
    result.score = score;
    result.transpose = offset <= 6 ? offset : offset - 12;
    double sum = 0;
    for (Point point : path) sum += point.confidence;
    result.confidence = sum / path.size();
    int cursor = 0;
    for (double t = 0; t < score.duration + .0001; t += .5) {
      while (cursor + 1 < path.size() && path.get(cursor + 1).scoreTime < t) cursor++;
      Point a = path.get(cursor), b = path.get(Math.min(path.size() - 1, cursor + 1));
      double fraction =
          b.scoreTime == a.scoreTime
              ? 0
              : Math.max(0, Math.min(1, (t - a.scoreTime) / (b.scoreTime - a.scoreTime)));
      result.points.add(
          new Point(
              t,
              a.audioTime + (b.audioTime - a.audioTime) * fraction,
              a.confidence + (b.confidence - a.confidence) * fraction));
    }
    if (result.points.get(result.points.size() - 1).scoreTime < score.duration) {
      Point last = path.get(path.size() - 1);
      result.points.add(new Point(score.duration, last.audioTime, last.confidence));
    }
    progress.update(1);
    return result;
  }
}
