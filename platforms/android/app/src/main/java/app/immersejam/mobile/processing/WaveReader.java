package app.immersejam.mobile.processing;

import java.io.*;
import java.nio.*;

/** Small random-access PCM cache; supports RIFF/RF64, integer PCM and float WAV. */
public final class WaveReader implements AutoCloseable {
  final RandomAccessFile in;
  public final int rate, channels, bits, format;
  public final long frames;
  final long data;
  long cached = -1;
  int cachedFrames;
  byte[] cache;

  public WaveReader(File file) throws IOException {
    in = new RandomAccessFile(file, "r");
    try {
      byte[] tag = new byte[12];
      in.readFully(tag);
      String riff = new String(tag, 0, 4, java.nio.charset.StandardCharsets.US_ASCII);
      if ((!riff.equals("RIFF") && !riff.equals("RF64")) || !new String(tag, 8, 4).equals("WAVE"))
        throw new IOException("Not PCM WAV");
      int r = 0, c = 0, b = 0, f = 0;
      long start = 0, length = 0, large = 0;
      while (in.getFilePointer() + 8 <= in.length()) {
        byte[] h = new byte[8];
        in.readFully(h);
        String name = new String(h, 0, 4);
        long size =
            Integer.toUnsignedLong(
                ByteBuffer.wrap(h, 4, 4).order(ByteOrder.LITTLE_ENDIAN).getInt());
        long pos = in.getFilePointer();
        if (name.equals("ds64") && size >= 28) {
          in.seek(pos + 8);
          large = Long.reverseBytes(in.readLong());
        }
        if (name.equals("fmt ") && size >= 16) {
          byte[] fmt = new byte[16];
          in.readFully(fmt);
          ByteBuffer v = ByteBuffer.wrap(fmt).order(ByteOrder.LITTLE_ENDIAN);
          f = Short.toUnsignedInt(v.getShort());
          c = Short.toUnsignedInt(v.getShort());
          r = v.getInt();
          v.position(14);
          b = Short.toUnsignedInt(v.getShort());
          if (f == 0xfffe && size >= 40) {
            in.seek(pos + 24);
            f = Short.reverseBytes(in.readShort()) & 65535;
          }
        }
        if (name.equals("data")) {
          start = pos;
          length = size == 0xffffffffL ? large : size;
          break;
        }
        if (size > in.length() - pos) throw new IOException("Invalid WAV chunk");
        in.seek(pos + size + (size & 1));
      }
      if (start == 0
          || r < 8000
          || r > 192000
          || c < 1
          || c > 8
          || !((f == 1 && (b == 16 || b == 24 || b == 32)) || (f == 3 && b == 32))
          || length < 0
          || length > in.length() - start) throw new IOException("Unsupported WAV format");
      rate = r;
      channels = c;
      bits = b;
      format = f;
      data = start;
      frames = length / (channels * bits / 8);
      cache = new byte[8192 * channels * bits / 8];
    } catch (IOException error) {
      in.close();
      throw error;
    }
  }

  float at(long frame, int channel) throws IOException {
    if (frame < 0 || frame >= frames) return 0;
    if (frame < cached || frame >= cached + cachedFrames) {
      cached = frame / 8192 * 8192;
      cachedFrames = (int) Math.min(8192, frames - cached);
      in.seek(data + cached * channels * bits / 8);
      in.readFully(cache, 0, cachedFrames * channels * bits / 8);
    }
    int
        p =
            (int) (frame - cached) * channels * (bits / 8)
                + Math.min(channels - 1, channel) * (bits / 8),
        v = (cache[p] & 255) | ((cache[p + 1] & 255) << 8);
    if (bits >= 24) v |= (cache[p + 2] & 255) << 16;
    if (bits == 32) v |= cache[p + 3] << 24;
    float result =
        format == 3
            ? Float.intBitsToFloat(v)
            : bits == 16
                ? (short) v / 32768f
                : bits == 24 ? (v << 8 >> 8) / 8388608f : v / 2147483648f;
    if (!Float.isFinite(result)) throw new IOException("音频包含无效采样");
    return result;
  }

  public float sample(double seconds, int channel) throws IOException {
    double position = seconds * rate;
    long frame = (long) Math.floor(position);
    double fraction = position - frame;
    return (float) (at(frame, channel) * (1 - fraction) + at(frame + 1, channel) * fraction);
  }

  public double duration() {
    return (double) frames / rate;
  }

  public void close() throws IOException {
    in.close();
  }
}
