// クエスト定義（サーバー・クライアント共有）
// 受注・報告制: しおりの妖精に話しかけて「うける」→ 討伐 → 「ほうこく」で報酬。
// 報酬を厚めにして「クエストを追えば自然に適正マップへ進む」チェーンにする。

export interface QuestDef {
  id: string;
  title: string;
  text: string;
  targetMap: string; // このマップの敵を倒すとカウント
  targetCount: number;
  targetBoss?: boolean; // trueならボスのみカウント
  rewardExp: number;
  next?: string;
}

export const FIRST_QUEST = "q1";

export const QUESTS: Record<string, QuestDef> = {
  q1: {
    id: "q1",
    title: "はじまりのページ",
    text: "もくじ広場のラクガキを 3たい たおそう",
    targetMap: "hub",
    targetCount: 3,
    rewardExp: 40,
    next: "q2",
  },
  q2: {
    id: "q2",
    title: "けいこのつづき",
    text: "もくじ広場のラクガキを さらに 5たい たおそう",
    targetMap: "hub",
    targetCount: 5,
    rewardExp: 90,
    next: "q3",
  },
  q3: {
    id: "q3",
    title: "もりへのとびら",
    text: "らくがきの森のモンスターを 3たい たおそう（つよい！なかまと いこう）",
    targetMap: "forest",
    targetCount: 3,
    rewardExp: 250,
    next: "q4",
  },
  q4: {
    id: "q4",
    title: "もりのぬし",
    text: "らくがきの森のボスを たおそう！",
    targetMap: "forest",
    targetCount: 1,
    targetBoss: true,
    rewardExp: 600,
    next: "q5",
  },
  q5: {
    id: "q5",
    title: "インクのぬまへ",
    text: "森のおくの扉から インクのぬまへ。モンスターを 4たい たおそう",
    targetMap: "swamp",
    targetCount: 4,
    rewardExp: 1000,
    next: "q6",
  },
  q6: {
    id: "q6",
    title: "ぬまの そうじ",
    text: "インクのぬまのモンスターを さらに 6たい たおそう",
    targetMap: "swamp",
    targetCount: 6,
    rewardExp: 1600,
    next: "q7",
  },
  q7: {
    id: "q7",
    title: "ぬまのぬし",
    text: "エノグゴーレムを たおそう！（Lv20・なかま すいしょう）",
    targetMap: "swamp",
    targetCount: 1,
    targetBoss: true,
    rewardExp: 3000,
    next: "q8",
  },
  q8: {
    id: "q8",
    title: "しろいページのなぞ",
    text: "ぬまのおくの扉から しろいページへ。モンスターを 6たい たおそう",
    targetMap: "blank",
    targetCount: 6,
    rewardExp: 5000,
    next: "q9",
  },
  q9: {
    id: "q9",
    title: "さいごのラフ",
    text: "しろいページのおくにいる 完成まぢかのラフベアーを たおそう！",
    targetMap: "blank",
    targetCount: 1,
    targetBoss: true,
    rewardExp: 12000,
  },
};
