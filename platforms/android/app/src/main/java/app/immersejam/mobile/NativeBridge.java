package app.immersejam.mobile;

import android.app.ActivityManager;
import android.content.*;
import android.net.Uri;
import android.os.*;
import androidx.core.content.FileProvider;
import androidx.webkit.JavaScriptReplyProxy;
import app.immersejam.mobile.transfer.LanClient;
import java.io.*;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import org.json.*;

public class NativeBridge {
  final MainActivity activity;
  final ProjectStore store;
  final NativeTakes takes;
  final Updates updates = new Updates();
  final PeerFiles peers;
  final NativeAudio audio;
  final StreamingAudio streaming;
  final NativeCapture capture;
  final ExecutorService captureIO = Executors.newSingleThreadExecutor();
  final ExecutorService playbackIO = Executors.newSingleThreadExecutor();
  final LanClient lan;
  final ExecutorService transfers = Executors.newSingleThreadExecutor();
  final Set<String> allowed = new HashSet<>();
  final Handler main = new Handler(Looper.getMainLooper());
  final ExecutorService downloads = Executors.newSingleThreadExecutor();
  volatile JavaScriptReplyProxy events;
  NativeBridge(MainActivity activity) {
    this.activity = activity;
    store = new ProjectStore(activity);
    takes = new NativeTakes(store);
    peers = new PeerFiles(store, this::emit);
    audio = new NativeAudio(store, takes);
    streaming = new StreamingAudio(store);
    capture = new NativeCapture(activity);
    lan = new LanClient(store, this::emit);
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
                  "android-pointer-style",
                  "android-playback-state",
                  "android-capture-devices", "android-capture-open", "android-capture-clock", "android-capture-stop", "android-capture-close",
                  "android-stream-open", "android-stream-close", "android-stream-wave", "android-stream-append",
                  "android-playback-budget",
                  "android-device",
                  "android-render-start",
                  "android-render-read",
                  "android-render-append",
                  "android-render-finish",
                  "android-render-abort",
                  "android-share-projects",
                  "android-take-normalize",
                  "android-take-recovery-list",
                  "android-scan-pair",
                  "android-lan-list",
                  "android-lan-download",
                  "android-lan-upload",
                  "android-lan-cancel")
              .contains(method)) throw new IOException("Unsupported operation");
      events = reply;
      boolean network = method.startsWith("android-lan-") && !method.equals("android-lan-cancel");
      if (network) data.put("_generation", lan.generation.get());
      JSONObject arguments = data;
      (network || method.equals("android-scan-pair")
              ? transfers
              : method.startsWith("android-capture-") ? captureIO : method.startsWith("android-stream-") ? playbackIO : method.equals("model-download") ? downloads : activity.io)
          .execute(
              () -> {
                try {
                  if (network) lan.begin(arguments.getLong("_generation"));
                  Object value = call(method, arguments);
                  respond(reply, id, value, null);
                } catch (Exception error) {
                  respond(
                      reply,
                      id,
                      null,
                      network && arguments.optLong("_generation") != lan.generation.get()
                          ? "已取消"
                          : Objects.requireNonNullElse(error.getMessage(), error.toString()));
                } finally {
                  if (network) lan.end();
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
      return new JSONObject().put("type", "error").put("message", message);
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
      case "android-pointer-style":
        activity.pointerStyle(d.getString("style"));
        return true;
      case "android-capture-devices": return capture.devices(d.optBoolean("permission"));
      case "android-capture-open": return capture.open(d);
      case "android-capture-clock": return new JSONObject().put("seconds", System.nanoTime() / 1e9);
      case "android-capture-stop": capture.stop(d.getString("session")); return true;
      case "android-capture-close": capture.dispose(d.getString("session")); return true;
      case "android-stream-open": return streaming.open(d);
      case "android-stream-append": return streaming.append(d);
      case "android-stream-wave": return streaming.wave(d);
      case "android-stream-close": streaming.close(d.getString("session")); return true;
      case "android-playback-state":
        return activity.playback(d.optBoolean("playing"), d.optString("title", "Immerse Jam"));
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
      case "android-scan-pair":
        return activity.scan();
      case "android-lan-list":
        return lan.list(d.getString("url"), d.getLong("_generation"));
      case "android-lan-download":
        return lan.download(d.getString("url"), d.getJSONArray("ids"), d.getLong("_generation"));
      case "android-lan-upload":
        return lan.upload(d.getString("url"), d.getJSONArray("ids"), d.getLong("_generation"));
      case "android-lan-cancel":
        lan.close();
        return true;
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
      case "android-take-normalize":
        return audio.startTake(d.getString("sessionId"));
      case "android-take-recovery-list":
        return takes.restore(d.getString("id"));
      case "android-render-read":
        return audio.read(d.getString("id"));
      case "android-render-append":
        return audio.append(d);
      case "android-render-finish":
        {
          Object result = audio.finish(d.getString("id"));
          if (result instanceof File) {
            File file = (File) result;
            share(file, "audio/wav");
            return file.getName();
          }
          return result;
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
      case "update-check":
        return updates.check();
      case "update-download":
        updates.open(activity);
        return true;
      case "runtime-status":
        return new JSONObject()
            .put("ready", true)
            .put("mode", "player")
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
      case "models": return new JSONArray();
      case "model-download":
      case "model-import":
        throw new IOException("手机端仅支持外部导入的音轨与分析");
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
        return store.update(d.getString("id"), d.getJSONObject("patch"));
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
          if (method.equals("result-select") && (d.isNull("resultId") || d.optString("resultId").isEmpty()))
            return store.save(p.put("tracks", new JSONArray()).put("activeResultId", JSONObject.NULL));
          if (method.equals("result-rename") && (d.optString("name").trim().isEmpty() || d.optString("name").length() > 120))
            throw new IOException("请输入 1–120 字的结果名称");
          JSONArray results = p.getJSONArray("results");
          boolean found = false;
          for (int i = 0; i < results.length(); i++) {
            JSONObject result = results.getJSONObject(i);
            if (result.getString("id").equals(d.getString("resultId"))) {
              found = true;
              if (method.equals("result-select"))
                p.put("tracks", result.getJSONArray("tracks"))
                    .put("activeResultId", result.getString("id"));
              else result.put("name", d.getString("name").trim());
            }
          }
          if (!found) throw new IOException("分离结果不存在");
          return store.save(p);
        }
      case "result-delete":
        return store.deleteResult(d.getString("id"), d.getString("resultId"));
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
      case "attachment-delete":
      case "creation-remove-group":
        {
          JSONObject p = store.get(d.getString("id"));
          java.util.Set<String> candidates = new java.util.LinkedHashSet<>();
          boolean attachment = method.equals("attachment-delete");
          String key = attachment ? "attachments" : "sourceGroups";
          String itemId = d.getString(attachment ? "attachmentId" : "groupId");
          if (!attachment && !p.optString("kind").equals("creation")) throw new IOException("分轨分组数据无效");
          if (!attachment && itemId.equals("source") && p.has("sessionSource")) {
            p.remove("sessionSource"); p.remove("sourceMix");
          } else {
            JSONArray items = p.getJSONArray(key), remaining = new JSONArray();
            boolean found = false;
            for (int i = 0; i < items.length(); i++) {
              JSONObject item = items.getJSONObject(i);
              if (!item.getString("id").equals(itemId)) { remaining.put(item); continue; }
              found = true;
              if (attachment) {
                candidates.add(item.getString("file"));
                if (item.getString("name").toLowerCase(java.util.Locale.ROOT).matches(".*\\.(gp[345x]?|gtp|musicxml|mxl|xml|mid|midi)$")) {
                  if (!p.isNull("scoreMidi")) candidates.add(p.optString("scoreMidi"));
                  p.put("scoreMidi", JSONObject.NULL); p.put("alignment", JSONObject.NULL);
                }
              } else {
                JSONArray tracks = item.getJSONArray("tracks");
                for (int j = 0; j < tracks.length(); j++) candidates.add(tracks.getJSONObject(j).getString("file"));
              }
            }
            if (!found) throw new IOException(attachment ? "附件不存在" : "分轨分组数据无效");
            p.put(key, remaining);
          }
          candidates.removeAll(ProjectStore.media(p));
          java.util.List<File> files = new java.util.ArrayList<>();
          for (String file : candidates) if (!file.isEmpty()) files.add(store.asset(p.getString("id"), file));
          JSONObject saved = store.save(p);
          for (File file : files) Files.deleteIfExists(file.toPath());
          return saved;
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
        return takes.remove(d.getString("id"), d.getString("takeId"));
      case "take-deleted":
        return takes.deleted(d.getString("id"));
      case "take-restore":
        return takes.restoreDeleted(d.getString("id"), d.getString("takeId"));
      case "take-import":
        {
          JSONObject p = store.get(d.getString("id"));
          for (Uri uri : activity.select(new String[] {"audio/*"}))
            p = takes.importUri(p, uri, d.optDouble("position", 0));
          return p;
        }
      case "take-open":
        return true;
      case "creation-add-group":
        return addGroup(d);
      case "creation-import-group":
        throw new IOException("请先将 .ijam 导入音乐库，再添加音乐库中的分轨分组。");
      case "run": throw new IOException("手机端仅支持外部导入的音轨与分析");
      case "cancel": return true;
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
    if (!Set.of("create", "rename", "delete", "move").contains(action)) throw new IOException("分类操作无效");
    if (d.has("cover")) ProjectValidation.validateCover(d.opt("cover"));
    String name = d.optString("name").trim();
    boolean exists = false;
    for (int i = 0; i < list.length(); i++) {
      JSONObject folder = list.getJSONObject(i);
      if (folder.getString("id").equals(id)) exists = true;
      if ((action.equals("create") || action.equals("rename")) && !folder.getString("id").equals(id) && folder.getString("name").equalsIgnoreCase(name)) throw new IOException("已有同名分类");
    }
    if (action.equals("create") || action.equals("rename")) {
      if (name.isEmpty() || name.length() > 60) throw new IOException("分类名称需要 1–60 个字");
      if (action.equals("create") && list.length() >= 200) throw new IOException("分类数量已达上限");
    }
    if (!action.equals("create") && !exists && !(action.equals("move") && id.isEmpty())) throw new IOException("分类不存在");
    if (action.equals("move")) store.get(project);
    if (action.equals("create"))
      list.put(
          new JSONObject()
              .put("id", UUID.randomUUID().toString())
              .put("name", name)
              .put("cover", d.optString("cover", ""))
              .put("projectIds", new JSONArray()));
    for (int i = 0; i < list.length(); i++) {
      JSONObject folder = list.getJSONObject(i);
      if (action.equals("delete") && folder.getString("id").equals(id)) continue;
      if (action.equals("rename") && folder.getString("id").equals(id)) {
        folder.put("name", name);
        if (d.has("cover")) folder.put("cover", d.getString("cover"));
      }
      if (action.equals("move")) {
        JSONArray old = folder.getJSONArray("projectIds"), ids = new JSONArray();
        for (int j = 0; j < old.length(); j++)
          if (!old.getString(j).equals(project)) ids.put(old.get(j));
        if (folder.getString("id").equals(id)) ids.put(project);
        folder.put("projectIds", ids);
      }
      next.put(folder);
    }
    ProjectStore.write(new File(store.root, "folders.json"), new JSONObject().put("schemaVersion", 1).put("folders", next));
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
                .put("start", d.optDouble("position", 0)));
    p.put(
        "duration",
        Math.max(
            p.optDouble("duration", 0),
            d.optDouble("position", 0) + source.optDouble("duration", 0)));
    return store.save(p);
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
    capture.close();
    captureIO.shutdownNow();
    streaming.close();
    playbackIO.shutdownNow();
    takes.close();
    peers.dispose();
    audio.close();
    downloads.shutdownNow();
    transfers.shutdownNow();
    lan.close();
  }
}
