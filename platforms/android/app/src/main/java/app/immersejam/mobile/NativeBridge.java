package app.immersejam.mobile;

import android.app.ActivityManager;
import android.content.*;
import android.net.Uri;
import android.os.*;
import androidx.core.content.FileProvider;
import androidx.webkit.JavaScriptReplyProxy;
import app.immersejam.mobile.inference.InferenceService;
import java.io.*;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import org.json.*;

public class NativeBridge {
  final MainActivity activity;
  final ProjectStore store;
  final NativeTakes takes;
  final PeerFiles peers;
  final NativeAudio audio;
  final Set<String> allowed = new HashSet<>();
  final Handler main = new Handler(Looper.getMainLooper());
  final ExecutorService downloads = Executors.newSingleThreadExecutor();
  volatile JavaScriptReplyProxy events;
  Messenger inference;
  boolean bound = false, running = false;
  volatile boolean cancelRequested = false, sent = false;
  String jobId;
  final ServiceConnection connection =
      new ServiceConnection() {
        public void onServiceConnected(ComponentName name, IBinder binder) {
          inference = new Messenger(binder);
        }

        public void onServiceDisconnected(ComponentName name) {
          inference = null;
          if (running) {
            running = false;
            emit(errorEvent("分离进程已停止，原有音轨已保留。请关闭其他应用后重试。"));
          }
        }
      };

  NativeBridge(MainActivity activity) {
    this.activity = activity;
    store = new ProjectStore(activity);
    takes = new NativeTakes(store);
    peers = new PeerFiles(store, this::emit);
    audio = new NativeAudio(store);
    try {
      JSONArray methods =
          new JSONArray(
              new String(
                  ProjectStore.bytes(activity.getAssets().open("ipc-methods.json")),
                  java.nio.charset.StandardCharsets.UTF_8));
      for (int i = 0; i < methods.length(); i++) allowed.add(methods.getString(i));
    } catch (Exception error) {
      throw new IllegalStateException(error);
    }
  }

  public void receive(String message, JavaScriptReplyProxy reply) {
    if (message == null || message.length() > 2_000_000) return;
    try {
      JSONObject request = new JSONObject(message);
      int id = request.getInt("id");
      String method = request.getString("method");
      JSONObject data = request.optJSONObject("data");
      if (data == null) data = new JSONObject();
      if (!allowed.contains(method)
          && !Set.of(
                  "android-back-result",
                  "android-playback-budget",
                  "android-device",
                  "android-render-start",
                  "android-render-read",
                  "android-render-append",
                  "android-render-finish",
                  "android-render-abort",
                  "android-share-projects")
              .contains(method)) throw new IOException("Unsupported operation");
      events = reply;
      JSONObject arguments = data;
      (method.equals("model-download") ? downloads : activity.io)
          .execute(
              () -> {
                try {
                  Object value = call(method, arguments);
                  respond(reply, id, value, null);
                } catch (Exception error) {
                  respond(
                      reply,
                      id,
                      null,
                      Objects.requireNonNullElse(error.getMessage(), error.toString()));
                }
              });
    } catch (Exception error) {
      android.util.Log.w("ImmerseBridge", "Invalid request", error);
    }
  }

  void respond(JavaScriptReplyProxy reply, int id, Object result, String error) {
    main.post(
        () -> {
          try {
            JSONObject message = new JSONObject().put("id", id);
            if (error != null) message.put("error", error);
            else message.put("result", result == null ? JSONObject.NULL : result);
            reply.postMessage(message.toString());
          } catch (Exception ignored) {
          }
        });
  }

  public void emit(JSONObject event) {
    main.post(
        () -> {
          try {
            if (events != null) events.postMessage(new JSONObject().put("event", event).toString());
          } catch (Exception ignored) {
          }
        });
  }

  JSONObject errorEvent(String message) {
    try {
      return new JSONObject().put("type", "error").put("jobId", jobId).put("message", message);
    } catch (Exception error) {
      throw new IllegalStateException(error);
    }
  }

