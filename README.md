# PAGESストーリー 〜描きかけの絵本の国〜

描きかけの絵本に迷いこんだ主人公が、あばれる「ラクガキ」を倒しながら白紙のページを冒険する、探索型アクションRPG。

## 🎮 あそぶ（ブラウザだけでOK・無料）
**▶ https://ryoya9595.github.io/pages-story/**

- 📖 あそびかた説明書: https://ryoya9595.github.io/pages-story/manual.html
- 🎉 紹介ページ: https://ryoya9595.github.io/pages-story/start.html

スマホもPCもOK・インストール不要。データはブラウザに自動保存されます。

## とくちょう
- ✨ 敵の技を写しとる「スケッチ（技コピー）」システム
- 🎨 4つの画材ロール → 全28職業の転職ツリー（最大Lv100）
- 🗺️ 全20ステージ・各ステージにボス（ラスボス=ラクガキ大王）
- 🪙 コイン＆ショップ＆ポーション、📜 全19クエスト

## 構成
| フォルダ | 役割 |
|---|---|
| `client/` | ゲーム画面（Phaser 3 + Vite + TypeScript） |
| `server/` | マルチプレイ用サーバー（Colyseus。オンライン協力プレイ用・任意） |
| `shared/` | マップ・職業・クエスト・技の共有定義 |
| `docs/` | GitHub Pages 公開ビルド（ソロプレイ・静的） |
| `landing/` | 紹介ページ／説明書のソース |

サーバー無しでも `client/src/localRoom.ts` によりソロ（1人）で全機能プレイ可能。
常時サーバーを立てれば `client/src/serverConfig.ts` にホストを書くだけでオンライン協力プレイになります。

## クレジット
- BGM: Caketown / Woodland Fantasy by Matthew Pablo (CC-BY)
- 背景: ansimuz (CC0)
