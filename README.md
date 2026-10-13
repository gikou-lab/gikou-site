# gikou-site

GIKOU のホームページ（gikou.dev）。EmDash を Cloudflare Workers で動かす。

- 看板（Issue・計画・人の手番）は非公開の `gikou-lab/gikou-site-board`。このリポジトリでは Issue を使わない
- ページの文章は EmDash の中（CMS）に置く。このリポジトリはコード・テーマ・テスト・設定
- main は PR を通してだけ変わる。merge は人の手番
- 工程は `gikou-lab/keiji` の `reference/dev-process-2026-10-10.md`、公開の口の決まりは `reference/llmo-site-design-2026-10-13.md`

## 手元で動かす

土台は EmDash の `marketing-cloudflare` ひな形（`emdash-cms/templates`・emdash v1.0.1）。`AGENTS.md` にコマンドと大事なファイルを書いてある。

```bash
pnpm install
pnpm dev        # http://localhost:4321/ 、管理画面は /_emdash/admin
pnpm typecheck
pnpm build
pnpm preview    # build したものを手元の workerd で出す（プレビュー）
```

- `pnpm dev` と `pnpm preview` は裏で動き続ける。止めるのは `pnpm exec astro dev stop`・`pnpm exec astro preview stop`
- プレビューは手元で出す。Cloudflare の上には出さない（`preview_urls` が false）
- D1・R2・KV は開発サーバーの中（miniflare）で動く。Cloudflare には何も作らない
- Cloudflare の中の名前は `gikou-site-` で始める（`wrangler.jsonc`）。`workers_dev`・`preview_urls` は止めてある
- 鍵・`.env`・`.dev.vars` は commit しない（`.gitignore` で止めてある）
- EmDash の skill は `.agents/skills/`。`.claude/skills` がそこへのリンク
