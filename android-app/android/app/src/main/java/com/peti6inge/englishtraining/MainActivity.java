package com.peti6inge.englishtraining;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.view.KeyEvent;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  private static final int REQ_BT = 81;

  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(CarMediaPlugin.class);
    registerPlugin(NativeTtsPlugin.class);
    registerPlugin(NativeMicPlugin.class);
    super.onCreate(savedInstanceState);
    requestBluetoothConnectIfNeeded();
  }

  @Override
  public boolean dispatchKeyEvent(KeyEvent event) {
    if (event.getAction() == KeyEvent.ACTION_DOWN) {
      String direction = KeyCodeMapper.directionFor(event.getKeyCode());
      if (direction != null) {
        CarMediaBridge.emit(direction, "activity");
        CarMediaService.ensurePlaying();
        return true;
      }
      if (KeyCodeMapper.isTransport(event.getKeyCode())) {
        CarMediaService.ensurePlaying();
        return true;
      }
    }
    return super.dispatchKeyEvent(event);
  }

  private void requestBluetoothConnectIfNeeded() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return;
    if (ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_CONNECT)
        == PackageManager.PERMISSION_GRANTED) {
      return;
    }
    ActivityCompat.requestPermissions(this, new String[] {Manifest.permission.BLUETOOTH_CONNECT}, REQ_BT);
  }
}