  JSONObject device() throws Exception {
    ActivityManager manager = (ActivityManager) activity.getSystemService(Context.ACTIVITY_SERVICE);
    ActivityManager.MemoryInfo info = new ActivityManager.MemoryInfo();
    manager.getMemoryInfo(info);
    return new JSONObject()
        .put("availableMb", info.availMem / 1048576)
        .put("totalMb", info.totalMem / 1048576)
        .put("lowMemory", info.lowMemory || manager.isLowRamDevice())
        .put("abi", Build.SUPPORTED_ABIS[0])
        .put("sdk", Build.VERSION.SDK_INT);
  }

  Object call(String method, JSONObject d) throws Exception {
    switch (method) {
      case "android-back-result":
        activity.backResult(d.optBoolean("handled"));
        return true;
      case "android-device":
        return device();
      case "android-playback-budget":
        {
          long estimate = d.getLong("bytes");
          JSONObject device = device();
          long limit = Math.min(320L * 1048576, device.getLong("availableMb") * 1048576 / 4);
          if (estimate > limit) throw new IOException("这首歌的多轨解码超出当前手机内存预算。请先在电脑导出需要的分轨，或减少挂载的音轨。");
          return true;
        }
      case "library":
        return store.list();
      case "android-share-projects":
        {
          JSONArray ids = d.getJSONArray("ids");
          if (ids.length() < 1 || ids.length() > 100) throw new IOException("一次最多分享 100 首歌曲");
          ArrayList<Uri> files = new ArrayList<>();
          for (int i = 0; i < ids.length(); i++)
            files.add(
                FileProvider.getUriForFile(
                    activity, activity.getPackageName() + ".files", store.pack(ids.getString(i))));
          activity.runOnUiThread(
              () -> {
                Intent intent =
                    new Intent(Intent.ACTION_SEND_MULTIPLE)
                        .setType("application/octet-stream")
                        .putParcelableArrayListExtra(Intent.EXTRA_STREAM, files)
                        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                ClipData clip = ClipData.newRawUri("Immerse Jam", files.get(0));
                for (int i = 1; i < files.size(); i++)
                  clip.addItem(new ClipData.Item(files.get(i)));
                intent.setClipData(clip);
                activity.startActivity(Intent.createChooser(intent, "Immerse Jam"));
              });
          return true;
        }
      case "android-render-start":
        return audio.start(d);
      case "android-render-read":
        return audio.read(d.getString("id"));
      case "android-render-append":
        return audio.append(d);
      case "android-render-finish":
        {
          File file = audio.finish(d.getString("id"));
          share(file, "audio/wav");
          return file.getName();
        }
      case "android-render-abort":
        audio.abort(d.getString("id"));
        return true;
      case "peer-prepare":
        return peers.prepare(d.getJSONArray("ids"));
      case "peer-outgoing":
        return peers.outgoing();
      case "peer-read":
        return peers.read(d);
      case "peer-begin":
        return peers.begin(d);
      case "peer-append":
        return peers.append(d);
      case "peer-finish":
        return peers.finish(d.getString("id"));
      case "peer-select":
        return peers.select(d.getString("id"), d.optBoolean("accept"));
      case "peer-close":
        peers.close();
        return true;
      case "project-recover":
        return store.recover(d.getString("id"));
      case "runtime-status":
        return new JSONObject()
            .put("ready", true)
            .put("mode", "android-cpu")
            .put("installing", false)
            .put("libraryPath", store.root.getAbsolutePath())
            .put("runtimePath", new File(activity.getFilesDir(), "models").getAbsolutePath())
            .put("device", device());
      case "runtime-install":
      case "audio-tools-ensure":
        return new JSONObject().put("ready", true);
      case "ui-language":
        activity
            .getSharedPreferences("ui", Context.MODE_PRIVATE)
            .edit()
            .putString("language", d.optString("language", "en"))
            .apply();
        return true;
      case "window":
        return true;
      case "models":
        return models();
      case "model-download":
        {
          JSONObject spec = model(d.getString("id"));
          ensureModel(spec);
          emit(
              new JSONObject()
                  .put("scope", "model-download")
                  .put("modelId", spec.getString("id"))
                  .put("type", "complete"));
          return models();
        }
      case "model-import":
        throw new IOException("Android 预览版暂只启用已验证的随包模型；外部移动模型适配正在开发。");
      case "import":
        {
          JSONArray imported = new JSONArray();
          for (Uri uri :
              activity.select(
                  new String[] {
                    "audio/*", "video/*", "application/zip", "application/octet-stream"
                  })) imported.put(store.importUri(uri));
          emit(new JSONObject().put("type", "library-changed"));
          return imported;
        }
      case "session-create":
        return store.create(d);
      case "creation-new":
        return store.create(
            new JSONObject().put("kind", "creation").put("title", d.optString("title", "我的创作")));
      case "update":
        {
          JSONObject p = store.get(d.getString("id")), patch = d.getJSONObject("patch");
          Iterator<String> keys = patch.keys();
          while (keys.hasNext()) {
            String key = keys.next();
            if (!Set.of("id", "original", "playback").contains(key)) p.put(key, patch.get(key));
          }
          return store.save(p);
        }
      case "project-delete":
        store.trash(d.getString("id"));
        return true;
      case "folders-list":
        return folders();
      case "folders-edit":
        return editFolders(d);
      case "result-select":
      case "result-rename":
        {
          JSONObject p = store.get(d.getString("id"));
          JSONArray results = p.getJSONArray("results");
          boolean found = false;
          for (int i = 0; i < results.length(); i++) {
            JSONObject result = results.getJSONObject(i);
            if (result.getString("id").equals(d.getString("resultId"))) {
              found = true;
              if (method.equals("result-select"))
                p.put("tracks", result.getJSONArray("tracks"))
                    .put("activeResultId", result.getString("id"));
              else result.put("name", d.getString("name"));
            }
          }
          if (!found) throw new IOException("分离结果不存在");
          return store.save(p);
        }
      case "result-open":
      case "reveal":
        return true;
      case "export":
        {
          File file = store.pack(d.getString("id"));
          share(file, "application/zip");
          return file.getName();
        }
      case "export-audio":
        {
          File file = audio.stems(d.getString("id"));
          share(file, "application/zip");
          return file.getName();
        }
      case "attach":
        {
          JSONObject p = store.get(d.getString("id"));
          if (d.has("midiBytes")) {
            JSONArray bytes = d.getJSONArray("midiBytes");
            byte[] content = new byte[bytes.length()];
            for (int i = 0; i < content.length; i++) content[i] = (byte) bytes.getInt(i);
            File file = store.asset(p.getString("id"), "attachments/score.mid");
            file.getParentFile().mkdirs();
            Files.write(file.toPath(), content);
            p.put("scoreMidi", "attachments/score.mid");
          } else
            for (Uri uri : activity.select(new String[] {"*/*"})) {
              String name = store.name(uri),
                  id = UUID.randomUUID().toString(),
                  file = "attachments/" + id + "-" + name.replaceAll("[^\\p{L}\\p{N}._ -]", "_");
              store.copyUri(uri, store.asset(p.getString("id"), file));
              p.getJSONArray("attachments")
                  .put(new JSONObject().put("id", id).put("name", name).put("file", file));
            }
          return store.save(p);
        }
      case "read-attachment":
        {
          JSONObject p = store.get(d.getString("id"));
          JSONArray attachments = p.getJSONArray("attachments");
          for (int i = 0; i < attachments.length(); i++) {
            JSONObject a = attachments.getJSONObject(i);
            if (a.getString("id").equals(d.getString("attachmentId"))) {
              File file = store.asset(p.getString("id"), a.getString("file"));
              if (file.length() > 32 * 1048576) throw new IOException("乐谱文件过大");
              byte[] bytes = Files.readAllBytes(file.toPath());
              JSONArray result = new JSONArray();
              for (byte b : bytes) result.put(b & 255);
              return result;
            }
          }
          throw new IOException("附件不存在");
        }
      case "take-start":
        return takes.start(d.getString("id"), d.getJSONObject("options"));
      case "take-append":
        return takes.append(d);
      case "take-finish":
        return takes.finish(d.getString("sessionId"));
      case "take-recover":
        return takes.recover(d.getString("id"));
      case "take-select":
        {
          JSONObject p = store.get(d.getString("id"));
          p.put("selectedTakeIds", d.getJSONArray("takeIds"));
          return store.save(p);
        }
      case "take-delete":
        {
          JSONObject p = store.get(d.getString("id"));
          String id = d.getString("takeId");
          JSONArray takes = p.getJSONArray("takes"),
              remaining = new JSONArray(),
              selected = new JSONArray();
          for (int i = 0; i < takes.length(); i++)
            if (!takes.getJSONObject(i).getString("id").equals(id)) remaining.put(takes.get(i));
          JSONArray ids = p.getJSONArray("selectedTakeIds");
          for (int i = 0; i < ids.length(); i++)
            if (!ids.getString(i).equals(id)) selected.put(ids.get(i));
          p.put("takes", remaining).put("selectedTakeIds", selected);
          return store.save(p);
        }
      case "take-import":
        {
          JSONObject p = store.get(d.getString("id"));
          for (Uri uri : activity.select(new String[] {"audio/*"}))
            p = takes.importUri(p, uri, d.optDouble("position"));
          return p;
        }
      case "take-open":
        return true;
      case "creation-add-group":
        return addGroup(d);
      case "creation-import-group":
        throw new IOException("请先将 .ijam 导入音乐库，再添加音乐库中的分轨分组。");
      case "run":
        return run(d);
      case "cancel":
        if (d.has("jobId") && !d.getString("jobId").equals(jobId)) return false;
        cancelRequested = true;
        if (sent && inference != null) {
          Message m = Message.obtain(null, 2);
          inference.send(m);
        }
        return true;
      case "feedback-open":
        activity.runOnUiThread(
            () ->
                activity.openExternal(
                    Uri.parse(
                        d.optString("target").equals("email")
                            ? "mailto:meowmeowneko999@gmail.com"
                            : "https://github.com/Kreeli/immerse-jam/issues/new")));
        return true;
      case "open-license-folder":
        activity.runOnUiThread(
            () ->
                activity.openExternal(
                    Uri.parse(
                        "https://github.com/Kreeli/immerse-jam/blob/main/docs/LICENSING.md")));
        return true;
      case "migration-detect":
      case "migration-scan":
        return new JSONArray();
      default:
        throw new IOException("此功能尚在 Android 适配中；现有文件会保留。");
    }
  }

