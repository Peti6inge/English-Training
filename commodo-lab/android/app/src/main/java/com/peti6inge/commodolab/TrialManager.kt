package com.peti6inge.commodolab

import android.content.Context
import android.os.Handler
import android.os.Looper
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

class TrialManager(private val context: Context) {
    companion object {
        const val WINDOW_MS = 8_000L
    }

    private val handler = Handler(Looper.getMainLooper())
    private val closeWindow = Runnable { finish(miss = true) }

    @Volatile
    private var open = false
    private var intention: Intention = Intention.INCONNU
    private var t0: EnvSnapshot? = null
    private val events = mutableListOf<ProbeEvent>()
    private val results = mutableListOf<TrialResult>()

    var onUpdate: (() -> Unit)? = null

    var nextHits = 0
        private set
    var previousHits = 0
        private set
    var misses = 0
        private set
    var lastVerdict: String = "—"
        private set
    var windowOpen: Boolean = false
        private set

    fun start(nextIntention: Intention) {
        handler.removeCallbacks(closeWindow)
        intention = nextIntention
        events.clear()
        t0 = LabHub.snapshot()
        open = true
        windowOpen = true
        lastVerdict = "écoute 8s…"
        LabHub.log("ESSAI ${nextIntention.name} — ${VerdictClassifier.fingerprint(t0!!)}")
        onUpdate?.invoke()
        handler.postDelayed(closeWindow, WINDOW_MS)
    }

    fun onProbe(event: ProbeEvent) {
        if (!open) return
        events.add(event)
        if (events.size == 1) {
            finish(miss = false)
        }
    }

    fun jsonlFile(): File = File(context.cacheDir, "commodolab.jsonl")

    fun allResults(): List<TrialResult> = results.toList()

    private fun finish(miss: Boolean) {
        if (!open) return
        handler.removeCallbacks(closeWindow)
        open = false
        windowOpen = false
        val snapshotEvent = LabHub.snapshot()
        val collected = if (miss) emptyList() else events.toList()
        val verdict = if (miss) Verdict.MISS else VerdictClassifier.classify(collected)
        val result =
            TrialResult(
                intention = intention,
                verdict = verdict,
                mode = LabHub.mode,
                t0 = t0 ?: snapshotEvent,
                tEvent = snapshotEvent,
                events = VerdictClassifier.debounce(collected),
            )
        results.add(result)
        lastVerdict = "${verdict.name} · ${intention.name}"
        when {
            verdict == Verdict.MISS -> misses += 1
            result.events.firstOrNull()?.direction == "previous" ||
                intention.name.contains("PREV") -> previousHits += 1
            else -> nextHits += 1
        }
        appendJsonl(result)
        LabHub.log("VERDICT ${verdict.name} | T_event ${VerdictClassifier.fingerprint(snapshotEvent)}")
        onUpdate?.invoke()
    }

    private fun appendJsonl(result: TrialResult) {
        jsonlFile().appendText(toJson(result).toString() + "\n")
    }

    private fun toJson(result: TrialResult): JSONObject =
        JSONObject()
            .put("intention", result.intention.name)
            .put("verdict", result.verdict.name)
            .put("mode", result.mode.name)
            .put("t0", snapshotJson(result.t0))
            .put("tEvent", snapshotJson(result.tEvent))
            .put(
                "events",
                JSONArray().also { array ->
                    result.events.forEach { event ->
                        array.put(
                            JSONObject()
                                .put("at", event.at)
                                .put("sensor", event.sensor.name)
                                .put("direction", event.direction)
                                .put("keyCode", event.keyCode)
                                .put("sourcePackage", event.sourcePackage),
                        )
                    }
                },
            )

    private fun snapshotJson(snapshot: EnvSnapshot): JSONObject =
        JSONObject()
            .put("at", snapshot.at)
            .put("aa", snapshot.aa)
            .put("btOn", snapshot.btOn)
            .put("a2dp", snapshot.a2dp)
            .put("hfp", snapshot.hfp)
            .put("ourPlaying", snapshot.ourPlaying)
            .put("mode", snapshot.mode)
            .put("mic", snapshot.mic)
            .put("audioMode", snapshot.audioMode)
            .put("audioModeLabel", VerdictClassifier.audioModeLabel(snapshot.audioMode))
            .put("scoOn", snapshot.scoOn)
            .put("btDevices", JSONArray(snapshot.btDevices))
            .put("activeSessions", JSONArray(snapshot.activeSessions))
            .put("fingerprint", VerdictClassifier.fingerprint(snapshot))
}
