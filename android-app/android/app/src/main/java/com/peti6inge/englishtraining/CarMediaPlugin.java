package com.peti6inge.englishtraining;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "CarMedia")
public class CarMediaPlugin extends Plugin {
  void emit(String event, JSObject data) {
    notifyListeners(event, data != null ? data : new JSObject(), true);
  }

  @Override
  public void load() {
    CarMediaBridge.attachPlugin(this);
    startHoldSession();
  }

  @Override
  protected void handleOnResume() {
    CarMediaBridge.attachPlugin(this);
    super.handleOnResume();
  }

  @Override
  protected void handleOnDestroy() {
    CarMediaBridge.detachPlugin(this);
    super.handleOnDestroy();
  }

  @PluginMethod
  public void startSession(PluginCall call) {
    applyCallMetadata(call);
    startHoldSession();
    JSObject ret = new JSObject();
    ret.put("ok", true);
    ret.put("notifications", hasNotificationPermission());
    call.resolve(ret);
  }

  @PluginMethod
  public void updateMetadata(PluginCall call) {
    applyCallMetadata(call);
    startService(CarMediaService.ACTION_METADATA);
    call.resolve();
  }

  @PluginMethod
  public void keepAlive(PluginCall call) {
    startService(CarMediaService.ACTION_KEEP_ALIVE);
    CarMediaService.ensurePlaying();
    call.resolve();
  }

  @PluginMethod
  public void stopSession(PluginCall call) {
    Intent intent = new Intent(getContext(), CarMediaService.class);
    intent.setAction(CarMediaService.ACTION_STOP);
    getContext().startService(intent);
    call.resolve();
  }

  private void applyCallMetadata(PluginCall call) {
    String title = call.getString("title");
    String artist = call.getString("artist");
    if (title != null && !title.isEmpty()) {
      CarMediaBridge.title = title;
    }
    if (artist != null && !artist.isEmpty()) {
      CarMediaBridge.artist = artist;
    }
  }

  private void startHoldSession() {
    try {
      startService(CarMediaService.ACTION_START);
    } catch (Exception ignored) {
      /* JS boot retries via startSession */
    }
  }

  private void startService(String action) {
    Intent intent = new Intent(getContext(), CarMediaService.class);
    intent.setAction(action);
    intent.putExtra("title", CarMediaBridge.title);
    intent.putExtra("artist", CarMediaBridge.artist);
    ContextCompat.startForegroundService(getContext(), intent);
  }

  private boolean hasNotificationPermission() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return true;
    return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS)
        == PackageManager.PERMISSION_GRANTED;
  }
}
