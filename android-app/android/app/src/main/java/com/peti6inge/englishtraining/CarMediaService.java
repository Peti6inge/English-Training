package com.peti6inge.englishtraining;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.view.KeyEvent;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.session.LibraryResult;
import androidx.media3.session.MediaLibraryService;
import androidx.media3.session.MediaSession;
import com.google.common.collect.ImmutableList;
import com.google.common.util.concurrent.Futures;
import com.google.common.util.concurrent.ListenableFuture;

public class CarMediaService extends MediaLibraryService {
  static final String ACTION_START = "com.peti6inge.englishtraining.action.START";
  static final String ACTION_STOP = "com.peti6inge.englishtraining.action.STOP";
  static final String ACTION_METADATA = "com.peti6inge.englishtraining.action.METADATA";
  static final String ACTION_KEEP_ALIVE = "com.peti6inge.englishtraining.action.KEEP_ALIVE";
  private static final String CHANNEL_ID = "english_training_media";
  private static final int NOTIFICATION_ID = 42;
  private static final long KEEP_ALIVE_MS = 1500L;

  static volatile CarMediaService instance;
  static volatile boolean stopping;

  private ExoPlayer exoPlayer;
  private SteeringPlayer player;
  private MediaLibraryService.MediaLibrarySession session;
  private final Handler handler = new Handler(Looper.getMainLooper());
  private final Runnable keepAliveTick =
      new Runnable() {
        @Override
        public void run() {
          ensurePlayingInternal();
          if (!stopping && exoPlayer != null) {
            handler.postDelayed(this, KEEP_ALIVE_MS);
          }
        }
      };

  static void ensurePlaying() {
    CarMediaService svc = instance;
    if (svc == null) return;
    svc.handler.post(svc::ensurePlayingInternal);
  }

  static boolean isStopping() {
    return stopping;
  }

  @Override
  public void onCreate() {
    super.onCreate();
    stopping = false;
    instance = this;
    ensureChannel();
    NotificationCompat.Builder notif =
        new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_et)
            .setContentTitle("English Training")
            .setContentText("Session média voiture active")
            .setOngoing(true)
            .setSilent(true)
            .setContentIntent(sessionActivity());
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      startForeground(NOTIFICATION_ID, notif.build(), ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
    } else {
      startForeground(NOTIFICATION_ID, notif.build());
    }

    AudioAttributes audioAttributes =
        new AudioAttributes.Builder()
            .setUsage(C.USAGE_MEDIA)
            .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
            .build();

    exoPlayer = new ExoPlayer.Builder(this).build();
    exoPlayer.setAudioAttributes(audioAttributes, /* handleAudioFocus= */ false);
    exoPlayer.setRepeatMode(Player.REPEAT_MODE_ALL);
    exoPlayer.setVolume(1f);
    player = new SteeringPlayer(exoPlayer);
    exoPlayer.setMediaSource(CarMediaBridge.silenceSource());
    exoPlayer.setPlayWhenReady(true);
    exoPlayer.prepare();
    exoPlayer.addListener(
        new Player.Listener() {
          @Override
          public void onPlayWhenReadyChanged(boolean playWhenReady, int reason) {
            if (!playWhenReady && !stopping) {
              handler.post(CarMediaService.this::ensurePlayingInternal);
            }
          }

          @Override
          public void onPlaybackStateChanged(int playbackState) {
            if (stopping) return;
            if (playbackState == Player.STATE_ENDED || playbackState == Player.STATE_IDLE) {
              handler.post(CarMediaService.this::restartSilence);
            }
          }
        });

    session =
        new MediaLibraryService.MediaLibrarySession.Builder(this, player, new LibraryCallback())
            .setId("english-training-session")
            .setSessionActivity(sessionActivity())
            .build();

