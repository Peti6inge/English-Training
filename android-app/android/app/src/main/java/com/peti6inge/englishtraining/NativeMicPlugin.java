package com.peti6inge.englishtraining;

import android.Manifest;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;

/**
 * Native microphone for Vosk (Duster / plain Bluetooth variant).
 *
 * During listening phases, opens Bluetooth SCO so {@link MediaRecorder.AudioSource#VOICE_COMMUNICATION}
 * routes through the car hands-free mic. SCO is released on pause/stop so AVRCP steering keys keep
 * working between utterances. Falls back to {@link MediaRecorder.AudioSource#VOICE_RECOGNITION}
 * (phone mic) when SCO is unavailable.
 */
@CapacitorPlugin(
    name = "NativeMic",
    permissions = {@Permission(alias = NativeMicPlugin.MIC_ALIAS, strings = {Manifest.permission.RECORD_AUDIO})})
public class NativeMicPlugin extends Plugin {
  static final String MIC_ALIAS = "microphone";
  private static final int SAMPLE_RATE = 16_000;
  private static final int CHUNK_SAMPLES = SAMPLE_RATE / 10; // 100 ms

  private AudioRecord record;
  private Thread thread;
  private volatile boolean running;
  private volatile boolean muted;
  private volatile boolean scoCapture;
  private volatile int audioSource = MediaRecorder.AudioSource.VOICE_RECOGNITION;

  @PluginMethod
  public void start(PluginCall call) {
    if (getPermissionState(MIC_ALIAS) != PermissionState.GRANTED) {
      requestPermissionForAlias(MIC_ALIAS, call, "startAfterPermission");
      return;
    }
    startCapture(call);
  }

  @PermissionCallback
  private void startAfterPermission(PluginCall call) {
    if (getPermissionState(MIC_ALIAS) != PermissionState.GRANTED) {
      call.reject("Micro refusé");
      return;
    }
    startCapture(call);
  }

  @PluginMethod
  public void pause(PluginCall call) {
    muted = true;
    BluetoothScoHelper.releaseForMedia(getContext());
    scoCapture = false;
    call.resolve(state());
  }

  @PluginMethod
  public void resume(PluginCall call) {
    scoCapture = BluetoothScoHelper.acquireForCapture(getContext());
    audioSource =
        scoCapture ? MediaRecorder.AudioSource.VOICE_COMMUNICATION : MediaRecorder.AudioSource.VOICE_RECOGNITION;
    muted = false;
    call.resolve(state());
  }

  @PluginMethod
  public void stop(PluginCall call) {
    stopCapture();
    call.resolve(state());
  }

  @PluginMethod
  public void state(PluginCall call) {
    call.resolve(state());
  }

  @Override
  protected void handleOnDestroy() {
    stopCapture();
    super.handleOnDestroy();
  }

  private JSObject state() {
    JSObject ret = new JSObject();
    ret.put("running", running);
    ret.put("muted", muted);
    ret.put("sampleRate", SAMPLE_RATE);
    ret.put("btSco", scoCapture && BluetoothScoHelper.isScoConnected());
    ret.put("audioSource", scoCapture ? "communication" : "recognition");
    return ret;
  }

  private synchronized void startCapture(PluginCall call) {
    if (running && record != null) {
      scoCapture = BluetoothScoHelper.acquireForCapture(getContext());
      audioSource =
          scoCapture ? MediaRecorder.AudioSource.VOICE_COMMUNICATION : MediaRecorder.AudioSource.VOICE_RECOGNITION;
      muted = false;
      call.resolve(state());
      return;
    }
    stopCapture();

    scoCapture = BluetoothScoHelper.acquireForCapture(getContext());
    audioSource =
        scoCapture ? MediaRecorder.AudioSource.VOICE_COMMUNICATION : MediaRecorder.AudioSource.VOICE_RECOGNITION;

    int minBuffer =
        AudioRecord.getMinBufferSize(SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
    int bufferBytes = Math.max(minBuffer, CHUNK_SAMPLES * 2 * 4);
    AudioRecord recorder;
    try {
      recorder =
          new AudioRecord(audioSource, SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, bufferBytes);
    } catch (Exception e) {
      BluetoothScoHelper.releaseForMedia(getContext());
      scoCapture = false;
      call.reject("AudioRecord: " + e.getMessage());
      return;
    }
    if (recorder.getState() != AudioRecord.STATE_INITIALIZED) {
      recorder.release();
      if (scoCapture) {
        scoCapture = false;
        BluetoothScoHelper.releaseForMedia(getContext());
        try {
          recorder =
              new AudioRecord(
                  MediaRecorder.AudioSource.VOICE_RECOGNITION,
                  SAMPLE_RATE,
                  AudioFormat.CHANNEL_IN_MONO,
                  AudioFormat.ENCODING_PCM_16BIT,
                  bufferBytes);
        } catch (Exception e) {
          call.reject("AudioRecord: " + e.getMessage());
          return;
        }
        if (recorder.getState() != AudioRecord.STATE_INITIALIZED) {
          recorder.release();
          call.reject("AudioRecord non initialisé");
          return;
        }
        audioSource = MediaRecorder.AudioSource.VOICE_RECOGNITION;
      } else {
        call.reject("AudioRecord non initialisé");
        return;
      }
    }

    record = recorder;
    running = true;
    muted = false;
    try {
      recorder.startRecording();
    } catch (IllegalStateException e) {
      running = false;
      recorder.release();
      record = null;
      BluetoothScoHelper.releaseAll(getContext());
      scoCapture = false;
      call.reject("startRecording: " + e.getMessage());
      return;
    }

    final int captureSource = audioSource;
    final boolean captureSco = scoCapture;
    final AudioRecord activeRecord = recorder;
    thread =
        new Thread(
            () -> {
              short[] pcm = new short[CHUNK_SAMPLES];
              ByteBuffer bytes = ByteBuffer.allocate(CHUNK_SAMPLES * 2).order(ByteOrder.LITTLE_ENDIAN);
              while (running) {
                int read = activeRecord.read(pcm, 0, pcm.length);
                if (read < 0) {
                  emitError("read=" + read);
                  break;
                }
                if (read == 0 || muted) continue;
                bytes.clear();
                for (int i = 0; i < read; i++) bytes.putShort(pcm[i]);
                String data = Base64.encodeToString(bytes.array(), 0, read * 2, Base64.NO_WRAP);
                JSObject payload = new JSObject();
                payload.put("data", data);
                payload.put("samples", read);
                payload.put("sampleRate", SAMPLE_RATE);
                payload.put("btSco", captureSco && BluetoothScoHelper.isScoConnected());
                payload.put("audioSource", captureSource);
                notifyListeners("pcm", payload);
              }
            },
            "native-mic");
    thread.setDaemon(true);
    thread.start();
    call.resolve(state());
  }

  private synchronized void stopCapture() {
    running = false;
    muted = false;
    if (thread != null) {
      try {
        thread.join(500);
      } catch (InterruptedException ignored) {
        Thread.currentThread().interrupt();
      }
      thread = null;
    }
    if (record != null) {
      try {
        record.stop();
      } catch (IllegalStateException ignored) {
        /* already stopped */
      }
      record.release();
      record = null;
    }
    BluetoothScoHelper.releaseAll(getContext());
    scoCapture = false;
    audioSource = MediaRecorder.AudioSource.VOICE_RECOGNITION;
  }

  private void emitError(String message) {
    JSObject payload = new JSObject();
    payload.put("message", message);
    notifyListeners("error", payload);
  }
}
