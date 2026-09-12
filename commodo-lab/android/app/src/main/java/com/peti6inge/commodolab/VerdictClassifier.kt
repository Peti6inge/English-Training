package com.peti6inge.commodolab

object VerdictClassifier {
    const val DEBOUNCE_MS = 280L

    fun debounce(events: List<ProbeEvent>, windowMs: Long = DEBOUNCE_MS): List<ProbeEvent> {
        if (events.isEmpty()) return emptyList()
        val ordered = events.sortedBy { it.at }
        val kept = mutableListOf<ProbeEvent>()
        for (event in ordered) {
            val last = kept.lastOrNull()
            val duplicate =
                last != null &&
                    last.direction == event.direction &&
                    event.at - last.at < windowMs
            if (!duplicate) kept.add(event)
        }
        return kept
    }

    fun classify(events: List<ProbeEvent>): Verdict {
        val first = debounce(events).minByOrNull { it.at } ?: return Verdict.MISS
        return when (first.sensor) {
            Sensor.AA_PLAYER -> Verdict.HIT_AA_PLAYER
            Sensor.KEYCODE, Sensor.MEDIA_BUTTON_RECEIVER -> Verdict.HIT_KEYCODE
            Sensor.ACTIVITY -> Verdict.HIT_ACTIVITY
            Sensor.OTHER_SESSION -> Verdict.HIT_OTHER_SESSION
        }
    }

    fun fingerprint(snapshot: EnvSnapshot): String {
        val devices = snapshot.btDevices.joinToString(",")
        val sessions = snapshot.activeSessions.joinToString(",")
        return "aa=${yn(snapshot.aa)} btOn=${yn(snapshot.btOn)} a2dp=${yn(snapshot.a2dp)} " +
            "hfp=${yn(snapshot.hfp)} ourPlaying=${yn(snapshot.ourPlaying)} " +
            "mode=${snapshot.mode} mic=${snapshot.mic} audioMode=${audioModeLabel(snapshot.audioMode)} " +
            "sco=${yn(snapshot.scoOn)} btDevices=[$devices] activeSessions=[$sessions]"
    }

    fun audioModeLabel(mode: Int): String =
        when (mode) {
            0 -> "NORMAL"
            1 -> "RINGTONE"
            2 -> "IN_CALL"
            3 -> "IN_COMMUNICATION"
            4 -> "CALL_SCREENING"
            else -> "UNKNOWN($mode)"
        }

    private fun yn(value: Boolean): String = if (value) "oui" else "non"
}
