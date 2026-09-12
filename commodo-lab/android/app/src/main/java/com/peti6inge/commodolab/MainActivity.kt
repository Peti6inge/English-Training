package com.peti6inge.commodolab

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.KeyEvent
import android.widget.Button
import android.widget.RadioGroup
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider

class MainActivity : AppCompatActivity() {
    private lateinit var tracker: EnvironmentTracker
    private lateinit var trials: TrialManager
    private val journal = StringBuilder()

    private val onLog: (String) -> Unit = { line ->
        runOnUiThread {
            journal.insert(0, "[${ts()}] $line\n")
            if (journal.length > 8000) journal.setLength(8000)
            findViewById<TextView>(R.id.log).text = journal
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        tracker = EnvironmentTracker(this)
        trials = TrialManager(this)
        trials.onUpdate = { refresh() }

        LabHub.logListeners.add(onLog)
        LabHub.probeListeners.add { trials.onProbe(it) }
        LabHub.statusListeners.add { runOnUiThread { refresh() } }

        requestRuntimePermissions()
        MicProbe.init(this)
        tracker.start()
        applyMode(PlayerMode.A)

        findViewById<Button>(R.id.btn_commod_next).setOnClickListener { trials.start(Intention.COMMOD_NEXT) }
        findViewById<Button>(R.id.btn_commod_prev).setOnClickListener { trials.start(Intention.COMMOD_PREV) }
        findViewById<Button>(R.id.btn_screen_next).setOnClickListener { trials.start(Intention.ECRAN_AA_NEXT) }
        findViewById<Button>(R.id.btn_screen_prev).setOnClickListener { trials.start(Intention.ECRAN_AA_PREV) }
        findViewById<Button>(R.id.btn_unknown).setOnClickListener { trials.start(Intention.INCONNU) }
        findViewById<Button>(R.id.btn_notif).setOnClickListener {
            startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
        }
        findViewById<Button>(R.id.btn_export).setOnClickListener { exportLogs() }

        findViewById<RadioGroup>(R.id.modes).setOnCheckedChangeListener { _, checkedId ->
            val mode =
                when (checkedId) {
                    R.id.mode_b -> PlayerMode.B
                    R.id.mode_c -> PlayerMode.C
                    R.id.mode_d -> PlayerMode.D
                    else -> PlayerMode.A
                }
            applyMode(mode)
        }
        findViewById<RadioGroup>(R.id.mics).setOnCheckedChangeListener { _, checkedId ->
            val mic =
                when (checkedId) {
                    R.id.mic_mic -> MicMode.MIC
                    R.id.mic_comm -> MicMode.COMM
                    else -> MicMode.OFF
                }
            if (mic != MicMode.OFF && !hasRecordAudioPermission()) {
                LabHub.log("RECORD_AUDIO manquant — accorder la permission puis réessayer")
                ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.RECORD_AUDIO), 2)
            }
            MicProbe.apply(mic)
            refresh()
        }
        refresh()
        LabHub.log("Commodolab prêt — choisir une intention puis appuyer dans les 8 s")
    }

    override fun onResume() {
        super.onResume()
        tracker.refreshAa()
        tracker.refreshBtFlags()
    }

    override fun onDestroy() {
        LabHub.logListeners.remove(onLog)
        MicProbe.release()
        tracker.stop()
        super.onDestroy()
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.action == KeyEvent.ACTION_DOWN) {
            val direction = KeyCodeMapper.directionFor(event.keyCode)
            if (direction != null) {
                LabHub.emit(
                    ProbeEvent(
                        at = System.currentTimeMillis(),
                        sensor = Sensor.ACTIVITY,
                        direction = direction,
                        keyCode = event.keyCode,
                    ),
                )
            }
        }
        return super.dispatchKeyEvent(event)
    }

    private fun applyMode(mode: PlayerMode) {
        LabHub.mode = mode
        val intent = Intent(this, LabMediaService::class.java)
        intent.putExtra(LabMediaService.EXTRA_MODE, mode.name)
        when (mode) {
            PlayerMode.C -> {
                intent.action = LabMediaService.ACTION_STOP
                if (LabMediaService.instance != null) startService(intent)
                LabHub.ourPlaying = false
            }
            PlayerMode.B -> {
                intent.action = LabMediaService.ACTION_PAUSE
                ContextCompat.startForegroundService(this, intent)
            }
            PlayerMode.A, PlayerMode.D -> {
                intent.action = LabMediaService.ACTION_START
                ContextCompat.startForegroundService(this, intent)
            }
        }
        LabHub.log("Mode ${mode.name}")
        refresh()
    }

    private fun refresh() {
        findViewById<TextView>(R.id.status).text = LabHub.statusLine()
        val listening = if (trials.windowOpen) " (fenêtre ouverte)" else ""
        findViewById<TextView>(R.id.verdict).text = "Verdict : ${trials.lastVerdict}$listening"
        findViewById<TextView>(R.id.counters).text =
            "Next ${trials.nextHits} · Prev ${trials.previousHits} · Miss ${trials.misses}"
    }

    private fun exportLogs() {
        val file = trials.jsonlFile()
        if (!file.exists() || file.length() == 0L) {
            LabHub.log("Rien à exporter")
            return
        }
        val uri = FileProvider.getUriForFile(this, "$packageName.fileprovider", file)
        val send =
            Intent(Intent.ACTION_SEND).apply {
                type = "application/jsonl"
                putExtra(Intent.EXTRA_STREAM, uri)
                putExtra(Intent.EXTRA_SUBJECT, "commodolab.jsonl")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
        startActivity(Intent.createChooser(send, "Exporter Commodolab"))
    }

    private fun requestRuntimePermissions() {
        val needed = mutableListOf<String>()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_CONNECT) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            needed.add(Manifest.permission.BLUETOOTH_CONNECT)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            needed.add(Manifest.permission.POST_NOTIFICATIONS)
        }
        if (!hasRecordAudioPermission()) {
            needed.add(Manifest.permission.RECORD_AUDIO)
        }
        if (needed.isNotEmpty()) {
            ActivityCompat.requestPermissions(this, needed.toTypedArray(), 1)
        }
    }

    private fun hasRecordAudioPermission(): Boolean =
        ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) ==
            PackageManager.PERMISSION_GRANTED

    private fun ts(): String {
        val now = java.util.Calendar.getInstance()
        return "%02d:%02d:%02d".format(
            now.get(java.util.Calendar.HOUR_OF_DAY),
            now.get(java.util.Calendar.MINUTE),
            now.get(java.util.Calendar.SECOND),
        )
    }
}
