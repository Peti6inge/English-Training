package com.peti6inge.englishtraining;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import androidx.annotation.Nullable;
import androidx.core.content.ContextCompat;

/**
 * Routes microphone capture through the car Bluetooth hands-free link (HFP / SCO) when
 * available. Released between listening phases so AVRCP media keys stay usable on plain
 * Bluetooth head units (Dacia Duster, no Android Auto).
 */
final class BluetoothScoHelper {
  private static final long SCO_CONNECT_TIMEOUT_MS = 3500L;

  private static Context appContext;
  private static AudioManager audioManager;
  private static final Handler main = new Handler(Looper.getMainLooper());

  private static volatile boolean captureWantsSco;
  private static volatile boolean scoConnected;
  @Nullable private static BroadcastReceiver scoReceiver;

  private BluetoothScoHelper() {}

  /** Car mic capture is active — {@link CarMediaService} must not tear down SCO. */
  static boolean isMicCaptureWantsSco() {
    return captureWantsSco;
  }

  static boolean isScoConnected() {
    return scoConnected || readScoOn();
  }

  static void init(Context context) {
    if (appContext == null) {
      appContext = context.getApplicationContext();
      audioManager = appContext.getSystemService(AudioManager.class);
    }
  }

  /**
   * @return true if SCO is connected or was already available for capture
   */
  @SuppressWarnings("deprecation")
  static boolean acquireForCapture(Context context) {
    init(context);
    captureWantsSco = true;
    if (audioManager == null) return false;
    if (readScoOn()) {
      scoConnected = true;
      return true;
    }
    ensureScoReceiver();
    try {
      audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);
    } catch (Exception ignored) {
      /* continue with legacy SCO */
    }
    return connectScoModern() || connectScoLegacy();
  }

  @SuppressWarnings("deprecation")
  static void releaseForMedia(Context context) {
    init(context);
    captureWantsSco = false;
    disconnectSco();
    try {
      if (audioManager != null && audioManager.getMode() != AudioManager.MODE_NORMAL) {
        audioManager.setMode(AudioManager.MODE_NORMAL);
      }
    } catch (Exception ignored) {
      /* ignore */
    }
  }

  static void releaseAll(Context context) {
    releaseForMedia(context);
    unregisterScoReceiver();
  }

  @SuppressWarnings("deprecation")
  private static boolean connectScoModern() {
    if (audioManager == null) return false;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      for (AudioDeviceInfo device : audioManager.getAvailableCommunicationDevices()) {
        if (device.getType() != AudioDeviceInfo.TYPE_BLUETOOTH_SCO) continue;
        try {
          if (audioManager.setCommunicationDevice(device)) {
            scoConnected = readScoOn();
            return scoConnected;
          }
        } catch (Exception ignored) {
          /* try legacy */
        }
      }
    }
    return false;
  }

  @SuppressWarnings("deprecation")
  private static boolean connectScoLegacy() {
    if (audioManager == null) return false;
    try {
      audioManager.startBluetoothSco();
      audioManager.setBluetoothScoOn(true);
    } catch (Exception ignored) {
      return false;
    }
    long deadline = System.currentTimeMillis() + SCO_CONNECT_TIMEOUT_MS;
    while (System.currentTimeMillis() < deadline) {
      if (readScoOn()) {
        scoConnected = true;
        return true;
      }
      try {
        Thread.sleep(80);
      } catch (InterruptedException e) {
        Thread.currentThread().interrupt();
        break;
      }
    }
    scoConnected = readScoOn();
    return scoConnected;
  }

  @SuppressWarnings("deprecation")
  private static void disconnectSco() {
    scoConnected = false;
    if (audioManager == null) return;
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        audioManager.clearCommunicationDevice();
      }
    } catch (Exception ignored) {
      /* ignore */
    }
    try {
      if (audioManager.isBluetoothScoOn()) {
        audioManager.setBluetoothScoOn(false);
      }
      audioManager.stopBluetoothSco();
    } catch (Exception ignored) {
      /* ignore */
    }
  }

  @SuppressWarnings("deprecation")
  private static boolean readScoOn() {
    if (audioManager == null) return false;
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        AudioDeviceInfo device = audioManager.getCommunicationDevice();
        if (device != null && device.getType() == AudioDeviceInfo.TYPE_BLUETOOTH_SCO) {
          return true;
        }
      }
      return audioManager.isBluetoothScoOn();
    } catch (Exception e) {
      return false;
    }
  }

  private static void ensureScoReceiver() {
    if (appContext == null || scoReceiver != null) return;
    scoReceiver =
        new BroadcastReceiver() {
          @Override
          public void onReceive(Context context, Intent intent) {
            int state = intent.getIntExtra(AudioManager.EXTRA_SCO_AUDIO_STATE, -1);
            if (state == AudioManager.SCO_AUDIO_STATE_CONNECTED) {
              scoConnected = true;
            } else if (state == AudioManager.SCO_AUDIO_STATE_DISCONNECTED) {
              scoConnected = false;
            }
          }
        };
    IntentFilter filter = new IntentFilter(AudioManager.ACTION_SCO_AUDIO_STATE_UPDATED);
    ContextCompat.registerReceiver(appContext, scoReceiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED);
  }

  private static void unregisterScoReceiver() {
    if (appContext == null || scoReceiver == null) return;
    try {
      appContext.unregisterReceiver(scoReceiver);
    } catch (Exception ignored) {
      /* ignore */
    }
    scoReceiver = null;
  }
}
