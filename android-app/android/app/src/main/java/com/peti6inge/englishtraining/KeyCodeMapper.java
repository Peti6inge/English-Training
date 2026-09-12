package com.peti6inge.englishtraining;

import android.view.KeyEvent;

/** AVRCP / steering-wheel keycodes (mirrors CommodoLab KeyCodeMapper). */
final class KeyCodeMapper {
  private KeyCodeMapper() {}

  static String directionFor(int keyCode) {
    switch (keyCode) {
      case KeyEvent.KEYCODE_MEDIA_NEXT:
      case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD:
      case KeyEvent.KEYCODE_MEDIA_SKIP_FORWARD:
        return "next";
      case KeyEvent.KEYCODE_MEDIA_PREVIOUS:
      case KeyEvent.KEYCODE_MEDIA_REWIND:
      case KeyEvent.KEYCODE_MEDIA_SKIP_BACKWARD:
        return "previous";
      default:
        return null;
    }
  }

  static boolean isTransport(int keyCode) {
    return directionFor(keyCode) != null
        || keyCode == KeyEvent.KEYCODE_MEDIA_PLAY
        || keyCode == KeyEvent.KEYCODE_MEDIA_PAUSE
        || keyCode == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE;
  }
}
