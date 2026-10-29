package app.immersejam.mobile;

import android.media.*;
import java.io.*;
import java.nio.*;
import java.util.function.BooleanSupplier;

public final class AudioFiles {
  public static final int MAX_SECONDS = 44 * 60;

  public static void checkDuration(double seconds) throws IOException {
    if (!Double.isFinite(seconds) || seconds < 0 || seconds > MAX_SECONDS)
      throw new IOException("Android 音频最长 44 分钟，请先裁剪后导入");
  }

  public static double duration(File input) throws Exception {
    MediaExtractor reader = new MediaExtractor();
    try {
      reader.setDataSource(input.getAbsolutePath());
      for (int i = 0; i < reader.getTrackCount(); i++) {
        MediaFormat format = reader.getTrackFormat(i);
        if (format.getString(MediaFormat.KEY_MIME).startsWith("audio/")
            && format.containsKey(MediaFormat.KEY_DURATION))
          return format.getLong(MediaFormat.KEY_DURATION) / 1000000.0;
      }
      return -1;
    } finally {
      reader.release();
    }
  }

  public static void header(RandomAccessFile out, long frames, int rate, int bits, int format)
      throws IOException {
    ByteBuffer b = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN);
    int bytes = bits / 8 * 2;
    b.put("RIFF".getBytes())
        .putInt((int) (36 + frames * bytes))
        .put("WAVEfmt ".getBytes())
        .putInt(16)
        .putShort((short) format)
        .putShort((short) 2)
        .putInt(rate)
        .putInt(rate * bytes)
        .putShort((short) bytes)
        .putShort((short) bits)
        .put("data".getBytes())
        .putInt((int) (frames * bytes));
    out.seek(0);
    out.write(b.array());
  }

  public static void writeSilence(File file) throws IOException {
    try (RandomAccessFile out = new RandomAccessFile(file, "rw")) {
      header(out, 0, 44100, 16, 1);
    }
  }

  public static File decode(File input, File output, BooleanSupplier cancelled) throws Exception {
    output.getParentFile().mkdirs();
    MediaExtractor extractor = new MediaExtractor();
    MediaCodec codec = null;
    try (RandomAccessFile out = new RandomAccessFile(output, "rw")) {
      extractor.setDataSource(input.getAbsolutePath());
      int selected = -1;
      for (int i = 0; i < extractor.getTrackCount(); i++)
        if (extractor.getTrackFormat(i).getString(MediaFormat.KEY_MIME).startsWith("audio/")) {
          selected = i;
          break;
        }
      if (selected < 0) throw new IOException("文件中没有音频");
      extractor.selectTrack(selected);
      MediaFormat format = extractor.getTrackFormat(selected);
      if (format.containsKey(MediaFormat.KEY_DURATION))
        checkDuration(format.getLong(MediaFormat.KEY_DURATION) / 1000000.0);
      format.setInteger(MediaFormat.KEY_PCM_ENCODING, AudioFormat.ENCODING_PCM_16BIT);
      codec = MediaCodec.createDecoderByType(format.getString(MediaFormat.KEY_MIME));
      codec.configure(format, null, null, 0);
      codec.start();
      header(out, 0, 44100, 16, 1);
      out.seek(44);
      MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
      boolean inputEnd = false, done = false;
      int rate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE),
          channels = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT),
          encoding = AudioFormat.ENCODING_PCM_16BIT;
      long inputFrame = 0, frames = 0, lastActivity = System.nanoTime();
      double next = 0, previousL = 0, previousR = 0;
      ByteBuffer bytes = ByteBuffer.allocate(65536).order(ByteOrder.LITTLE_ENDIAN);
      while (!done) {
        if (cancelled.getAsBoolean()) throw new IOException("已取消");
        if (System.nanoTime() - lastActivity > 30_000_000_000L) throw new IOException("音频解码超时");
        if (!inputEnd) {
          int slot = codec.dequeueInputBuffer(10000);
          if (slot >= 0) {
            ByteBuffer buffer = codec.getInputBuffer(slot);
            int n = extractor.readSampleData(buffer, 0);
            if (n < 0) {
              codec.queueInputBuffer(slot, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM);
              inputEnd = true;
            } else {
              codec.queueInputBuffer(slot, 0, n, extractor.getSampleTime(), 0);
              extractor.advance();
            }
          }
        }
        int slot = codec.dequeueOutputBuffer(info, 10000);
        if (slot == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
          MediaFormat actual = codec.getOutputFormat();
          rate = actual.getInteger(MediaFormat.KEY_SAMPLE_RATE);
          channels = actual.getInteger(MediaFormat.KEY_CHANNEL_COUNT);
          encoding =
              actual.containsKey(MediaFormat.KEY_PCM_ENCODING)
                  ? actual.getInteger(MediaFormat.KEY_PCM_ENCODING)
                  : AudioFormat.ENCODING_PCM_16BIT;
        } else if (slot >= 0) {
          ByteBuffer data = codec.getOutputBuffer(slot).order(ByteOrder.LITTLE_ENDIAN);
          data.position(info.offset);
          data.limit(info.offset + info.size);
          int width = encoding == AudioFormat.ENCODING_PCM_FLOAT ? 4 : 2;
          while (data.remaining() >= width * channels) {
            double left = 0, right = 0;
            for (int c = 0; c < channels; c++) {
              double sample = width == 4 ? data.getFloat() : data.getShort() / 32768.0;
              if (c == 0) left = sample;
              if (c == 1) right = sample;
            }
            if (channels == 1) right = left;
            while (next <= inputFrame) {
              double frac = inputFrame == 0 ? 1 : Math.max(0, Math.min(1, next - (inputFrame - 1)));
              double l = previousL + (left - previousL) * frac,
                  r = previousR + (right - previousR) * frac;
              bytes
                  .putShort((short) Math.round(Math.max(-1, Math.min(.99997, l)) * 32768))
                  .putShort((short) Math.round(Math.max(-1, Math.min(.99997, r)) * 32768));
              frames++;
              if (frames > 44100L * MAX_SECONDS)
                throw new IOException("Android 音频最长 44 分钟，请先裁剪后导入");
              next += (double) rate / 44100;
              if (bytes.remaining() < 4) {
                out.write(bytes.array(), 0, bytes.position());
                bytes.clear();
              }
            }
            previousL = left;
            previousR = right;
            inputFrame++;
          }
          if (info.size > 0) lastActivity = System.nanoTime();
          done = (info.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0;
          codec.releaseOutputBuffer(slot, false);
        }
      }
      if (bytes.position() > 0) out.write(bytes.array(), 0, bytes.position());
      if (frames == 0) throw new IOException("音频为空");
      header(out, frames, 44100, 16, 1);
    } finally {
      if (codec != null) {
        codec.stop();
        codec.release();
      }
      extractor.release();
    }
    return output;
  }

  public static float[][] readPcm(File wav, long start, int frames) throws IOException {
    float[][] result = new float[2][frames];
    try (RandomAccessFile in = new RandomAccessFile(wav, "r")) {
      in.seek(44 + Math.max(0, start) * 4);
      byte[] bytes = new byte[frames * 4];
      int n = in.read(bytes);
      if (n < 0) return result;
      ByteBuffer data = ByteBuffer.wrap(bytes, 0, n).order(ByteOrder.LITTLE_ENDIAN);
      for (int i = 0; i < n / 4; i++) {
        result[0][i] = data.getShort() / 32768f;
        result[1][i] = data.getShort() / 32768f;
      }
    }
    return result;
  }

  public static void appendPcm(RandomAccessFile out, float[][] samples, int count)
      throws IOException {
    ByteBuffer bytes = ByteBuffer.allocate(count * 4).order(ByteOrder.LITTLE_ENDIAN);
    for (int i = 0; i < count; i++)
      for (int c = 0; c < 2; c++) {
        float v = samples[c][i];
        if (!Float.isFinite(v)) throw new IOException("模型输出无效数值");
        bytes.putShort((short) Math.round(Math.max(-1, Math.min(.99997, v)) * 32768));
      }
    out.write(bytes.array());
  }
}
