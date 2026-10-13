// ビルドしたサイトを手元で立て、同じオリジンのリンクと資源を辿って、4xx・5xx を見つける。
// 使い方: pnpm build && pnpm check-links
// BASE_URL を渡すと、サーバーを立てずにそのアドレスを辿る。
import { execFileSync } from "node:child_process";

const base = new URL(process.env.BASE_URL ?? "http://localhost:4321");
const startServer = !process.env.BASE_URL;
const skipPrefixes = ["/_emdash/admin", "/_emdash/api"];
const attrPattern = /\s(?:href|src)=["']([^"'#]+)["']/g;

const astro = (...args) =>
	execFileSync("pnpm", ["exec", "astro", ...args], { stdio: ["ignore", "pipe", "inherit"] }).toString();

async function waitForServer() {
	for (let i = 0; i < 60; i++) {
		try {
			const res = await fetch(base, { redirect: "manual" });
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
		if (!(res.headers.get("content-type") ?? "").includes("text/html")) continue;
		const html = await res.text();
		for (const [, raw] of html.matchAll(attrPattern)) {
			const next = sameOriginPath(raw, path);
			if (next) queue.push({ path: next, from: path });
		}
	}
	return results;
}

if (startServer) astro("preview");
let exitCode = 0;
try {
	await waitForServer();
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
