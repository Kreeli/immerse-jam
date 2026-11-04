package app.immersejam.mobile;

import android.Manifest;
import android.content.*;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.*;
import android.webkit.*;
import android.widget.FrameLayout;
import android.widget.Toast;
import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.webkit.*;
import com.journeyapps.barcodescanner.ScanContract;
import com.journeyapps.barcodescanner.ScanOptions;
import java.io.*;
import java.util.*;
import java.util.concurrent.*;
import org.json.*;

public class MainActivity extends ComponentActivity {
  public static final String ORIGIN = "https://appassets.androidplatform.net";
  WebView web;
  NativeBridge bridge;
  private CompletableFuture<List<Uri>> selection;
  private ValueCallback<Uri[]> coverSelection;
  private final ActivityResultLauncher<String[]> coverPicker =
      registerForActivityResult(new ActivityResultContracts.OpenDocument(), uri -> {
        ValueCallback<Uri[]> callback = coverSelection;
        coverSelection = null;
        if (callback != null) callback.onReceiveValue(uri == null ? null : new Uri[]{uri});
      });
  private PermissionRequest microphone;
  private CompletableFuture<Boolean> nativeMicrophone;
  private long lastBack;
  private boolean pageReady;
  private volatile boolean customPointer = true;
  private Intent sharedIntent;
  private CompletableFuture<String> scanTask;
  private final ActivityResultLauncher<ScanOptions> scanner =
      registerForActivityResult(
          new ScanContract(),
          result -> {
            CompletableFuture<String> task = scanTask;
            scanTask = null;
            if (task != null)
              task.complete(result.getContents() == null ? "" : result.getContents());
          });
  final ExecutorService io = Executors.newSingleThreadExecutor();
  private final ActivityResultLauncher<String[]> files =
      registerForActivityResult(
          new ActivityResultContracts.OpenMultipleDocuments(),
          result -> {
            CompletableFuture<List<Uri>> task = selection;
            selection = null;
            if (task != null) task.complete(result);
          });
  private final ActivityResultLauncher<String> audioPermission =
      registerForActivityResult(
          new ActivityResultContracts.RequestPermission(),
          granted -> {
            CompletableFuture<Boolean> nativeTask = nativeMicrophone;
            nativeMicrophone = null;
            if (nativeTask != null) nativeTask.complete(granted);
            PermissionRequest request = microphone;
            microphone = null;
            if (request != null) {
              if (granted) request.grant(new String[] {PermissionRequest.RESOURCE_AUDIO_CAPTURE});
              else request.deny();
            }
          });

