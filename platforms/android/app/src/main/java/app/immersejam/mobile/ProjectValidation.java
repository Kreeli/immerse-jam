package app.immersejam.mobile;

import java.io.IOException;
import java.util.*;
import org.json.*;

/** Strict types for untrusted archives; JSONObject numeric getters also accept strings. */
public final class ProjectValidation {
  static void repairLegacyAnalysis(JSONObject p) throws Exception {
    JSONObject a = p.optJSONObject("analysis");
    Object value = p.opt("duration");
    if (a == null
        || !"audiojam-migration".equals(a.optString("method"))
        || !(value instanceof Number)) return;
    double duration = ((Number) value).doubleValue();
    JSONArray chords = a.optJSONArray("chords");
    if (!Double.isFinite(duration) || duration <= 0 || chords == null) return;
    JSONArray repaired = new JSONArray();
    for (int i = 0; i < chords.length(); i++) {
      Object item = chords.get(i);
      if (item instanceof JSONObject) {
        JSONObject c = (JSONObject) item;
        Object start = c.opt("start"), end = c.opt("end");
        if (start instanceof Number && end instanceof Number) {
          double s = ((Number) start).doubleValue(), e = ((Number) end).doubleValue();
          if (Double.isFinite(s) && Double.isFinite(e)) {
            if ("N".equals(c.optString("label"))
                && s >= duration
                && s <= duration + 2
                && e <= s
                && Math.abs(e - duration) < 1) continue;
            if (s >= 0 && s < duration && e > duration && e <= duration + 2) c.put("end", duration);
          }
        }
      }
      repaired.put(item);
    }
    a.put("chords", repaired);
  }

  static void number(JSONObject o, String key, double min, double max, boolean optional)
      throws Exception {
    if (!o.has(key) && optional) return;
    Object value = o.opt(key);
    if (!(value instanceof Number)) throw new IOException("歌曲数值类型无效：" + key);
    double n = ((Number) value).doubleValue();
    if (!Double.isFinite(n) || n < min || n > max) throw new IOException("歌曲数值超出范围：" + key);
  }

  static JSONArray array(JSONObject o, String key, int limit) throws Exception {
    if (!o.has(key) || o.isNull(key)) return new JSONArray();
    if (!(o.opt(key) instanceof JSONArray) || o.getJSONArray(key).length() > limit)
      throw new IOException("歌曲列表无效：" + key);
    return o.getJSONArray(key);
  }

  static void tracks(JSONArray tracks) throws Exception {
    Set<String> ids = new HashSet<>();
    for (int i = 0; i < tracks.length(); i++) {
      JSONObject t = tracks.getJSONObject(i);
      if (!(t.opt("id") instanceof String)
          || t.getString("id").isEmpty()
          || !ids.add(t.getString("id"))
          || !(t.opt("file") instanceof String)) throw new IOException("音轨编号或文件无效");
      number(t, "gain", 0, 1.5, false);
      number(t, "pan", -1, 1, false);
      number(t, "start", -2640, 2640, true);
      if (!(t.opt("mute") instanceof Boolean) || !(t.opt("solo") instanceof Boolean))
        throw new IOException("音轨开关无效");
    }
  }

  public static void validate(JSONObject p) throws Exception {
    if (p.getInt("schemaVersion") != 1 && p.getInt("schemaVersion") != 2)
      throw new IOException("不支持的歌曲版本");
    if (!(p.opt("title") instanceof String) || !(p.opt("original") instanceof String))
      throw new IOException("歌曲名称或原曲无效");
    number(p, "duration", 0, 2640, false);
    JSONObject settings = p.getJSONObject("practice");
    number(settings, "tempo", .25, 2, false);
    number(settings, "pitch", -24, 24, false);
    number(settings, "master", 0, 1, false);
    number(settings, "metronomeVolume", 0, 1, true);
    tracks(array(p, "tracks", 1000));
    tracks(array(p, "takes", 1000));
    if (p.optJSONObject("originalMix") != null)
      tracks(new JSONArray().put(p.getJSONObject("originalMix")));
    for (String key : List.of("results", "sourceGroups")) {
      JSONArray groups = array(p, key, 200);
      for (int i = 0; i < groups.length(); i++)
        tracks(array(groups.getJSONObject(i), "tracks", 32));
    }
    JSONArray takes = array(p, "takes", 1000);
    for (int i = 0; i < takes.length(); i++)
      number(takes.getJSONObject(i), "duration", 0, 2640, false);
    JSONArray marks = array(p, "bookmarks", 10000);
    for (int i = 0; i < marks.length(); i++) {
      JSONObject mark = marks.getJSONObject(i);
      number(mark, "start", 0, 2640, false);
      number(mark, "end", mark.getDouble("start"), 2640, true);
    }
    JSONObject analysis = p.optJSONObject("analysis");
    if (p.has("analysis") && !p.isNull("analysis") && analysis == null)
      throw new IOException("分析数据格式无效");
    if (analysis != null) {
      number(analysis, "bpm", 0, 350, false);
      for (String key : List.of("beats", "downbeats")) {
        JSONArray beats = array(analysis, key, 300000);
        double last = 0;
        for (int i = 0; i < beats.length(); i++) {
          Object value = beats.get(i);
          if (!(value instanceof Number)) throw new IOException("节拍时间无效");
          double v = ((Number) value).doubleValue();
          if (!Double.isFinite(v) || v < last || v > 2640) throw new IOException("节拍顺序无效");
          last = v;
        }
      }
      JSONArray chords = array(analysis, "chords", 100000);
      for (int i = 0; i < chords.length(); i++) {
        JSONObject c = chords.getJSONObject(i);
        number(c, "start", 0, 2640, false);
        number(c, "end", c.getDouble("start"), 2640, false);
        number(c, "confidence", 0, 1, false);
        if (!(c.opt("label") instanceof String)) throw new IOException("和弦名称无效");
      }
    }
    JSONObject alignment = p.optJSONObject("alignment");
    if (p.has("alignment") && !p.isNull("alignment") && alignment == null)
      throw new IOException("乐谱同步数据格式无效");
    if (alignment != null) {
      number(alignment, "duration", 0, 2640, false);
      number(alignment, "confidence", 0, 1, false);
      number(alignment, "transpose", -12, 12, true);
      JSONArray points = array(alignment, "points", 100000);
      double lastScore = 0, lastAudio = 0;
      for (int i = 0; i < points.length(); i++) {
        JSONObject point = points.getJSONObject(i);
        number(point, "scoreTime", lastScore, 2640, false);
        number(point, "audioTime", lastAudio, 2640, false);
        number(point, "confidence", 0, 1, false);
        lastScore = point.getDouble("scoreTime");
        lastAudio = point.getDouble("audioTime");
      }
      JSONArray notes = array(alignment, "notes", 100000);
      for (int i = 0; i < notes.length(); i++) {
        JSONObject note = notes.getJSONObject(i);
        number(note, "start", 0, 2640, false);
        number(note, "end", note.getDouble("start"), 2640, false);
        number(note, "pitch", 0, 127, false);
        number(note, "velocity", 0, 127, false);
        number(note, "program", 0, 127, true);
        if (note.has("drum") && !(note.opt("drum") instanceof Boolean))
          throw new IOException("乐谱打击乐标记无效");
      }
    }
  }
}
