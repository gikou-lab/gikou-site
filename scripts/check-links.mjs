// ビルドしたサイトを手元で立て、同じオリジンのリンクと資源を辿って、4xx・5xx を見つける。
// 使い方: pnpm build && pnpm check-links
// BASE_URL を渡すと、サーバーを立てずにそのアドレスを辿る。
// 立てたときは、seed のページ（題名と slug だけ）を手元の D1 に入れてから辿る。
// 本番では setup の画面で入れるもので、ビルドしたサイトには入っていないため。
// 立てるときは 127.0.0.1 の空いている番号を選んで渡す。localhost の 4321 番に別のサーバーが
// 残っていると、IPv4 と IPv6 で別々のサーバーに当たり、古い中身を辿ってしまうため。
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { createServer } from "node:net";

const startServer = !process.env.BASE_URL;
const skipPrefixes = ["/_emdash/admin", "/_emdash/api"];
const attrPattern = /\s(?:href|src)=["']([^"'#]+)["']/g;
const cssUrlPattern = /url\(["']?([^"')#]+)["']?\)/g;

const pnpmExec = (...args) =>
	execFileSync("pnpm", ["exec", ...args], { stdio: ["ignore", "pipe", "inherit"] }).toString();
const astro = (...args) => pnpmExec("astro", ...args);
const d1Dir = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject";

async function waitForServer() {
	for (let i = 0; i < 60; i++) {
		try {
			// 中身を引かない道で待つ。先に / を引くと、seed を入れる前の「無い」が KV の cache に残る
			const res = await fetch(new URL("/robots.txt", base), { redirect: "manual" });
			if (res.status < 500) return;
		} catch {}
		await new Promise((r) => setTimeout(r, 1000));
	}
	throw new Error(`server did not start at ${base}`);
}

function sameOriginPath(raw, from) {
	if (/^(mailto|tel|javascript|data):/i.test(raw)) return null;
	const url = new URL(raw, new URL(from, base));
	if (url.origin !== base.origin) return null;
	if (skipPrefixes.some((p) => url.pathname.startsWith(p))) return null;
	return url.pathname + url.search;
}

async function sitemapPaths() {
	const res = await fetch(new URL("/sitemap.xml", base));
	if (!res.ok) return [];
	const xml = await res.text();
	return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
}

async function crawl() {
	const results = new Map();
	const queue = [{ path: "/", from: "(start)" }, { path: "/sitemap.xml", from: "(start)" }];
	for (const path of await sitemapPaths()) queue.push({ path, from: "/sitemap.xml" });

	while (queue.length > 0) {
		const { path, from } = queue.shift();
		const seen = results.get(path);
		if (seen) {
			seen.from.add(from);
			continue;
		}
		const res = await fetch(new URL(path, base), { redirect: "follow" });
		results.set(path, { status: res.status, from: new Set([from]) });
		const type = res.headers.get("content-type") ?? "";
		const patterns = type.includes("text/html")
			? [attrPattern, cssUrlPattern]
			: type.includes("text/css")
				? [cssUrlPattern]
				: [];
		if (patterns.length === 0) continue;
		const body = await res.text();
		for (const pattern of patterns) {
			for (const [, raw] of body.matchAll(pattern)) {
				const next = sameOriginPath(raw, path);
				if (next) queue.push({ path: next, from: path });
			}
		}
	}
	return results;
}

function freePort() {
	return new Promise((resolve, reject) => {
		const server = createServer();
		server.on("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const { port } = server.address();
			server.close(() => resolve(port));
		});
	});
}

function seedLocalD1() {
	const files = readdirSync(d1Dir).filter((f) => f.endsWith(".sqlite") && f !== "metadata.sqlite");
	if (files.length !== 1) throw new Error(`expected one D1 file in ${d1Dir}, found ${files.length}`);
	pnpmExec("emdash", "seed", "seed/seed.json", "--database", `${d1Dir}/${files[0]}`);
}

async function startPreview() {
	const port = await freePort();
	astro("preview", "--background", "--force", "--host", "127.0.0.1", "--port", String(port));
	return `http://127.0.0.1:${port}`;
}

const base = new URL(startServer ? await startPreview() : process.env.BASE_URL);
let exitCode = 0;
try {
	await waitForServer();
	if (startServer) seedLocalD1();
	const results = await crawl();
	const broken = [...results].filter(([, r]) => r.status >= 400);
	console.log(`checked ${results.size} URLs on ${base.origin}`);
	for (const [path, r] of broken) {
		console.log(`BROKEN ${r.status} ${path}  <- ${[...r.from].join(", ")}`);
	}
	exitCode = broken.length > 0 ? 1 : 0;
	console.log(exitCode ? `FAIL: ${broken.length} broken` : "OK: no broken links");
} finally {
	if (startServer) astro("preview", "stop");
}
process.exit(exitCode);
