package app.immersejam.mobile.transfer;

import app.immersejam.mobile.ProjectStore;
import java.io.*;
import java.net.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Consumer;
import org.json.*;

public final class LanClient implements AutoCloseable {
  final ProjectStore store;
  final Consumer<JSONObject> emit;
  public final AtomicLong generation = new AtomicLong();
  volatile HttpURLConnection active;
  volatile Thread worker;

  public LanClient(ProjectStore store, Consumer<JSONObject> emit) {
    this.store = store;
    this.emit = emit;
  }

  void check(long version) throws IOException {
    if (version != generation.get() || Thread.currentThread().isInterrupted())
      throw new IOException("已取消");
  }

  public void begin(long version) throws IOException {
    worker = Thread.currentThread();
    check(version);
  }

  public void end() {
    worker = null;
    Thread.interrupted();
  }

  HttpURLConnection open(LanAddress address, String path, long version) throws Exception {
    return open(address.endpoint(path), version);
  }

  HttpURLConnection open(URL url, long version) throws Exception {
    check(version);
    HttpURLConnection connection = (HttpURLConnection) url.openConnection();
    active = connection;
    connection.setConnectTimeout(10000);
    connection.setReadTimeout(30000);
    connection.setInstanceFollowRedirects(false);
    connection.setRequestProperty("Cache-Control", "no-store");
    check(version);
    return connection;
  }

  void status(HttpURLConnection connection) throws IOException {
    if (connection.getResponseCode() != 200)
      throw new IOException("无法配对，请确认二维码未过期，双方位于同一 Wi-Fi 或热点");
  }

  public JSONArray list(String url, long version) throws Exception {
    HttpURLConnection connection = open(new LanAddress(url), "/api/list", version);
    try {
      status(connection);
      ByteArrayOutputStream bytes = new ByteArrayOutputStream();
      try (InputStream in = connection.getInputStream()) {
        byte[] buffer = new byte[8192];
        int n;
        while ((n = in.read(buffer)) != -1) {
          check(version);
          if (bytes.size() + n > 1048576) throw new IOException("歌曲清单过大");
          bytes.write(buffer, 0, n);
        }
      }
      JSONArray list = new JSONArray(bytes.toString("UTF-8"));
      if (list.length() > 1000) throw new IOException("歌曲清单过大");
      for (int i = 0; i < list.length(); i++) {
        JSONObject song = list.getJSONObject(i);
        if (!song.getString("id").matches("[a-f0-9-]{36}")
            || song.getString("title").length() > 1000) throw new IOException("歌曲清单无效");
      }
      return list;
    } finally {
      connection.disconnect();
      if (active == connection) active = null;
    }
  }

  public JSONArray download(String url, JSONArray ids, long version) throws Exception {
    if (ids.length() < 1 || ids.length() > 100) throw new IOException("一次最多传输 100 首歌曲");
    LanAddress address = new LanAddress(url);
    JSONArray result = new JSONArray();
    for (int i = 0; i < ids.length(); i++) {
      String id = ids.getString(i);
      if (!id.matches("[a-f0-9-]{36}")) throw new IOException("歌曲编号无效");
      File parent = new File(store.root, "incoming-files");
      parent.mkdirs();
      File file = new File(parent, UUID.randomUUID() + ".ijam");
      HttpURLConnection connection = open(address, "/api/download/" + id, version);
      try {
        status(connection);
        long expected = connection.getContentLengthLong(), received = 0, last = 0;
        if (expected > 8L * 1024 * 1024 * 1024
            || expected > 0 && parent.getUsableSpace() < expected * 2 + 100L * 1048576)
          throw new IOException("剩余存储空间不足");
        try (InputStream in = connection.getInputStream();
            OutputStream out = new FileOutputStream(file)) {
          byte[] bytes = new byte[65536];
          int n;
          while ((n = in.read(bytes)) != -1) {
            check(version);
            received += n;
            if (received > 8L * 1024 * 1024 * 1024 || parent.getUsableSpace() < 100L * 1048576)
              throw new IOException("文件过大或剩余存储空间不足");
            out.write(bytes, 0, n);
            long now = System.nanoTime();
            if (now - last > 250_000_000) {
              last = now;
              emit.accept(
                  new JSONObject()
                      .put("type", "lan-progress")
                      .put("received", received)
                      .put("index", i + 1)
                      .put("total", ids.length()));
            }
          }
        }
        if (expected >= 0 && received != expected) throw new IOException("文件传输未完成，请重试");
        check(version);
        result.put(store.importArchive(file, UUID.randomUUID().toString()));
        emit.accept(new JSONObject().put("type", "library-changed"));
      } finally {
        file.delete();
        connection.disconnect();
        if (active == connection) active = null;
      }
    }
    return result;
  }

  public boolean upload(String url, JSONArray ids, long version) throws Exception {
    if (ids.length() < 1 || ids.length() > 100) throw new IOException("一次最多传输 100 首歌曲");
    LanAddress address = new LanAddress(url);
    for (int i = 0; i < ids.length(); i++) {
      check(version);
      String id = ids.getString(i);
      File file = store.pack(id);
      HttpURLConnection connection = null;
      try {
        connection =
            open(
                new URL(address.endpoint("/api/upload").toString() + "&name=" + id + ".ijam"),
                version);
        connection.setRequestMethod("POST");
        connection.setDoOutput(true);
        connection.setRequestProperty("Content-Type", "application/zip");
        connection.setFixedLengthStreamingMode(file.length());
        try (InputStream in = new FileInputStream(file);
            OutputStream out = connection.getOutputStream()) {
          byte[] bytes = new byte[65536];
          int n;
          while ((n = in.read(bytes)) != -1) {
            check(version);
            out.write(bytes, 0, n);
          }
        }
        status(connection);
        check(version);
      } finally {
        file.delete();
        if (connection != null) {
          connection.disconnect();
          if (active == connection) active = null;
        }
      }
    }
    return true;
  }

  public void close() {
    generation.incrementAndGet();
    Thread task = worker;
    if (task != null) task.interrupt();
    HttpURLConnection connection = active;
    if (connection != null) connection.disconnect();
    active = null;
  }
}
