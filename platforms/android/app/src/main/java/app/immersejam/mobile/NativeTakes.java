package app.immersejam.mobile;

import android.net.Uri;
import android.util.Base64;
import app.immersejam.mobile.processing.RecordingMath;
import app.immersejam.mobile.processing.WaveReader;
import java.io.*;
import java.nio.*;
import java.util.*;
import org.json.*;

final class NativeTakes {
  final ProjectStore store;
  final Map<String, Session> sessions = new java.util.concurrent.ConcurrentHashMap<>();

  static final class Session {
    String id, projectId, relative;
    JSONObject options;
    RandomAccessFile out;
    int sequence;
    long frames;
    double first = -1;
  }

  NativeTakes(ProjectStore store) {
    this.store = store;
  }

  JSONObject start(String projectId, JSONObject options) throws Exception {
    if (!sessions.isEmpty()) throw new IOException("已有录音正在进行");
    RecordingMath.validate(
        options.getInt("sampleRate"),
        options.optDouble("tempo", 1),
        options.optDouble("pitch", 0),
        options.getDouble("anchorPosition"),
        options.getDouble("anchorTime"),
        options.optDouble("latencyMs", 0));
    if (!Set.of("instrument", "mixed").contains(options.optString("mode", "instrument")))
      throw new IOException("录音模式无效");
    Session s = new Session();
    s.id = UUID.randomUUID().toString();
    s.projectId = projectId;
    s.options = options;
    s.relative = "recordings/" + s.id;
    File file = store.asset(projectId, s.relative + "/raw.wav");
    file.getParentFile().mkdirs();
    s.out = new RandomAccessFile(file, "rw");
    try {
      AudioFiles.header(s.out, 0, options.getInt("sampleRate"), 32, 3);
      s.out.seek(44);
      ProjectStore.write(
          store.asset(projectId, s.relative + "/pending.json"),
          new JSONObject().put("id", s.id).put("options", options));
      sessions.put(s.id, s);
    } catch (Exception error) {
      s.out.close();
      throw error;
    }
    return new JSONObject().put("id", s.id);
  }

