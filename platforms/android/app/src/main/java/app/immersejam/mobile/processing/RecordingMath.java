package app.immersejam.mobile.processing;

public final class RecordingMath {
  public static void validate(
      int rate, double tempo, double pitch, double position, double anchor, double latency) {
    if (rate < 8000
        || rate > 192000
        || !Double.isFinite(tempo)
        || tempo < .25
        || tempo > 2
        || !Double.isFinite(pitch)
        || Math.abs(pitch) > 24
        || !Double.isFinite(position)
        || Math.abs(position) > 2640
        || !Double.isFinite(anchor)
        || anchor < 0
        || !Double.isFinite(latency)
        || Math.abs(latency) > 2000) throw new IllegalArgumentException("录音设置无效");
  }

  public static double start(
      double position, double first, double anchor, double tempo, double latency) {
    return position + (first - anchor - latency / 1000) * tempo;
  }

  public static double limit(double position, double tempo) {
    return Math.max(0, Math.min(2640, (2640 - Math.max(0, position)) / tempo));
  }
}