  @Override
  public void onCreate(Bundle saved) {
    super.onCreate(saved);
    customPointer = !getSharedPreferences("ui", MODE_PRIVATE).getString("pointerStyle", "arrow").equals("system");
    web = new WebView(this) {
      @Override
      public android.view.PointerIcon onResolvePointerIcon(android.view.MotionEvent event, int pointerIndex) {
        if (customPointer && (event.isFromSource(android.view.InputDevice.SOURCE_MOUSE) || event.getToolType(pointerIndex) == android.view.MotionEvent.TOOL_TYPE_MOUSE))
          return android.view.PointerIcon.getSystemIcon(getContext(), android.view.PointerIcon.TYPE_NULL);
        return super.onResolvePointerIcon(event, pointerIndex);
      }
    };
    web.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
    PlaybackService.host = new java.lang.ref.WeakReference<>(this);
    web.setBackgroundColor(Color.rgb(17, 17, 20));
    FrameLayout frame = new FrameLayout(this);
    frame.setBackgroundColor(Color.rgb(17, 17, 20));
    frame.addView(web, new FrameLayout.LayoutParams(-1, -1));
    setContentView(frame);
    ViewCompat.setOnApplyWindowInsetsListener(
        frame,
        (view, insets) -> {
          androidx.core.graphics.Insets bars =
              insets.getInsets(
                  WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
          view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
          return insets;
        });
    web.getSettings().setJavaScriptEnabled(true);
    web.getSettings().setDomStorageEnabled(true);
    web.getSettings().setMediaPlaybackRequiresUserGesture(false);
    web.getSettings().setAllowFileAccess(false);
    web.getSettings().setAllowContentAccess(false);
    web.getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
    WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
    bridge = new NativeBridge(this);
    sharedIntent = getIntent();
    WebViewAssetLoader loader =
        new WebViewAssetLoader.Builder()
            .addPathHandler("/app/", path -> assetResponse(path))
            .addPathHandler("/projects/", path -> bridge.store.response(path))
            .addPathHandler("/stream/", path -> bridge.streaming.response(path))
            .addPathHandler("/capture/", path -> bridge.capture.response(path))
            .build();
    web.setWebViewClient(
        new WebViewClient() {
          @Override
          public void onPageFinished(WebView view, String url) {
            pageReady = true;
            handleSharedIntent();
          }

          @Override
          public WebResourceResponse shouldInterceptRequest(
              WebView view, WebResourceRequest request) {
            if ("appassets.androidplatform.net".equals(request.getUrl().getHost()))
              return loader.shouldInterceptRequest(request.getUrl());
            return new WebResourceResponse(
                "text/plain",
                "UTF-8",
                403,
                "Blocked",
                Map.of(),
                new ByteArrayInputStream(new byte[0]));
          }

          @Override
          public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (ORIGIN.equals(uri.getScheme() + "://" + uri.getHost())) return false;
            if (request.isForMainFrame()) openExternal(uri);
            return true;
          }
        });
    web.setWebChromeClient(
        new WebChromeClient() {
          @Override
          public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (view.getUrl() == null || !view.getUrl().startsWith(ORIGIN + "/")) return false;
            if (coverSelection != null) coverSelection.onReceiveValue(null);
            coverSelection = callback;
            try {
              coverPicker.launch(new String[]{"image/jpeg", "image/png", "image/webp"});
            } catch (Exception error) {
              coverSelection = null;
              callback.onReceiveValue(null);
            }
            return true;
          }

          @Override
          public void onPermissionRequest(PermissionRequest request) {
            runOnUiThread(
                () -> {
                  if (!request.getOrigin().toString().startsWith(ORIGIN)
                      || !Arrays.asList(request.getResources())
                          .contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) {
                    request.deny();
                    return;
                  }
                  if (checkSelfPermission(Manifest.permission.RECORD_AUDIO)
                      == PackageManager.PERMISSION_GRANTED)
                    request.grant(new String[] {PermissionRequest.RESOURCE_AUDIO_CAPTURE});
                  else if (microphone != null || nativeMicrophone != null) request.deny();
                  else {
                    microphone = request;
                    audioPermission.launch(Manifest.permission.RECORD_AUDIO);
                  }
                });
          }

          @Override
          public void onPermissionRequestCanceled(PermissionRequest request) {
            if (microphone == request) microphone = null;
          }

          @Override
          public boolean onConsoleMessage(ConsoleMessage message) {
            android.util.Log.d("ImmerseWeb", message.message());
            return true;
          }
        });
    if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
      Toast.makeText(
              this,
              "请更新 Android System WebView / Please update Android System WebView",
              Toast.LENGTH_LONG)
          .show();
      finish();
      return;
    }
    WebViewCompat.addWebMessageListener(
        web,
        "ImmerseNative",
        Set.of(ORIGIN),
        (view, message, origin, isMainFrame, reply) -> {
          if (!isMainFrame || !ORIGIN.equals(origin.toString())) return;
          bridge.receive(message.getData(), reply);
        });
    getOnBackPressedDispatcher()
        .addCallback(
            this,
            new OnBackPressedCallback(true) {
              @Override
              public void handleOnBackPressed() {
                web.evaluateJavascript(
                    "window.dispatchEvent(new Event('immerse-android-back'))", null);
              }
            });
    web.loadUrl(ORIGIN + "/app/index.html");
  }

  WebResourceResponse assetResponse(String path) {
    try {
      if (path.contains("..") || path.contains("\\")) return null;
      String mime =
          path.endsWith(".js")
              ? "text/javascript"
              : path.endsWith(".wasm")
                  ? "application/wasm"
                  : path.endsWith(".sf2")
                      ? "application/octet-stream"
                      : MimeTypeMap.getSingleton()
                          .getMimeTypeFromExtension(path.substring(path.lastIndexOf('.') + 1));
      return new WebResourceResponse(
          mime == null ? "application/octet-stream" : mime,
          "UTF-8",
          getAssets().open("web/" + path));
    } catch (IOException error) {
      return new WebResourceResponse(
          "text/plain", "UTF-8", 404, "Not found", Map.of(), new ByteArrayInputStream(new byte[0]));
    }
  }

  List<Uri> select(String[] mime) throws Exception {
    if (selection != null) throw new IOException("已有文件选择窗口");
    selection = new CompletableFuture<>();
    CompletableFuture<List<Uri>> current = selection;
    runOnUiThread(() -> files.launch(mime));
    return current.get();
  }

  void requireMicrophone() throws Exception {
    CompletableFuture<Boolean> task = new CompletableFuture<>();
    runOnUiThread(() -> {
      if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) task.complete(true);
      else if (microphone != null || nativeMicrophone != null) task.completeExceptionally(new IOException("请先完成麦克风授权"));
      else { nativeMicrophone = task; audioPermission.launch(Manifest.permission.RECORD_AUDIO); }
    });
    if (!task.get()) throw new IOException("请在系统设置中允许麦克风权限");
  }

  @Override protected void onStop() {
    if (bridge != null) bridge.capture.stop(null);
    super.onStop();
  }

  String scan() throws Exception {
    if (scanTask != null) throw new IOException("已有扫码窗口");
    scanTask = new CompletableFuture<>();
    CompletableFuture<String> current = scanTask;
    runOnUiThread(
        () -> {
          ScanOptions options =
              new ScanOptions()
                  .setDesiredBarcodeFormats(ScanOptions.QR_CODE)
                  .setOrientationLocked(false)
                  .setBeepEnabled(false)
                  .setPrompt(
                      getSharedPreferences("ui", MODE_PRIVATE)
                              .getString("language", Locale.getDefault().getLanguage())
                              .startsWith("zh")
                          ? "扫描 Immerse Jam 配对二维码"
                          : "Scan an Immerse Jam pairing code");
          scanner.launch(options);
        });
    return current.get();
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    sharedIntent = intent;
    if (pageReady) handleSharedIntent();
  }

  void handleSharedIntent() {
    Intent intent = sharedIntent;
    sharedIntent = null;
    if (intent == null) return;
    List<Uri> uris = new ArrayList<>();
    if (Intent.ACTION_VIEW.equals(intent.getAction())) {
      if (intent.getData() != null) uris.add(intent.getData());
    } else if (Intent.ACTION_SEND.equals(intent.getAction())) {
      Uri uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
      if (uri != null) uris.add(uri);
    } else if (Intent.ACTION_SEND_MULTIPLE.equals(intent.getAction())) {
      ArrayList<Uri> list = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
      if (list != null) uris.addAll(list);
    }
    if (uris.size() > 100) uris = uris.subList(0, 100);
    for (Uri uri : uris) {
      if (!"content".equals(uri.getScheme())) continue;
      io.execute(
          () -> {
            try {
              JSONObject p = bridge.store.importUri(uri);
              bridge.emit(new JSONObject().put("type", "shared-import").put("result", p));
            } catch (Exception error) {
              bridge.emit(bridge.errorEvent(error.getMessage()));
            }
          });
    }
  }

  void backResult(boolean handled) {
    runOnUiThread(
        () -> {
          if (handled) {
            lastBack = 0;
            return;
          }
          long now = SystemClock.elapsedRealtime();
          if (now - lastBack < 2000) {
            requestClose();
          } else {
            lastBack = now;
            Toast.makeText(
                    this,
                    getSharedPreferences("ui", MODE_PRIVATE)
                            .getString("language", Locale.getDefault().getLanguage())
                            .startsWith("zh")
                        ? "再按一次返回退出应用"
                        : "Press Back again to exit",
                    Toast.LENGTH_SHORT)
                .show();
          }
        });
  }

  boolean closeRequested;
  void requestClose() {
    if (closeRequested) return;
    closeRequested = true;
    try { bridge.emit(new JSONObject().put("type", "closing")); }
    catch (Exception error) { closeRequested = false; }
    new Handler(Looper.getMainLooper()).postDelayed(() -> {
      if (closeRequested && !isFinishing()) {
        closeRequested = false;
        Toast.makeText(this, "Saving has not finished. Please retry before exiting.", Toast.LENGTH_LONG).show();
      }
    }, 15000);
  }

  void openExternal(Uri uri) {
    if (!Set.of("https", "mailto").contains(uri.getScheme())) return;
    try {
      startActivity(new Intent(Intent.ACTION_VIEW, uri));
    } catch (ActivityNotFoundException error) {
      Toast.makeText(this, uri.toString(), Toast.LENGTH_LONG).show();
    }
  }

  void pointerStyle(String style) throws IOException {
    if (!Set.of("arrow", "ring", "crosshair", "system").contains(style)) throw new IOException("无效指针样式");
    getSharedPreferences("ui", MODE_PRIVATE).edit().putString("pointerStyle", style).apply();
    runOnUiThread(() -> {
      customPointer = !style.equals("system");
      web.setPointerIcon(android.view.PointerIcon.getSystemIcon(this, customPointer ? android.view.PointerIcon.TYPE_NULL : android.view.PointerIcon.TYPE_ARROW));
    });
  }

  boolean playback(boolean playing, String title) throws Exception {
    CompletableFuture<Boolean> task = new CompletableFuture<>();
    runOnUiThread(() -> {
      try {
        Intent intent = new Intent(this, PlaybackService.class)
            .putExtra("playing", playing).putExtra("title", title);
        if (playing) startForegroundService(intent);
        else startService(intent);
        task.complete(true);
      } catch (Exception error) { task.completeExceptionally(error); }
    });
    return task.get(5, TimeUnit.SECONDS);
  }

  void audioEvent(String action) {
    runOnUiThread(() -> web.evaluateJavascript(
        "window.dispatchEvent(new CustomEvent('immerse-audio',{detail:" + JSONObject.quote(action) + "}))", null));
  }

  @Override
  protected void onDestroy() {
    stopService(new Intent(this, PlaybackService.class));
    PlaybackService.host.clear();
    if (selection != null) selection.complete(List.of());
    if (coverSelection != null) coverSelection.onReceiveValue(null);
    if (scanTask != null) scanTask.complete("");
    if (microphone != null) microphone.deny();
    if (nativeMicrophone != null) nativeMicrophone.complete(false);
    io.shutdownNow();
    bridge.close();
    web.destroy();
    super.onDestroy();
  }
}
