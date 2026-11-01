package app.immersejam.mobile;

import android.app.*;
import android.content.*;
import android.media.*;
import android.media.session.*;
import android.os.*;
import java.lang.ref.WeakReference;

/** Keeps WebAudio's render thread and transport scheduler alive while locked. */
public final class PlaybackService extends Service {
  static WeakReference<MainActivity> host = new WeakReference<>(null);
  private final Handler handler = new Handler(Looper.getMainLooper());
  private MediaSession session;
  private PowerManager.WakeLock wake;
  private AudioManager audio;
  private AudioFocusRequest focus;
  private boolean playing, focused;
  private String title = "Immerse Jam";
  private boolean devicesReady;
  private final AudioDeviceCallback devices = new AudioDeviceCallback() {
    private void changed() {
      MainActivity activity = host.get();
      command("pause");
      if (activity != null) activity.audioEvent("route-changed");
    }
    @Override public void onAudioDevicesAdded(AudioDeviceInfo[] added) {
      if (devicesReady) changed();
      devicesReady = true;
    }
    @Override public void onAudioDevicesRemoved(AudioDeviceInfo[] removed) { changed(); }
  };
  private final Runnable tick = new Runnable() {
    public void run() {
      MainActivity activity = host.get();
      if (activity == null) { stopSelf(); return; }
      activity.audioEvent("tick");
      if (playing) handler.postDelayed(this, 100);
    }
  };
  private final BroadcastReceiver noisy = new BroadcastReceiver() {
    public void onReceive(Context c, Intent i) { command("pause"); }
  };
  private void command(String action) {
    MainActivity activity = host.get();
    if (activity != null) activity.audioEvent(action);
    if (action.equals("pause")) update(false);
  }
  @Override public void onCreate() {
    super.onCreate();
    audio = (AudioManager) getSystemService(AUDIO_SERVICE);
    focus = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
        .setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA)
            .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build())
        .setOnAudioFocusChangeListener(change -> {
          if (change != AudioManager.AUDIOFOCUS_GAIN) command("pause");
          // A call or another app never causes an unexpected automatic restart.
        }, handler).build();
    wake = ((PowerManager) getSystemService(POWER_SERVICE))
        .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "ImmerseJam:playback");
    wake.setReferenceCounted(false);
    session = new MediaSession(this, "Immerse Jam");
    session.setCallback(new MediaSession.Callback() {
      @Override public void onPlay() { command("play"); }
      @Override public void onPause() { command("pause"); }
      @Override public void onStop() { command("pause"); stopSelf(); }
    });
    session.setActive(true);
    audio.registerAudioDeviceCallback(devices, handler);
    getSystemService(NotificationManager.class).createNotificationChannel(
        new NotificationChannel("playback", "Immerse Jam", NotificationManager.IMPORTANCE_LOW));
    IntentFilter filter = new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY);
    if (Build.VERSION.SDK_INT >= 33) registerReceiver(noisy, filter, RECEIVER_NOT_EXPORTED);
    else registerReceiver(noisy, filter);
  }
  private Notification notification() {
    PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class),
        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    PendingIntent toggle = PendingIntent.getService(this, 1,
        new Intent(this, PlaybackService.class).setAction(playing ? "pause" : "play"),
        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    return new Notification.Builder(this, "playback").setSmallIcon(android.R.drawable.ic_media_play)
        .setContentTitle(title).setContentText("Immerse Jam").setContentIntent(open)
        .setOnlyAlertOnce(true).setOngoing(playing)
        .addAction(new Notification.Action.Builder(playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play,
            playing ? "Pause" : "Play", toggle).build())
        .setStyle(new Notification.MediaStyle().setMediaSession(session.getSessionToken())
            .setShowActionsInCompactView(0)).build();
  }
  private void update(boolean active) {
    playing = active;
    handler.removeCallbacks(tick);
    if (active) {
      // Foreground status is required before requesting focus on newer Android.
      startForeground(41, notification());
      if (!focused) focused = audio.requestAudioFocus(focus) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
      if (!focused) { command("pause"); return; }
      if (!wake.isHeld()) wake.acquire();
      handler.post(tick);
    } else {
      if (wake.isHeld()) wake.release();
      if (focused) audio.abandonAudioFocusRequest(focus);
      focused = false;
      stopForeground(STOP_FOREGROUND_DETACH);
      getSystemService(NotificationManager.class).notify(41, notification());
    }
    session.setMetadata(new MediaMetadata.Builder().putString(MediaMetadata.METADATA_KEY_TITLE, title).build());
    session.setPlaybackState(new PlaybackState.Builder()
        .setActions(PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_STOP)
        .setState(playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED,
            PlaybackState.PLAYBACK_POSITION_UNKNOWN, playing ? 1 : 0).build());
  }
  @Override public int onStartCommand(Intent intent, int flags, int id) {
    if (intent == null || host.get() == null) { stopSelf(); return START_NOT_STICKY; }
    if (intent.getAction() != null) {
      // A notification Play is a user action and must enter foreground promptly.
      if (intent.getAction().equals("play")) startForeground(41, notification());
      command(intent.getAction());
    } else {
      title = intent.getStringExtra("title");
      update(intent.getBooleanExtra("playing", false));
    }
    return START_NOT_STICKY;
  }
  @Override public void onTaskRemoved(Intent root) { command("pause"); stopSelf(); }
  @Override public void onDestroy() {
    handler.removeCallbacksAndMessages(null);
    if (wake.isHeld()) wake.release();
    audio.abandonAudioFocusRequest(focus);
    audio.unregisterAudioDeviceCallback(devices);
    session.release();
    unregisterReceiver(noisy);
    getSystemService(NotificationManager.class).cancel(41);
    super.onDestroy();
  }
  @Override public IBinder onBind(Intent intent) { return null; }
}
