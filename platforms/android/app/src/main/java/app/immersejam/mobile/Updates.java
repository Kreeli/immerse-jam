package app.immersejam.mobile;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import java.io.*;
import java.net.*;
import java.util.regex.*;
import org.json.*;

final class Updates {
  private String downloadUrl;

  private String read(String url) throws Exception {
    HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
    connection.setConnectTimeout(15000);
    connection.setReadTimeout(15000);
    connection.setRequestProperty("Accept", "application/json");
    connection.setRequestProperty("User-Agent", "Immerse-Jam");
    try {
      if (connection.getResponseCode() != 200) throw new IOException("Update source unavailable");
      ByteArrayOutputStream bytes = new ByteArrayOutputStream();
      try (InputStream in = connection.getInputStream()) {
        byte[] buffer = new byte[8192];
        int count;
        while ((count = in.read(buffer)) != -1) {
          if (bytes.size() + count > 1048576) throw new IOException("Update catalog too large");
          bytes.write(buffer, 0, count);
        }
      }
      return bytes.toString("UTF-8");
    } finally {
      connection.disconnect();
    }
  }

  JSONObject check() throws Exception {
    Exception last = null;
    String abi = Build.SUPPORTED_ABIS[0].contains("x86") ? "x86_64" : "arm64";
    Pattern name = Pattern.compile("Immerse-Jam-Android-(.+)-" + abi + "\\.apk");
    for (String source : new String[] {
      "https://api.github.com/repos/Kreeli/immerse-jam/releases/latest",
      "https://kreeli.github.io/immerse-jam/download/releases.json"
    }) {
      try {
        String text = read(source).trim();
        JSONArray releases = text.startsWith("[") ? new JSONArray(text) : new JSONArray().put(new JSONObject(text));
        JSONObject best = null;
        String bestUrl = null;
        for (int r = 0; r < releases.length(); r++) {
          JSONObject release = releases.getJSONObject(r);
          if (release.optBoolean("draft") || release.optBoolean("prerelease")
              || !release.optString("tag_name").matches("v[0-9]+\\.[0-9]+\\.[0-9]+")) continue;
          JSONArray assets = release.getJSONArray("assets");
          for (int i = 0; i < assets.length(); i++) {
            JSONObject asset = assets.getJSONObject(i);
            Matcher match = name.matcher(asset.getString("name"));
            if (!match.matches()) continue;
            String url = asset.getString("browser_download_url");
            if (!url.startsWith("https://github.com/Kreeli/immerse-jam/releases/download/")) continue;
            String latest = match.group(1), current = BuildConfig.VERSION_NAME;
            if (best != null && !newer(latest, best.getString("latest"))) continue;
            best = new JSONObject().put("current", current).put("latest", latest)
                .put("available", newer(latest, current)).put("size", asset.optLong("size"));
            bestUrl = url;
          }
        }
        if (best == null) throw new IOException("No matching APK");
        downloadUrl = bestUrl;
        return best;
      } catch (Exception error) {
        last = error;
      }
    }
    throw new IOException("暂时无法检查更新，请检查网络后重试。", last);
  }

  static boolean newer(String latest, String current) {
    String[] a = latest.split("[.\\-]"), b = current.split("[.\\-]");
    for (int i = 0; i < Math.min(a.length, b.length); i++) {
      if (a[i].equals(b[i])) continue;
      if (a[i].matches("[0-9]+") && b[i].matches("[0-9]+"))
        return Long.parseLong(a[i]) > Long.parseLong(b[i]);
      return false;
    }
    return a.length == 3 && b.length > 3;
  }

  void open(MainActivity activity) throws Exception {
    if (downloadUrl == null) throw new IOException("请先检查更新");
    Uri uri = Uri.parse(downloadUrl);
    activity.runOnUiThread(() -> activity.startActivity(new Intent(Intent.ACTION_VIEW, uri)));
  }
}
