package app.immersejam.mobile.inference;

import ai.onnxruntime.*;
import app.immersejam.mobile.processing.*;
import java.io.*;
import java.nio.*;
import java.util.*;
import java.util.concurrent.*;
import org.json.*;

final class BeatEngine {
  static JSONObject run(InferenceService service, File decoded, JSONObject model, String job)
      throws Exception {
    File weights = new File(model.getString("path")),
        melFile = new File(model.getString("melPath"));
    if (!app.immersejam.mobile.ProjectStore.sha(weights).equals(model.getString("sha256"))
        || !app.immersejam.mobile.ProjectStore.sha(melFile).equals(model.getString("melSha256")))
      throw new IOException("节拍模型校验失败");
    byte[] bytes = java.nio.file.Files.readAllBytes(melFile.toPath());
    if (bytes.length != 513 * 128 * 4) throw new IOException("节拍特征尺寸不匹配");
    float[] mel = new float[513 * 128];
    ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN).asFloatBuffer().get(mel);
    try (WaveReader reader = new WaveReader(decoded);
        OrtSession.SessionOptions options = new OrtSession.SessionOptions()) {
      options.setIntraOpNumThreads(Math.min(2, Runtime.getRuntime().availableProcessors()));
      options.setInterOpNumThreads(1);
      options.setOptimizationLevel(OrtSession.SessionOptions.OptLevel.BASIC_OPT);
      options.setCPUArenaAllocator(false);
      options.setMemoryPatternOptimization(false);
      OrtEnvironment env = OrtEnvironment.getEnvironment();
      try (OrtSession session = env.createSession(weights.getAbsolutePath(), options)) {
        int total = (int) (Math.ceil(reader.duration() * 22050) / 441) + 1;
        float[] beat = new float[total], downbeat = new float[total];
        Arrays.fill(beat, -1000);
        Arrays.fill(downbeat, -1000);
        List<Integer> starts = new ArrayList<>();
        for (int start = -6; start < total - 6; start += 1488) starts.add(start);
        if (total > 1488) starts.set(starts.size() - 1, total - 1494);
        int covered = 0;
        for (int start : starts) {
          service.check();
          int length = Math.min(1500, total - start + 6);
          float[] spect = spectrum(reader, start, length, total, mel, unused -> service.check());
          try (OnnxTensor input =
                  OnnxTensor.createTensor(
                      env, FloatBuffer.wrap(spect), new long[] {1, length, 128});
              OrtSession.RunOptions run = new OrtSession.RunOptions()) {
            service.activeRun = run;
            ScheduledExecutorService watchdog = Executors.newSingleThreadScheduledExecutor();
            watchdog.schedule(
                () -> {
                  try {
                    run.setTerminate(true);
                  } catch (Exception ignored) {
                  }
                },
                180,
                TimeUnit.SECONDS);
            try (OrtSession.Result output = session.run(Map.of("spectrogram", input), run)) {
              FloatBuffer b = ((OnnxTensor) output.get("beat").orElseThrow()).getFloatBuffer(),
                  d = ((OnnxTensor) output.get("downbeat").orElseThrow()).getFloatBuffer();
              if (b.remaining() != length || d.remaining() != length)
                throw new IOException("节拍模型输出不匹配");
              for (int j = 6; j < length - 6; j++) {
                int index = start + j;
                if (index >= covered && index < total) {
                  beat[index] = b.get(j);
                  downbeat[index] = d.get(j);
                }
              }
              covered = Math.max(covered, Math.min(total, start + length - 6));
            } finally {
              service.activeRun = null;
              watchdog.shutdownNow();
            }
          }
          service.progress(job, .1 + .65 * covered / total, "Beat This! 本机节拍识别");
        }
        double[] beats = BeatFeatures.peaks(beat, reader.duration()),
            downs =
                BeatFeatures.snapDownbeats(beats, BeatFeatures.peaks(downbeat, reader.duration()));
        JSONArray b = new JSONArray(), d = new JSONArray();
        for (double t : beats) b.put(t);
        for (double t : downs) d.put(t);
        double bpm = 0, stability = 0;
        if (beats.length >= 4) {
          int width = Math.min(16, Math.max(2, beats.length / 4));
          double[] intervals = new double[beats.length - width];
          for (int i = 0; i < intervals.length; i++)
            intervals[i] = (beats[i + width] - beats[i]) / width;
          Arrays.sort(intervals);
          double interval = intervals[intervals.length / 2];
          if (interval > 60.0 / 350 && interval < 3) {
            bpm = 60 / interval;
            for (int i = 0; i < intervals.length; i++)
              intervals[i] = Math.abs(intervals[i] - interval);
            Arrays.sort(intervals);
            stability = Math.max(0, 1 - 5 * intervals[intervals.length / 2] / interval);
          }
        }
        int[] meters = new int[7];
        for (int i = 1; i < downs.length; i++) {
          int count = 0;
          for (double t : beats) if (t >= downs[i - 1] - .04 && t < downs[i] - .04) count++;
          if (count == 2 || count == 3 || count == 4 || count == 6) meters[count]++;
        }
        int meter = 4;
        for (int i : new int[] {2, 3, 6}) if (meters[i] > meters[meter]) meter = i;
        return new JSONObject()
            .put("bpm", Math.round(bpm * 100) / 100.0)
            .put("beats", b)
            .put("downbeats", d)
            .put("beatsPerBar", meter)
            .put("downbeat", downs.length > 0 ? downs[0] : beats.length > 0 ? beats[0] : 0)
            .put("tempoStability", stability)
            .put("tempoMethod", "beat-this")
            .put("tempoReviewed", false);
      }
    }
  }

  static float[] spectrum(
      WaveReader reader,
      int start,
      int length,
      int total,
      float[] mel,
      MusicAnalysis.Progress progress)
      throws Exception {
    long samples = (long) Math.ceil(reader.duration() * 22050);
    int first = (int) Math.max(0, (long) Math.max(0, start) * 441 - 512),
        last = (int) Math.min(samples, (long) Math.min(total - 1, start + length - 1) * 441 + 513);
    int sourceFirst = first * 2 - 64;
    float[] source = new float[(last - first) * 2 + 129];
    for (int i = 0; i < source.length; i++) {
      long frame = sourceFirst + (long) i;
      if (frame < 0) frame = -frame;
      if (frame >= reader.frames) frame = Math.max(0, 2 * reader.frames - 2 - frame);
      double time = frame / 44100.0;
      source[i] = (reader.sample(time, 0) + reader.sample(time, 1)) * .5f;
    }
    double[] kernel = new double[129];
    double norm = 0;
    for (int i = 0; i < 129; i++) {
      int x = i - 64;
      double v = x == 0 ? .485 : Math.sin(Math.PI * .485 * x) / (Math.PI * x);
      kernel[i] =
          v * (.42 - .5 * Math.cos(2 * Math.PI * i / 128) + .08 * Math.cos(4 * Math.PI * i / 128));
      norm += kernel[i];
    }
    for (int k = 0; k < 129; k++) kernel[k] /= norm;
    float[] mono = new float[last - first];
    for (int i = 0; i < mono.length; i++) {
      double v = 0;
      for (int k = 0; k < 129; k++) v += source[i * 2 + k] * kernel[k];
      mono[i] = (float) v;
      if (i % 22050 == 0) progress.update(0);
    }
    float[] out = new float[length * 128];
    double[] window = new double[1024];
    for (int t = 0; t < length; t++) {
      long frame = (long) start + t;
      if (frame < 0 || frame >= total) continue;
      for (int i = 0; i < 1024; i++) {
        long sample = frame * 441 + i - 512;
        if (sample < 0) sample = -sample;
        if (sample >= samples) sample = 2 * samples - 2 - sample;
        window[i] = mono[(int) (sample - first)];
      }
      float[] values = BeatFeatures.frame(window, mel);
      System.arraycopy(values, 0, out, t * 128, 128);
      if (t % 100 == 0) progress.update(0);
    }
    return out;
  }
}
