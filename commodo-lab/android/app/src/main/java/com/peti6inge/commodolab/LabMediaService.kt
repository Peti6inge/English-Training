package com.peti6inge.commodolab

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.KeyEvent
import androidx.core.app.NotificationCompat
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.datasource.RawResourceDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.LibraryResult
import androidx.media3.session.MediaLibraryService
import androidx.media3.session.MediaSession
import com.google.common.collect.ImmutableList
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture

class LabMediaService : MediaLibraryService() {
    companion object {
        const val ACTION_START = "com.peti6inge.commodolab.START"
        const val ACTION_PAUSE = "com.peti6inge.commodolab.PAUSE"
        const val ACTION_STOP = "com.peti6inge.commodolab.STOP"
        const val EXTRA_MODE = "mode"
        private const val CHANNEL_ID = "commodolab_media"
        private const val NOTIFICATION_ID = 71

        @Volatile
        var instance: LabMediaService? = null

        fun ensurePlaying() {
            instance?.handler?.post { instance?.ensurePlayingInternal() }
        }

        fun metadata(): MediaMetadata =
            MediaMetadata.Builder()
                .setTitle("Commodolab")
                .setArtist("Mode ${LabHub.mode.name}")
                .setAlbumTitle("Diagnostic commodo")
                .setIsPlayable(true)
                .setIsBrowsable(false)
                .build()

        fun keepAliveItem(id: String): MediaItem =
            MediaItem.Builder()
                .setMediaId(id)
                .setUri(RawResourceDataSource.buildRawResourceUri(R.raw.keepalive))
                .setMediaMetadata(metadata())
                .build()

        fun keepAliveQueue(): List<MediaItem> = (0 until 4).map { keepAliveItem("keepalive-$it") }
    }

    private var exoPlayer: ExoPlayer? = null
    private var player: LabPlayer? = null
    private var session: MediaLibrarySession? = null
    private val handler = Handler(Looper.getMainLooper())
    private val keepAlive =
        object : Runnable {
            override fun run() {
                if (LabHub.mode == PlayerMode.A || LabHub.mode == PlayerMode.D) {
                    ensurePlayingInternal()
                    handler.postDelayed(this, 1500)
                }
            }
        }

    override fun onCreate() {
        super.onCreate()
        instance = this
        ensureChannel()
        val notif =
            NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_lab)
                .setContentTitle("Commodolab")
                .setContentText("Session média diagnostic")
                .setOngoing(true)
                .setSilent(true)
                .setContentIntent(sessionActivity())
                .build()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(NOTIFICATION_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
        } else {
            startForeground(NOTIFICATION_ID, notif)
        }

