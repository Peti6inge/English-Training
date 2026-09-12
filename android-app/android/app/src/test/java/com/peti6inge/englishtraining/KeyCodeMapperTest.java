package com.peti6inge.englishtraining;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import android.view.KeyEvent;
import org.junit.Test;

public class KeyCodeMapperTest {
  @Test
  public void directionForNextKeycodes() {
    assertEquals("next", KeyCodeMapper.directionFor(KeyEvent.KEYCODE_MEDIA_NEXT));
    assertEquals("next", KeyCodeMapper.directionFor(KeyEvent.KEYCODE_MEDIA_FAST_FORWARD));
    assertEquals("next", KeyCodeMapper.directionFor(KeyEvent.KEYCODE_MEDIA_SKIP_FORWARD));
  }

  @Test
  public void directionForPreviousKeycodes() {
    assertEquals("previous", KeyCodeMapper.directionFor(KeyEvent.KEYCODE_MEDIA_PREVIOUS));
    assertEquals("previous", KeyCodeMapper.directionFor(KeyEvent.KEYCODE_MEDIA_REWIND));
    assertEquals("previous", KeyCodeMapper.directionFor(KeyEvent.KEYCODE_MEDIA_SKIP_BACKWARD));
  }

  @Test
  public void directionForUnknownReturnsNull() {
    assertNull(KeyCodeMapper.directionFor(KeyEvent.KEYCODE_HOME));
  }
}
