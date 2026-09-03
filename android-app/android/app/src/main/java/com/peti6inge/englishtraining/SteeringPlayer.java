package com.peti6inge.englishtraining;

import androidx.media3.common.ForwardingPlayer;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.Player;

final class SteeringPlayer extends ForwardingPlayer {
  SteeringPlayer(Player player) {
    super(player);
  }

  @Override
  public Commands getAvailableCommands() {
    return super.getAvailableCommands()
        .buildUpon()
        .add(COMMAND_SEEK_TO_NEXT)
        .add(COMMAND_SEEK_TO_NEXT_MEDIA_ITEM)
        .add(COMMAND_SEEK_TO_PREVIOUS)
        .add(COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM)
        .add(COMMAND_PLAY_PAUSE)
        .build();
  }

  @Override
  public boolean isCommandAvailable(int command) {
    if (command == COMMAND_SEEK_TO_NEXT
        || command == COMMAND_SEEK_TO_NEXT_MEDIA_ITEM
        || command == COMMAND_SEEK_TO_PREVIOUS
        || command == COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM) {
      return true;
    }
    return super.isCommandAvailable(command);
  }

  @Override
  public MediaMetadata getMediaMetadata() {
    return CarMediaBridge.metadata();
  }

  @Override
  public MediaMetadata getPlaylistMetadata() {
    return CarMediaBridge.metadata();
  }

  @Override
  public MediaItem getCurrentMediaItem() {
    MediaItem current = super.getCurrentMediaItem();
    if (current == null) {
      return CarMediaBridge.playableItem();
    }
    return current.buildUpon().setMediaMetadata(CarMediaBridge.metadata()).build();
  }

  @Override
  public void play() {
    super.play();
  }

  @Override
  public void pause() {
    if (CarMediaService.isStopping()) {
      super.pause();
      return;
    }
    super.play();
  }

  @Override
  public void stop() {
    if (CarMediaService.isStopping()) {
      super.stop();
      return;
    }
    super.play();
  }

  @Override
  public void setPlayWhenReady(boolean playWhenReady) {
    super.setPlayWhenReady(CarMediaService.isStopping() ? playWhenReady : true);
  }

  @Override
  public void seekToNext() {
    CarMediaBridge.emit("next");
    CarMediaService.ensurePlaying();
  }

  @Override
  public void seekToNextMediaItem() {
    CarMediaBridge.emit("next");
    CarMediaService.ensurePlaying();
  }

  @Override
  public void seekToPrevious() {
    CarMediaBridge.emit("previous");
    CarMediaService.ensurePlaying();
  }

  @Override
  public void seekToPreviousMediaItem() {
    CarMediaBridge.emit("previous");
    CarMediaService.ensurePlaying();
  }
}
