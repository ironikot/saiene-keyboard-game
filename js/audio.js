/*
 * audio.js — 効果音（WebAudio で合成。外部素材ファイルは使わない）
 */
(function (global) {
  "use strict";

  let ctx = null;
  let enabled = true;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) ctx = new AC();
    }
    if (ctx && ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function beep(freq, durMs, type, gain) {
    if (!enabled) return;
    const c = ensure();
    if (!c) return;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type || "sine";
    osc.frequency.value = freq;
    g.gain.value = gain == null ? 0.06 : gain;
    osc.connect(g);
    g.connect(c.destination);
    const now = c.currentTime;
    g.gain.setValueAtTime(g.gain.value, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + durMs / 1000);
    osc.start(now);
    osc.stop(now + durMs / 1000);
  }

  const Sound = {
    setEnabled(v) {
      enabled = !!v;
    },
    isEnabled() {
      return enabled;
    },
    unlock() {
      ensure();
    },
    type() {
      beep(880, 40, "square", 0.04);
    },
    miss() {
      beep(160, 120, "sawtooth", 0.07);
    },
    word() {
      // 軽い上昇アルペジオ
      beep(660, 80, "triangle", 0.06);
      setTimeout(() => beep(990, 110, "triangle", 0.06), 70);
    },
    finish() {
      beep(523, 120, "triangle", 0.07);
      setTimeout(() => beep(659, 120, "triangle", 0.07), 110);
      setTimeout(() => beep(784, 200, "triangle", 0.07), 220);
    },
  };

  global.Sound = Sound;
})(window);
