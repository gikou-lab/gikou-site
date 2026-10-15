import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import { d1, kvCache, r2 } from "@emdash-cms/cloudflare";
import icon from "astro-iconset";
import { defineConfig, fontProviders } from "astro/config";
import emdash from "emdash/astro";

export default defineConfig({
	output: "server",
	// 実行時に画像を変換しない。既定の Images binding は /_image を外から叩かれると変換の枠を食われ、Paid なら課金される
	adapter: cloudflare({ imageService: "passthrough" }),
	image: {
		layout: "constrained",
		responsiveStyles: true,
	},
	vite: {
		ssr: {
			optimizeDeps: {
				// Pre-bundle so it isn't discovered mid-render, which would trigger
				// a Vite dep re-optimization and break in-flight worker imports
				// under the Cloudflare dev runner (workerd).
				include: ["astro-iconset/components"],
			},
		},
	},
	integrations: [
		react(),
		icon({
			// Only ship the Phosphor icons actually referenced in templates,
			// not the full @iconify-json/ph set (which adds megabytes to the
			// deployed worker bundle).
			include: {
				ph: [
					"chart-bar",
					"check-circle",
					"clock",
					"cloud",
					"code",
					"currency-dollar",
					"envelope",
					"globe",
					"heart",
					"lifebuoy",
					"lightning",
					"lock",
					"shield-check",
					"sparkle",
					"star",
					"users-three",
				],
			},
		}),
		emdash({
			database: d1({ binding: "DB", session: "auto" }),
			storage: r2({ binding: "MEDIA" }),
			objectCache: kvCache({ binding: "CACHE" }),
			// 公開面に編集者用のフローティングのツールバーを出さない。文面は MCP で入れ、確認はプレビュー URL でやる
			toolbar: false,
			// 本番の Worker は表を作らない。無料プランの CPU 10 ms で途中で止まり、移行の鍵が残るため。
			// 本番の表は deploy の前に `emdash migrate` で作る。CI と手元のプレビューは空の D1 から立てるので auto にする
			migrations: {
				runtime: process.env.EMDASH_RUNTIME_MIGRATIONS === "auto" ? "auto" : "check",
				dev: "auto",
			},
		}),
	],
	fonts: [
		{
			provider: fontProviders.google(),
			name: "IBM Plex Sans JP",
			cssVariable: "--font-ibm-plex-sans-jp",
			weights: [400, 500, 700],
			fallbacks: ["Hiragino Sans", "Noto Sans JP", "sans-serif"],
		},
	],
	devToolbar: { enabled: false },
});
