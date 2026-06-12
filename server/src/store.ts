import fs from "fs";
import path from "path";

// プレイヤーデータの永続化（プロト版はJSONファイル。本番で必要になったらSQLite/Supabaseへ移行）
export interface PlayerRecord {
  playerId: string;
  secret: string;
  name: string;
  level: number;
  exp: number;
  mapId: string;
  x: number;
  y: number;
  questId?: string;
  questProgress?: number;
  questPhase?: string;
  job?: string;
  sp?: number;
  statAtk?: number;
  statHp?: number;
  statSpd?: number;
  colorIdx?: number;
  updatedAt: number;
}

export class PlayerStore {
  private file: string;
  private data: Record<string, PlayerRecord> = {};
  private dirty = false;

  // 本番(fly.io)では DATA_DIR=/data（永続ボリューム）を指定して再デプロイでも消えないようにする。
  // 未指定ならローカル開発用に server/data/players.json。
  constructor(
    file = process.env.DATA_DIR
      ? path.join(process.env.DATA_DIR, "players.json")
      : path.resolve(process.cwd(), "data/players.json")
  ) {
    this.file = file;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (fs.existsSync(file)) {
      try {
        this.data = JSON.parse(fs.readFileSync(file, "utf8"));
      } catch (e) {
        console.error("[store] players.json の読み込みに失敗。空の状態から開始:", e);
        this.data = {};
      }
    }
    setInterval(() => this.flush(), 10_000).unref();
    process.on("beforeExit", () => this.flush());
  }

  get(playerId: string): PlayerRecord | undefined {
    return this.data[playerId];
  }

  upsert(rec: PlayerRecord) {
    this.data[rec.playerId] = rec;
    this.dirty = true;
  }

  /** 一時ファイル経由のアトミック書き込み */
  flush() {
    if (!this.dirty) return;
    this.dirty = false;
    const tmp = this.file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }
}

export const store = new PlayerStore();
