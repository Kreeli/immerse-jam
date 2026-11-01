package app.immersejam.mobile.processing;

import java.io.IOException;
import java.nio.*;

/** At most one second of 48 kHz stereo float PCM plus interpolation guard samples. */
public final class PcmWindow {
  public static byte[] read(WaveReader reader, long first) throws IOException {
    return read(reader, first, 48002);
  }
  public static byte[] read(WaveReader reader, long first, int requested) throws IOException {
    if (first < 0) throw new IOException("Invalid PCM position");
    if (requested < 1 || requested > 48002) throw new IOException("Invalid PCM window");
    int frames = (int) Math.min(requested, Math.max(0, Math.ceil(reader.duration()*48000)-first));
    ByteBuffer out = ByteBuffer.allocate(frames*8).order(ByteOrder.LITTLE_ENDIAN);
    for (int i=0;i<frames;i++) {
      if (reader.rate == 48000) {
        out.putFloat(reader.at(first+i,0)); out.putFloat(reader.at(first+i,1));
      } else {
        double position=(first+i)*(double)reader.rate/48000.0;
        long frame=(long)Math.floor(position);
        double fraction=position-frame;
        float left=reader.at(frame,0), right=reader.at(frame,1);
        out.putFloat((float)(left*(1-fraction)+reader.at(frame+1,0)*fraction));
        out.putFloat((float)(right*(1-fraction)+reader.at(frame+1,1)*fraction));
      }
    }
    return out.array();
  }
}
