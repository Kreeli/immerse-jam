package app.immersejam.mobile.processing;

import static org.junit.Assert.*;

import java.io.*;
import java.nio.*;
import org.junit.Test;

public class WaveReaderTest {
  @Test
  public void readsFloatAndIntegerAndInterpolatesAcrossCacheBoundary() throws Exception {
    for (int bits : new int[] {16, 24, 32})
      for (int format : new int[] {1, 3}) {
        if (format == 3 && bits != 32) continue;
        File file = File.createTempFile("immerse-pcm-", ".wav");
        try {
          ByteBuffer bytes =
              ByteBuffer.allocate(44 + 9000 * 2 * (bits / 8)).order(ByteOrder.LITTLE_ENDIAN);
          bytes
              .put("RIFF".getBytes())
              .putInt(bytes.capacity() - 8)
              .put("WAVEfmt ".getBytes())
              .putInt(16)
              .putShort((short) format)
              .putShort((short) 2)
              .putInt(48000)
              .putInt(48000 * 2 * bits / 8)
              .putShort((short) (2 * bits / 8))
              .putShort((short) bits)
              .put("data".getBytes())
              .putInt(bytes.capacity() - 44);
          for (int i = 0; i < 9000; i++)
            for (double v : new double[] {.25, -.5}) {
              if (format == 3) bytes.putFloat((float) v);
              else {
                int value = (int) (v * Math.pow(2, bits - 1));
                for (int b = 0; b < bits / 8; b++) bytes.put((byte) (value >> 8 * b));
              }
            }
          try (FileOutputStream out = new FileOutputStream(file)) {
            out.write(bytes.array());
          }
          try (WaveReader reader = new WaveReader(file)) {
            assertEquals(9000, reader.frames);
            assertEquals(.25, reader.sample(8191.5 / 48000, 0), 1e-7);
            assertEquals(-.5, reader.sample(8191.5 / 48000, 1), 1e-7);
            assertEquals(0, reader.sample(-1, 0), 0);
            assertEquals(0, reader.sample(1, 1), 0);
          }
        } finally {
          file.delete();
        }
      }
  }
}
