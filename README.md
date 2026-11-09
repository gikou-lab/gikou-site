# gikou-site

GIKOU のホームページ（gikou.dev）。EmDash を Cloudflare Workers で動かす。

- 看板（Issue・計画・人の手番）は非公開の `gikou-lab/gikou-site-board`。このリポジトリでは Issue を使わない
- ページの文章は EmDash の中（CMS）に置く。このリポジトリはコード・テーマ・テスト・設定
- main は PR を通してだけ変わる。merge は人の手番
- 工程は `gikou-lab/keiji` の `reference/dev-process-2026-10-10.md`、公開の口の決まりは `reference/llmo-site-design-2026-10-13.md`

## 開発の始め方

土台は EmDash の `marketing-cloudflare` ひな形（`emdash-cms/templates`・emdash v1.0.1）。`AGENTS.md` に大事なファイルを書いてある。

要るもの：Node.js（CI は 24）と pnpm（版は `package.json` の `packageManager` で決まっている）。

```bash
pnpm install --frozen-lockfile   # 依存を pnpm-lock.yaml のとおりに入れる
pnpm dev          # http://localhost:4321/ 、管理画面は /_emdash/admin
pnpm typecheck
pnpm build
pnpm preview      # build したものを手元の workerd で出す（プレビュー）
pnpm check-links  # 先に pnpm build が要る
```

| コマンド | 中身（`package.json` の scripts） | すること |
| --- | --- | --- |
| `pnpm dev` | `astro dev` | 開発サーバーを立てる |
| `pnpm typecheck` | `astro check` | TypeScript と `.astro` の型を確かめる |
| `pnpm build` | `astro build` | Cloudflare Workers 向けに build する |
| `pnpm preview` | `astro preview` | build したものを手元で出す |
| `pnpm check-links` | `node scripts/check-links.mjs` | build したサイトを手元で立て、`seed/seed.json` のページを手元の D1 に入れてから、`/` と `/sitemap.xml` から辿れる同じオリジンのリンクと資源を引く。4xx・5xx があれば失敗で終わる |

- 手を入れたら `pnpm typecheck`・`pnpm build`・`pnpm check-links` を通す。PR の CI（`.github/workflows/check.yml`）も同じものを打つ
- `pnpm check-links` に `BASE_URL` を渡すと、サーバーを立てずにそのアドレスを辿る（例：`BASE_URL=http://localhost:4321 pnpm check-links`）。`/_emdash/admin` と `/_emdash/api` は辿らない

- `pnpm dev` と `pnpm preview` は裏で動き続ける。止めるのは `pnpm exec astro dev stop`・`pnpm exec astro preview stop`
- プレビューは手元で出す。Cloudflare の上には出さない（`preview_urls` が false）
- D1・R2・KV は開発サーバーの中（miniflare）で動く。Cloudflare には何も作らない
- Cloudflare の中の名前は `gikou-site-` で始める（`wrangler.jsonc`）。`workers_dev`・`preview_urls` は止めてある
- 鍵・`.env`・`.dev.vars` は commit しない（`.gitignore` で止めてある）
- EmDash の skill は `.agents/skills/`。`.claude/skills` がそこへのリンク
