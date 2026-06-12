import { Server } from "colyseus";
import { WorldRoom } from "./rooms/WorldRoom.js";

const port = Number(process.env.PORT || 2567);

const gameServer = new Server();
// あいことば（keyword）が同じプレイヤー同士が同じ部屋（最大4人）に入る
gameServer.define("world", WorldRoom).filterBy(["keyword"]);

gameServer.listen(port).then(() => {
  console.log(`PAGESストーリー server listening on ws://localhost:${port}`);
});
