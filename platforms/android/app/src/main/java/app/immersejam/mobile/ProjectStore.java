package app.immersejam.mobile;

import android.content.*;
import android.database.Cursor;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.webkit.WebResourceResponse;
import java.io.*;
import java.nio.file.*;
import java.security.*;
import java.time.Instant;
import java.util.*;
import java.util.zip.*;
import org.json.*;

public class ProjectStore {
  public final File root, projects;
  final Context context;

  public ProjectStore(Context context) {
    this.context = context;
    root = new File(context.getExternalFilesDir(null), "library");
    projects = new File(root, "projects");
    projects.mkdirs();
  }

  public static String now() {
    return Instant.now().toString();
  }

  public File dir(String id) throws IOException {
    if (!id.matches("[a-zA-Z0-9_-]{1,100}")) throw new IOException("无效内容编号");
    return new File(projects, id);
  }

  public static File contained(File root, String path) throws IOException {
    if (path.isEmpty() || path.indexOf('\0') >= 0 || path.contains("\\") || path.startsWith("/"))
      throw new IOException("无效文件路径");
    File file = new File(root, path).getCanonicalFile();
    if (!file.toPath().startsWith(root.getCanonicalFile().toPath())
        || file.equals(root.getCanonicalFile())) throw new IOException("文件超出范围");
    return file;
  }

  public File asset(String id, String file) throws IOException {
    return contained(dir(id), file);
  }

  public static JSONObject read(File file) throws Exception {
    return new JSONObject(
        new String(Files.readAllBytes(file.toPath()), java.nio.charset.StandardCharsets.UTF_8));
  }

