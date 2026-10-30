package app.immersejam.mobile.transfer;

import static org.junit.Assert.*;

import java.io.*;
import org.junit.Test;

public class LanAddressTest {
  final String token = "a".repeat(48);

  @Test
  public void privateLiteralPairingAddressesAreAccepted() throws Exception {
    for (String host : new String[] {"192.168.1.2", "172.16.0.1", "10.0.2.2"}) {
      LanAddress a = new LanAddress("http://" + host + ":4567/?token=" + token);
      assertEquals(host, a.host);
      assertEquals(4567, a.port);
      assertEquals("/api/list", a.endpoint("/api/list").getPath());
    }
  }

  @Test
  public void publicRedirectAmbiguityAndUntrustedUrlsAreRejected() throws Exception {
    for (String url :
        new String[] {
          "http://example.com/?token=" + token,
          "http://127.0.0.1/?token=" + token,
          "http://8.8.8.8/?token=" + token,
          "https://10.0.0.1/?token=" + token,
          "http://user@10.0.0.1/?token=" + token,
          "http://10.0.0.1/other?token=" + token,
          "http://010.0.0.1/?token=" + token,
          "http://10.0.0.1/?token=short"
        }) {
      try {
        new LanAddress(url);
        fail(url);
      } catch (IOException expected) {
      }
    }
  }
}
