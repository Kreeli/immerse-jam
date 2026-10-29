package app.immersejam.mobile.inference;

import ai.onnxruntime.*;
import app.immersejam.mobile.*;
import java.io.*;
import java.nio.*;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import org.json.*;

final class ScnetEngine {
  static JSONObject run(
      InferenceService service,
      File decoded,
      File temporary,
      File project,
      JSONObject model,
      String job,
      String mode)
      throws Exception {
    int fft = 4096,
        hop = 1024,
        f = 2049,
        t = 338,
        length = (t - 1) * hop,
        trim = fft / 2,
        step = length - 2 * trim;
    long frames = (decoded.length() - 44) / 4;
    String resultId = UUID.randomUUID().toString();
    JSONArray stems = model.getJSONArray("stems");
    if (!List.of("basic", "vocal", "drummer", "bassist").contains(mode))
      throw new IOException("所选移动模型不支持此分离方式");
    if (stems.length() != 4) throw new IOException("SCNet 需要四轨清单");
    RandomAccessFile[] files = new RandomAccessFile[4];
    OrtEnvironment environment = OrtEnvironment.getEnvironment();
    try (OrtSession.SessionOptions options = new OrtSession.SessionOptions()) {
      options.setIntraOpNumThreads(Math.min(2, Runtime.getRuntime().availableProcessors()));
      options.setInterOpNumThreads(1);
      options.setOptimizationLevel(OrtSession.SessionOptions.OptLevel.BASIC_OPT);
      options.setCPUArenaAllocator(false);
      options.setMemoryPatternOptimization(false);
      try (OrtSession session = environment.createSession(model.getString("path"), options)) {
        if (session.getNumInputs() != 1 || session.getNumOutputs() != 1)
          throw new IOException("SCNet 输入输出数量不匹配");
        String inputName = session.getInputNames().iterator().next();
        long[] shape = ((TensorInfo) session.getInputInfo().get(inputName).getInfo()).getShape();
        if (!Arrays.equals(shape, new long[] {1, 4, f, t})) throw new IOException("SCNet 形状不匹配");
        for (int s = 0; s < 4; s++) {
          files[s] = new RandomAccessFile(new File(temporary, stems.getString(s) + ".wav"), "rw");
          AudioFiles.header(files[s], 0, 44100, 16, 1);
          files[s].seek(44);
        }
        for (long start = 0; start < frames; start += step) {
          service.check();
          float[][] wave = new float[2][length];
          long begin = start - trim;
          int prefix = (int) Math.max(0, -begin);
          float[][] read = AudioFiles.readPcm(decoded, Math.max(0, begin), length - prefix);
          for (int c = 0; c < 2; c++)
            System.arraycopy(read[c], 0, wave[c], prefix, length - prefix);
          float[] spectrum = SignalMath.spectrum(wave, fft, hop, f, t, 0);
          double mean = 0;
          for (int i = 0; i < spectrum.length; i++) {
            spectrum[i] /= 64;
            mean += spectrum[i];
          }
          mean /= spectrum.length;
          double variance = 0;
          for (float v : spectrum) variance += (v - mean) * (v - mean);
          double std = Math.sqrt(variance / (spectrum.length - 1));
          for (int i = 0; i < spectrum.length; i++)
            spectrum[i] = (float) ((spectrum[i] - mean) / (1e-5 + std));
          try (OnnxTensor input =
                  OnnxTensor.createTensor(
                      environment, FloatBuffer.wrap(spectrum), new long[] {1, 4, f, t});
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
            try (OrtSession.Result output = session.run(Map.of(inputName, input), run)) {
              OnnxTensor tensor = (OnnxTensor) output.get(0);
              if (!Arrays.equals(tensor.getInfo().getShape(), new long[] {1, 4, 4, f, t}))
                throw new IOException("SCNet 输出声部不匹配");
              FloatBuffer values = tensor.getFloatBuffer();
              int count = (int) Math.min(step, frames - start);
              for (int s = 0; s < 4; s++) {
                float[] spec = new float[4 * f * t];
                values.get(spec);
                for (int i = 0; i < spec.length; i++) {
                  if (!Float.isFinite(spec[i])) throw new IOException("模型输出无效");
                  spec[i] = (float) ((spec[i] * std + mean) * 64);
                }
                float[][] restored = SignalMath.inverse(spec, fft, hop, f, t),
                    slice = new float[2][count];
                for (int c = 0; c < 2; c++) System.arraycopy(restored[c], trim, slice[c], 0, count);
                AudioFiles.appendPcm(files[s], slice, count);
              }
            } finally {
              service.activeRun = null;
              watchdog.shutdownNow();
            }
          }
          service.progress(
              job,
              .1 + .85 * Math.min(1, (double) (start + step) / frames),
              "本机四轨分离 " + Math.min(frames, start + step) / 44100 + " / " + frames / 44100 + " 秒");
        }
        for (RandomAccessFile file : files) AudioFiles.header(file, frames, 44100, 16, 1);
      }
    } finally {
      for (RandomAccessFile file : files) if (file != null) file.close();
    }
    String selected =
        mode.equals("drummer")
            ? "drums"
            : mode.equals("bassist") ? "bass" : mode.equals("vocal") ? "vocals" : null;
    if (selected != null) {
      try (RandomAccessFile out = new RandomAccessFile(new File(temporary, "residual.wav"), "rw")) {
        AudioFiles.header(out, frames, 44100, 16, 1);
        out.seek(44);
        for (long start = 0; start < frames; start += 4096) {
          int count = (int) Math.min(4096, frames - start);
          float[][] sum = new float[2][count];
          for (int s = 0; s < 4; s++) {
            String stem = stems.getString(s);
            if (stem.equals(selected)) continue;
            float[][] wave = AudioFiles.readPcm(new File(temporary, stem + ".wav"), start, count);
            for (int c = 0; c < 2; c++) for (int i = 0; i < count; i++) sum[c][i] += wave[c][i];
          }
          AudioFiles.appendPcm(out, sum, count);
        }
      }
    }
    service.check();
    decoded.delete();
    String relative = "results/" + resultId;
    File dest = ProjectStore.contained(project, relative);
    dest.getParentFile().mkdirs();
    Files.move(temporary.toPath(), dest.toPath());
    JSONArray tracks = new JSONArray();
    for (int s = 0; s < 4; s++) {
      String stem = stems.getString(s);
      if (selected != null && !stem.equals(selected)) continue;
      tracks.put(ProjectStore.track(stem, stem, relative + "/" + stem + ".wav"));
    }
    if (selected != null)
      tracks.put(ProjectStore.track("other", "other", relative + "/residual.wav"));
    return new JSONObject()
        .put("id", resultId)
        .put("name", model.getString("name") + " · " + ProjectStore.now())
        .put("modelId", model.getString("id"))
        .put("modelName", model.getString("name"))
        .put("mode", mode)
        .put("createdAt", ProjectStore.now())
        .put("directory", relative)
        .put("tracks", tracks);
  }
}
