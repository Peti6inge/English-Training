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

  private static long lastEmitAt;
  private static String lastEmitEvent;

  private CarMediaBridge() {}

  static void emit(String event) {
    emit(event, null);
  }

  static void emit(String event, String source) {
    long now = SystemClock.elapsedRealtime();
    if (event.equals(lastEmitEvent) && now - lastEmitAt < 280) {
      return;
    }
    lastEmitAt = now;
    lastEmitEvent = event;
    CarMediaPlugin current = plugin;
    if (current == null) return;
    JSObject data = new JSObject();
    if (source != null && !source.isEmpty()) {
      data.put("source", source);
    }
    current.emit(event, data);
  }

  static void emitKey(int keyCode, int action) {
    CarMediaPlugin current = plugin;
    if (current == null) return;
    JSObject data = new JSObject();
    data.put("keyCode", keyCode);
    data.put("action", action);
    current.emit("mediakey", data);
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
