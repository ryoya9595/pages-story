// あいことば（合言葉）管理
// 同じあいことばを入れた友達と同じ世界（最大4人）に入れる。
// 優先順位: URLの ?room=◯◯ → localStorage → デフォルト「ひろば」

const KEY = "pages-story-keyword";
const DEFAULT_KEYWORD = "ひろば";

export function getKeyword(): string {
  const url = new URL(location.href);
  const fromUrl = url.searchParams.get("room");
  if (fromUrl) {
    const kw = fromUrl.slice(0, 20);
    localStorage.setItem(KEY, kw);
    return kw;
  }
  return localStorage.getItem(KEY) || DEFAULT_KEYWORD;
}

export function setKeyword(kw: string) {
  localStorage.setItem(KEY, kw.slice(0, 20) || DEFAULT_KEYWORD);
}
