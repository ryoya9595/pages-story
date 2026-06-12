# PAGESストーリー 本デプロイ手順（固定URL化）

構成: **クライアント=Cloudflare Pages**（無料・固定URL）＋ **サーバー=fly.io**（Colyseus常時稼働・東京リージョン）。
これで Mac を消してても遊べる固定URLになる。トンネル（毎回URLが変わる）からの卒業。

> 私（Claude）が準備した設定ファイル: `Dockerfile` / `fly.toml` / `.dockerignore` / `client/src/serverConfig.ts` / `deploy-client.sh`
> りょうやくんがやるのは「アカウント作成・ログイン・コマンド実行」だけ。下を上から順に。

---

## 0. 事前準備（CLIインストール）

```sh
# fly.io CLI
brew install flyctl

# Cloudflare の wrangler は npx で都度実行するのでインストール不要
```

---

## 1. サーバーを fly.io にデプロイ

```sh
cd "/Users/ryoya/Desktop/AI Agents/pages-story"

# 1-1. ログイン（ブラウザが開く。アカウント作成＋クレカ登録が必要＝無料枠だが本人確認のため）
fly auth login

# 1-2. アプリ作成（fly.toml を読む。"既存設定を使うか"→Yes。デプロイするか聞かれたら一旦No）
fly launch --no-deploy --copy-config --name pages-story-server --region nrt
#   → app名が pages-story-server で取れなければ別名になる。
#     その場合 fly.toml の app名 と client/src/serverConfig.ts の PROD_SERVER_HOST を新app名に合わせる。

# 1-3. セーブデータ用の永続ボリューム（3GB無料枠。1GBで十分）
fly volumes create pages_data --size 1 --region nrt --yes

# 1-4. デプロイ
fly deploy

# 1-5. 動作確認（https://<app名>.fly.dev/matchmake/... が返ればOK）
fly open
fly logs   # "server listening" が出ていれば成功
```

デプロイ後のサーバーURL = `https://<app名>.fly.dev`（wssは自動）。

---

## 2. クライアントの接続先を確定

`client/src/serverConfig.ts` の `PROD_SERVER_HOST` を、1で確定した fly のホスト名にする。
（デフォルトは `pages-story-server.fly.dev`。app名が同じならそのままでOK）

```ts
export const PROD_SERVER_HOST = "pages-story-server.fly.dev"; // ← 自分のapp名.fly.dev
```

---

## 3. クライアントを Cloudflare Pages にデプロイ

```sh
cd "/Users/ryoya/Desktop/AI Agents/pages-story"

# 3-1. 初回だけ Cloudflare にログイン（ブラウザが開く。無料アカウントでOK・クレカ不要）
npx wrangler login

# 3-2. ビルド＆公開（用意したスクリプト一発）
./deploy-client.sh
```

完了すると `https://pages-story.pages.dev` が**固定URL**。これを友達に送ればOK。
（更新したい時は `./deploy-client.sh` を再実行するだけ）

---

## 4. 公開前チェックリスト

- [ ] `?server=` 無しのPages URLで4人入れるか（あいことば違いで別部屋になるか）
- [ ] ALLOW_DEV: fly本番では**付けていない**（Dockerfileに無いのでOK）。ローカルの `start.sh` だけ付く
- [ ] BGMクレジットがゲーム内に表示されているか（タイトル画面下部）
- [ ] セーブデータが再デプロイで消えないか（fly volume に保存されているか）

---

## 困ったとき

- **wssに繋がらない**: ブラウザのコンソールで接続先を確認。`serverConfig.ts` のホスト名と fly の実app名が一致しているか
- **fly無料枠が不安**: `fly scale count 1` で1台固定。`auto_stop_machines=false`（fly.toml）で寝かさない設定済み
- **コスト確認**: `fly dashboard` で使用量を見る。256MB/1台/東京なら無料枠内に収まる想定