  JSONArray folders() throws Exception {
    File file = new File(store.root, "folders.json");
    return file.isFile() ? ProjectStore.read(file).getJSONArray("folders") : new JSONArray();
  }

  JSONArray editFolders(JSONObject d) throws Exception {
    JSONArray list = folders(), next = new JSONArray();
    String action = d.getString("action"),
        id = d.optString("id"),
        project = d.optString("projectId");
    if (action.equals("create"))
      list.put(
          new JSONObject()
              .put("id", UUID.randomUUID().toString())
              .put("name", d.getString("name"))
              .put("projectIds", new JSONArray()));
    for (int i = 0; i < list.length(); i++) {
      JSONObject folder = list.getJSONObject(i);
      if (action.equals("delete") && folder.getString("id").equals(id)) continue;
      if (action.equals("rename") && folder.getString("id").equals(id))
        folder.put("name", d.getString("name"));
      if (action.equals("move")) {
        JSONArray old = folder.getJSONArray("projectIds"), ids = new JSONArray();
        for (int j = 0; j < old.length(); j++)
          if (!old.getString(j).equals(project)) ids.put(old.get(j));
        if (folder.getString("id").equals(id)) ids.put(project);
        folder.put("projectIds", ids);
      }
      next.put(folder);
    }
    ProjectStore.write(new File(store.root, "folders.json"), new JSONObject().put("folders", next));
    return next;
  }

