package com.peti6inge.commodolab

import android.content.Context
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Build

/**
 * Single-variable probe: opens the microphone the way a native app would (MIC)
 * or the way the Chromium WebView does for getUserMedia (COMM = MODE_IN_COMMUNICATION
 * + Bluetooth SCO). Everything else in the lab stays untouched.
 */
object MicProbe {
    private const val SAMPLE_RATE = 16_000

    private var audioManager: AudioManager? = null
    private var record: AudioRecord? = null
    private var thread: Thread? = null

    @Volatile
    private var running = false

    fun init(context: Context) {
        if (audioManager == null) {
            audioManager = context.getSystemService(AudioManager::class.java)
        }
    }

    fun audioMode(): Int = audioManager?.mode ?: AudioManager.MODE_INVALID

    @Suppress("DEPRECATION")
    fun scoOn(): Boolean {
        val manager = audioManager ?: return false
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val device = manager.communicationDevice
            if (device != null && device.type == android.media.AudioDeviceInfo.TYPE_BLUETOOTH_SCO) return true
        }
        return manager.isBluetoothScoOn
    }

    fun apply(mode: MicMode) {
        stopCapture()
        LabHub.micMode = mode
        when (mode) {
            MicMode.OFF -> restoreNormal()
            MicMode.MIC -> {
                restoreNormal()
                startCapture(MediaRecorder.AudioSource.VOICE_RECOGNITION)
            }
            MicMode.COMM -> {
                enterCommunication()
                startCapture(MediaRecorder.AudioSource.VOICE_COMMUNICATION)
            }
        }
        LabHub.log("Micro ${mode.name} — audioMode=${audioMode()} sco=${scoOn()}")
        LabHub.notifyStatus()
    }

    fun release() {
        stopCapture()
        restoreNormal()
    }

    /** Mirrors org.chromium.media.AudioManagerAndroid when an HFP headset is connected. */
    @Suppress("DEPRECATION")
    private fun enterCommunication() {
        val manager = audioManager ?: return
        try {
            manager.mode = AudioManager.MODE_IN_COMMUNICATION
        } catch (e: SecurityException) {
            LabHub.log("setMode refusé: ${e.message}")
        }
        try {
            manager.startBluetoothSco()
            manager.isBluetoothScoOn = true
        } catch (e: Exception) {
            LabHub.log("startBluetoothSco refusé: ${e.message}")
        }
    }

    @Suppress("DEPRECATION")
    private fun restoreNormal() {
        val manager = audioManager ?: return
        try {
            if (manager.isBluetoothScoOn) manager.isBluetoothScoOn = false
            manager.stopBluetoothSco()
        } catch (_: Exception) {
            /* no SCO to stop */
        }
        try {
            if (manager.mode != AudioManager.MODE_NORMAL) manager.mode = AudioManager.MODE_NORMAL
        } catch (e: SecurityException) {
            LabHub.log("setMode(NORMAL) refusé: ${e.message}")
        }
    }

    private fun startCapture(source: Int) {
        val minBuffer =
            AudioRecord.getMinBufferSize(SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
        val bufferSize = maxOf(minBuffer, SAMPLE_RATE / 5 * 2)
        val recorder =
            try {
                AudioRecord(source, SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, bufferSize)
            } catch (e: Exception) {
                LabHub.log("AudioRecord impossible: ${e.message}")
                return
            }
        if (recorder.state != AudioRecord.STATE_INITIALIZED) {
            LabHub.log("AudioRecord non initialisé (permission RECORD_AUDIO ?)")
            recorder.release()
            return
        }
        record = recorder
        running = true
        recorder.startRecording()
        thread =
            Thread {
                val buffer = ShortArray(SAMPLE_RATE / 10)
                while (running) {
                    val read = recorder.read(buffer, 0, buffer.size)
                    if (read < 0) break
                }
            }.apply {
                name = "commodolab-mic"
                isDaemon = true
                start()
            }
    }

    private fun stopCapture() {
        running = false
        thread?.let {
            try {
                it.join(500)
            } catch (_: InterruptedException) {
                /* ignore */
            }
        }
        thread = null
        record?.let {
            try {
                it.stop()
            } catch (_: Exception) {
                /* already stopped */
            }
            it.release()
        }
        record = null
    }
}
