// 動作確認用ボット: ルームに参加して左右にうろうろする
import { Client } from "colyseus.js";

const endpoint = process.env.ENDPOINT || "ws://localhost:2567";
const name = process.env.BOT_NAME || "テストくん";

async function main() {
  const client = new Client(endpoint);
  const keyword = process.env.BOT_ROOM || "ひろば";
  const playerId = `bot-${Math.random().toString(36).slice(2, 10)}`;
  const room = await client.joinOrCreate("world", { name, keyword, playerId, secret: "bot-secret" });
  console.log(`[bot] joined room ${room.roomId} (あいことば: ${keyword}) as ${name}`);

  // hub-2（x840〜1060をパトロール中のラクガキ）の近くをうろうろしながら攻撃する
  let x = Number(process.env.BOT_MIN || 840);
  const min = Number(process.env.BOT_MIN || 840);
  const max = Number(process.env.BOT_MAX || 1060);
  let dir = 1;
  const y = 637;

  setInterval(() => {
    x += dir * 6;
    if (x > max) dir = -1;
    if (x < min) dir = 1;
    room.send("move", { x, y, flip: dir < 0, anim: "walk" });
  }, 50);

  setInterval(() => {
    room.send("attack");
  }, 700);

  room.onMessage("levelup", (m: any) => {
    if (m.sessionId === room.sessionId) console.log(`[bot] ${name} レベルアップ → Lv${m.level}`);
  });
  room.onMessage("exp", (m: any) => {
    if (m.sessionId === room.sessionId) console.log(`[bot] ${name} +${m.amount} EXP`);
  });
}

main().catch((e) => {
  console.error("[bot] error:", e);
  process.exit(1);
});
