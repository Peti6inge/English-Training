package com.peti6inge.englishtraining;

import android.media.AudioAttributes;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
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
  private static final long SPEAK_TIMEOUT_MS = 20_000L;

  private TextToSpeech tts;
  private boolean ready = false;
  private PluginCall pendingSpeak;
  private String pendingUtteranceId;
  private final AtomicInteger utteranceSeq = new AtomicInteger();
  private final Handler main = new Handler(Looper.getMainLooper());
  private final Runnable speakTimeout = this::timeoutSpeak;

  @Override
  public void load() {
    tts =
        new TextToSpeech(
            getContext(),
            status -> {
              ready = status == TextToSpeech.SUCCESS;
              if (ready && tts != null) {
                applySpeechAudioAttributes();
              }
            });
  }

  @Override
  protected void handleOnDestroy() {
    main.removeCallbacks(speakTimeout);
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
    main.postDelayed(
        () -> {
          if (ready) call.resolve();
          else call.reject("TTS init failed");
        },
        800);
  }

  @PluginMethod
  public void cancel(PluginCall call) {
    finishSpeak(false);
    if (tts != null) tts.stop();
    CarMediaService.ensurePlaying();
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

    finishSpeak(false);

    String lang = call.getString("lang", "fr-FR");
    float rate = call.getFloat("rate", 0.95f);
    Locale locale = Locale.forLanguageTag(lang.replace('_', '-'));
    int langResult = tts.setLanguage(locale);
    if (langResult == TextToSpeech.LANG_MISSING_DATA || langResult == TextToSpeech.LANG_NOT_SUPPORTED) {
      tts.setLanguage(Locale.getDefault());
    }
    tts.setSpeechRate(rate);
    applySpeechAudioAttributes();

    String utteranceId = "et-" + utteranceSeq.incrementAndGet();
    pendingUtteranceId = utteranceId;
    pendingSpeak = call;
    tts.setOnUtteranceProgressListener(
        new UtteranceProgressListener() {
          @Override
          public void onStart(String id) {
            CarMediaService.ensurePlaying();
          }

          @Override
          public void onDone(String id) {
            completeIfCurrent(id, false);
          }

          @Override
          @Deprecated
          public void onError(String id) {
            completeIfCurrent(id, true);
          }

          @Override
          public void onError(String id, int errorCode) {
            completeIfCurrent(id, true);
          }

          private void completeIfCurrent(String id, boolean failed) {
            main.post(
                () -> {
                  if (!utteranceId.equals(id)) return;
                  finishSpeak(failed);
                  CarMediaService.ensurePlaying();
                });
          }
        });

    Bundle params = new Bundle();
    params.putString(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, utteranceId);
    tts.stop();
    int result = tts.speak(text, TextToSpeech.QUEUE_FLUSH, params, utteranceId);
    if (result != TextToSpeech.SUCCESS) {
      pendingSpeak = null;
      pendingUtteranceId = null;
      call.reject("TTS speak failed");
      CarMediaService.ensurePlaying();
      return;
    }
    main.removeCallbacks(speakTimeout);
    main.postDelayed(speakTimeout, SPEAK_TIMEOUT_MS);
  }

  private void applySpeechAudioAttributes() {
    if (tts == null) return;
    AudioAttributes attrs =
        new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
            .build();
    tts.setAudioAttributes(attrs);
  }

  private void timeoutSpeak() {
    finishSpeak(false);
    CarMediaService.ensurePlaying();
  }

  private void finishSpeak(boolean failed) {
    main.removeCallbacks(speakTimeout);
    PluginCall active = pendingSpeak;
    pendingSpeak = null;
    pendingUtteranceId = null;
    if (active == null) return;
    if (failed) active.reject("TTS playback error");
    else active.resolve();
  }
}
