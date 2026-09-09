package com.peti6inge.commodolab

import android.media.AudioManager
import android.media.ToneGenerator
import java.util.concurrent.CopyOnWriteArrayList

object LabHub {
    @Volatile
    var mode: PlayerMode = PlayerMode.A

    @Volatile
    var ourPlaying: Boolean = false

    @Volatile
    var aa: Boolean = false

    @Volatile
    var btOn: Boolean = false

    @Volatile
    var a2dp: Boolean = false

    @Volatile
    var hfp: Boolean = false

    @Volatile
    var btDevices: List<String> = emptyList()

    @Volatile
    var activeSessions: List<String> = emptyList()

    val logListeners = CopyOnWriteArrayList<(String) -> Unit>()
    val probeListeners = CopyOnWriteArrayList<(ProbeEvent) -> Unit>()
    val statusListeners = CopyOnWriteArrayList<() -> Unit>()

    fun log(message: String) {
        logListeners.forEach { it(message) }
    }

    fun emit(event: ProbeEvent) {
        log(
            "HIT ${event.sensor} ${event.direction}" +
                (event.keyCode?.let { " key=$it" } ?: "") +
                (event.sourcePackage?.let { " pkg=$it" } ?: ""),
        )
        if (mode == PlayerMode.D && event.direction != "pause") {
            beep()
        }
        probeListeners.forEach { it(event) }
        notifyStatus()
    }

    fun notifyStatus() {
        statusListeners.forEach { it() }
    }

    fun snapshot(): EnvSnapshot =
        EnvSnapshot(
            at = System.currentTimeMillis(),
            aa = aa,
            btOn = btOn,
            btDevices = btDevices,
            a2dp = a2dp,
            hfp = hfp,
            activeSessions = activeSessions,
            ourPlaying = ourPlaying,
            mode = mode.name,
        )

    fun statusLine(): String {
        val snap = snapshot()
        return VerdictClassifier.fingerprint(snap)
    }

    private fun beep() {
        try {
            ToneGenerator(AudioManager.STREAM_MUSIC, 80).startTone(ToneGenerator.TONE_PROP_BEEP, 160)
        } catch (_: Exception) {
            /* no audio path */
        }
    }
}
