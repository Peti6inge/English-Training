package com.peti6inge.commodolab

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.view.KeyEvent

class LabMediaButtonReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (Intent.ACTION_MEDIA_BUTTON != intent.action) return
        val event = intent.getParcelableExtra(Intent.EXTRA_KEY_EVENT) as? KeyEvent ?: return
        if (event.action != KeyEvent.ACTION_DOWN) return
        val direction = KeyCodeMapper.directionFor(event.keyCode) ?: return
        LabHub.emit(
            ProbeEvent(
                at = System.currentTimeMillis(),
                sensor = Sensor.MEDIA_BUTTON_RECEIVER,
                direction = direction,
                keyCode = event.keyCode,
            ),
        )
    }
}
