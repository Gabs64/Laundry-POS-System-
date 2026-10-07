/**
 * MY STORE POS - Sound Synthesis Module (Web Audio API)
 * Provides crisp audio cues for POS interactions: add item, remove, checkout success, warnings.
 */

const Sound = {
  enabled: true,
  audioCtx: null,

  init() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext && !this.audioCtx) {
        this.audioCtx = new AudioContext();
      }
    } catch (e) {
      console.warn("Web Audio API not supported", e);
    }
  },

  ensureContext() {
    if (!this.audioCtx) {
      this.init();
    }
    if (this.audioCtx && this.audioCtx.state === "suspended") {
      this.audioCtx.resume();
    }
  },

  toggleSound() {
    this.enabled = !this.enabled;
    const icon = document.getElementById("sound-icon");
    if (icon) {
      if (this.enabled) {
        icon.setAttribute("data-lucide", "volume-2");
        this.playBeep(880, 0.08);
      } else {
        icon.setAttribute("data-lucide", "volume-x");
      }
      if (window.lucide) lucide.createIcons();
    }
    App.showToast(this.enabled ? "Sound effects enabled" : "Sound effects muted", "info");
  },

  playBeep(frequency = 600, duration = 0.08, type = "sine") {
    if (!this.enabled) return;
    try {
      this.ensureContext();
      if (!this.audioCtx) return;

      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(frequency, this.audioCtx.currentTime);

      gain.gain.setValueAtTime(0.12, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + duration);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start();
      osc.stop(this.audioCtx.currentTime + duration);
    } catch (e) {
      // Ignore audio synthesis restrictions if user hasn't interacted
    }
  },

  playAdd() {
    this.playBeep(750, 0.07, "sine");
  },

  playRemove() {
    this.playBeep(350, 0.08, "triangle");
  },

  playError() {
    if (!this.enabled) return;
    try {
      this.ensureContext();
      if (!this.audioCtx) return;

      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.setValueAtTime(140, now + 0.08);

      gain.gain.setValueAtTime(0.15, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.2);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start(now);
      osc.stop(now + 0.2);
    } catch (e) {}
  },

  playSuccess() {
    if (!this.enabled) return;
    try {
      this.ensureContext();
      if (!this.audioCtx) return;

      const now = this.audioCtx.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6 chord arpeggio
      notes.forEach((freq, idx) => {
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        osc.type = "triangle";
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);

        gain.gain.setValueAtTime(0.15, now + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.25);

        osc.connect(gain);
        gain.connect(this.audioCtx.destination);

        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.25);
      });
    } catch (e) {}
  }
};
