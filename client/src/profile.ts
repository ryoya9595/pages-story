// プレイヤープロフィール（名前・キャラ選択）。タイトル画面で設定→入室時にサーバーへ渡す

const KEY = "pages-story-profile";

export interface Profile {
  name: string;
  charIdx: number; // 0-3（heroVariantの番号）
}

export function getProfile(): Profile {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) || "{}");
    return {
      name: typeof p.name === "string" && p.name.trim() ? p.name.trim().slice(0, 12) : "",
      charIdx: Number.isInteger(p.charIdx) && p.charIdx >= 0 && p.charIdx <= 3 ? p.charIdx : -1,
    };
  } catch {
    return { name: "", charIdx: -1 };
  }
}

export function setProfile(p: Profile) {
  localStorage.setItem(KEY, JSON.stringify({ name: p.name.trim().slice(0, 12), charIdx: p.charIdx }));
}
