// プレイヤーID管理（匿名アカウント＋引き継ぎコード方式）
// - 初回アクセス時にID/secretを自動生成してlocalStorageに保存
// - 引き継ぎコード = `playerId.secret`。別端末で `?code=<コード>` 付きURLを開くと引き継げる

export interface Identity {
  playerId: string;
  secret: string;
}

const KEY = "pages-story-identity";

export function getIdentity(): Identity {
  // URLに引き継ぎコードが付いていたら取り込む
  const url = new URL(location.href);
  const code = url.searchParams.get("code");
  if (code && code.includes(".")) {
    const [playerId, secret] = code.split(".");
    if (playerId && secret) {
      localStorage.setItem(KEY, JSON.stringify({ playerId, secret }));
    }
    url.searchParams.delete("code");
    history.replaceState(null, "", url.toString());
  }

  const raw = localStorage.getItem(KEY);
  if (raw) {
    try {
      const id = JSON.parse(raw);
      if (id.playerId && id.secret) return id;
    } catch {
      // 壊れていたら作り直す
    }
  }

  const id: Identity = {
    playerId: crypto.randomUUID(),
    secret: crypto.randomUUID().replace(/-/g, ""),
  };
  localStorage.setItem(KEY, JSON.stringify(id));
  return id;
}

export function transferCode(id: Identity): string {
  return `${id.playerId}.${id.secret}`;
}

export function resetIdentity() {
  localStorage.removeItem(KEY);
}
