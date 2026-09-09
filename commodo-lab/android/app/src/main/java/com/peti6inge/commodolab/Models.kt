package com.peti6inge.commodolab

enum class PlayerMode {
    A,
    B,
    C,
    D,
}

enum class Intention {
    COMMOD_NEXT,
    COMMOD_PREV,
    ECRAN_AA_NEXT,
    ECRAN_AA_PREV,
    INCONNU,
}

enum class Sensor {
    AA_PLAYER,
    KEYCODE,
    ACTIVITY,
    MEDIA_BUTTON_RECEIVER,
    OTHER_SESSION,
}

enum class Verdict {
    HIT_AA_PLAYER,
    HIT_KEYCODE,
    HIT_ACTIVITY,
    HIT_OTHER_SESSION,
    MISS,
}

data class ProbeEvent(
    val at: Long,
    val sensor: Sensor,
    val direction: String,
    val keyCode: Int? = null,
    val sourcePackage: String? = null,
)

data class EnvSnapshot(
    val at: Long,
    val aa: Boolean,
    val btOn: Boolean,
    val btDevices: List<String>,
    val a2dp: Boolean,
    val hfp: Boolean,
    val activeSessions: List<String>,
    val ourPlaying: Boolean,
    val mode: String,
)

data class TrialResult(
    val intention: Intention,
    val verdict: Verdict,
    val mode: PlayerMode,
    val t0: EnvSnapshot,
    val tEvent: EnvSnapshot,
    val events: List<ProbeEvent>,
)
