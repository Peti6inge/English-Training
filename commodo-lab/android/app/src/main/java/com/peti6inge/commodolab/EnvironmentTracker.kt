package com.peti6inge.commodolab

import android.Manifest
import android.bluetooth.BluetoothA2dp
import android.bluetooth.BluetoothHeadset
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.content.Context
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.app.UiModeManager
import android.os.Build
import androidx.core.content.ContextCompat

class EnvironmentTracker(private val context: Context) : BluetoothProfile.ServiceListener {
    private val manager = context.getSystemService(BluetoothManager::class.java)
    private var a2dpProxy: BluetoothA2dp? = null
    private var headsetProxy: BluetoothHeadset? = null

    fun start() {
        refreshAa()
        refreshBtFlags()
        val adapter = manager?.adapter ?: return
        try {
            adapter.getProfileProxy(context, this, BluetoothProfile.A2DP)
            adapter.getProfileProxy(context, this, BluetoothProfile.HEADSET)
        } catch (_: SecurityException) {
            LabHub.log("Bluetooth: permission manquante pour les profils")
        }
    }

    fun stop() {
        val adapter = manager?.adapter ?: return
        a2dpProxy?.let { adapter.closeProfileProxy(BluetoothProfile.A2DP, it) }
        headsetProxy?.let { adapter.closeProfileProxy(BluetoothProfile.HEADSET, it) }
        a2dpProxy = null
        headsetProxy = null
    }

    fun refreshAa() {
        val ui = context.getSystemService(UiModeManager::class.java)
        val car = ui?.currentModeType == Configuration.UI_MODE_TYPE_CAR
        val gearhead =
            try {
                context.packageManager.getPackageInfo("com.google.android.projection.gearhead", 0)
                true
            } catch (_: Exception) {
                false
            }
        LabHub.aa = car || gearhead
    }

    fun refreshBtFlags() {
        LabHub.btOn = manager?.adapter?.isEnabled == true
        refreshConnected()
        LabHub.notifyStatus()
    }

    override fun onServiceConnected(profile: Int, proxy: BluetoothProfile?) {
        when (profile) {
            BluetoothProfile.A2DP -> a2dpProxy = proxy as? BluetoothA2dp
            BluetoothProfile.HEADSET -> headsetProxy = proxy as? BluetoothHeadset
        }
        refreshConnected()
        LabHub.notifyStatus()
    }

    override fun onServiceDisconnected(profile: Int) {
        when (profile) {
            BluetoothProfile.A2DP -> a2dpProxy = null
            BluetoothProfile.HEADSET -> headsetProxy = null
        }
        refreshConnected()
        LabHub.notifyStatus()
    }

    private fun refreshConnected() {
        if (!hasConnectPermission()) {
            LabHub.a2dp = false
            LabHub.hfp = false
            LabHub.btDevices = emptyList()
            return
        }
        val names = linkedSetOf<String>()
        val a2dpDevices =
            try {
                a2dpProxy?.connectedDevices.orEmpty()
            } catch (_: SecurityException) {
                emptyList()
            }
        val hfpDevices =
            try {
                headsetProxy?.connectedDevices.orEmpty()
            } catch (_: SecurityException) {
                emptyList()
            }
        LabHub.a2dp = a2dpDevices.isNotEmpty()
        LabHub.hfp = hfpDevices.isNotEmpty()
        (a2dpDevices + hfpDevices).forEach { device ->
            val label =
                try {
                    device.name ?: device.address
                } catch (_: SecurityException) {
                    device.address
                }
            names.add(label)
        }
        LabHub.btDevices = names.toList()
    }

    private fun hasConnectPermission(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
        return ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_CONNECT) ==
            PackageManager.PERMISSION_GRANTED
    }
}
