package app.immersejam.mobile;

import android.content.Context;
import android.media.*;
import android.os.Process;
import android.webkit.WebResourceResponse;
import java.io.*;
import java.nio.*;
import java.util.*;
import org.json.*;

/** Foreground capture independent of Chromium's microphone/device constraints. */
final class NativeCapture implements AutoCloseable {
  private final MainActivity activity;
  private final AudioManager manager;
  private Session current;
  private boolean closed;
  NativeCapture(MainActivity activity) {
    this.activity = activity;
    manager = (AudioManager) activity.getSystemService(Context.AUDIO_SERVICE);
  }
  JSONArray devices(boolean permission) throws Exception {
    if (permission) activity.requireMicrophone();
    JSONArray result = new JSONArray();
    for (AudioDeviceInfo device : manager.getDevices(AudioManager.GET_DEVICES_INPUTS)) {
      result.put(new JSONObject().put("deviceId", "android:" + device.getId())
          .put("kind", "audioinput").put("label", device.getProductName().toString()));
    }
    return result;
  }
  JSONObject open(JSONObject d) throws Exception {
    activity.requireMicrophone();
    synchronized (this) {
      if (closed) throw new IOException("录音窗口已关闭");
      if (current != null) throw new IOException("已有录音正在进行");
      AudioDeviceInfo preferred = null;
      String id = d.optString("device", "default");
      if (id.startsWith("android:")) {
        for (AudioDeviceInfo device : manager.getDevices(AudioManager.GET_DEVICES_INPUTS))
          if (id.equals("android:" + device.getId())) preferred = device;
        if (preferred == null) throw new IOException("录音设备已断开，请刷新设备列表");
      }
      // PCM16 is supported more widely than WebRTC's requested stereo input.
      // Try stereo for USB interfaces, then mono for phone/headset microphones.
      Exception failure = null;
      for (int source : new int[] {MediaRecorder.AudioSource.VOICE_RECOGNITION, MediaRecorder.AudioSource.MIC}) {
        for (int channels : new int[] {2, 1}) {
          AudioRecord record = null;
          try {
            int mask = channels == 2 ? AudioFormat.CHANNEL_IN_STEREO : AudioFormat.CHANNEL_IN_MONO;
            int size = AudioRecord.getMinBufferSize(48000, mask, AudioFormat.ENCODING_PCM_16BIT);
            if (size <= 0) continue;
            record = new AudioRecord.Builder().setAudioSource(source)
                .setAudioFormat(new AudioFormat.Builder().setSampleRate(48000).setChannelMask(mask)
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT).build())
                .setBufferSizeInBytes(Math.max(size * 4, 48000 * channels / 2)).build();
            if (record.getState() != AudioRecord.STATE_INITIALIZED) throw new IOException("输入初始化失败");
            if (preferred != null && !record.setPreferredDevice(preferred)) throw new IOException("无法选择录音设备");
            if (channels == 1 && d.optString("channel").equals("right"))
              throw new IOException("所选输入只有一个声道，请选择单声道或左声道");
            record.startRecording();
            if (record.getRecordingState() != AudioRecord.RECORDSTATE_RECORDING) throw new IOException("输入未开始");
            current = new Session(record, channels, d.optString("channel", "stereo"));
            current.thread.start();
            return new JSONObject().put("id", current.id).put("sampleRate", 48000).put("channels", channels);
          } catch (Exception error) {
            failure = error;
            if (record != null) record.release();
          }
        }
      }
      throw new IOException("无法启动录音输入，请检查系统麦克风开关、其他录音应用及所选设备。" +
          (failure == null ? "" : " " + failure.getMessage()));
    }
  }
  synchronized void stop(String id) {
    if (current != null && (id == null || current.id.equals(id))) current.stop();
  }
  synchronized void dispose(String id) {
    if (current != null && current.id.equals(id)) {
      current.stop();
      current = null;
    }
  }
  WebResourceResponse response(String path) {
    try {
      String[] parts = path.split("/");
      Session session;
      synchronized (this) { session = current; }
      if (parts.length != 2 || !parts[1].equals("read") || session == null || !session.id.equals(parts[0]))
        throw new IOException("录音会话已结束");
      byte[] packet;
      synchronized (session) {
        long until = System.nanoTime() + 300_000_000L;
        while (session.packets.isEmpty() && !session.ended && System.nanoTime() < until) session.wait(50);
        if (!session.packets.isEmpty()) packet = session.packets.removeFirst();
        else if (session.failure != null) throw new IOException(session.failure);
        else if (session.ended) return new WebResourceResponse("application/octet-stream", null, 204, "Done", Map.of("Cache-Control", "no-store"), new ByteArrayInputStream(new byte[0]));
        else packet = new byte[0];
      }
      return new WebResourceResponse("application/octet-stream", null, 200, "OK", Map.of("Cache-Control", "no-store"), new ByteArrayInputStream(packet));
    } catch (Exception error) {
      return new WebResourceResponse("text/plain", "UTF-8", 400, "Capture error", Map.of("Cache-Control", "no-store"),
          new ByteArrayInputStream(error.getMessage().getBytes(java.nio.charset.StandardCharsets.UTF_8)));
    }
  }
  @Override public synchronized void close() {
    closed = true;
    if (current != null) current.stop();
    current = null;
  }
  private static final class Session {
    final String id = UUID.randomUUID().toString();
    final AudioRecord record;
    final int channels;
    final String channel;
    final ArrayDeque<byte[]> packets = new ArrayDeque<>();
    final Thread thread;
    volatile boolean stopping, ended;
    volatile String failure;
    Session(AudioRecord record, int channels, String channel) {
      this.record = record; this.channels = channels; this.channel = channel;
      thread = new Thread(this::read, "ImmerseCapture");
    }
    void stop() {
      stopping = true;
      try { record.stop(); } catch (IllegalStateException ignored) {}
    }
    void read() {
      Process.setThreadPriority(Process.THREAD_PRIORITY_AUDIO);
      short[] data = new short[4096 * channels];
      AudioTimestamp timestamp = new AudioTimestamp();
      long frames = 0;
      double origin = Double.NaN;
      try {
        while (!stopping) {
          int n = record.read(data, 0, data.length, AudioRecord.READ_BLOCKING);
          if (n <= 0) { if (!stopping) throw new IOException("录音设备已断开，已保留收到的录音"); break; }
          int count = n / channels;
          if (Double.isNaN(origin)) {
            // Let the hardware timestamp settle before publishing calibration
            // samples. Arming starts later, so this warm-up is never saved.
            if (frames + count < 48000 * .18) { frames += count; continue; }
            origin = record.getTimestamp(timestamp, AudioTimestamp.TIMEBASE_MONOTONIC) == AudioRecord.SUCCESS
                ? timestamp.nanoTime / 1e9 - timestamp.framePosition / 48000.0
                : System.nanoTime() / 1e9 - (frames + count) / 48000.0;
          }
          ByteBuffer packet = ByteBuffer.allocate(8 + count * 8).order(ByteOrder.LITTLE_ENDIAN);
          packet.putDouble(origin + frames / 48000.0);
          for (int i = 0; i < count; i++) {
            float left = data[i * channels] / 32768f;
            float right = channels == 1 ? left : data[i * channels + 1] / 32768f;
            if (channel.equals("left")) right = left;
            else if (channel.equals("right")) left = right;
            else if (channel.equals("mono")) left = right = (left + right) / 2;
            packet.putFloat(left).putFloat(right);
          }
          frames += count;
          synchronized (this) {
            if (packets.size() >= 24) throw new IOException("录音处理跟不上输入，已保留收到的录音，请保存后重试");
            packets.add(packet.array()); notifyAll();
          }
          if (frames >= 48000L * 44 * 60) throw new IOException("本次录音已达到 44 分钟，请保存后继续");
        }
      } catch (Exception error) { failure = error.getMessage(); }
      finally {
        record.release();
        synchronized (this) { ended = true; notifyAll(); }
      }
    }
  }
}
