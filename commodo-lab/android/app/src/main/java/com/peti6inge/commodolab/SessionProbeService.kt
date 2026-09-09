package com.peti6inge.commodolab

import android.content.ComponentName
import android.media.MediaMetadata
import android.media.session.MediaController
import android.media.session.MediaSessionManager
import android.os.Handler
import android.os.Looper
import android.service.notification.NotificationListenerService

class SessionProbeService : NotificationListenerService() {
    private val main = Handler(Looper.getMainLooper())
    private val controllers = mutableMapOf<String, MediaController>()
    private val callbacks = mutableMapOf<String, MediaController.Callback>()
    private val titles = mutableMapOf<String, String>()
    private var sessionManager: MediaSessionManager? = null

    private val sessionsChanged =
        MediaSessionManager.OnActiveSessionsChangedListener {
            sync()
        }

    override fun onListenerConnected() {
        super.onListenerConnected()
        sessionManager = getSystemService(MediaSessionManager::class.java)
        val cn = ComponentName(this, SessionProbeService::class.java)
        try {
            sessionManager?.addOnActiveSessionsChangedListener(sessionsChanged, cn, main)
        } catch (_: SecurityException) {
            LabHub.log("Sessions tierces: accès notifications requis")
        }
        sync()
        LabHub.log("SessionProbe connecté")
    }

    override fun onListenerDisconnected() {
        drop()
        try {
            sessionManager?.removeOnActiveSessionsChangedListener(sessionsChanged)
        } catch (_: Exception) {
            /* gone */
        }
        super.onListenerDisconnected()
    }

    private fun sync() {
        drop()
        val cn = ComponentName(this, SessionProbeService::class.java)
        val active =
            try {
                sessionManager?.getActiveSessions(cn).orEmpty()
            } catch (_: SecurityException) {
                emptyList()
            }
        LabHub.activeSessions = active.mapNotNull { it.packageName }.distinct()
        LabHub.notifyStatus()
        for (controller in active) {
            val pkg = controller.packageName ?: continue
            if (pkg == packageName) continue
            if (pkg in IGNORED) continue
            val callback =
                object : MediaController.Callback() {
                    override fun onMetadataChanged(metadata: MediaMetadata?) {
                        val title = metadata?.getText(MediaMetadata.METADATA_KEY_TITLE)?.toString().orEmpty()
                        val previous = titles[pkg]
                        titles[pkg] = title
                        if (previous != null && previous != title && title.isNotEmpty()) {
                            LabHub.emit(
                                ProbeEvent(
                                    at = System.currentTimeMillis(),
                                    sensor = Sensor.OTHER_SESSION,
                                    direction = "next",
                                    sourcePackage = pkg,
                                ),
                            )
                        }
                    }
                }
            controllers[pkg] = controller
            callbacks[pkg] = callback
            titles[pkg] = controller.metadata?.getText(MediaMetadata.METADATA_KEY_TITLE)?.toString().orEmpty()
            controller.registerCallback(callback, main)
        }
    }

    private fun drop() {
        for ((pkg, controller) in controllers) {
            callbacks[pkg]?.let { controller.unregisterCallback(it) }
        }
        controllers.clear()
        callbacks.clear()
    }

    companion object {
        private val IGNORED =
            setOf(
                "com.google.android.projection.gearhead",
                "com.google.android.apps.maps",
                "com.google.android.googlequicksearchbox",
                "com.android.systemui",
            )
    }
}
