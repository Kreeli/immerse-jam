package app.immersejam.mobile.inference;

import ai.onnxruntime.*;
import android.app.*;
import android.content.Intent;
import android.os.*;
import app.immersejam.mobile.*;
import java.io.*;
import java.nio.*;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import org.json.*;

public class InferenceService extends Service {
  final ExecutorService worker = Executors.newSingleThreadExecutor();
  volatile boolean cancelled = false, busy = false;
  volatile OrtSession.RunOptions activeRun;
  Messenger reply;
  final Messenger binder =
      new Messenger(
          new Handler(
              Looper.getMainLooper(),
              message -> {
                if (message.what == 2) {
                  cancelled = true;
                  try {
                    if (activeRun != null) activeRun.setTerminate(true);
                  } catch (Exception ignored) {
                  }
                  return true;
                }
                if (message.what == 1 && !busy) {
                  busy = true;
                  cancelled = false;
                  reply = message.replyTo;
                  String request = message.getData().getString("request");
                  worker.execute(() -> process(request));
                }
                return true;
              }));

  void foreground() {
    NotificationManager manager = getSystemService(NotificationManager.class);
    manager.createNotificationChannel(
        new NotificationChannel(
            "separation", "Local music processing", NotificationManager.IMPORTANCE_LOW));
    Notification n =
        new Notification.Builder(this, "separation")
            .setContentTitle("Immerse Jam")
            .setContentText("正在本机处理音乐 / Processing on this device")
            .setSmallIcon(android.R.drawable.ic_media_play)
            .build();
    if (Build.VERSION.SDK_INT >= 35)
      startForeground(
          1, n, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROCESSING);
    else if (Build.VERSION.SDK_INT >= 29)
      startForeground(1, n, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
    else startForeground(1, n);
  }

  @Override
  public void onCreate() {
    super.onCreate();
    foreground();
  }

  @Override
  public int onStartCommand(Intent intent, int flags, int startId) {
    foreground();
    return START_NOT_STICKY;
  }

  @Override
  public IBinder onBind(Intent intent) {
    return binder.getBinder();
  }

  void emit(JSONObject e) {
    try {
      Message message = Message.obtain(null, 1);
      Bundle b = new Bundle();
      b.putString("event", e.toString());
      message.setData(b);
      reply.send(message);
    } catch (Exception ignored) {
    }
  }

  void check() throws Exception {
    if (cancelled) throw new IOException("已取消");
    ActivityManager.MemoryInfo info = new ActivityManager.MemoryInfo();
    getSystemService(ActivityManager.class).getMemoryInfo(info);
    if (info.lowMemory || info.availMem < 160L * 1048576) throw new IOException("可用内存不足，本次处理已安全停止");
    if (Build.VERSION.SDK_INT >= 29
        && getSystemService(PowerManager.class).getCurrentThermalStatus()
            >= PowerManager.THERMAL_STATUS_SEVERE) throw new IOException("设备温度较高，已停止处理；冷却后可重试");
  }

  void progress(String id, double value, String text) throws Exception {
    emit(
        new JSONObject()
            .put("type", "progress")
            .put("jobId", id)
            .put("progress", value)
            .put("message", text));
  }

  void process(String text) {
    File temporary = null;
    String job = "";
    try {
      JSONObject request = new JSONObject(text);
      job = request.getString("jobId");
      JSONObject model = request.getJSONObject("model");
      String id = request.getString("id");
      File root = new File(request.getString("root"));
      File project = ProjectStore.contained(new File(root, "projects"), id);
      JSONObject p = ProjectStore.read(new File(project, "project.json"));
      temporary = new File(project, ".processing-" + job);
      temporary.mkdirs();
      check();
      File
          input = ProjectStore.contained(project, p.optString("playback", p.getString("original"))),
          decoded = new File(temporary, "decoded.wav");
      if (project.getUsableSpace()
          < Math.max(100L * 1048576, (long) (p.optDouble("duration", 300) * 44100 * 4 * 4)))
        throw new IOException("剩余存储空间不足");
      progress(job, .03, "正在解码音频");
      AudioFiles.decode(input, decoded, () -> cancelled);
      if (!request.optString("operation").equals("separate"))
        throw new IOException("Android 自动节拍／和弦模型正在适配，可使用手动校准或导入电脑识别结果。");
      File modelFile = new File(model.getString("path"));
      if (!ProjectStore.sha(modelFile).equals(model.getString("sha256")))
        throw new IOException("模型校验失败");
      if (model.getString("adapter").equals("scnet-spectral")) {
        JSONObject result =
            ScnetEngine.run(
                this, decoded, temporary, project, model, job, request.optString("mode", "basic"));
        temporary = null;
        ProjectStore.write(
            new File(root, "pending-results/" + id + "-" + result.getString("id") + ".json"),
            new JSONObject().put("result", result));
        emit(
            new JSONObject()
                .put("type", "complete")
                .put("jobId", job)
                .put("projectId", id)
                .put("separationResult", result));
        return;
      }
      int fft = model.getInt("nFft"),
          hop = model.getInt("hop"),
          dimF = model.getInt("dimF"),
          dimT = model.getInt("dimT"),
          length = (dimT - 1) * hop,
          trim = fft / 2,
          step = length - trim * 2;
      long frames = (decoded.length() - 44) / 4;
      String resultId = UUID.randomUUID().toString();
      File instrumental = new File(temporary, "other.wav"),
          vocals = new File(temporary, "vocals.wav");
      progress(job, .08, "正在试运行移动模型");
      OrtEnvironment environment = OrtEnvironment.getEnvironment();
      try (OrtSession.SessionOptions options = new OrtSession.SessionOptions()) {
        options.setIntraOpNumThreads(Math.min(2, Runtime.getRuntime().availableProcessors()));
        options.setInterOpNumThreads(1);
        options.setOptimizationLevel(OrtSession.SessionOptions.OptLevel.BASIC_OPT);
        options.setCPUArenaAllocator(false);
        options.setMemoryPatternOptimization(false);
        try (OrtSession session = environment.createSession(modelFile.getAbsolutePath(), options);
            RandomAccessFile inst = new RandomAccessFile(instrumental, "rw");
            RandomAccessFile voc = new RandomAccessFile(vocals, "rw")) {
          if (session.getNumInputs() != 1 || session.getNumOutputs() != 1)
            throw new IOException("模型输入输出数量不匹配");
          String inputName = session.getInputNames().iterator().next();
          long[] inputShape =
              ((TensorInfo) session.getInputInfo().get(inputName).getInfo()).getShape();
          if (inputShape.length != 4
              || inputShape[1] != 4
              || inputShape[2] != dimF
              || inputShape[3] != dimT) throw new IOException("模型频谱形状不匹配");
          AudioFiles.header(inst, 0, 44100, 16, 1);
          AudioFiles.header(voc, 0, 44100, 16, 1);
          inst.seek(44);
          voc.seek(44);
          for (long start = 0; start < frames; start += step) {
            check();
            float[][] wave = new float[2][length];
            long begin = start - trim;
            int prefix = (int) Math.max(0, -begin);
            float[][] read = AudioFiles.readPcm(decoded, Math.max(0, begin), length - prefix);
            for (int c = 0; c < 2; c++)
              System.arraycopy(read[c], 0, wave[c], prefix, length - prefix);
            float[] spectrum = SignalMath.spectrum(wave, fft, hop, dimF, dimT);
            float[][] predicted;
            try (OnnxTensor inputTensor =
                    OnnxTensor.createTensor(
                        environment, FloatBuffer.wrap(spectrum), new long[] {1, 4, dimF, dimT});
                OrtSession.RunOptions run = new OrtSession.RunOptions()) {
              activeRun = run;
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
              try (OrtSession.Result output = session.run(Map.of(inputName, inputTensor), run)) {
                OnnxTensor tensor = (OnnxTensor) output.get(0);
                long[] shape = tensor.getInfo().getShape();
                if (!Arrays.equals(shape, new long[] {1, 4, dimF, dimT}))
                  throw new IOException("模型输出形状不匹配");
                FloatBuffer buffer = tensor.getFloatBuffer();
                float[] values = new float[4 * dimF * dimT];
                buffer.get(values);
                for (float v : values) if (!Float.isFinite(v)) throw new IOException("模型输出无效数值");
                predicted = SignalMath.inverse(values, fft, hop, dimF, dimT);
              } finally {
                activeRun = null;
                watchdog.shutdownNow();
              }
            }
            int count = (int) Math.min(step, frames - start);
            float[][] a = new float[2][count], b = new float[2][count];
            float compensation = (float) model.optDouble("compensate", 1);
            for (int c = 0; c < 2; c++)
              for (int i = 0; i < count; i++) {
                a[c][i] = predicted[c][i + trim] * compensation;
                b[c][i] = wave[c][i + trim] - a[c][i];
              }
            AudioFiles.appendPcm(inst, a, count);
            AudioFiles.appendPcm(voc, b, count);
            progress(
                job,
                .1 + .85 * Math.min(1, (double) (start + step) / frames),
                "本机分轨 " + Math.min(frames, start + step) / 44100 + " / " + frames / 44100 + " 秒");
          }
          AudioFiles.header(inst, frames, 44100, 16, 1);
          AudioFiles.header(voc, frames, 44100, 16, 1);
        }
      }
      check();
      decoded.delete();
      String relative = "results/" + resultId;
      File dest = ProjectStore.contained(project, relative);
      dest.getParentFile().mkdirs();
      Files.move(temporary.toPath(), dest.toPath());
      temporary = null;
      JSONArray tracks =
          new JSONArray()
              .put(ProjectStore.track("vocals", "vocals", relative + "/vocals.wav"))
              .put(ProjectStore.track("other", "other", relative + "/other.wav"));
      JSONObject result =
          new JSONObject()
              .put("id", resultId)
              .put("name", model.getString("name") + " · " + ProjectStore.now())
              .put("modelId", model.getString("id"))
              .put("modelName", model.getString("name"))
              .put("mode", "vocal")
              .put("createdAt", ProjectStore.now())
              .put("directory", relative)
              .put("tracks", tracks);
      ProjectStore.write(
          new File(root, "pending-results/" + id + "-" + result.getString("id") + ".json"),
          new JSONObject().put("result", result));
      emit(
          new JSONObject()
              .put("type", "complete")
              .put("jobId", job)
              .put("projectId", id)
              .put("separationResult", result));
    } catch (Throwable error) {
      try {
        emit(
            new JSONObject()
                .put("type", cancelled ? "cancelled" : "error")
                .put("jobId", job)
                .put(
                    "message",
                    error instanceof OutOfMemoryError
                        ? "移动模型内存不足，原有分轨已保留"
                        : Objects.requireNonNullElse(error.getMessage(), error.toString())));
      } catch (Exception ignored) {
      }
    } finally {
      if (temporary != null)
        try {
          ProjectStore.remove(temporary);
        } catch (Exception ignored) {
        }
      busy = false;
      stopForeground(STOP_FOREGROUND_REMOVE);
      stopSelf();
    }
  }

  @Override
  public void onDestroy() {
    cancelled = true;
    worker.shutdownNow();
    super.onDestroy();
  }
}
