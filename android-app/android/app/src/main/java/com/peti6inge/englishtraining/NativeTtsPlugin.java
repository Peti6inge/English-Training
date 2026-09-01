package com.peti6inge.englishtraining;

import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicInteger;

@CapacitorPlugin(name = "NativeTts")
public class NativeTtsPlugin extends Plugin {
  private TextToSpeech tts;
  private boolean ready = false;
  private PluginCall pendingSpeak;
  private final AtomicInteger utteranceSeq = new AtomicInteger();

  @Override
  public void load() {
    tts = new TextToSpeech(getContext(), status -> ready = status == TextToSpeech.SUCCESS);
  }

  @Override
  protected void handleOnDestroy() {
    if (tts != null) {
      tts.shutdown();
      tts = null;
    }
    ready = false;
    super.handleOnDestroy();
  }

  @PluginMethod
  public void init(PluginCall call) {
    if (ready && tts != null) {
      call.resolve();
      return;
    }
    getBridge()
        .getWebView()
        .postDelayed(
            () -> {
              if (ready) call.resolve();
              else call.reject("TTS init failed");
            },
            800);
  }

  @PluginMethod
  public void cancel(PluginCall call) {
    if (pendingSpeak != null) {
      pendingSpeak.resolve();
      pendingSpeak = null;
    }
    if (tts != null) tts.stop();
    call.resolve();
  }

  @PluginMethod
  public void speak(PluginCall call) {
    String text = call.getString("text", "").trim();
    if (text.isEmpty()) {
      call.resolve();
      return;
    }
    if (!ready || tts == null) {
      call.reject("TTS not ready");
      return;
    }

    if (pendingSpeak != null) {
      pendingSpeak.resolve();
      pendingSpeak = null;
    }

    String lang = call.getString("lang", "fr-FR");
    float rate = call.getFloat("rate", 0.95f);
    Locale locale = Locale.forLanguageTag(lang.replace('_', '-'));
    int langResult = tts.setLanguage(locale);
    if (langResult == TextToSpeech.LANG_MISSING_DATA || langResult == TextToSpeech.LANG_NOT_SUPPORTED) {
      tts.setLanguage(Locale.getDefault());
    }
    tts.setSpeechRate(rate);

    String utteranceId = "et-" + utteranceSeq.incrementAndGet();
    pendingSpeak = call;
    tts.setOnUtteranceProgressListener(
        new UtteranceProgressListener() {
          @Override
          public void onStart(String id) {}

          @Override
          public void onDone(String id) {
            finishSpeak(id, false);
          }

          @Override
          @Deprecated
          public void onError(String id) {
            finishSpeak(id, true);
          }

          @Override
          public void onError(String id, int errorCode) {
            finishSpeak(id, true);
          }

          private void finishSpeak(String id, boolean failed) {
            if (!utteranceId.equals(id) || pendingSpeak == null) return;
            PluginCall active = pendingSpeak;
            pendingSpeak = null;
            if (failed) active.reject("TTS playback error");
            else active.resolve();
          }
        });

    Bundle params = new Bundle();
    params.putString(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, utteranceId);
    tts.stop();
    int result = tts.speak(text, TextToSpeech.QUEUE_FLUSH, params, utteranceId);
    if (result != TextToSpeech.SUCCESS) {
      pendingSpeak = null;
      call.reject("TTS speak failed");
    }
  }
}