  JSONObject addGroup(JSONObject d) throws Exception {
    JSONObject p = store.get(d.getString("id")), source = store.get(d.getString("sourceId"));
    String id = UUID.randomUUID().toString(),
        resultId = d.optString("resultId", source.optString("activeResultId"));
    JSONArray tracks = source.getJSONArray("tracks");
    JSONArray results = source.getJSONArray("results");
    for (int i = 0; i < results.length(); i++)
      if (results.getJSONObject(i).getString("id").equals(resultId))
        tracks = results.getJSONObject(i).getJSONArray("tracks");
    JSONArray copied = new JSONArray();
    for (int i = 0; i < tracks.length(); i++) {
      JSONObject t = new JSONObject(tracks.getJSONObject(i).toString());
      String file = "groups/" + id + "/" + i + ".wav";
      File dest = store.asset(p.getString("id"), file);
      dest.getParentFile().mkdirs();
      Files.copy(store.asset(source.getString("id"), t.getString("file")).toPath(), dest.toPath());
      t.put("file", file).put("id", id + ":" + t.getString("id")).put("groupId", id);
      copied.put(t);
    }
    p.getJSONArray("sourceGroups")
        .put(
            new JSONObject()
                .put("id", id)
                .put("name", source.getString("title"))
                .put("sourceTitle", source.getString("title"))
                .put("tracks", copied)
                .put("gain", 1)
                .put("mute", false)
                .put("solo", false)
                .put("start", d.optDouble("position")));
    p.put(
        "duration",
        Math.max(p.optDouble("duration"), d.optDouble("position") + source.optDouble("duration")));
    return store.save(p);
  }

