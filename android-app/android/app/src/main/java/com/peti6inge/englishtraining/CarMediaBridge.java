package com.peti6inge.englishtraining;

import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.exoplayer.source.SilenceMediaSource;

final class CarMediaBridge {
  static volatile CarMediaPlugin plugin;
  static volatile String title = "English Training";
  static volatile String artist = "Session";

  private CarMediaBridge() {}

  static void emit(String event) {
    CarMediaPlugin current = plugin;
    if (current != null) {
      current.emit(event);
    }
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
    return new MediaItem.Builder()
        .setMediaId("current-phrase")
        .setMediaMetadata(metadata())
        .build();
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

  static SilenceMediaSource silenceSource() {
    return new SilenceMediaSource.Factory().setDurationUs(60_000_000L).createMediaSource();
  }
}
