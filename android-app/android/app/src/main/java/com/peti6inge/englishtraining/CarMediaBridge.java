package com.peti6inge.englishtraining;

import android.net.Uri;
import android.os.SystemClock;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.datasource.RawResourceDataSource;
import com.getcapacitor.JSObject;
import java.util.ArrayList;
import java.util.List;

/** Routes wheel / AVRCP events to Capacitor (CommodoLab A/D model). */
final class CarMediaBridge {
  static volatile CarMediaPlugin plugin;
  static volatile String title = "English Training";
  static volatile String artist = "Session";
  static volatile boolean ourPlaying = false;

  private static final long DEBOUNCE_MS = 280L;
  private static String lastEvent;
  private static long lastAt;

  private CarMediaBridge() {}

  static void attachPlugin(CarMediaPlugin next) {
    plugin = next;
  }

  static void detachPlugin(CarMediaPlugin current) {
    if (plugin == current) plugin = null;
  }

  static void emit(String event) {
    emit(event, null);
  }

  static void emit(String event, String source) {
    if (event == null || event.isEmpty()) return;
    long now = SystemClock.elapsedRealtime();
    if (event.equals(lastEvent) && now - lastAt < DEBOUNCE_MS) return;
    lastEvent = event;
    lastAt = now;

    CarMediaPlugin current = plugin;
    if (current == null) return;
    JSObject data = new JSObject();
    if (source != null && !source.isEmpty()) {
      data.put("source", source);
    }
    current.emit(event, data);
  }

  /** Non-debounced diagnostic event (audio mode / SCO watchdog). */
  static void emitRaw(String event, JSObject data) {
    CarMediaPlugin current = plugin;
    if (current == null) return;
    current.emit(event, data);
  }

  static MediaMetadata metadata() {
    return new MediaMetadata.Builder()
        .setTitle(title)
        .setArtist(artist)
        .setAlbumTitle("English Training")
        .setIsPlayable(true)
        .setIsBrowsable(false)
        .build();
  }

  static MediaItem playableItem() {
    return keepAliveItem("current-phrase");
  }

  static MediaItem keepAliveItem(String mediaId) {
    return new MediaItem.Builder()
        .setMediaId(mediaId)
        .setUri(keepAliveUri())
        .setMediaMetadata(metadata())
        .build();
  }

  static List<MediaItem> keepAliveQueue() {
    List<MediaItem> items = new ArrayList<>();
    for (int i = 0; i < 4; i++) {
      items.add(keepAliveItem("keepalive-" + i));
    }
    return items;
  }

  static Uri keepAliveUri() {
    return RawResourceDataSource.buildRawResourceUri(R.raw.keepalive);
  }

  static MediaItem rootItem() {
    return new MediaItem.Builder()
        .setMediaId("root")
        .setMediaMetadata(
            new MediaMetadata.Builder()
                .setTitle("English Training")
                .setIsBrowsable(true)
                .setIsPlayable(false)
                .build())
        .build();
  }
}
