// Optional confirmation cues (Display settings): a short vibration and a soft beep when a KOT is sent.
export function kotFeedback(opts: { sound: boolean; vibration: boolean } | undefined) {
  try {
    if (opts?.vibration && "vibrate" in navigator) navigator.vibrate(60);
    if (opts?.sound) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.value = 0.05;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
      osc.onended = () => void ctx.close();
    }
  } catch {
    // cues are best effort
  }
}