  JSONArray models() throws Exception {
    JSONArray source =
        new JSONArray(
            new String(
                ProjectStore.bytes(activity.getAssets().open("model-catalog.json")),
                java.nio.charset.StandardCharsets.UTF_8));
    for (int i = 0; i < source.length(); i++)
      source
          .getJSONObject(i)
          .put(
              "installed",
              source.getJSONObject(i).optBoolean("bundled")
                  || new File(
                          activity.getFilesDir(),
                          "models/" + source.getJSONObject(i).getString("file"))
                      .isFile());
    return source;
  }

  JSONObject model(String id) throws Exception {
    JSONArray models = models();
    for (int i = 0; i < models.length(); i++)
      if (models.getJSONObject(i).getString("id").equals(id)) return models.getJSONObject(i);
    throw new IOException("模型不存在");
  }

  File ensureModel(JSONObject spec) throws Exception {
    File file = new File(activity.getFilesDir(), "models/" + spec.getString("file"));
    if (!file.isFile()) {
      file.getParentFile().mkdirs();
      File part = new File(file.getPath() + ".part");
      if (spec.optBoolean("bundled")) {
        try (InputStream in = activity.getAssets().open("models/" + spec.getString("file"))) {
          Files.copy(in, part.toPath(), StandardCopyOption.REPLACE_EXISTING);
        }
      } else {
        java.net.URL url = new java.net.URL(spec.getString("modelUrl"));
        if (!url.getProtocol().equals("https")) throw new IOException("Model URL must use HTTPS");
        java.net.HttpURLConnection connection = (java.net.HttpURLConnection) url.openConnection();
        connection.setConnectTimeout(20000);
        connection.setReadTimeout(30000);
        connection.setInstanceFollowRedirects(true);
        if (connection.getResponseCode() != 200)
          throw new IOException("Model download failed: " + connection.getResponseCode());
        long size = spec.getLong("sizeBytes"), received = 0, last = 0;
        if (file.getParentFile().getUsableSpace() < size * 2 + 100L * 1048576)
          throw new IOException("模型存储空间不足");
        try (InputStream in = connection.getInputStream();
            OutputStream out = new FileOutputStream(part)) {
          byte[] bytes = new byte[65536];
          int n;
          while ((n = in.read(bytes)) >= 0) {
            received += n;
            if (received > size) throw new IOException("Model size mismatch");
            out.write(bytes, 0, n);
            long now = android.os.SystemClock.elapsedRealtime();
            if (now - last > 250) {
              last = now;
              emit(
                  new JSONObject()
                      .put("type", "progress")
                      .put("scope", "model-download")
                      .put("modelId", spec.getString("id"))
                      .put("progress", (double) received / size)
                      .put("message", "Downloading model"));
            }
          }
        } finally {
          connection.disconnect();
        }
        if (received != size) throw new IOException("Model size mismatch");
      }
      if (!ProjectStore.sha(part).equals(spec.getString("sha256"))) {
        part.delete();
        throw new IOException("模型校验失败");
      }
      Files.move(part.toPath(), file.toPath(), StandardCopyOption.REPLACE_EXISTING);
    }
    if (!ProjectStore.sha(file).equals(spec.getString("sha256"))) {
      file.delete();
      throw new IOException("模型校验失败");
    }
    return file;
  }

