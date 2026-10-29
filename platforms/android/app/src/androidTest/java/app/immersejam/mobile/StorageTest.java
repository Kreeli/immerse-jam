package app.immersejam.mobile;

import static org.junit.Assert.*;

import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.*;
import java.util.*;
import org.json.*;
import org.junit.*;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class StorageTest {
  @Test
  public void interruptedRecordingRecoversWithTimeline() throws Exception {
    Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
    ProjectStore store = new ProjectStore(context);
    JSONObject p = store.create(new JSONObject().put("kind", "creation").put("title", "录音恢复验收"));
    NativeTakes takes = new NativeTakes(store);
    JSONObject options =
        new JSONObject()
            .put("sampleRate", 48000)
            .put("tempo", 1)
            .put("pitch", 0)
            .put("anchorTime", 10)
            .put("anchorPosition", 2)
            .put("latencyMs", 100)
            .put("mode", "instrument");
    String id = takes.start(p.getString("id"), options).getString("id");
    java.nio.ByteBuffer pcm =
        java.nio.ByteBuffer.allocate(4800 * 8).order(java.nio.ByteOrder.LITTLE_ENDIAN);
    for (int i = 0; i < 4800; i++) {
      float v = (float) Math.sin(i * .1) * .2f;
      pcm.putFloat(v).putFloat(v);
    }
    JSONArray bytes = new JSONArray();
    for (byte b : pcm.array()) bytes.put(b & 255);
    takes.append(
        new JSONObject()
            .put("sessionId", id)
            .put("sequence", 0)
            .put("contextTime", 10.01)
            .put("bytes", bytes));
    takes.close();
    JSONObject recovered = new NativeTakes(store).recover(p.getString("id"));
    assertEquals(1, recovered.getJSONArray("takes").length());
    JSONObject take = recovered.getJSONArray("takes").getJSONObject(0);
    assertEquals(1.91, take.getDouble("start"), .001);
    assertEquals(.1, take.getDouble("duration"), .001);
    assertTrue(store.asset(p.getString("id"), take.getString("file")).length() > 44);
  }

  @Test
  public void archiveSessionsAndSeed() throws Exception {
    Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
    ProjectStore store = new ProjectStore(context);
    String id = UUID.randomUUID().toString();
    File wave = store.asset(id, "media/original.wav");
    wave.getParentFile().mkdirs();
    int frames = 44100 * 12;
    float[][] samples = new float[2][frames];
    for (int i = 0; i < frames; i++)
      samples[0][i] = samples[1][i] = (float) Math.sin(2 * Math.PI * 220 * i / 44100) * .1f;
    try (RandomAccessFile out = new RandomAccessFile(wave, "rw")) {
      AudioFiles.header(out, frames, 44100, 16, 1);
      out.seek(44);
      AudioFiles.appendPcm(out, samples, frames);
    }
    JSONArray tracks = new JSONArray();
    for (String stem : List.of("vocals", "other")) {
      String file = "results/test/" + stem + ".wav";
      File dest = store.asset(id, file);
      dest.getParentFile().mkdirs();
      java.nio.file.Files.copy(wave.toPath(), dest.toPath());
      tracks.put(ProjectStore.track(stem, stem, file));
    }
    JSONObject result =
        new JSONObject()
            .put("id", "test")
            .put("name", "测试分轨")
            .put("directory", "results/test")
            .put("modelId", "test")
            .put("modelName", "Test")
            .put("mode", "vocal")
            .put("createdAt", ProjectStore.now())
            .put("tracks", tracks);
    JSONObject p =
        new JSONObject()
            .put("schemaVersion", 1)
            .put("id", id)
            .put("title", "Android 验收")
            .put("artist", "Synthetic fixture")
            .put("original", "media/original.wav")
            .put("duration", 12)
            .put("tracks", tracks)
            .put("results", new JSONArray().put(result))
            .put("activeResultId", "test")
            .put("createdAt", ProjectStore.now())
            .put("starred", false);
    store.save(p);
    JSONObject analysis =
        new JSONObject()
            .put("bpm", 120.123)
            .put("key", "C")
            .put("method", "desktop-import")
            .put("tempoMethod", "beat-this")
            .put("tempoReviewed", true)
            .put("beatsPerBar", 3)
            .put("downbeat", .125)
            .put("beats", new JSONArray(new double[] {.125, .6245, 1.124, 1.6235, 2.123, 2.6225}))
            .put("downbeats", new JSONArray(new double[] {.125, 1.6235}))
            .put(
                "chords",
                new JSONArray()
                    .put(
                        new JSONObject()
                            .put("start", 0)
                            .put("end", 12)
                            .put("label", "C")
                            .put("confidence", .8)));
    p.put("analysis", analysis);
    store.save(p);
    File archive = store.pack(id);
    JSONObject imported = store.importArchive(archive, UUID.randomUUID().toString());
    assertEquals(analysis.toString(), imported.getJSONObject("analysis").toString());
    assertEquals(
        ProjectStore.sha(wave),
        ProjectStore.sha(store.asset(imported.getString("id"), imported.getString("original"))));
    store.trash(imported.getString("id"));
    JSONObject practice =
        store.create(
            new JSONObject()
                .put("kind", "practice")
                .put("sourceId", id)
                .put("resultId", "test")
                .put("title", "手机跟练验收"));
    assertEquals(2, practice.getJSONArray("tracks").length());
    assertEquals(analysis.toString(), practice.getJSONObject("analysis").toString());
    assertNotEquals(id, practice.getString("id"));
    try {
      ProjectStore.contained(store.root, "../escape");
      fail("Traversal accepted");
    } catch (IOException expected) {
    }
  }
}
