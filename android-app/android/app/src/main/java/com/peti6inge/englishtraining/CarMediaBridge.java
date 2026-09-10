package com.peti6inge.englishtraining;

import android.net.Uri;
import android.os.SystemClock;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.datasource.RawResourceDataSource;
import com.getcapacitor.JSObject;
import java.util.ArrayList;
import java.util.List;

final class CarMediaBridge {
  static volatile CarMediaPlugin plugin;
  static volatile String title = "English Training";
  static volatile String artist = "Session";
  static final WheelCommandBuffer wheel = new WheelCommandBuffer();

  private CarMediaBridge() {}

  static void attachPlugin(CarMediaPlugin next) {
    plugin = next;
    if (next != null) flushPending();
  }

  static void detachPlugin(CarMediaPlugin current) {
    if (plugin == current) {
      plugin = null;
      wheel.markUndelivered();
    }
  }

  static void emit(String event) {
    emit(event, null);
  }

  static void emit(String event, String source) {
    long now = SystemClock.elapsedRealtime();
    if (!wheel.accept(event, now)) return;
    boolean delivered = deliver(event, source);
    wheel.hold(event, source, now, delivered);
  }

  static void emitKey(int keyCode, int action) {
    CarMediaPlugin current = plugin;
    if (current == null) return;
    JSObject data = new JSObject();
    data.put("keyCode", keyCode);
    data.put("action", action);
    current.emit("mediakey", data);
  }

  static JSObject drainPending() {
    JSObject ret = new JSObject();
    WheelCommandBuffer.Pending pending = wheel.takeUndelivered(SystemClock.elapsedRealtime());
    if (pending == null) return ret;
    ret.put("event", pending.event);
    if (pending.source != null && !pending.source.isEmpty()) {
      ret.put("source", pending.source);
    }
    return ret;
  }

  static void flushPending() {
    CarMediaPlugin current = plugin;
    if (current == null) return;
    long now = SystemClock.elapsedRealtime();
    WheelCommandBuffer.Pending pending = wheel.takeUndelivered(now);
    if (pending == null) return;
    boolean delivered = deliver(pending.event, pending.source);
    wheel.hold(pending.event, pending.source, now, delivered);
  }

  private static boolean deliver(String event, String source) {
    CarMediaPlugin current = plugin;
    if (current == null) return false;
    JSObject data = new JSObject();
    if (source != null && !source.isEmpty()) {
      data.put("source", source);
    }
    current.emit(event, data);
    return true;
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
