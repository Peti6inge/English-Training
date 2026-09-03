package com.peti6inge.englishtraining;

import android.content.ComponentName;
import android.media.MediaMetadata;
import android.media.session.MediaController;
import android.media.session.MediaSessionManager;
import android.media.session.PlaybackState;
import android.os.Handler;
import android.os.Looper;
import android.service.notification.NotificationListenerService;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Watches other apps' media sessions (Spotify, YouTube Music, …).
 * If the Clio commodo still talks to those apps over AVRCP while Android Auto
 * shows English Training, track skips become Next/Previous in our loop.
 */
public class MediaRelayService extends NotificationListenerService {
  static volatile boolean enabled;
  static volatile MediaRelayService instance;

  private static final Set<String> IGNORED_PACKAGES = new HashSet<>();

  static {
    IGNORED_PACKAGES.add("com.peti6inge.englishtraining");
    IGNORED_PACKAGES.add("com.google.android.projection.gearhead");
    IGNORED_PACKAGES.add("com.google.android.apps.maps");
    IGNORED_PACKAGES.add("com.google.android.googlequicksearchbox");
    IGNORED_PACKAGES.add("com.android.systemui");
  }

  private final Handler main = new Handler(Looper.getMainLooper());
  private final Map<String, MediaController> controllers = new HashMap<>();
  private final Map<String, MediaController.Callback> callbacks = new HashMap<>();
  private final Map<String, TrackSnapshot> snapshots = new HashMap<>();
  private MediaSessionManager sessionManager;
  private final MediaSessionManager.OnActiveSessionsChangedListener sessionsChanged =
      controllersList -> syncControllers();

  static void setEnabled(boolean value) {
    enabled = value;
    MediaRelayService svc = instance;
    if (svc != null) {
      svc.main.post(svc::syncControllers);
    }
  }

  @Override
  public void onListenerConnected() {
    super.onListenerConnected();
    instance = this;
    sessionManager = getSystemService(MediaSessionManager.class);
    if (sessionManager != null) {
      ComponentName cn = new ComponentName(this, MediaRelayService.class);
      try {
        sessionManager.addOnActiveSessionsChangedListener(sessionsChanged, cn, main);
      } catch (SecurityException ignored) {
        /* granted after a settings toggle */
      }
    }
    syncControllers();
  }

  @Override
  public void onListenerDisconnected() {
    dropControllers();
    if (sessionManager != null) {
      try {
        sessionManager.removeOnActiveSessionsChangedListener(sessionsChanged);
      } catch (Exception ignored) {
        /* already gone */
      }
    }
    if (instance == this) instance = null;
    super.onListenerDisconnected();
  }

  private void syncControllers() {
    dropControllers();
    if (!enabled || sessionManager == null) return;
    ComponentName cn = new ComponentName(this, MediaRelayService.class);
    List<MediaController> active;
    try {
      active = sessionManager.getActiveSessions(cn);
    } catch (SecurityException e) {
      return;
    }
    if (active == null) return;
    for (MediaController controller : active) {
      String pkg = controller.getPackageName();
      if (pkg == null || IGNORED_PACKAGES.contains(pkg)) continue;
      if (controllers.containsKey(pkg)) continue;
      RelayCallback callback = new RelayCallback(pkg);
      controllers.put(pkg, controller);
      callbacks.put(pkg, callback);
      snapshots.put(pkg, TrackSnapshot.from(controller));
      controller.registerCallback(callback, main);
    }
  }

  private void dropControllers() {
    for (Map.Entry<String, MediaController> entry : controllers.entrySet()) {
      MediaController.Callback callback = callbacks.get(entry.getKey());
      if (callback == null) continue;
      try {
        entry.getValue().unregisterCallback(callback);
      } catch (Exception ignored) {
        /* session already destroyed */
      }
    }
    controllers.clear();
    callbacks.clear();
    snapshots.clear();
  }

  private void onExternalTrackChange(String pkg, MediaController controller) {
    if (!enabled || CarMediaService.instance == null) return;
    TrackSnapshot previous = snapshots.get(pkg);
    TrackSnapshot current = TrackSnapshot.from(controller);
    snapshots.put(pkg, current);
    if (previous == null || previous.unset || current.sameAs(previous)) return;

    if (previous.queueId != -1 && current.queueId != -1 && current.queueId != previous.queueId) {
      if (current.queueId > previous.queueId) {
        CarMediaBridge.emit("next", pkg);
      } else {
        CarMediaBridge.emit("previous", pkg);
      }
      return;
    }

    CarMediaBridge.emit("next", pkg);
  }

  private final class RelayCallback extends MediaController.Callback {
    private final String pkg;

    RelayCallback(String pkg) {
      this.pkg = pkg;
    }

    @Override
    public void onMetadataChanged(MediaMetadata metadata) {
      MediaController controller = controllers.get(pkg);
      if (controller != null) onExternalTrackChange(pkg, controller);
    }
  }

  private static final class TrackSnapshot {
    final String title;
    final long queueId;
    final boolean unset;

    TrackSnapshot(String title, long queueId, boolean unset) {
      this.title = title;
      this.queueId = queueId;
      this.unset = unset;
    }

    static TrackSnapshot from(MediaController controller) {
      if (controller == null) return new TrackSnapshot("", -1, true);
      MediaMetadata meta = controller.getMetadata();
      String title = "";
      if (meta != null) {
        CharSequence raw = meta.getText(MediaMetadata.METADATA_KEY_TITLE);
        if (raw != null) title = raw.toString();
      }
      long queueId = -1;
      PlaybackState state = controller.getPlaybackState();
      if (state != null) {
        queueId = state.getActiveQueueItemId();
      }
      return new TrackSnapshot(title, queueId, false);
    }

    boolean sameAs(TrackSnapshot other) {
      return title.equals(other.title) && queueId == other.queueId;
    }
  }
}
