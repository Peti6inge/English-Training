package com.peti6inge.englishtraining;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.view.KeyEvent;
/**
 * Plain-Bluetooth AVRCP often delivers steering-wheel keys via {@link Intent#ACTION_MEDIA_BUTTON}
 * without an Android Auto controller. Route known transport codes to {@link CarMediaBridge}
 * and keep {@link CarMediaService} in a playing state.
 */
public class EtMediaButtonReceiver extends BroadcastReceiver {
  @Override
  public void onReceive(Context context, Intent intent) {
    if (intent == null || !Intent.ACTION_MEDIA_BUTTON.equals(intent.getAction())) return;
    KeyEvent event = intent.getParcelableExtra(Intent.EXTRA_KEY_EVENT);
    if (event != null && event.getAction() == KeyEvent.ACTION_DOWN) {
      String direction = KeyCodeMapper.directionFor(event.getKeyCode());
      if (direction != null) {
        CarMediaBridge.emit(direction, "receiver");
        CarMediaService.ensurePlaying();
        return;
      }
      if (KeyCodeMapper.isTransport(event.getKeyCode())) {
        CarMediaService.ensurePlaying();
      }
    }
  }
}
