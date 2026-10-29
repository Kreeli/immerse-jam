package app.immersejam.mobile;

import android.util.Base64;
import app.immersejam.mobile.processing.WaveReader;
import java.io.*;
import java.nio.*;
import java.util.*;
import java.util.zip.*;
import org.json.*;

/**
 * Disk-backed export sessions; Java mixes, the shared SoundTouch engine stretches in bounded
 * blocks.
 */
final class NativeAudio implements AutoCloseable {
  final ProjectStore store;
  final Map<String, Session> sessions = new java.util.concurrent.ConcurrentHashMap<>();
  volatile boolean closed;

  static class Session {
    String id;
    File folder, output;
    RandomAccessFile input, out;
    long frames, read, written;
    double tempo, pitch, master;
  }

  NativeAudio(ProjectStore store) {
    this.store = store;
  }

  JSONArray tracks(JSONObject p) throws Exception {
    JSONArray all = new JSONArray();
    Set<String> selected = new HashSet<>();
    JSONArray ids = p.getJSONArray("selectedTakeIds");
    for (int i = 0; i < ids.length(); i++) selected.add(ids.getString(i));
    boolean creation = p.optString("kind").equals("creation"),
        mixed =
            p.optString("kind").equals("practice")
                && p.optString("practiceMode").equals("mixed")
                && !selected.isEmpty();
    JSONArray groups = new JSONArray(p.getJSONArray("sourceGroups").toString());
    if (!creation || p.has("sessionSource")) {
      JSONArray backing = p.getJSONArray("tracks");
      if (backing.length() == 0) backing = new JSONArray().put(p.getJSONObject("originalMix"));
      if (creation) {
        JSONObject source = p.optJSONObject("sourceMix");
        JSONObject group =
            new JSONObject()
                .put("tracks", backing)
                .put("gain", 1)
                .put("start", 0)
                .put("mute", false)
                .put("solo", false);
        if (source != null) {
          Iterator<String> keys = source.keys();
          while (keys.hasNext()) {
            String k = keys.next();
            group.put(k, source.get(k));
          }
        }
        groups.put(group);
      } else if (!mixed)
        for (int i = 0; i < backing.length(); i++)
          all.put(new JSONObject(backing.getJSONObject(i).toString()));
    }
    JSONArray takes = p.getJSONArray("takes");
    boolean outerSolo = false;
    if (creation) {
      for (int i = 0; i < groups.length(); i++)
        if (groups.getJSONObject(i).optBoolean("solo")
            && !groups.getJSONObject(i).optBoolean("mute")) outerSolo = true;
      for (int i = 0; i < takes.length(); i++)
        if (takes.getJSONObject(i).optBoolean("solo") && !takes.getJSONObject(i).optBoolean("mute"))
          outerSolo = true;
      for (int i = 0; i < groups.length(); i++) {
        JSONObject g = groups.getJSONObject(i);
        if (g.optBoolean("mute") || (outerSolo && !g.optBoolean("solo"))) continue;
        JSONArray tracks = g.getJSONArray("tracks");
        boolean innerSolo = false;
        for (int j = 0; j < tracks.length(); j++)
          if (tracks.getJSONObject(j).optBoolean("solo")
              && !tracks.getJSONObject(j).optBoolean("mute")) innerSolo = true;
        for (int j = 0; j < tracks.length(); j++) {
          JSONObject t = new JSONObject(tracks.getJSONObject(j).toString());
          if (t.optBoolean("mute") || (innerSolo && !t.optBoolean("solo"))) continue;
          t.put("gain", t.getDouble("gain") * g.optDouble("gain", 1))
              .put("start", t.optDouble("start") + g.optDouble("start"))
              .put("solo", false);
          all.put(t);
        }
      }
    }
    for (int i = 0; i < takes.length(); i++) {
      JSONObject t = new JSONObject(takes.getJSONObject(i).toString());
      if (!creation && !selected.contains(t.getString("id"))) continue;
      if (creation && outerSolo && !t.optBoolean("solo")) continue;
      t.put("start", t.optDouble("start") + t.optDouble("offsetMs") / 1000);
      if (creation) t.put("solo", false);
      all.put(t);
    }
    boolean solo = false;
    for (int i = 0; i < all.length(); i++)
      if (all.getJSONObject(i).optBoolean("solo") && !all.getJSONObject(i).optBoolean("mute"))
        solo = true;
    JSONArray audible = new JSONArray();
    for (int i = 0; i < all.length(); i++) {
      JSONObject t = all.getJSONObject(i);
      if (!t.optBoolean("mute") && (!solo || t.optBoolean("solo"))) audible.put(t);
    }
    return audible;
  }

