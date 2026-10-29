package app.immersejam.mobile;

import android.util.Base64;
import java.io.*;
import java.security.MessageDigest;
import java.util.*;
import java.util.function.Consumer;
import org.json.*;

/** Bounded file storage behind the shared encrypted WebRTC data channel. */
final class PeerFiles implements AutoCloseable {
  final ProjectStore store;
  final Consumer<JSONObject> emit;
  final Map<String, Outgoing> outgoing = new java.util.concurrent.ConcurrentHashMap<>();
  final Map<String, Incoming> incoming = new java.util.concurrent.ConcurrentHashMap<>(),
      pending = new java.util.concurrent.ConcurrentHashMap<>();
  volatile boolean disposed;

  static class Outgoing {
    File file;
    RandomAccessFile reader;
    JSONObject metadata;
  }

  static class Incoming {
    File file;
    OutputStream out;
    MessageDigest hash;
    long size, received;
    String name, expected;
  }

  PeerFiles(ProjectStore store, Consumer<JSONObject> emit) {
    this.store = store;
    this.emit = emit;
  }

  JSONArray prepare(JSONArray ids) throws Exception {
    if (disposed) throw new IOException("应用正在关闭");
    if (ids.length() > 100) throw new IOException("一次最多传输 100 首歌曲");
    closeOutgoing();
    try {
      for (int i = 0; i < ids.length(); i++) {
        JSONObject p = store.get(ids.getString(i));
        File file = store.pack(p.getString("id"));
        Outgoing item = new Outgoing();
        item.file = file;
        try {
          item.metadata =
              new JSONObject()
                  .put("id", UUID.randomUUID().toString())
                  .put("name", p.getString("title") + ".ijam")
                  .put("size", file.length())
                  .put("sha256", ProjectStore.sha(file));
          item.reader = new RandomAccessFile(file, "r");
          outgoing.put(item.metadata.getString("id"), item);
          if (disposed) {
            closeOutgoing();
            throw new IOException("已取消");
          }
        } catch (Exception error) {
          file.delete();
          throw error;
        }
      }
      return outgoing();
    } catch (Exception error) {
      closeOutgoing();
      throw error;
    }
  }

  JSONArray outgoing() {
    JSONArray list = new JSONArray();
    for (Outgoing item : outgoing.values()) list.put(item.metadata);
    return list;
  }

  String read(JSONObject d) throws Exception {
    Outgoing item = outgoing.get(d.getString("id"));
    long offset = d.getLong("offset");
    if (item == null || offset < 0 || offset > item.file.length()) throw new IOException("无效传输片段");
    byte[] bytes = new byte[(int) Math.min(48 * 1024, item.file.length() - offset)];
    item.reader.seek(offset);
    item.reader.readFully(bytes);
    return Base64.encodeToString(bytes, Base64.NO_WRAP);
  }

  String begin(JSONObject d) throws Exception {
    if (!incoming.isEmpty()) throw new IOException("已有文件正在接收");
    Object length = d.opt("size");
    if (!(length instanceof Number)) throw new IOException("文件清单无效");
    long size = ((Number) length).longValue();
    if (((Number) length).doubleValue() != size
        || size < 1
        || size > 8L * 1024 * 1024 * 1024
        || !d.optString("sha256").matches("[a-f0-9]{64}")) throw new IOException("文件清单无效");
    if (store.root.getUsableSpace() < size * 2 + 100L * 1048576) throw new IOException("剩余存储空间不足");
    String id = UUID.randomUUID().toString();
    Incoming item = new Incoming();
    item.size = size;
    item.name = d.optString("name", "Song.ijam");
    item.expected = d.getString("sha256");
    item.hash = MessageDigest.getInstance("SHA-256");
    File folder = new File(store.root, "incoming-files");
    folder.mkdirs();
    item.file = new File(folder, id + ".ijam");
    item.out = new FileOutputStream(item.file);
    incoming.put(id, item);
    return id;
  }

  long append(JSONObject d) throws Exception {
    Incoming item = incoming.get(d.getString("id"));
    String chunk = d.getString("chunk");
    if (item == null || d.getLong("offset") != item.received || chunk.length() > 65536)
      throw new IOException("传输片段顺序无效");
    byte[] bytes = Base64.decode(chunk, Base64.NO_WRAP);
    if (bytes.length == 0 || item.received + bytes.length > item.size)
      throw new IOException("文件长度无效");
    item.out.write(bytes);
    item.hash.update(bytes);
    item.received += bytes.length;
    return item.received;
  }

  boolean finish(String id) throws Exception {
    Incoming item = incoming.remove(id);
    if (item == null) throw new IOException("传输已失效");
    try {
      item.out.close();
      item.out = null;
      StringBuilder hash = new StringBuilder();
      for (byte b : item.hash.digest()) hash.append(String.format(Locale.ROOT, "%02x", b & 255));
      if (item.received != item.size || !hash.toString().equals(item.expected))
        throw new IOException("接收校验失败，请重新发送");
      pending.put(id, item);
      emit.accept(
          new JSONObject()
              .put("type", "incoming")
              .put("id", id)
              .put("name", item.name)
              .put("size", item.size)
              .put("remote", true));
      return true;
    } catch (Exception error) {
      item.file.delete();
      throw error;
    }
  }

  Object select(String id, boolean accept) throws Exception {
    Incoming item = pending.remove(id);
    if (item == null) throw new IOException("待接收文件不存在");
    try {
      if (!accept) return null;
      JSONObject p = store.importArchive(item.file, UUID.randomUUID().toString());
      emit.accept(new JSONObject().put("type", "library-changed"));
      return new JSONArray().put(p);
    } finally {
      item.file.delete();
    }
  }

  void closeOutgoing() {
    for (Outgoing item : outgoing.values()) {
      try {
        item.reader.close();
      } catch (Exception ignored) {
      }
      item.file.delete();
    }
    outgoing.clear();
  }

  public void close() {
    closeOutgoing();
    for (Incoming item : incoming.values()) {
      try {
        if (item.out != null) item.out.close();
      } catch (Exception ignored) {
      }
      item.file.delete();
    }
    incoming.clear();
    for (Incoming item : pending.values()) item.file.delete();
    pending.clear();
  }

  void dispose() {
    disposed = true;
    close();
  }
}
