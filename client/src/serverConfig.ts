// 本番サーバー（fly.io）のホスト名。
// fly launch でアプリ名が確定したら、ここを実際の <app名>.fly.dev に書き換える。
// （?server=<host> をURLに付けるとこの設定より優先される＝トンネル/テスト用の上書き）
// 空文字 "" のあいだはローカル/LAN開発（同ホストの :2567）として動く。
export const PROD_SERVER_HOST = "pages-story-server.fly.dev";