  Object run(JSONObject d) throws Exception {
    if (running) throw new IOException("已有本地处理正在进行");
    String operation = d.optString("operation");
    if (!Set.of("separate", "analyze").contains(operation))
      throw new IOException("Android 自动节拍／和弦模型正在适配，可使用手动校准或导入电脑识别结果。");
    boolean separating = operation.equals("separate");
    JSONObject existing = store.get(d.getString("id")).optJSONObject("analysis");
    boolean keepRhythm =
        !separating
            && !d.optBoolean("refreshRhythm")
            && existing != null
            && existing.optJSONArray("beats") != null
            && existing.getJSONArray("beats").length() >= 4;
    JSONObject
        spec =
            separating
                ? model(d.optString("modelId", "uvr-mobile"))
                : keepRhythm ? new JSONObject() : model("beat-this-mobile"),
        device = device();
    if ((device.optBoolean("lowMemory") && !keepRhythm)
        || device.getLong("availableMb")
            < spec.optInt("minimumAvailableMb", separating ? 900 : 200))
      throw new IOException("当前可用内存不足，暂不启动本地分轨。请关闭其他应用；已有分轨仍可播放。");
    if (separating
        && !spec.optBoolean("bundled")
        && !new File(activity.getFilesDir(), "models/" + spec.getString("file")).isFile())
      throw new IOException("请先在设置中下载所选移动模型");
    if (separating || !keepRhythm) spec.put("path", ensureModel(spec).getAbsolutePath());
    if (!separating && !keepRhythm) {
      File mel = new File(activity.getFilesDir(), "models/" + spec.getString("melFile"));
      mel.getParentFile().mkdirs();
      if (!mel.isFile())
        try (InputStream in = activity.getAssets().open("models/" + spec.getString("melFile"))) {
          Files.copy(in, mel.toPath(), StandardCopyOption.REPLACE_EXISTING);
        }
      if (!ProjectStore.sha(mel).equals(spec.getString("melSha256"))) {
        mel.delete();
        throw new IOException("节拍特征校验失败");
      }
      spec.put("melPath", mel.getAbsolutePath());
    }
    jobId = UUID.randomUUID().toString();
    JSONObject request =
        new JSONObject(d.toString())
            .put("jobId", jobId)
            .put("root", store.root.getAbsolutePath())
            .put("model", spec);
    request.put("keepRhythm", keepRhythm);
    running = true;
    cancelRequested = false;
    sent = false;
    Intent intent = new Intent(activity, InferenceService.class);
    activity.runOnUiThread(
        () -> {
          try {
            activity.startForegroundService(intent);
            if (!bound) {
              bound = activity.bindService(intent, connection, Context.BIND_AUTO_CREATE);
            }
            sendWhenBound(request, SystemClock.elapsedRealtime() + 15000);
          } catch (Exception error) {
            running = false;
            emit(errorEvent(error.getMessage()));
          }
        });
    return new JSONObject().put("jobId", jobId);
  }

