package app.immersejam.mobile.processing;

import java.io.*;
import java.util.*;

/** SMF 0/1 reader with a global tempo map. Parsing is independent of Android and playback. */
public final class MidiScore {
  public static final class Note {
    public double start, end;
    public int pitch, velocity, program;
    public boolean drum;
  }

  static final class Raw {
    long start, end;
    int pitch, velocity, program, channel;
  }

  static final class Tempo {
    long tick;
    int microseconds;

    Tempo(long tick, int us) {
      this.tick = tick;
      microseconds = us;
    }
  }

  public final List<Note> notes = new ArrayList<>();
  public double duration;

  public static MidiScore read(File file) throws IOException {
    if (file.length() > 32L * 1048576) throw new IOException("MIDI 文件过大");
    try (DataInputStream in = new DataInputStream(new FileInputStream(file))) {
      if (in.readInt() != 0x4d546864) throw new IOException("MIDI 文件头无效");
      int header = in.readInt(),
          format = in.readUnsignedShort(),
          tracks = in.readUnsignedShort(),
          division = in.readUnsignedShort();
      if (header < 6
          || header > 1024
          || format > 1
          || tracks < 1
          || tracks > 1000
          || format == 0 && tracks != 1
          || division == 0) throw new IOException("仅支持格式 0/1 MIDI");
      skip(in, header - 6);
      List<Tempo> tempos = new ArrayList<>();
      tempos.add(new Tempo(0, 500000));
      List<Raw> notes = new ArrayList<>();
      int started = 0;
      for (int track = 0; track < tracks; track++) {
        if (in.readInt() != 0x4d54726b) throw new IOException("MIDI 音轨无效");
        int length = in.readInt();
        if (length < 0 || length > 32 * 1048576) throw new IOException("MIDI 音轨过大");
        byte[] bytes = new byte[length];
        in.readFully(bytes);
        DataInputStream data = new DataInputStream(new ByteArrayInputStream(bytes));
        long tick = 0;
        int running = 0;
        int[] programs = new int[16];
        Map<Integer, List<Raw>> active = new HashMap<>();
        while (data.available() > 0) {
          tick += variable(data);
          int status = data.readUnsignedByte(), first = -1;
          if (status < 128) {
            if (running == 0) throw new IOException("MIDI running status 无效");
            first = status;
            status = running;
          } else if (status < 240) running = status;
          if (status == 255) {
            int type = data.readUnsignedByte(), n = variable(data);
            if (n > data.available()) throw new EOFException();
            if (type == 81 && n == 3) {
              int us =
                  (data.readUnsignedByte() << 16)
                      | (data.readUnsignedByte() << 8)
                      | data.readUnsignedByte();
              if (us <= 0) throw new IOException("MIDI 速度无效");
              if (tempos.size() >= 100000) throw new IOException("MIDI 速度事件过多");
              tempos.add(new Tempo(tick, us));
            } else skip(data, n);
            if (type == 47) break;
            continue;
          }
          if (status == 240 || status == 247) {
            int n = variable(data);
            if (n > data.available()) throw new EOFException();
            skip(data, n);
            running = 0;
            continue;
          }
          if (status >= 240) throw new IOException("MIDI 系统事件不支持");
          int channel = status & 15,
              kind = status & 240,
              a = first < 0 ? data.readUnsignedByte() : first,
              b = (kind == 192 || kind == 208) ? 0 : data.readUnsignedByte();
          if (a > 127 || b > 127) throw new IOException("MIDI 数据无效");
          if (kind == 192) programs[channel] = a;
          if (kind == 144 && b > 0) {
            if (++started > 100000) throw new IOException("MIDI 音符过多，请减少轨道后导入");
            Raw note = new Raw();
            note.start = tick;
            note.pitch = a;
            note.velocity = b;
            note.program = programs[channel];
            note.channel = channel;
            active.computeIfAbsent(channel * 128 + a, k -> new ArrayList<>()).add(note);
          } else if (kind == 128 || kind == 144) {
            List<Raw> open = active.remove(channel * 128 + a);
            if (open != null)
              for (Raw note : open) {
                note.end = tick;
                if (note.end > note.start) notes.add(note);
              }
          }
          if (notes.size() > 100000) throw new IOException("MIDI 音符过多，请减少轨道后导入");
        }
        for (List<Raw> open : active.values())
          for (Raw note : open) {
            note.end = tick;
            if (note.end > note.start) notes.add(note);
          }
      }
      tempos.sort(Comparator.comparingLong(t -> t.tick));
      List<Tempo> map = new ArrayList<>();
      for (Tempo tempo : tempos) {
        if (!map.isEmpty() && map.get(map.size() - 1).tick == tempo.tick)
          map.set(map.size() - 1, tempo);
        else map.add(tempo);
      }
      double[] seconds = new double[map.size()];
      for (int i = 1; i < map.size(); i++)
        seconds[i] =
            seconds[i - 1]
                + (map.get(i).tick - map.get(i - 1).tick)
                    * map.get(i - 1).microseconds
                    / 1000000.0
                    / (division & 32767);
      MidiScore result = new MidiScore();
      for (Raw raw : notes) {
        Note note = new Note();
        note.start = time(raw.start, division, map, seconds);
        note.end = time(raw.end, division, map, seconds);
        if (note.end > 2640 || !Double.isFinite(note.end))
          throw new IOException("Android 乐谱最长 44 分钟");
        note.pitch = raw.pitch;
        note.velocity = raw.velocity;
        note.program = raw.program;
        note.drum = raw.channel == 9;
        result.notes.add(note);
        result.duration = Math.max(result.duration, note.end);
      }
      result.notes.sort(Comparator.comparingDouble(n -> n.start));
      if (result.notes.isEmpty()) throw new IOException("MIDI 中没有可对齐的音符");
      return result;
    }
  }

  static int variable(DataInputStream in) throws IOException {
    int value = 0;
    for (int i = 0; i < 4; i++) {
      int b = in.readUnsignedByte();
      value = (value << 7) | (b & 127);
      if ((b & 128) == 0) return value;
    }
    throw new IOException("MIDI 时间编码无效");
  }

  static void skip(DataInputStream in, int bytes) throws IOException {
    while (bytes > 0) {
      int n = in.skipBytes(bytes);
      if (n == 0) {
        in.readByte();
        n = 1;
      }
      bytes -= n;
    }
  }

  static double time(long tick, int division, List<Tempo> tempos, double[] seconds)
      throws IOException {
    if ((division & 32768) != 0) {
      int fps = -(byte) (division >> 8), sub = division & 255;
      if (!Set.of(24, 25, 29, 30).contains(fps) || sub == 0)
        throw new IOException("MIDI SMPTE 时间无效");
      return tick / ((fps == 29 ? 29.97 : fps) * sub);
    }
    int lo = 0, hi = tempos.size() - 1;
    while (lo < hi) {
      int mid = (lo + hi + 1) / 2;
      if (tempos.get(mid).tick <= tick) lo = mid;
      else hi = mid - 1;
    }
    return seconds[lo]
        + (tick - tempos.get(lo).tick) * tempos.get(lo).microseconds / 1000000.0 / division;
  }
}