  JSONObject start(JSONObject d) throws Exception {
    if (closed) throw new IOException("应用正在关闭");
    if (!sessions.isEmpty()) throw new IOException("已有音频导出正在进行");
    JSONObject p = store.get(d.getString("id")), practice = p.getJSONObject("practice");
    JSONArray tracks = tracks(p);
    if (tracks.length() == 0) throw new IOException("当前所有音轨都已关闭声音");
    if (tracks.length() > 128) throw new IOException("导出音轨过多，请减少音轨");
    Session s = new Session();
    s.id = UUID.randomUUID().toString();
    s.folder = new File(store.context.getCacheDir(), "render-" + s.id);
    s.folder.mkdirs();
    List<WaveReader> readers = new ArrayList<>();
    try {
      double duration = p.getDouble("duration");
      for (int i = 0; i < tracks.length(); i++) {
        File source = store.asset(p.getString("id"), tracks.getJSONObject(i).getString("file"));
        WaveReader reader;
        try {
          reader = new WaveReader(source);
        } catch (IOException unsupported) {
          source =
              AudioFiles.decode(
                  source,
                  new File(s.folder, "decode-" + i + ".wav"),
                  () -> Thread.currentThread().isInterrupted());
          reader = new WaveReader(source);
        }
        readers.add(reader);
        AudioFiles.checkDuration(reader.duration());
        duration =
            Math.max(duration, reader.duration() + tracks.getJSONObject(i).optDouble("start"));
      }
      AudioFiles.checkDuration(duration);
      double a = 0, b = duration;
      if (d.optJSONObject("region") != null) {
        a = d.getJSONObject("region").getDouble("a");
        b = d.getJSONObject("region").getDouble("b");
        if (!Double.isFinite(a) || !Double.isFinite(b) || a < 0 || b <= a || b > duration)
          throw new IOException("导出段落无效");
      }
      long frames = Math.round((b - a) * 44100);
      s.tempo = practice.getDouble("tempo");
      s.pitch = practice.getDouble("pitch");
      s.master = practice.getDouble("master");
      if (s.folder.getUsableSpace() < frames * (8 + 4 / s.tempo) + 100L * 1048576)
        throw new IOException("剩余存储空间不足");
      File mix = new File(s.folder, "mix.wav");
      try (RandomAccessFile out = new RandomAccessFile(mix, "rw")) {
        AudioFiles.header(out, frames, 44100, 32, 3);
        out.seek(44);
        for (long start = 0; start < frames; start += 4096) {
          if (closed || Thread.currentThread().isInterrupted()) throw new IOException("已取消");
          int count = (int) Math.min(4096, frames - start);
          float[][] values = new float[2][count];
          for (int j = 0; j < readers.size(); j++) {
            JSONObject track = tracks.getJSONObject(j);
            double gain = track.getDouble("gain"),
                pan = track.getDouble("pan"),
                offset = track.optDouble("start");
            WaveReader reader = readers.get(j);
            for (int i = 0; i < count; i++) {
              double t = a + (start + i) / 44100.0 - offset;
              if (t < 0 || t >= reader.duration()) continue;
              float l = reader.sample(t, 0), r = reader.sample(t, 1);
              if (pan <= 0) {
                values[0][i] += (l + Math.cos((pan + 1) * Math.PI / 2) * r) * gain;
                values[1][i] += Math.sin((pan + 1) * Math.PI / 2) * r * gain;
              } else {
                values[0][i] += Math.cos(pan * Math.PI / 2) * l * gain;
                values[1][i] += (r + Math.sin(pan * Math.PI / 2) * l) * gain;
              }
            }
          }
          ByteBuffer bytes = ByteBuffer.allocate(count * 8).order(ByteOrder.LITTLE_ENDIAN);
          for (int i = 0; i < count; i++) {
            bytes.putFloat(values[0][i]);
            bytes.putFloat(values[1][i]);
          }
          out.write(bytes.array());
        }
      }
      s.frames = frames;
      s.input = new RandomAccessFile(mix, "r");
      s.input.seek(44);
      s.output = new File(s.folder, "export.wav");
      s.out = new RandomAccessFile(s.output, "rw");
      AudioFiles.header(s.out, 0, 44100, 16, 1);
      s.out.seek(44);
      sessions.put(s.id, s);
      if (closed) {
        abort(s.id);
        throw new IOException("已取消");
      }
      return new JSONObject()
          .put("id", s.id)
          .put("frames", frames)
          .put("sampleRate", 44100)
          .put("tempo", s.tempo)
          .put("pitch", s.pitch);
    } catch (Exception error) {
      try {
        if (s.input != null) s.input.close();
      } catch (Exception ignored) {
      }
      try {
        if (s.out != null) s.out.close();
      } catch (Exception ignored) {
      }
      ProjectStore.remove(s.folder);
      throw error;
    } finally {
      for (WaveReader reader : readers) reader.close();
    }
  }

