package com.peti6inge.englishtraining;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "CarMedia")
public class CarMediaPlugin extends Plugin {
  void emit(String event, JSObject data) {
    notifyListeners(event, data != null ? data : new JSObject());
  }

  @Override
  public void load() {
    CarMediaBridge.plugin = this;
  }

  @Override
  protected void handleOnDestroy() {
    CarMediaBridge.plugin = null;
    super.handleOnDestroy();
  }

  @PluginMethod
  public void startSession(PluginCall call) {
    applyCallMetadata(call);
    startService(CarMediaService.ACTION_START);
    JSObject ret = new JSObject();
    ret.put("ok", true);
    ret.put("notifications", hasNotificationPermission());
    ret.put("notificationListener", isNotificationListenerEnabled());
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
  public void setMediaRelay(PluginCall call) {
    boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
    MediaRelayService.setEnabled(enabled);
    JSObject ret = new JSObject();
    ret.put("enabled", enabled);
    ret.put("notificationListener", isNotificationListenerEnabled());
    call.resolve(ret);
  }

  @PluginMethod
  public void notificationAccess(PluginCall call) {
    JSObject ret = new JSObject();
    ret.put("notificationListener", isNotificationListenerEnabled());
    call.resolve(ret);
  }

  @PluginMethod
  public void openNotificationAccess(PluginCall call) {
    Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    getContext().startActivity(intent);
    call.resolve();
  }

  @PluginMethod
  public void stopSession(PluginCall call) {
    MediaRelayService.setEnabled(false);
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

  private boolean isNotificationListenerEnabled() {
    String flat =
        Settings.Secure.getString(getContext().getContentResolver(), "enabled_notification_listeners");
    String pkg = getContext().getPackageName();
    return flat != null && pkg != null && flat.contains(pkg);
  }
}
