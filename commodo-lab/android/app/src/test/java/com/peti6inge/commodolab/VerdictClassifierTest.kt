package com.peti6inge.commodolab

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class VerdictClassifierTest {
    @Test
    fun emptyIsMiss() {
        assertEquals(Verdict.MISS, VerdictClassifier.classify(emptyList()))
    }

    @Test
    fun aaPlayerWins() {
        val events =
            listOf(
                ProbeEvent(10, Sensor.AA_PLAYER, "next"),
                ProbeEvent(12, Sensor.KEYCODE, "next", keyCode = 87),
            )
        assertEquals(Verdict.HIT_AA_PLAYER, VerdictClassifier.classify(events))
    }

    @Test
    fun keycodeFromReceiver() {
        val events = listOf(ProbeEvent(10, Sensor.MEDIA_BUTTON_RECEIVER, "previous", keyCode = 88))
        assertEquals(Verdict.HIT_KEYCODE, VerdictClassifier.classify(events))
    }

    @Test
    fun activityHit() {
        val events = listOf(ProbeEvent(10, Sensor.ACTIVITY, "next", keyCode = 87))
        assertEquals(Verdict.HIT_ACTIVITY, VerdictClassifier.classify(events))
    }

    @Test
    fun otherSessionHit() {
        val events = listOf(ProbeEvent(10, Sensor.OTHER_SESSION, "next", sourcePackage = "com.spotify.music"))
        assertEquals(Verdict.HIT_OTHER_SESSION, VerdictClassifier.classify(events))
    }

    @Test
    fun debounceSameDirection() {
        val events =
            listOf(
                ProbeEvent(100, Sensor.AA_PLAYER, "next"),
                ProbeEvent(200, Sensor.KEYCODE, "next", keyCode = 87),
                ProbeEvent(500, Sensor.AA_PLAYER, "previous"),
            )
        val kept = VerdictClassifier.debounce(events)
        assertEquals(2, kept.size)
        assertEquals("next", kept[0].direction)
        assertEquals("previous", kept[1].direction)
    }

    @Test
    fun fingerprintContainsFlags() {
        val snap =
            EnvSnapshot(
                at = 1,
                aa = true,
                btOn = true,
                btDevices = listOf("Renault"),
                a2dp = true,
                hfp = false,
                activeSessions = listOf("com.spotify.music"),
                ourPlaying = true,
                mode = "A",
            )
        val text = VerdictClassifier.fingerprint(snap)
        assertTrue(text.contains("aa=oui"))
        assertTrue(text.contains("a2dp=oui"))
        assertTrue(text.contains("hfp=non"))
        assertTrue(text.contains("Renault"))
        assertTrue(text.contains("com.spotify.music"))
    }

    @Test
    fun keyMapping() {
        assertEquals("next", KeyCodeMapper.directionFor(KeyCodeMapper.KEYCODE_MEDIA_NEXT))
        assertEquals("previous", KeyCodeMapper.directionFor(KeyCodeMapper.KEYCODE_MEDIA_PREVIOUS))
        assertNull(KeyCodeMapper.directionFor(24))
    }
}