  Session session(String id) throws IOException {
    Session s = sessions.get(id);
    if (s == null) throw new IOException("音频导出已结束");
    return s;
  }

  String read(String id) throws Exception {
    Session s = session(id);
    int count = (int) Math.min(8192, s.frames - s.read);
    byte[] bytes = new byte[count * 8];
    s.input.readFully(bytes);
    s.read += count;
    return Base64.encodeToString(bytes, Base64.NO_WRAP);
  }

  boolean append(JSONObject d) throws Exception {
    Session s = session(d.getString("id"));
    String chunk = d.getString("chunk");
    if (chunk.length() > 200000) throw new IOException("导出片段过大");
    byte[] data = Base64.decode(chunk, Base64.NO_WRAP);
    if (data.length % 8 != 0 || s.written + data.length / 8 > Math.ceil(s.frames / s.tempo) + 2)
      throw new IOException("导出长度无效");
    ByteBuffer input = ByteBuffer.wrap(data).order(ByteOrder.LITTLE_ENDIAN),
        output = ByteBuffer.allocate(data.length / 2).order(ByteOrder.LITTLE_ENDIAN);
    while (input.hasRemaining()) {
      float value = input.getFloat();
      if (!Float.isFinite(value)) throw new IOException("导出采样无效");
      output.putShort((short) Math.round(Math.max(-.98, Math.min(.98, value * s.master)) * 32767));
    }
    s.out.write(output.array());
    s.written += data.length / 8;
    return true;
  }

  File finish(String id) throws Exception {
    Session s = session(id);
    try {
      if (Math.abs(s.written - Math.round(s.frames / s.tempo)) > 2) throw new IOException("导出尚未完成");
      AudioFiles.header(s.out, s.written, 44100, 16, 1);
      s.out.close();
      s.input.close();
      File folder = new File(store.context.getExternalFilesDir(null), "exports");
      folder.mkdirs();
      File file = new File(folder, s.id + ".wav");
      java.nio.file.Files.move(s.output.toPath(), file.toPath());
      return file;
    } finally {
      abort(id);
    }
  }

  void abort(String id) {
    Session s = sessions.remove(id);
    if (s == null) return;
    try {
      s.input.close();
    } catch (Exception ignored) {
    }
    try {
      s.out.close();
    } catch (Exception ignored) {
    }
    try {
      ProjectStore.remove(s.folder);
    } catch (Exception ignored) {
    }
  }

  File stems(String id) throws Exception {
    JSONObject p = store.get(id);
    File folder = new File(store.context.getExternalFilesDir(null), "exports");
    folder.mkdirs();
    File file = new File(folder, UUID.randomUUID() + "-stems.zip");
    Set<String> files = new LinkedHashSet<>();
    boolean creation = p.optString("kind").equals("creation");
    if (!creation || p.has("sessionSource")) files.add(p.getString("original"));
    for (int i = 0; i < p.getJSONArray("tracks").length(); i++)
      files.add(p.getJSONArray("tracks").getJSONObject(i).getString("file"));
    JSONArray groups = p.getJSONArray("sourceGroups");
    for (int i = 0; i < groups.length(); i++) {
      JSONArray tracks = groups.getJSONObject(i).getJSONArray("tracks");
      for (int j = 0; j < tracks.length(); j++)
        files.add(tracks.getJSONObject(j).getString("file"));
    }
    Set<String> selected = new HashSet<>();
    JSONArray ids = p.getJSONArray("selectedTakeIds");
    for (int i = 0; i < ids.length(); i++) selected.add(ids.getString(i));
    JSONArray takes = p.getJSONArray("takes");
    for (int i = 0; i < takes.length(); i++) {
      JSONObject take = takes.getJSONObject(i);
      if (creation || selected.contains(take.getString("id"))) files.add(take.getString("file"));
    }
    try (ZipOutputStream out = new ZipOutputStream(new FileOutputStream(file))) {
      int index = 0;
      for (String relative : files) {
        if (!relative.toLowerCase(Locale.ROOT).matches(".*\\.(wav|flac|mp3|m4a|ogg|aac|opus)$"))
          continue;
        out.putNextEntry(
            new ZipEntry(
                String.format(Locale.ROOT, "%03d-", index++) + new File(relative).getName()));
        java.nio.file.Files.copy(store.asset(id, relative).toPath(), out);
        out.closeEntry();
      }
      return file;
    } catch (Exception error) {
      file.delete();
      throw error;
    }
  }

  public void close() {
    closed = true;
    for (String id : new ArrayList<>(sessions.keySet())) abort(id);
  }
}
