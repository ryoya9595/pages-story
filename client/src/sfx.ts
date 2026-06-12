// 効果音（Web Audio合成・素材ファイル不要のレトロSE）

let ctx: AudioContext | undefined;

function ac(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function tone(freq: number, dur: number, type: OscillatorType, gain: number, slideTo?: number, delay = 0) {
  const c = ac();
  const t = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise(dur: number, gain: number, delay = 0) {
  const c = ac();
  const t = c.currentTime + delay;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  const g = c.createGain();
  src.buffer = buf;
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(g).connect(c.destination);
  src.start(t);
}

export const sfx = {
  /** 攻撃の素振り */
  swing() {
    tone(500, 0.09, "sawtooth", 0.06, 160);
    noise(0.06, 0.03);
  },
  /** ヒット */
  hit() {
    tone(220, 0.1, "square", 0.08, 70);
    noise(0.05, 0.05);
  },
  /** 被ダメージ */
  hurt() {
    tone(160, 0.16, "square", 0.07, 60);
  },
  /** レベルアップのファンファーレ＋ボイス */
  levelup() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => tone(f, 0.16, "square", 0.07, undefined, i * 0.09));
    tone(1047, 0.4, "triangle", 0.06, undefined, 0.36);
    // 合成音声で「レベルアップ！」（対応していない端末では無音スキップ）
    try {
      const u = new SpeechSynthesisUtterance("レベルアップ！");
      u.lang = "ja-JP";
      u.pitch = 1.5;
      u.rate = 1.15;
      u.volume = 0.85;
      speechSynthesis.speak(u);
    } catch {
      // 非対応環境では何もしない
    }
  },
  /** クエストクリア */
  questClear() {
    [784, 1047, 1319].forEach((f, i) => tone(f, 0.14, "square", 0.07, undefined, i * 0.1));
  },
  /** クエスト受注 */
  accept() {
    tone(660, 0.08, "square", 0.06);
    tone(880, 0.1, "square", 0.06, undefined, 0.08);
  },
  /** SP振り */
  spend() {
    tone(880, 0.06, "square", 0.05, 1100);
  },
  /** 回復 */
  heal() {
    tone(523, 0.12, "sine", 0.07, 784);
    tone(784, 0.18, "sine", 0.05, 1047, 0.1);
  },
};
