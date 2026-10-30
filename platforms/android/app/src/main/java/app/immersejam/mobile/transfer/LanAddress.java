package app.immersejam.mobile.transfer;

import java.io.IOException;
import java.net.*;

/**
 * A pairing URL is a private IPv4 endpoint plus an ephemeral capability, never an arbitrary URL.
 */
public final class LanAddress {
  public final String host, token;
  public final int port;

  public LanAddress(String text) throws IOException {
    try {
      URI uri = new URI(text.trim());
      String host = uri.getHost();
      if (!"http".equals(uri.getScheme())
          || uri.getUserInfo() != null
          || uri.getFragment() != null
          || host == null
          || !(uri.getPath().isEmpty() || uri.getPath().equals("/")))
        throw new IOException("配对地址无效");
      String[] parts = host.split("\\.");
      if (parts.length != 4) throw new IOException("请使用同一网络中的配对地址");
      int[] ip = new int[4];
      for (int i = 0; i < 4; i++) {
        if (!parts[i].matches("0|[1-9][0-9]{0,2}")) throw new IOException("配对地址无效");
        ip[i] = Integer.parseInt(parts[i]);
        if (ip[i] > 255) throw new IOException("配对地址无效");
      }
      if (!(ip[0] == 10
          || ip[0] == 192 && ip[1] == 168
          || ip[0] == 172 && ip[1] >= 16 && ip[1] <= 31)) throw new IOException("请使用同一网络中的配对地址");
      String query = uri.getRawQuery();
      if (query == null || !query.matches("token=[a-f0-9]{48}")) throw new IOException("配对码无效或已过期");
      this.host = host;
      port = uri.getPort() == -1 ? 80 : uri.getPort();
      if (port < 1 || port > 65535) throw new IOException("配对地址无效");
      token = query.substring(6);
    } catch (URISyntaxException | IllegalArgumentException error) {
      throw new IOException("配对地址无效", error);
    }
  }

  public URL endpoint(String path) throws MalformedURLException {
    return new URL("http", host, port, path + "?token=" + token);
  }
}