        val attrs =
            AudioAttributes.Builder()
                .setUsage(C.USAGE_MEDIA)
                .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                .build()
        val exo = ExoPlayer.Builder(this).build()
        exo.setAudioAttributes(attrs, false)
        exo.repeatMode = Player.REPEAT_MODE_ALL
        exo.setMediaItems(keepAliveQueue())
        exo.prepare()
        exoPlayer = exo
        player = LabPlayer(exo)
        session =
            MediaLibrarySession.Builder(this, player!!, LibraryCallback())
                .setId("commodolab-session")
                .setSessionActivity(sessionActivity())
                .build()
        applyMode(LabHub.mode)
        LabHub.log("MediaLibraryService prêt")
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaLibrarySession? = session

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val modeName = intent?.getStringExtra(EXTRA_MODE)
        if (modeName != null) {
            LabHub.mode = PlayerMode.valueOf(modeName)
        }
        when (intent?.action) {
            ACTION_STOP -> {
                LabHub.mode = PlayerMode.C
                stopPlayback()
                return START_NOT_STICKY
            }
            ACTION_PAUSE -> {
                LabHub.mode = PlayerMode.B
                handler.removeCallbacks(keepAlive)
                exoPlayer?.playWhenReady = false
                LabHub.ourPlaying = false
                LabHub.notifyStatus()
            }
            else -> applyMode(LabHub.mode)
        }
        return super.onStartCommand(intent, flags, startId)
    }

    override fun onDestroy() {
        handler.removeCallbacks(keepAlive)
        session?.release()
        session = null
        exoPlayer?.release()
        exoPlayer = null
        player = null
        if (instance == this) instance = null
        LabHub.ourPlaying = false
        super.onDestroy()
    }

    private fun applyMode(mode: PlayerMode) {
        handler.removeCallbacks(keepAlive)
        when (mode) {
            PlayerMode.A, PlayerMode.D -> {
                ensurePlayingInternal()
                handler.post(keepAlive)
            }
            PlayerMode.B -> {
                exoPlayer?.playWhenReady = false
                LabHub.ourPlaying = false
            }
            PlayerMode.C -> stopPlayback()
        }
        LabHub.notifyStatus()
    }

    private fun ensurePlayingInternal() {
        val exo = exoPlayer ?: return
        if (LabHub.mode == PlayerMode.B || LabHub.mode == PlayerMode.C) return
        if (exo.playbackState == Player.STATE_IDLE || exo.playbackState == Player.STATE_ENDED) {
            exo.setMediaItems(keepAliveQueue())
            exo.prepare()
        }
        exo.playWhenReady = true
        exo.play()
        LabHub.ourPlaying = true
    }

    private fun stopPlayback() {
        handler.removeCallbacks(keepAlive)
        exoPlayer?.playWhenReady = false
        exoPlayer?.stop()
        LabHub.ourPlaying = false
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun sessionActivity(): PendingIntent {
        val launch = Intent(this, MainActivity::class.java)
        launch.flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        var flags = PendingIntent.FLAG_UPDATE_CURRENT
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags = flags or PendingIntent.FLAG_IMMUTABLE
        return PendingIntent.getActivity(this, 0, launch, flags)
    }

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(NotificationManager::class.java) ?: return
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "Commodolab", NotificationManager.IMPORTANCE_LOW),
        )
    }

    private class LibraryCallback : MediaLibrarySession.Callback {
        override fun onConnect(
            session: MediaSession,
            controller: MediaSession.ControllerInfo,
        ): MediaSession.ConnectionResult {
            val commands =
                MediaSession.ConnectionResult.DEFAULT_PLAYER_COMMANDS
                    .buildUpon()
                    .add(Player.COMMAND_SEEK_TO_NEXT)
                    .add(Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM)
                    .add(Player.COMMAND_SEEK_TO_PREVIOUS)
                    .add(Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM)
                    .build()
            return MediaSession.ConnectionResult.AcceptedResultBuilder(session)
                .setAvailablePlayerCommands(commands)
                .setAvailableSessionCommands(MediaSession.ConnectionResult.DEFAULT_SESSION_AND_LIBRARY_COMMANDS)
                .build()
        }

        override fun onMediaButtonEvent(
            session: MediaSession,
            controllerInfo: MediaSession.ControllerInfo,
            intent: Intent,
        ): Boolean {
            val event = intent.getParcelableExtra(Intent.EXTRA_KEY_EVENT) as? KeyEvent ?: return false
            if (event.action == KeyEvent.ACTION_DOWN) {
                val direction = KeyCodeMapper.directionFor(event.keyCode)
                if (direction != null) {
                    LabHub.emit(
                        ProbeEvent(
                            at = System.currentTimeMillis(),
                            sensor = Sensor.KEYCODE,
                            direction = direction,
                            keyCode = event.keyCode,
                        ),
                    )
                    ensurePlaying()
                    return true
                }
            }
            return super.onMediaButtonEvent(session, controllerInfo, intent)
        }

        override fun onGetLibraryRoot(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            params: MediaLibraryService.LibraryParams?,
        ): ListenableFuture<LibraryResult<MediaItem>> =
            Futures.immediateFuture(
                LibraryResult.ofItem(
                    MediaItem.Builder()
                        .setMediaId("root")
                        .setMediaMetadata(
                            MediaMetadata.Builder()
                                .setTitle("Commodolab")
                                .setIsBrowsable(true)
                                .setIsPlayable(false)
                                .build(),
                        )
                        .build(),
                    params,
                ),
            )

        override fun onGetChildren(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            parentId: String,
            page: Int,
            pageSize: Int,
            params: MediaLibraryService.LibraryParams?,
        ): ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> =
            Futures.immediateFuture(LibraryResult.ofItemList(ImmutableList.copyOf(keepAliveQueue()), params))

        override fun onGetItem(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            mediaId: String,
        ): ListenableFuture<LibraryResult<MediaItem>> =
            Futures.immediateFuture(LibraryResult.ofItem(keepAliveItem(mediaId), null))
    }
}
