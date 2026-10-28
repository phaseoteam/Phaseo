package app.phaseo.haptics

import android.annotation.SuppressLint
import android.content.Context
import android.content.res.Resources
import android.media.AudioAttributes
import android.os.Build
import android.os.VibrationAttributes
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * What the phone's vibration motor can play, and short touch-feedback pulses for phones whose motor can't play the
 * system's haptic effects. View.performHapticFeedback drops those effects as unsupported there: a Galaxy A53 reports
 * no effects and no primitives at all, so the system's ticks, clicks and toggles never play, from any app.
 *
 * src/lib/haptics.ts chooses: the system's effects where the motor has them, these pulses where it doesn't.
 */
class PhaseoHapticsModule : Module() {
  private val context: Context?
    get() = appContext.reactContext

  private val vibrator: Vibrator?
    get() {
      val context = context ?: return null
      return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        (context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
      } else {
        @Suppress("DEPRECATION")
        context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
      }
    }

  override fun definition() = ModuleDefinition {
    Name("PhaseoHaptics")

    Function("capabilities") {
      capabilities()
    }

    AsyncFunction("pulse") { timings: List<Int>, amplitudes: List<Int> ->
      pulse(timings, amplitudes)
    }
  }

  /**
   * `vibrator`: there's a motor. `amplitude`: it can vary its strength. `effects`: it plays the predefined click,
   * tick, heavy click and double click that the system's haptic feedback is made of (null when Android
   * can't tell: before Android 11, or a motor that doesn't say). `primitives`: it plays the click and tick primitives
   * Android 14's newer feedback is composed from (null when it can't tell). `tapPulseMs`: how long the system's own tap
   * pattern runs the motor (null if the phone doesn't list one).
   */
  private fun capabilities(): Map<String, Any?> {
    val vibrator = vibrator
    return mapOf(
      "vibrator" to (vibrator?.hasVibrator() == true),
      "amplitude" to (vibrator != null && hasAmplitudeControl(vibrator)),
      "effects" to vibrator?.let { effectsSupported(it) },
      "primitives" to vibrator?.let { primitivesSupported(it) },
      "tapPulseMs" to systemPatternOnMs("config_virtualKeyVibePattern"),
    )
  }

  /**
   * How long one of the system's own vibration patterns runs the motor (ms): a framework int-array of off and on times,
   * or a single on time. Android falls back to these on motors without effects, but makers can play their own instead:
   * a Galaxy A53 lists a 20 ms tap and plays 45 ms. Null if the phone doesn't have the pattern.
   */
  @SuppressLint("DiscouragedApi")
  private fun systemPatternOnMs(name: String): Int? {
    return try {
      val resources = Resources.getSystem()
      val id = resources.getIdentifier(name, "array", "android")
      if (id == 0) return null
      val pattern = resources.getIntArray(id)
      when {
        pattern.isEmpty() -> null
        pattern.size == 1 -> pattern[0]
        else -> pattern.filterIndexed { index, _ -> index % 2 == 1 }.sum()
      }
    } catch (_: Exception) {
      null
    }
  }

  private fun hasAmplitudeControl(vibrator: Vibrator): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false
    return vibrator.hasAmplitudeControl()
  }

  private fun effectsSupported(vibrator: Vibrator): Boolean? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return null
    val support = vibrator.areAllEffectsSupported(
      VibrationEffect.EFFECT_CLICK,
      VibrationEffect.EFFECT_TICK,
      VibrationEffect.EFFECT_HEAVY_CLICK,
      VibrationEffect.EFFECT_DOUBLE_CLICK,
    )
    return when (support) {
      Vibrator.VIBRATION_EFFECT_SUPPORT_YES -> true
      Vibrator.VIBRATION_EFFECT_SUPPORT_NO -> false
      else -> null
    }
  }

  private fun primitivesSupported(vibrator: Vibrator): Boolean? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return null
    return vibrator.areAllPrimitivesSupported(VibrationEffect.Composition.PRIMITIVE_CLICK, VibrationEffect.Composition.PRIMITIVE_TICK)
  }

  /** The phone's touch feedback setting (Sound and vibration). Off means no touch haptics, as for the system's own. */
  private fun touchFeedbackOn(): Boolean {
    val context = context ?: return false
    // Deprecated for apps that write it; it is still the setting, and reading it is how to respect it.
    @Suppress("DEPRECATION")
    return Settings.System.getInt(context.contentResolver, Settings.System.HAPTIC_FEEDBACK_ENABLED, 1) != 0
  }

  /**
   * A waveform as touch feedback: `timings` alternate off and on (ms, starting with the wait before the first pulse) and
   * `amplitudes` give each segment's strength (0 to 255), used where the motor can vary it. Marked as touch, so the
   * phone's touch vibration intensity applies to it, as it does to the system's own touch haptics.
   */
  private fun pulse(timings: List<Int>, amplitudes: List<Int>) {
    val vibrator = vibrator ?: return
    if (timings.isEmpty() || !vibrator.hasVibrator() || !touchFeedbackOn()) return
    val waveTimings = timings.map { it.coerceIn(0, 1000).toLong() }.toLongArray()
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      @Suppress("DEPRECATION")
      vibrator.vibrate(waveTimings, -1)
      return
    }
    val effect = if (amplitudes.size == timings.size && vibrator.hasAmplitudeControl()) {
      VibrationEffect.createWaveform(waveTimings, amplitudes.map { it.coerceIn(0, 255) }.toIntArray(), -1)
    } else {
      VibrationEffect.createWaveform(waveTimings, -1)
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      vibrator.vibrate(effect, VibrationAttributes.createForUsage(VibrationAttributes.USAGE_TOUCH))
    } else {
      val attributes = AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .build()
      @Suppress("DEPRECATION")
      vibrator.vibrate(effect, attributes)
    }
  }
}