    handler.post(keepAliveTick);
  }

  @Nullable
  @Override
  public MediaLibraryService.MediaLibrarySession onGetSession(MediaSession.ControllerInfo controllerInfo) {
    return session;
  }

  @Override
  public int onStartCommand(Intent intent, int flags, int startId) {
    if (intent != null) {
      String action = intent.getAction();
      if (ACTION_STOP.equals(action)) {
        stopPlayback();
        return START_NOT_STICKY;
      }
      if (intent.hasExtra("title")) {
        CarMediaBridge.title = intent.getStringExtra("title");
      }
      if (intent.hasExtra("artist")) {
        CarMediaBridge.artist = intent.getStringExtra("artist");
      }
      if (ACTION_METADATA.equals(action) || ACTION_START.equals(action) || ACTION_KEEP_ALIVE.equals(action)) {
        applyMetadata();
      }
    }
    return super.onStartCommand(intent, flags, startId);
  }

  void applyMetadata() {
    if (exoPlayer == null) return;
    exoPlayer.setPlaylistMetadata(CarMediaBridge.metadata());
    ensurePlayingInternal();
  }

  private void restartSilence() {
    if (stopping || exoPlayer == null) return;
    exoPlayer.setMediaSource(CarMediaBridge.silenceSource());
    exoPlayer.prepare();
    exoPlayer.setPlayWhenReady(true);
    exoPlayer.play();
  }

  private void ensurePlayingInternal() {
    if (stopping || exoPlayer == null) return;
    int state = exoPlayer.getPlaybackState();
    if (state == Player.STATE_IDLE || state == Player.STATE_ENDED) {
      restartSilence();
      return;
    }
    if (!exoPlayer.getPlayWhenReady()) {
      exoPlayer.setPlayWhenReady(true);
    }
    exoPlayer.play();
  }

  private void stopPlayback() {
    stopping = true;
    handler.removeCallbacks(keepAliveTick);
    if (exoPlayer != null) {
      exoPlayer.setPlayWhenReady(false);
      exoPlayer.stop();
    }
    stopForeground(STOP_FOREGROUND_REMOVE);
    stopSelf();
  }

  @Override
  public void onDestroy() {
    stopping = true;
    handler.removeCallbacks(keepAliveTick);
    instance = null;
    if (session != null) {
      session.release();
      session = null;
    }
    if (exoPlayer != null) {
      exoPlayer.release();
      exoPlayer = null;
    }
    player = null;
    super.onDestroy();
  }

  private PendingIntent sessionActivity() {
    Intent launch = new Intent(this, MainActivity.class);
    launch.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
    int flags = PendingIntent.FLAG_UPDATE_CURRENT;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      flags |= PendingIntent.FLAG_IMMUTABLE;
    }
    return PendingIntent.getActivity(this, 0, launch, flags);
  }

  private void ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    NotificationManager manager = getSystemService(NotificationManager.class);
    if (manager == null) return;
    NotificationChannel channel =
        new NotificationChannel(CHANNEL_ID, "English Training", NotificationManager.IMPORTANCE_LOW);
    channel.setDescription("Session média pour les commandes du volant");
    channel.setSound(null, null);
    manager.createNotificationChannel(channel);
  }

  private static final class LibraryCallback implements MediaLibraryService.MediaLibrarySession.Callback {
    @Override
    public MediaSession.ConnectionResult onConnect(
        MediaSession session, MediaSession.ControllerInfo controller) {
      Player.Commands playerCommands =
          MediaSession.ConnectionResult.DEFAULT_PLAYER_COMMANDS
              .buildUpon()
              .add(Player.COMMAND_SEEK_TO_NEXT)
              .add(Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM)
              .add(Player.COMMAND_SEEK_TO_PREVIOUS)
              .add(Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM)
              .build();
      return new MediaSession.ConnectionResult.AcceptedResultBuilder(session)
          .setAvailablePlayerCommands(playerCommands)
          .setAvailableSessionCommands(MediaSession.ConnectionResult.DEFAULT_SESSION_AND_LIBRARY_COMMANDS)
          .build();
    }

    @Override
    public boolean onMediaButtonEvent(
        MediaSession session, MediaSession.ControllerInfo controllerInfo, Intent intent) {
      KeyEvent event = intent.getParcelableExtra(Intent.EXTRA_KEY_EVENT);
      if (event != null && event.getAction() == KeyEvent.ACTION_DOWN) {
        int code = event.getKeyCode();
        if (code == KeyEvent.KEYCODE_MEDIA_NEXT
            || code == KeyEvent.KEYCODE_MEDIA_SKIP_FORWARD
            || code == KeyEvent.KEYCODE_MEDIA_FAST_FORWARD) {
          CarMediaBridge.emit("next");
          CarMediaService.ensurePlaying();
          return true;
        }
        if (code == KeyEvent.KEYCODE_MEDIA_PREVIOUS
            || code == KeyEvent.KEYCODE_MEDIA_SKIP_BACKWARD
            || code == KeyEvent.KEYCODE_MEDIA_REWIND) {
          CarMediaBridge.emit("previous");
          CarMediaService.ensurePlaying();
          return true;
        }
        if (code == KeyEvent.KEYCODE_MEDIA_PLAY
            || code == KeyEvent.KEYCODE_MEDIA_PAUSE
            || code == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE) {
          CarMediaService.ensurePlaying();
          return true;
        }
      }
      return MediaLibraryService.MediaLibrarySession.Callback.super.onMediaButtonEvent(
          session, controllerInfo, intent);
    }

    @Override
    public ListenableFuture<LibraryResult<MediaItem>> onGetLibraryRoot(
        MediaLibraryService.MediaLibrarySession session,
        MediaSession.ControllerInfo browser,
        @Nullable MediaLibraryService.LibraryParams params) {
      return Futures.immediateFuture(LibraryResult.ofItem(CarMediaBridge.rootItem(), params));
    }

    @Override
    public ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> onGetChildren(
        MediaLibraryService.MediaLibrarySession session,
        MediaSession.ControllerInfo browser,
        String parentId,
        int page,
        int pageSize,
        @Nullable MediaLibraryService.LibraryParams params) {
      return Futures.immediateFuture(
          LibraryResult.ofItemList(ImmutableList.of(CarMediaBridge.playableItem()), params));
    }

    @Override
    public ListenableFuture<LibraryResult<MediaItem>> onGetItem(
        MediaLibraryService.MediaLibrarySession session,
        MediaSession.ControllerInfo browser,
        String mediaId) {
      return Futures.immediateFuture(LibraryResult.ofItem(CarMediaBridge.playableItem(), null));
    }
  }
}