  void sendWhenBound(JSONObject request, long deadline) {
    if (!running || !request.optString("jobId").equals(jobId)) return;
    if (cancelRequested) {
      running = false;
      if (bound) {
        activity.unbindService(connection);
        bound = false;
        inference = null;
      }
      activity.stopService(new Intent(activity, InferenceService.class));
      try {
        emit(new JSONObject().put("type", "cancelled").put("jobId", jobId));
      } catch (Exception ignored) {
      }
      return;
    }
    if (inference == null) {
      if (SystemClock.elapsedRealtime() > deadline) {
        running = false;
        emit(errorEvent("分离进程未能启动"));
        return;
      }
      main.postDelayed(() -> sendWhenBound(request, deadline), 100);
      return;
    }
    try {
      Message message = Message.obtain(null, 1);
      Bundle bundle = new Bundle();
      bundle.putString("request", request.toString());
      message.setData(bundle);
      message.replyTo =
          new Messenger(
              new Handler(
                  Looper.getMainLooper(),
                  reply -> {
                    try {
                      JSONObject e = new JSONObject(reply.getData().getString("event"));
                      if (Set.of("complete", "error", "cancelled").contains(e.getString("type"))) {
                        running = false;
                        if (bound) {
                          activity.unbindService(connection);
                          bound = false;
                          inference = null;
                        }
                      }
                      if (e.has("processingPatch")) {
                        activity.io.execute(
                            () -> {
                              try {
                                e.put("result", store.get(e.getString("projectId")));
                                emit(e);
                              } catch (Exception error) {
                                emit(errorEvent(error.getMessage()));
                              }
                            });
                      } else if (e.has("separationResult")) {
                        activity.io.execute(
                            () -> {
                              try {
                                JSONObject p = store.get(e.getString("projectId")),
                                    result = e.getJSONObject("separationResult");
                                boolean present = false;
                                for (int i = 0; i < p.getJSONArray("results").length(); i++)
                                  if (p.getJSONArray("results")
                                      .getJSONObject(i)
                                      .getString("id")
                                      .equals(result.getString("id"))) present = true;
                                if (!present) p.getJSONArray("results").put(result);
                                p.put("activeResultId", result.getString("id"))
                                    .put("tracks", result.getJSONArray("tracks"));
                                e.put("result", store.save(p));
                                emit(e);
                              } catch (Exception error) {
                                emit(errorEvent(error.getMessage()));
                              }
                            });
                      } else emit(e);
                    } catch (Exception ignored) {
                    }
                    return true;
                  }));
      inference.send(message);
      sent = true;
      if (cancelRequested) {
        Message cancel = Message.obtain(null, 2);
        inference.send(cancel);
      }
    } catch (Exception error) {
      running = false;
      emit(errorEvent(error.getMessage()));
    }
  }

  void share(File file, String mime) {
    activity.runOnUiThread(
        () -> {
          Uri uri =
              FileProvider.getUriForFile(activity, activity.getPackageName() + ".files", file);
          Intent intent =
              new Intent(Intent.ACTION_SEND)
                  .setType(mime)
                  .putExtra(Intent.EXTRA_STREAM, uri)
                  .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
          activity.startActivity(Intent.createChooser(intent, "Immerse Jam"));
        });
  }

  void close() {
    takes.close();
    peers.dispose();
    audio.close();
    downloads.shutdownNow();
    if (bound) activity.unbindService(connection);
  }
}
