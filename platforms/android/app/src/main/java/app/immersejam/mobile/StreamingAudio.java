package app.immersejam.mobile;

import android.webkit.WebResourceResponse;
import app.immersejam.mobile.processing.WaveReader;
import app.immersejam.mobile.processing.PcmWindow;
import java.io.*;
import java.nio.*;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import org.json.*;

/** Disk-backed PCM windows. Song length never determines the playback heap. */
final class StreamingAudio implements AutoCloseable {
  final ProjectStore store;
  volatile boolean closed;
  final Map<String, Session> sessions = new ConcurrentHashMap<>();
  final ExecutorService waveIO = Executors.newSingleThreadExecutor(task -> {
    Thread thread = new Thread(task, "ImmerseWaveform");
    thread.setPriority(Thread.MIN_PRIORITY); return thread;
  });
  static final class Track implements AutoCloseable {
    final String id; final File file; final WaveReader reader;
    Track(String id, File file) throws Exception { this.id = id; this.file = file; reader = new WaveReader(file); }
    public void close() throws IOException { reader.close(); }
  }
  static final class Session {
    final String project;
    final Map<String, Track> tracks = new ConcurrentHashMap<>();
    final List<Track> ordered = new CopyOnWriteArrayList<>();
    final Map<String, Future<byte[]>> waves = new ConcurrentHashMap<>();
    volatile boolean closed;
    Session(String project) { this.project = project; }
  }
  StreamingAudio(ProjectStore store) { this.store = store; }
  JSONObject open(JSONObject d) throws Exception {
    if (closed) throw new IOException("播放器已关闭");
    String project = d.getString("id"), id = UUID.randomUUID().toString();
    JSONObject p = store.get(project);
    Set<String> allowed = new HashSet<>(ProjectStore.media(p));
    JSONArray requested = d.getJSONArray("tracks"), result = new JSONArray();
    if (requested.length() > 64) throw new IOException("同时播放音轨过多，请分成较小的创作项目");
    Session s = new Session(project);
    try {
      for (int i = 0; i < requested.length(); i++) {
        if (closed || Thread.currentThread().isInterrupted()) throw new IOException("已取消");
        JSONObject t = requested.getJSONObject(i);
        String file = t.getString("file"), key = t.getString("id");
        if (!allowed.contains(file) || s.tracks.containsKey(key)) throw new IOException("无效播放音轨");
        File source = store.asset(project, file);
        try (WaveReader check = new WaveReader(source)) { AudioFiles.checkDuration(check.duration()); }
        catch (IOException unsupported) {
          double seconds = AudioFiles.duration(source);
          AudioFiles.checkDuration(seconds);
          File cache = new File(store.context.getCacheDir(), "playback-pcm"); cache.mkdirs();
          String fingerprint = UUID.nameUUIDFromBytes((source.getAbsolutePath()+":"+source.length()+":"+source.lastModified()).getBytes(java.nio.charset.StandardCharsets.UTF_8)).toString();
          File decoded = new File(cache, fingerprint+".wav");
          if (!decoded.isFile()) {
            if (cache.getUsableSpace() < seconds * 44100 * 4 + 100L * 1048576) throw new IOException("解码缓存空间不足，请清理手机存储后重试");
            File part = new File(cache, fingerprint+".part");
            try { AudioFiles.decode(source, part, () -> closed || Thread.currentThread().isInterrupted()); Files.move(part.toPath(), decoded.toPath(), StandardCopyOption.REPLACE_EXISTING); }
            finally { part.delete(); }
          }
          source = decoded;
        }
        Track track = new Track(key, source); s.tracks.put(key, track); s.ordered.add(track);
        result.put(new JSONObject().put("id", key).put("duration", track.reader.duration()));
      }
      synchronized (this) {
        if (closed || Thread.currentThread().isInterrupted()) throw new IOException("已取消");
        sessions.put(id, s);
      }
      return new JSONObject().put("id", id).put("tracks", result);
    } catch (Exception error) { dispose(s); throw error; }
  }
  JSONObject append(JSONObject d) throws Exception {
    Session s = session(d.getString("session"));
    JSONObject project = store.get(s.project);
    JSONArray takes = project.optJSONArray("takes"), requested = d.getJSONArray("tracks"), removed = d.optJSONArray("removed");
    List<Track> opened = new ArrayList<>();
    Set<String> ids = new HashSet<>();
    boolean committed = false;
    try {
      if (requested.length() > 64) throw new IOException("同时播放音轨过多，请分成较小的创作项目");
      for (int i=0;i<requested.length();i++) {
        JSONObject item=requested.getJSONObject(i); String id=item.getString("id"),file=item.getString("file");
        boolean allowed=false;
        for(int n=0;takes!=null&&n<takes.length();n++) {
          JSONObject take=takes.getJSONObject(n);
          if(id.equals(take.getString("id"))&&file.equals(take.getString("file"))) {allowed=true;break;}
        }
        if(!allowed||!ids.add(id)) throw new IOException("无效录音音轨");
        Track track=new Track(id,store.asset(s.project,file));
        opened.add(track); AudioFiles.checkDuration(track.reader.duration());
      }
      JSONArray result=new JSONArray();
      synchronized(s) {
        if(s.closed||closed) throw new IOException("播放已关闭");
        Set<String> retiring = new HashSet<>();
        for (int i = 0; removed != null && i < removed.length(); i++) retiring.add(removed.getString(i));
        if(s.tracks.size()+opened.size()-retiring.stream().filter(s.tracks::containsKey).count()>64) throw new IOException("同时播放音轨过多，请分成较小的创作项目");
        for(Track track:opened) if(s.tracks.containsKey(track.id)) throw new IOException("录音音轨已载入");
        for(String id:retiring) {
          Track track = s.tracks.remove(id);
          if (track == null) continue;
          int slot = s.ordered.indexOf(track);
          if (slot >= 0) s.ordered.set(slot, null); // stable slots for all ongoing backing reads
          synchronized(track) { try { track.close(); } catch(Exception ignored) {} }
        }
        for(Track track:opened) {s.tracks.put(track.id,track);s.ordered.add(track);result.put(new JSONObject().put("id",track.id).put("duration",track.reader.duration()));}
        committed=true;
      }
      return new JSONObject().put("tracks",result);
    } finally { if(!committed)for(Track track:opened)try{track.close();}catch(Exception ignored){} }
  }
  JSONObject wave(JSONObject d) throws Exception {
    Session s = session(d.getString("session"));
    if (s.waves.size() >= 8) throw new IOException("波形任务繁忙，请稍后重试");
    String key = UUID.randomUUID().toString();
    s.waves.put(key, waveIO.submit(() -> cachedEnvelope(s, d)));
    return new JSONObject().put("url", "/stream/"+d.getString("session")+"/wave/"+key);
  }
  Session session(String id) throws IOException {
    Session s = sessions.get(id);
    if (s == null || s.closed) throw new IOException("播放已关闭");
    return s;
  }
  WebResourceResponse response(String path) {
    try {
      String[] parts = path.split("/");
      Session s = session(parts[0]);
      byte[] bytes;
      if (parts.length == 3 && parts[1].equals("wave")) {
        Future<byte[]> task = s.waves.remove(parts[2]);
        if (task == null) throw new IOException("波形任务已结束");
        // Do not compute a whole song on WebView's request interception thread;
        // PCM window requests must stay responsive while an overview is built.
        return new WebResourceResponse("application/octet-stream", null, 200, "OK", Map.of("Cache-Control","no-store"), new InputStream() {
          InputStream data;
          private InputStream input() throws IOException {
            if (data == null) try { data = new ByteArrayInputStream(task.get()); }
            catch (Exception error) { throw new IOException(error); }
            return data;
          }
          public int read() throws IOException { return input().read(); }
          public int read(byte[] out, int offset, int length) throws IOException { return input().read(out,offset,length); }
        });
      } else if ((parts.length == 4 || parts.length == 5) && parts[1].equals("pcm")) {
        int index = Integer.parseInt(parts[2]); long first = Long.parseLong(parts[3]);
        int count = parts.length == 5 ? Integer.parseInt(parts[4]) : 48002;
        if (index < 0 || index >= s.ordered.size() || first < 0 || first > 48000L * AudioFiles.MAX_SECONDS) throw new IOException("无效音频窗口");
        Track t = s.ordered.get(index);
        if (t == null) throw new IOException("录音音轨已卸载");
        synchronized(t) {
          if (s.closed) throw new IOException("播放已关闭");
          bytes = PcmWindow.read(t.reader, first, count);
        }
      } else throw new IOException("无效播放请求");
      return new WebResourceResponse("application/octet-stream", null, 200, "OK", Map.of("Cache-Control","no-store"), new ByteArrayInputStream(bytes));
    } catch (Exception error) {
      return new WebResourceResponse("text/plain", "UTF-8", 400, "Unavailable", Map.of(), new ByteArrayInputStream(String.valueOf(error.getMessage()).getBytes(java.nio.charset.StandardCharsets.UTF_8)));
    }
  }
  byte[] cachedEnvelope(Session s, JSONObject d) throws Exception {
    StringBuilder stamp = new StringBuilder();
    JSONObject layout = new JSONObject(d.toString()); layout.remove("session");
    stamp.append(layout.toString());
    for (Track track : s.ordered) if(track != null) stamp.append(track.file.getAbsolutePath()).append(':').append(track.file.length()).append(':').append(track.file.lastModified());
    String key = UUID.nameUUIDFromBytes(stamp.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8)).toString();
    File folder = new File(store.context.getCacheDir(), "playback-waves"); folder.mkdirs();
    File file = new File(folder, key + ".bin");
    long expected = (long)Math.ceil(d.getDouble("duration")*100)*4;
    if (file.isFile() && file.length() == expected) { file.setLastModified(System.currentTimeMillis()); return Files.readAllBytes(file.toPath()); }
    byte[] data = envelope(s,d);
    if (!s.closed) {
      Files.write(file.toPath(),data);
      File[] files = folder.listFiles(); long total = 0;
      if (files != null) {
        Arrays.sort(files, Comparator.comparingLong(File::lastModified));
        for (File item : files) total += item.length();
        for (File item : files) { if (total <= 64L*1048576) break; long size=item.length(); if (item.delete()) total-=size; }
      }
    }
    return data;
  }
  byte[] envelope(Session s, JSONObject d) throws Exception {
    double origin=d.getDouble("origin"), duration=d.getDouble("duration"), master=d.getDouble("master");
    if (!Double.isFinite(origin) || !Double.isFinite(duration) || duration < 0 || duration > AudioFiles.MAX_SECONDS*2 || !Double.isFinite(master)) throw new IOException("无效波形范围");
    JSONArray layout=d.getJSONArray("tracks");
    if (layout.length() > s.tracks.size()) throw new IOException("无效波形音轨");
    List<WaveReader> readers=new ArrayList<>();
    double[][] coefficients = new double[layout.length()][5];
    try {
      for(int j=0;j<layout.length();j++) {
        Track track=s.tracks.get(layout.getJSONObject(j).getString("id"));
        if(track==null) throw new IOException("音轨已变化");
        readers.add(new WaveReader(track.file));
        JSONObject t=layout.getJSONObject(j);
        double pan=Math.max(-1,Math.min(1,t.optDouble("pan",0))), gain=t.optDouble("gain",1);
        coefficients[j]=new double[]{t.optDouble("start",0),
          (pan<=0 ? 1 : Math.cos(pan*Math.PI/2))*gain,
          (pan<=0 ? Math.cos((pan+1)*Math.PI/2) : 0)*gain,
          (pan<=0 ? 0 : Math.sin(pan*Math.PI/2))*gain,
          (pan<=0 ? Math.sin((pan+1)*Math.PI/2) : 1)*gain};
      }
      int count=(int)Math.ceil(duration*100);
      ByteBuffer out=ByteBuffer.allocate(count*4).order(ByteOrder.LITTLE_ENDIAN);
      for(int bin=0;bin<count;bin++) {
        if(s.closed || Thread.currentThread().isInterrupted()) throw new IOException("播放已关闭");
        float peak=0;
        // A bounded overview, sampled across each 10 ms bin. Playback uses all samples.
        for(int k=0;k<16;k++) {
          double time=origin+bin/100.0+k/1600.0, l=0,r=0;
          for(int j=0;j<readers.size();j++) {
            WaveReader reader=readers.get(j); double[] weights=coefficients[j];
            double position=time-weights[0];
            if(position<0 || position>=reader.duration()) continue;
            double a=reader.sample(position,0),b=reader.sample(position,1);
            l+=a*weights[1]+b*weights[2]; r+=a*weights[3]+b*weights[4];
          }
          peak=(float)Math.max(peak, Math.max(Math.abs(l),Math.abs(r))*master);
        }
        out.putFloat(peak);
      }
      return out.array();
    } finally { for(WaveReader r:readers) r.close(); }
  }
  void dispose(Session s) {
    synchronized(s) {s.closed=true;} for (Future<byte[]> wave : s.waves.values()) wave.cancel(true); s.waves.clear();
    for(Track t:s.tracks.values()) synchronized(t) { try {t.close();}catch(Exception ignored){} }
  }
  void close(String id) { Session s=sessions.remove(id); if(s!=null) dispose(s); }
  public synchronized void close() { closed=true; for(String id:new ArrayList<>(sessions.keySet())) close(id); waveIO.shutdownNow(); }
}
