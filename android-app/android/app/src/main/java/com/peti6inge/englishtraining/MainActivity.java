package com.peti6inge.englishtraining;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(CarMediaPlugin.class);
    registerPlugin(NativeTtsPlugin.class);
    super.onCreate(savedInstanceState);
  }
}
