package com.peti6inge.commodolab

import androidx.media3.common.ForwardingPlayer
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player

class LabPlayer(player: Player) : ForwardingPlayer(player) {
    override fun getAvailableCommands(): Player.Commands =
        super.getAvailableCommands()
            .buildUpon()
            .add(Player.COMMAND_SEEK_TO_NEXT)
            .add(Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM)
            .add(Player.COMMAND_SEEK_TO_PREVIOUS)
            .add(Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM)
            .add(Player.COMMAND_PLAY_PAUSE)
            .build()

    override fun isCommandAvailable(command: Int): Boolean =
        command == Player.COMMAND_SEEK_TO_NEXT ||
            command == Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM ||
            command == Player.COMMAND_SEEK_TO_PREVIOUS ||
            command == Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM ||
            super.isCommandAvailable(command)

    override fun getMediaMetadata(): MediaMetadata = LabMediaService.metadata()

    override fun getCurrentMediaItem(): MediaItem {
        val current = super.getCurrentMediaItem() ?: return LabMediaService.keepAliveItem("current")
        return current.buildUpon().setMediaMetadata(LabMediaService.metadata()).build()
    }

    override fun pause() {
        if (LabHub.mode == PlayerMode.B || LabHub.mode == PlayerMode.C) {
            super.pause()
            LabHub.ourPlaying = false
            return
        }
        super.play()
        LabHub.ourPlaying = true
    }

    override fun setPlayWhenReady(playWhenReady: Boolean) {
        val allowPause = LabHub.mode == PlayerMode.B || LabHub.mode == PlayerMode.C
        super.setPlayWhenReady(if (allowPause) playWhenReady else true)
        LabHub.ourPlaying = getPlayWhenReady()
    }

    override fun seekToNext() {
        emit("next")
        super.seekToNext()
    }

    override fun seekToNextMediaItem() {
        emit("next")
        super.seekToNextMediaItem()
    }

    override fun seekToPrevious() {
        emit("previous")
        super.seekToPrevious()
    }

    override fun seekToPreviousMediaItem() {
        emit("previous")
        super.seekToPreviousMediaItem()
    }

    private fun emit(direction: String) {
        LabHub.emit(
            ProbeEvent(
                at = System.currentTimeMillis(),
                sensor = Sensor.AA_PLAYER,
                direction = direction,
            ),
        )
        LabMediaService.ensurePlaying()
    }
}
