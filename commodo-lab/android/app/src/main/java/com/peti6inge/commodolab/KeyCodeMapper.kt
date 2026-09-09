package com.peti6inge.commodolab

object KeyCodeMapper {
    const val KEYCODE_MEDIA_NEXT = 87
    const val KEYCODE_MEDIA_PREVIOUS = 88
    const val KEYCODE_MEDIA_PLAY = 126
    const val KEYCODE_MEDIA_PAUSE = 127
    const val KEYCODE_MEDIA_PLAY_PAUSE = 85
    const val KEYCODE_MEDIA_FAST_FORWARD = 90
    const val KEYCODE_MEDIA_REWIND = 89
    const val KEYCODE_MEDIA_SKIP_FORWARD = 272
    const val KEYCODE_MEDIA_SKIP_BACKWARD = 273

    fun directionFor(keyCode: Int): String? =
        when (keyCode) {
            KEYCODE_MEDIA_NEXT,
            KEYCODE_MEDIA_FAST_FORWARD,
            KEYCODE_MEDIA_SKIP_FORWARD,
            -> "next"
            KEYCODE_MEDIA_PREVIOUS,
            KEYCODE_MEDIA_REWIND,
            KEYCODE_MEDIA_SKIP_BACKWARD,
            -> "previous"
            else -> null
        }

    fun isTransport(keyCode: Int): Boolean =
        directionFor(keyCode) != null ||
            keyCode == KEYCODE_MEDIA_PLAY ||
            keyCode == KEYCODE_MEDIA_PAUSE ||
            keyCode == KEYCODE_MEDIA_PLAY_PAUSE
}