  public static void write(File file, JSONObject value) throws Exception {
    file.getParentFile().mkdirs();
    File temporary = new File(file.getParentFile(), file.getName() + ".tmp");
    Files.write(
        temporary.toPath(), value.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
    Files.move(temporary.toPath(), file.toPath(), StandardCopyOption.REPLACE_EXISTING);
  }

  public synchronized JSONArray list() throws Exception {
    JSONArray result = new JSONArray();
    File[] dirs = projects.listFiles();
    if (dirs != null)
      for (File dir : dirs)
        if (new File(dir, "project.json").isFile()) {
          try {
            result.put(get(dir.getName()));
          } catch (Exception error) {
            JSONObject broken =
                new JSONObject()
                    .put("schemaVersion", 1)
                    .put("id", dir.getName())
                    .put("title", "歌曲数据需要恢复")
                    .put("artist", dir.getName())
                    .put("original", "missing")
                    .put("duration", 0)
                    .put("createdAt", "")
                    .put("updatedAt", "")
                    .put("starred", false)
                    .put("broken", String.valueOf(error.getMessage()));
            result.put(normalize(broken));
          }
        }
    return result;
  }

  public synchronized JSONObject get(String id) throws Exception {
    JSONObject p = normalize(read(new File(dir(id), "project.json")));
    ProjectValidation.validate(p);
    File pending = new File(root, "pending-results");
    File[] records = pending.listFiles();
    if (records != null)
      for (File record : records)
        if (record.getName().startsWith(id + "-") && record.getName().endsWith(".json")) {
          JSONObject entry = read(record);
          if (entry.has("patch")) {
            JSONObject patch = entry.getJSONObject("patch");
            for (String key : List.of("analysis", "alignment"))
              if (patch.has(key)) p.put(key, patch.get(key));
            validate(p);
            write(new File(dir(id), "project.json"), p);
            record.delete();
            continue;
          }
          JSONObject result = entry.getJSONObject("result");
          boolean exists = false;
          JSONArray results = p.getJSONArray("results");
          for (int i = 0; i < results.length(); i++)
            if (results.getJSONObject(i).getString("id").equals(result.getString("id")))
              exists = true;
          if (!exists) {
            results.put(result);
            p.put("tracks", result.getJSONArray("tracks"))
                .put("activeResultId", result.getString("id"));
            validate(p);
            write(new File(dir(id), "project.json"), p);
          }
          record.delete();
        }
    return p;
  }

  public synchronized JSONObject save(JSONObject project) throws Exception {
    normalize(project);
    validate(project);
    project.put("updatedAt", now());
    File previous = new File(dir(project.getString("id")), "project.json");
    if (previous.isFile())
      try {
        ProjectValidation.validate(normalize(read(previous)));
        Files.copy(
            previous.toPath(),
            new File(previous.getParentFile(), "project.previous.json").toPath(),
            StandardCopyOption.REPLACE_EXISTING);
      } catch (Exception ignored) {
      }
    write(new File(dir(project.getString("id")), "project.json"), project);
    return project;
  }

  public synchronized JSONObject recover(String id) throws Exception {
    File folder = dir(id), previous = new File(folder, "project.previous.json");
    if (!previous.isFile()) throw new IOException("没有可用的自动备份，请重新导入歌曲包");
    JSONObject value = normalize(read(previous));
    value.put("id", id);
    validate(value);
    File current = new File(folder, "project.json");
    if (current.isFile())
      Files.copy(
          current.toPath(),
          new File(folder, "project.corrupt." + System.currentTimeMillis() + ".json").toPath());
    write(current, value);
    return value;
  }

  JSONObject normalize(JSONObject p) throws Exception {
    ProjectValidation.repairLegacyAnalysis(p);
    for (String key :
        List.of(
            "tracks",
            "results",
            "takes",
            "selectedTakeIds",
            "attachments",
            "bookmarks",
            "presets",
            "chordCharts",
            "sourceGroups")) if (p.optJSONArray(key) == null) p.put(key, new JSONArray());
    JSONObject practice = p.optJSONObject("practice");
    if (practice == null) {
      practice = new JSONObject();
      p.put("practice", practice);
    }
    double[] defaults = {1, 0, .8}, min = {.25, -24, 0}, max = {2, 24, 1};
    String[] keys = {"tempo", "pitch", "master"};
    for (int i = 0; i < keys.length; i++) {
      double v = practice.optDouble(keys[i], defaults[i]);
      practice.put(
          keys[i], Double.isFinite(v) ? Math.max(min[i], Math.min(max[i], v)) : defaults[i]);
    }
    if (!p.has("originalMix"))
      p.put(
          "originalMix", track("original", "原曲", p.optString("playback", p.optString("original"))));
    return p;
  }

  void validate(JSONObject p) throws Exception {
    ProjectValidation.validate(p);
    AudioFiles.checkDuration(p.optDouble("duration", 0));
    for (String path : media(p)) {
      File media = asset(p.getString("id"), path);
      if (!media.isFile()) throw new IOException("媒体文件不存在：" + path);
    }
    if ("practice".equals(p.optString("kind")) && p.getJSONArray("selectedTakeIds").length() > 2)
      throw new IOException("跟练最多挂载两条录音");
    Set<String> takeIds = new HashSet<>(), selectedIds = new HashSet<>();
    for (int i = 0; i < p.getJSONArray("takes").length(); i++) {
      JSONObject take = p.getJSONArray("takes").getJSONObject(i);
      if (!takeIds.add(take.getString("id"))) throw new IOException("录音编号重复");
    }
    for (int i = 0; i < p.getJSONArray("selectedTakeIds").length(); i++) {
      String id = p.getJSONArray("selectedTakeIds").getString(i);
      if (!takeIds.contains(id) || !selectedIds.add(id)) throw new IOException("录音选择无效");
    }
    for (int i = 0; i < p.getJSONArray("chordCharts").length(); i++) {
      JSONArray bars = p.getJSONArray("chordCharts").getJSONObject(i).getJSONArray("bars");
      for (int j = 0; j < bars.length(); j++)
        if (bars.getJSONObject(j).getJSONArray("slots").length() > 2)
          throw new IOException("每小节最多两个和弦");
    }
  }

  public static JSONObject track(String id, String name, String file) throws Exception {
    return new JSONObject()
        .put("id", id)
        .put("name", name)
        .put("file", file)
        .put("gain", 1)
        .put("pan", 0)
        .put("mute", false)
        .put("solo", false);
  }

  public static Set<String> media(JSONObject p) throws Exception {
    Set<String> files = new LinkedHashSet<>();
    if (p.optJSONObject("originalMix") != null)
      files.add(p.getJSONObject("originalMix").getString("file"));
    for (String key : List.of("original", "playback", "scoreMidi"))
      if (p.has(key) && !p.isNull(key) && !p.getString(key).isEmpty()) files.add(p.getString(key));
    for (String key : List.of("tracks", "takes", "attachments")) {
      JSONArray items = p.optJSONArray(key);
      if (items != null)
        for (int i = 0; i < items.length(); i++) {
          JSONObject item = items.getJSONObject(i);
          files.add(item.getString("file"));
          if (item.has("rawFile")) files.add(item.getString("rawFile"));
        }
    }
    for (String key : List.of("results", "sourceGroups")) {
      JSONArray groups = p.optJSONArray(key);
      if (groups != null)
        for (int i = 0; i < groups.length(); i++) {
          JSONArray tracks = groups.getJSONObject(i).getJSONArray("tracks");
          for (int j = 0; j < tracks.length(); j++)
            files.add(tracks.getJSONObject(j).getString("file"));
        }
    }
    return files;
  }

  public static String sha(File file) throws Exception {
    MessageDigest digest = MessageDigest.getInstance("SHA-256");
    try (InputStream in = new FileInputStream(file)) {
      byte[] b = new byte[65536];
      int n;
      while ((n = in.read(b)) >= 0) {
        if (Thread.currentThread().isInterrupted()) throw new IOException("已取消");
        digest.update(b, 0, n);
      }
    }
    StringBuilder result = new StringBuilder();
    for (byte b : digest.digest())
      result.append(String.format(java.util.Locale.ROOT, "%02x", b & 255));
    return result.toString();
  }

  public static byte[] bytes(InputStream in) throws IOException {
    try (in;
        ByteArrayOutputStream out = new ByteArrayOutputStream()) {
      copy(in, out);
      return out.toByteArray();
    }
  }

  public static void copy(InputStream in, OutputStream out) throws IOException {
    byte[] bytes = new byte[65536];
    int n;
    while ((n = in.read(bytes)) >= 0) out.write(bytes, 0, n);
  }

  String name(Uri uri) {
    try (Cursor c =
        context
            .getContentResolver()
            .query(uri, new String[] {OpenableColumns.DISPLAY_NAME}, null, null, null)) {
      if (c != null && c.moveToFirst()) return c.getString(0);
    } catch (Exception ignored) {
    }
    return "Audio.wav";
  }

  public File copyUri(Uri uri, File dest) throws Exception {
    dest.getParentFile().mkdirs();
    try (InputStream in = context.getContentResolver().openInputStream(uri);
        OutputStream out = new FileOutputStream(dest)) {
      if (in == null) throw new IOException("无法读取文件");
      byte[] bytes = new byte[65536];
      long total = 0;
      int n;
      while ((n = in.read(bytes)) != -1) {
        if (Thread.currentThread().isInterrupted()) throw new IOException("已取消");
        total += n;
        if (total > 8L * 1024 * 1024 * 1024) throw new IOException("单个文件不能超过 8 GB");
        if (total % (16 * 1048576) < 65536
            && dest.getParentFile().getUsableSpace() < 100L * 1048576)
          throw new IOException("剩余存储空间不足");
        out.write(bytes, 0, n);
      }
    } catch (Exception error) {
      dest.delete();
      throw error;
    }
    return dest;
  }

  public JSONObject importUri(Uri uri) throws Exception {
    String name = name(uri), id = UUID.randomUUID().toString();
    File folder = dir(id);
    folder.mkdirs();
    try {
      if (name.toLowerCase(Locale.ROOT).endsWith(".ijam")) {
        File archive = copyUri(uri, new File(context.getCacheDir(), id + ".ijam"));
        try {
          return importArchive(archive, id);
        } finally {
          archive.delete();
        }
      }
      String safe = name.replaceAll("[^\\p{L}\\p{N}._ -]", "_");
      File source = copyUri(uri, asset(id, "media/" + safe));
      JSONObject p =
          new JSONObject()
              .put("schemaVersion", 1)
              .put("id", id)
              .put("title", name.replaceFirst("\\.[^.]+$", ""))
              .put("artist", "")
              .put("original", "media/" + safe)
              .put("duration", 0)
              .put("createdAt", now())
              .put("starred", false);
      try (MediaMetadataRetriever reader = new MediaMetadataRetriever()) {
        reader.setDataSource(source.getAbsolutePath());
        p.put(
            "duration",
            Double.parseDouble(
                    Objects.requireNonNullElse(
                        reader.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION), "0"))
                / 1000);
        p.put(
            "artist",
            Objects.requireNonNullElse(
                reader.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ARTIST), ""));
      } catch (Exception ignored) {
      }
      return save(p);
    } catch (Exception error) {
      remove(folder);
      throw error;
    }
  }

  public JSONObject importArchive(File archive, String id) throws Exception {
    File folder = dir(id);
    folder.mkdirs();
    long total = 0;
    int count = 0;
    Set<String> names = new HashSet<>();
    // Desktop archiver uses streamed STORED entries with data descriptors.
    // ZipFile uses central-directory sizes instead of guessing their boundaries.
    try (ZipFile zip = new ZipFile(archive)) {
      Enumeration<? extends ZipEntry> entries = zip.entries();
      byte[] bytes = new byte[65536];
      while (entries.hasMoreElements()) {
        ZipEntry entry = entries.nextElement();
        if (++count > 6000 || !names.add(entry.getName())) throw new IOException("压缩包条目无效");
        if (entry.getSize() > 8L * 1024 * 1024 * 1024
            || entry.getName().toLowerCase(Locale.ROOT).endsWith(".json")
                && entry.getSize() > 16L * 1048576) throw new IOException("压缩包条目过大");
        File dest = contained(folder, entry.getName());
        if (entry.isDirectory()) {
          dest.mkdirs();
          continue;
        }
        dest.getParentFile().mkdirs();
        try (InputStream in = zip.getInputStream(entry);
            OutputStream out = new FileOutputStream(dest)) {
          int n;
          long written = 0;
          while ((n = in.read(bytes)) >= 0) {
            if (Thread.currentThread().isInterrupted()) throw new IOException("已取消");
            total += n;
            written += n;
            if (entry.getName().toLowerCase(Locale.ROOT).endsWith(".json")
                && written > 16L * 1048576) throw new IOException("压缩包清单过大");
            if (total > 8L * 1024 * 1024 * 1024) throw new IOException("压缩包过大");
            out.write(bytes, 0, n);
          }
        }
      }
    } catch (Exception error) {
      remove(folder);
      throw error;
    }
    try {
      JSONObject p = read(new File(folder, "project.json")),
          hashes = read(new File(folder, "checksums.json"));
      Iterator<String> keys = hashes.keys();
      while (keys.hasNext()) {
        String file = keys.next();
        if (!sha(contained(folder, file)).equalsIgnoreCase(hashes.getString(file)))
          throw new IOException("压缩包校验失败：" + file);
      }
      ProjectValidation.repairLegacyAnalysis(p);
      ProjectValidation.validate(p);
      normalize(p);
      for (String file : media(p)) if (!hashes.has(file)) throw new IOException("媒体缺少校验值");
      String origin = p.optString("originId", p.optString("id", id));
      File[] existing = projects.listFiles();
      if (existing != null)
        for (File directory : existing) {
          if (directory.equals(folder) || !new File(directory, "project.json").isFile()) continue;
          try {
            JSONObject item = get(directory.getName());
            if (item.optString("originId").equals(origin)) {
              remove(folder);
              return item;
            }
          } catch (Exception damagedProject) {
            /* Broken items remain visible in list(). */
          }
        }
      p.put("originId", origin).put("id", id).remove("recordingSettings");
      ProjectValidation.validate(p);
      double measured = 0;
      for (String path : media(p))
        if (path.toLowerCase(Locale.ROOT)
            .matches(".*\\.(wav|mp3|m4a|flac|ogg|aac|mp4|webm|opus)$")) {
          double seconds = AudioFiles.duration(asset(id, path));
          if (seconds < 0) throw new IOException("无法确定音频时长，请先转换为 WAV 或 MP3");
          AudioFiles.checkDuration(seconds);
          measured = Math.max(measured, seconds);
        }
      p.put("duration", Math.max(p.optDouble("duration", 0), measured));
      if (Thread.currentThread().isInterrupted()) throw new IOException("已取消");
      return save(p);
    } catch (Exception error) {
      remove(folder);
      throw error;
    }
  }

  public File pack(String id) throws Exception {
    JSONObject p = get(id);
    File exports = new File(context.getExternalFilesDir(null), "exports");
    exports.mkdirs();
    File file = new File(exports, UUID.randomUUID() + ".ijam");
    JSONObject hashes = new JSONObject();
    try (ZipOutputStream out = new ZipOutputStream(new FileOutputStream(file))) {
      for (String relative : media(p)) {
        File media = asset(id, relative);
        hashes.put(relative, sha(media));
        out.putNextEntry(new ZipEntry(relative));
        Files.copy(media.toPath(), out);
        out.closeEntry();
      }
      out.putNextEntry(new ZipEntry("project.json"));
      p.remove("recordingSettings");
      if (!p.optString("kind").equals("creation") && p.getJSONArray("sourceGroups").length() == 0)
        p.remove("sourceGroups");
      out.write(p.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
      out.closeEntry();
      out.putNextEntry(new ZipEntry("checksums.json"));
      out.write(hashes.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
      out.closeEntry();
    }
    return file;
  }

  public synchronized JSONObject create(JSONObject options) throws Exception {
    String kind = options.getString("kind"), id = UUID.randomUUID().toString();
    if (!List.of("practice", "creation").contains(kind)) throw new IOException("内容类型无效");
    JSONObject p;
    String sourceId = options.optString("sourceId");
    if (!sourceId.isEmpty()) {
      JSONObject source = get(sourceId);
      if (!source.optString("kind").isEmpty()) throw new IOException("请选择音乐库歌曲");
      p = new JSONObject(source.toString());
      JSONArray results = source.getJSONArray("results");
      JSONObject result = null;
      String requested = options.optString("resultId", source.optString("activeResultId"));
      for (int i = 0; i < results.length(); i++)
        if (results.getJSONObject(i).getString("id").equals(requested))
          result = results.getJSONObject(i);
      if (kind.equals("practice") && result == null) throw new IOException("跟练需要选择已分轨的歌曲");
      p.put("results", result == null ? new JSONArray() : new JSONArray().put(result))
          .put("tracks", result == null ? new JSONArray() : result.getJSONArray("tracks"))
          .put("activeResultId", result == null ? JSONObject.NULL : result.getString("id"))
          .put("takes", new JSONArray())
          .put("selectedTakeIds", new JSONArray())
          .put("sourceGroups", new JSONArray())
          .put("presets", new JSONArray());
      p.put(
          "sessionSource",
          new JSONObject()
              .put("projectId", sourceId)
              .put("title", source.getString("title"))
              .put("resultId", requested));
      p.remove("recordingSettings");
      for (String file : media(p)) {
        File dest = asset(id, file);
        dest.getParentFile().mkdirs();
        Files.copy(
            asset(sourceId, file).toPath(), dest.toPath(), StandardCopyOption.REPLACE_EXISTING);
      }
    } else {
      if (kind.equals("practice")) throw new IOException("跟练需要选择已分轨的歌曲");
      File silence = asset(id, "media/original.wav");
      silence.getParentFile().mkdirs();
      AudioFiles.writeSilence(silence);
      p =
          new JSONObject()
              .put("original", "media/original.wav")
              .put("duration", 0)
              .put("artist", "");
    }
    p.put("id", id)
        .put("kind", kind)
        .put("title", options.getString("title"))
        .put("schemaVersion", 1)
        .put("createdAt", now())
        .put("starred", false);
    if (kind.equals("practice")) p.put("practiceMode", options.optString("mode", "instrument"));
    return save(p);
  }

  public void trash(String id) throws Exception {
    File source = dir(id), trash = new File(root, "trash/" + id + "-" + System.currentTimeMillis());
    trash.getParentFile().mkdirs();
    Files.move(source.toPath(), trash.toPath());
  }

  public static void remove(File file) throws IOException {
    if (file.isDirectory()) {
      File[] children = file.listFiles();
      if (children != null) for (File child : children) remove(child);
    }
    if (file.exists() && !file.delete()) throw new IOException("无法清理临时文件");
  }

  public WebResourceResponse response(String path) {
    try {
      int slash = path.indexOf('/');
      if (slash < 1) return null;
      File file = asset(path.substring(0, slash), path.substring(slash + 1));
      String ext = file.getName().replaceFirst(".*\\.", "").toLowerCase(Locale.ROOT);
      String mime =
          ext.equals("wav")
              ? "audio/wav"
              : ext.equals("mp3")
                  ? "audio/mpeg"
                  : ext.equals("mid") ? "audio/midi" : "application/octet-stream";
      return new WebResourceResponse(mime, null, new FileInputStream(file));
    } catch (Exception error) {
      return new WebResourceResponse(
          "text/plain", "UTF-8", 404, "Not found", Map.of(), new ByteArrayInputStream(new byte[0]));
    }
  }
}
