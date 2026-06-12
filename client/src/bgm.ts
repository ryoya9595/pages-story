// チップチューン風BGM（Web Audioで生成・素材ファイル不要）
// メイプルの「のどかな狩場曲」リスペクトの、明るいC majorループ（C→Am→F→G）

const NOTE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function freq(n: string): number {
  const m = n.match(/^([A-G])(\d)$/);
  if (!m) return 440;
  const midi = 12 * (Number(m[2]) + 1) + NOTE[m[1]];
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// 8小節 × 8分音符8個 = 64ステップ（"."は休符）
const MELODY = [
  // C
  "E5", ".", "G5", ".", "C6", ".", "G5", ".",
  // Am
  "A5", ".", "C6", ".", "E6", ".", "C6", ".",
  // F
  "F5", ".", "A5", ".", "C6", ".", "A5", ".",
  // G
  "G5", ".", "B5", ".", "D6", ".", "B5", ".",
  // C
  "E6", ".", "C6", ".", "G5", ".", "E5", ".",
  // Am
  "A5", "G5", "E5", ".", "C5", ".", "E5", ".",
  // F
  "F5", ".", "A5", "G5", "F5", ".", "D5", ".",
  // G
  "G5", ".", "D5", ".", "B4", ".", "C5", ".",
];

const BASS_BARS: [string, string][] = [
  ["C3", "G3"],
  ["A2", "E3"],
  ["F2", "C3"],
  ["G2", "D3"],
];

const BPM = 116;
const STEP = 60 / BPM / 2; // 8分音符

const STORAGE_KEY = "pages-story-bgm";

// フリーBGMファイルを置く場所（優先して再生される）
// client/public/bgm/field.mp3 ← ここにmp3を置くだけでOK。無ければ内蔵チップチューンで鳴る
const BGM_FILE = "/bgm/field.mp3";

export class Bgm {
  private ctx?: AudioContext;
  private master?: GainNode;
  private noiseBuf?: AudioBuffer;
  private timer?: ReturnType<typeof setInterval>;
  private nextStepTime = 0;
  private step = 0;
  private audioEl?: HTMLAudioElement;
  private started = false;
  private currentFile = BGM_FILE;
  enabled: boolean;

  /** マップの雰囲気に合わせて曲を切り替える（/bgm/<name>.mp3） */
  setTrack(name: string) {
    const file = `/bgm/${name}.mp3`;
    if (this.currentFile === file) return;
    this.currentFile = file;
    if (!this.started || !this.enabled || !this.audioEl) return; // ファイル再生中のときだけ即切り替え
    const old = this.audioEl;
    fetch(file, { method: "HEAD" })
      .then((res) => {
        if (!res.ok || !(res.headers.get("content-type") || "").includes("audio")) return;
        old.pause();
        this.audioEl = new Audio(file);
        this.audioEl.loop = true;
        this.audioEl.volume = 0.35;
        this.audioEl.play();
      })
      .catch(() => {});
  }

  constructor() {
    this.enabled = (localStorage.getItem(STORAGE_KEY) ?? "on") === "on";
  }

  /** 最初のタップ/キー入力で呼ぶ（ブラウザの自動再生制限対策） */
  userGesture() {
    if (!this.enabled || this.started) return;
    this.start();
  }

  toggle(): boolean {
    this.enabled = !this.enabled;
    localStorage.setItem(STORAGE_KEY, this.enabled ? "on" : "off");
    if (this.enabled) this.start();
    else this.stop();
    return this.enabled;
  }

  private async start() {
    if (this.started) {
      this.audioEl?.play();
      this.ctx?.resume();
      return;
    }
    this.started = true;
    // まずフリーBGMファイルを探す（あればそっちを優先）
    try {
      const res = await fetch(this.currentFile, { method: "HEAD" });
      const type = res.headers.get("content-type") || "";
      if (res.ok && type.includes("audio")) {
        this.audioEl = new Audio(this.currentFile);
        this.audioEl.loop = true;
        this.audioEl.volume = 0.35;
        this.audioEl.play();
        return;
      }
    } catch {
      // ファイルなし → 内蔵曲へ
    }
    this.startChiptune();
  }

  private stop() {
    this.audioEl?.pause();
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.ctx?.suspend();
    this.started = false;
  }

  private startChiptune() {
    if (this.ctx) {
      this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(ctx.destination);

    // ハイハット用ノイズ
    const len = Math.floor(ctx.sampleRate * 0.05);
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    this.nextStepTime = ctx.currentTime + 0.1;
    this.step = 0;
    this.timer = setInterval(() => this.schedule(), 120);
  }

  private stopAudio() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.ctx?.suspend();
  }

  private schedule() {
    const ctx = this.ctx!;
    while (this.nextStepTime < ctx.currentTime + 0.35) {
      this.playStep(this.step % 64, this.nextStepTime);
      this.step++;
      this.nextStepTime += STEP;
    }
  }

  private tone(note: string, t: number, type: OscillatorType, gain: number, dur: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq(note);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(this.master!);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private playStep(i: number, t: number) {
    // メロディ（スクエア波）
    const m = MELODY[i];
    if (m !== ".") this.tone(m, t, "square", 0.055, 0.24);

    // ベース（三角波）: 小節ごとにルート→5度
    const bar = Math.floor(i / 8) % 4;
    const [root, fifth] = BASS_BARS[bar];
    if (i % 4 === 0) this.tone(i % 8 === 0 ? root : fifth, t, "triangle", 0.085, 0.3);

    // ハイハット（裏拍）
    if (i % 2 === 1 && this.noiseBuf) {
      const src = this.ctx!.createBufferSource();
      const g = this.ctx!.createGain();
      src.buffer = this.noiseBuf;
      g.gain.setValueAtTime(0.018, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
      src.connect(g).connect(this.master!);
      src.start(t);
    }
  }
}

// シーンをまたいで共有するシングルトン（タイトル画面のタップでBGM開始できるように）
export const bgm = new Bgm();