  Object append(JSONObject d) throws Exception {
    Session s = sessions.get(d.getString("sessionId"));
    if (s == null) throw new IOException("录音已停止");
    byte[] bytes;
    if (d.has("pcm")) {
      String pcm = d.getString("pcm");
      if (pcm.length() > 1_400_000) throw new IOException("录音片段过大");
      bytes = Base64.decode(pcm, Base64.NO_WRAP);
    } else {
      JSONArray input = d.getJSONArray("bytes");
      if (input.length() > 1048576) throw new IOException("录音片段过大");
      bytes = new byte[input.length()];
      for (int i = 0; i < bytes.length; i++) bytes[i] = (byte) input.getInt(i);
    }
    if (d.getInt("sequence") != s.sequence
        || bytes.length == 0
        || bytes.length > 1048576
        || bytes.length % 8 != 0) throw new IOException("录音片段顺序或格式错误");
    ByteBuffer values = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN);
    while (values.remaining() > 0)
      if (!Float.isFinite(values.getFloat())) throw new IOException("录音包含无效采样");
    double time = d.getDouble("contextTime");
    if (!Double.isFinite(time)) throw new IOException("录音时间无效");
    if (s.first < 0) {
      s.first = time;
      ProjectStore.write(
          store.asset(s.projectId, s.relative + "/pending.json"),
          new JSONObject().put("id", s.id).put("options", s.options).put("first", time));
    }
    long target = Math.round((time - s.first) * s.options.getInt("sampleRate"));
    if (target + bytes.length / 8
        > s.options.getInt("sampleRate")
            * RecordingMath.limit(
                s.options.getDouble("anchorPosition"), s.options.optDouble("tempo", 1)))
      throw new IOException("本次录音已达到 44 分钟，请保存后继续");
    if (target < s.frames - 2 || target - s.frames > 96000) throw new IOException("录音时间不连续");
    if (target > s.frames) {
      s.out.write(new byte[(int) (target - s.frames) * 8]);
      s.frames = target;
    }
    s.out.write(bytes);
    s.frames += bytes.length / 8;
    s.sequence++;
    return true;
  }

  Session seal(String id) throws Exception {
    Session s = sessions.remove(id);
    if (s == null) throw new IOException("录音已停止");
    try {
      AudioFiles.header(s.out, s.frames, s.options.getInt("sampleRate"), 32, 3);
    } finally {
      s.out.close();
    }
    return s;
  }

  JSONObject finish(String id) throws Exception {
    Session s = seal(id);
    if (s.options.optDouble("tempo", 1) != 1 || s.options.optDouble("pitch", 0) != 0)
      throw new IOException("录音已保存，请重新打开跟练恢复变速录音");
    return commit(s, s.relative + "/raw.wav");
  }

  JSONObject commit(Session s, String file) throws Exception {
    JSONObject p = store.get(s.projectId);
    if (s.frames > 0) {
      for (int i = 0; i < p.getJSONArray("takes").length(); i++)
        if (p.getJSONArray("takes").getJSONObject(i).getString("id").equals(s.id)) {
          store.asset(s.projectId, s.relative + "/pending.json").delete();
          return p;
        }
      double duration;
      try (WaveReader reader = new WaveReader(store.asset(s.projectId, file))) {
        duration = reader.duration();
      }
      AudioFiles.checkDuration(duration);
      double tempo = s.options.optDouble("tempo", 1), pitch = s.options.optDouble("pitch", 0);
      double start =
          RecordingMath.start(
              s.options.getDouble("anchorPosition"),
              s.first,
              s.options.getDouble("anchorTime"),
              tempo,
              s.options.optDouble("latencyMs", 0));
      JSONObject take =
          ProjectStore.track(s.id, "录音 " + (p.getJSONArray("takes").length() + 1), file);
      take.put("rawFile", s.relative + "/raw.wav")
          .put("duration", duration)
          .put("start", start)
          .put("offsetMs", 0)
          .put("mode", s.options.optString("mode", "instrument"))
          .put("inputLabel", s.options.optString("inputLabel"))
          .put("createdAt", ProjectStore.now())
          .put("recordedTempo", tempo)
          .put("recordedPitch", pitch)
          .put(
              "mute",
              s.options.optString("mode").equals("mixed")
                  && !p.optString("kind").equals("practice"))
          .put("latencyMs", s.options.optDouble("latencyMs", 0));
      p.getJSONArray("takes").put(take);
      if (p.getJSONArray("selectedTakeIds").length() < 2 || p.optString("kind").equals("creation"))
        p.getJSONArray("selectedTakeIds").put(s.id);
      if (p.optString("kind").equals("creation"))
        p.put("duration", Math.max(p.optDouble("duration", 0), start + take.getDouble("duration")));
      p = store.save(p);
    }
    store.asset(s.projectId, s.relative + "/pending.json").delete();
    return p;
  }

  JSONObject importUri(JSONObject p, Uri uri, double start) throws Exception {
    String id = UUID.randomUUID().toString(),
        file =
            "recordings/" + id + "/input-" + store.name(uri).replaceAll("[^\\p{L}\\p{N}._ -]", "_");
    File source = store.copyUri(uri, store.asset(p.getString("id"), file));
    String wave = "recordings/" + id + "/audio.wav";
    File decoded = AudioFiles.decode(source, store.asset(p.getString("id"), wave), () -> false);
    double duration = (decoded.length() - 44) / 176400.0;
    JSONObject take =
        ProjectStore.track(id, store.name(uri), wave)
            .put("duration", duration)
            .put("start", start)
            .put("offsetMs", 0)
            .put("mode", "instrument")
            .put("createdAt", ProjectStore.now())
            .put("recordedTempo", 1)
            .put("recordedPitch", 0);
    p.getJSONArray("takes").put(take);
    if (p.getJSONArray("selectedTakeIds").length() < 2 || p.optString("kind").equals("creation"))
      p.getJSONArray("selectedTakeIds").put(id);
    if (p.optString("kind").equals("creation"))
      p.put("duration", Math.max(p.optDouble("duration", 0), start + duration));
    return store.save(p);
  }

  JSONArray restore(String projectId) throws Exception {
    JSONArray restored = new JSONArray();
    if (!sessions.isEmpty()) return restored;
    File folder = store.asset(projectId, "recordings");
    File[] directories = folder.listFiles();
    if (directories != null)
      for (File directory : directories) {
        File marker = new File(directory, "pending.json"), raw = new File(directory, "raw.wav");
        if (!marker.isFile() || !raw.isFile() || !directory.getName().matches("[a-f0-9-]{36}"))
          continue;
        JSONObject pending = ProjectStore.read(marker);
        JSONObject options = pending.getJSONObject("options");
        int rate = options.getInt("sampleRate");
        if (rate < 8000 || rate > 192000 || raw.length() < 44) continue;
        JSONObject project = store.get(projectId);
        boolean exists = false;
        for (int i = 0; i < project.getJSONArray("takes").length(); i++)
          if (project
              .getJSONArray("takes")
              .getJSONObject(i)
              .getString("id")
              .equals(directory.getName())) exists = true;
        if (exists) {
          marker.delete();
          continue;
        }
        Session s = new Session();
        s.id = directory.getName();
        s.projectId = projectId;
        s.relative = "recordings/" + s.id;
        s.options = options;
        RecordingMath.validate(
            rate,
            options.optDouble("tempo", 1),
            options.optDouble("pitch", 0),
            options.getDouble("anchorPosition"),
            options.getDouble("anchorTime"),
            options.optDouble("latencyMs", 0));
        s.frames = (raw.length() - 44) / 8;
        s.first = pending.optDouble("first", options.getDouble("anchorTime"));
        s.out = new RandomAccessFile(raw, "rw");
        sessions.put(s.id, s);
        restored.put(s.id);
      }
    return restored;
  }

  JSONObject recover(String projectId) throws Exception {
    JSONArray restored = restore(projectId);
    for (int i = 0; i < restored.length(); i++) finish(restored.getString(i));
    return store.get(projectId);
  }

  void close() {
    for (Session s : sessions.values())
      try {
        AudioFiles.header(s.out, s.frames, s.options.getInt("sampleRate"), 32, 3);
        s.out.close();
      } catch (Exception ignored) {
      }
    sessions.clear();
  }
}
