package app.immersejam.mobile.processing;

import static org.junit.Assert.*;

import org.junit.Test;

public class RecordingMathTest {
  @Test
  public void latencyAndTimeOffsetsFollowSourceTempo() {
    assertEquals(12.455, RecordingMath.start(12.5, 10.01, 10, .5, 100), 1e-9);
    assertEquals(12.32, RecordingMath.start(12.5, 10.01, 10, 2, 100), 1e-9);
    assertEquals(2640, RecordingMath.limit(0, .5), 0);
    assertEquals(120, RecordingMath.limit(2400, 2), 0);
    assertEquals(0, RecordingMath.limit(2640, 1), 0);
  }

  @Test
  public void invalidRecordingSettingsAreRejected() {
    for (double tempo : new double[] {0, Double.NaN, -1, 3}) {
      try {
        RecordingMath.validate(48000, tempo, 0, 0, 10, 0);
        fail();
      } catch (IllegalArgumentException expected) {
      }
    }
    RecordingMath.validate(48000, .25, -24, 0, 10, 2000);
  }
}
