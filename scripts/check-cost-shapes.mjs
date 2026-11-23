// 請求が青天井になる形がリポジトリに入ったら落ちる見張り。
// 使い方: node scripts/check-cost-shapes.mjs            今のツリーを見る
//         node scripts/check-cost-shapes.mjs --self-test 決まりがわざと当たる文字列で落ちるかを確かめる
//
// Cloudflare には請求額で止める設定が無い。入ってから探すのでは遅いので、形で止める。
// 見つけたら 1 件 1 行で「決まり ファイル:行 説明」を出し、1 で終わる。
// 手元のファイルを読むだけで、外へは出ない。
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const SELF = fileURLToPath(import.meta.url);
const ROOT = join(SELF, "..", "..");
const CODE_EXT = /\.(?:[cm]?[jt]sx?|astro)$/;
const SITE_HOSTS = /EMDASH_SITE_URL|gikou\.dev/;

// 今の契約。Paid に上げる回で "paid" に変える。この 1 語で決まり (1) の向きが変わる
const PLAN = "free";

const RULES = [
	"1-limits-on-free",
	"1-no-limits-on-paid",
	"2-queue-loop",
	"3-do-alarm",
	"4-self-fetch",
	"5-unbounded-retry",
];

// JSONC のコメントと末尾のカンマを、文字列の中を壊さずに外す（行の数は変えない）
function stripJsonc(text) {
	let out = "";
	let i = 0;
	while (i < text.length) {
		const c = text[i];
		if (c === '"') {
			const start = i++;
			while (i < text.length && text[i] !== '"') i += text[i] === "\\" ? 2 : 1;
			out += text.slice(start, ++i);
		} else if (c === "/" && text[i + 1] === "/") {
			while (i < text.length && text[i] !== "\n") i++;
		} else if (c === "/" && text[i + 1] === "*") {
			const end = text.indexOf("*/", i + 2);
			const stop = end === -1 ? text.length : end + 2;
			out += text.slice(i, stop).replace(/[^\n]/g, "");
			i = stop;
		} else {
			out += c;
			i++;
		}
	}
	return out.replace(/,(\s*[}\]])/g, "$1");
}

const lineOf = (text, index) => text.slice(0, index).split("\n").length;
const keyLine = (text, key) => {
	const at = text.search(new RegExp(`"${key}"\\s*:`));
	return at === -1 ? 1 : lineOf(text, at);
};

// open の位置にある括弧に対応する閉じ括弧の位置。見つからなければ末尾
function matching(text, open) {
	const pair = { "(": ")", "{": "}" }[text[open]];
	let depth = 0;
	for (let i = open; i < text.length; i++) {
		if (text[i] === text[open]) depth++;
		else if (text[i] === pair && --depth === 0) return i;
	}
	return text.length;
}

function checkWrangler(path, text, plan) {
	const hits = [];
	let config;
	try {
		config = JSON.parse(stripJsonc(text));
	} catch (e) {
		return [{ rule: "wrangler-parse", path, line: 1, message: `JSONC として読めない: ${e.message}` }];
	}
	// (1) 契約と limits は組で動く。Free で書くと deploy が API に蹴られ、Paid で書かないと上限が広がる
	if (plan === "free" && config.limits) {
		hits.push({
			rule: "1-limits-on-free",
			path,
			line: keyLine(text, "limits"),
			message: "無料プランなのに limits がある（deploy が CPU limits are not supported for the Free plan・code 100328 で落ちる）",
		});
	}
	if (plan === "paid" && config.limits?.subrequests === undefined) {
		hits.push({
			rule: "1-no-limits-on-paid",
			path,
			line: 1,
			message: "Paid なのに limits.subrequests が無い（上限が既定の 50 から 10,000 へ黙って広がる）",
		});
	}
	// (2) 同じ Worker が Queue の作り手と受け手を兼ねると、受け手が送り直す輪が止まらない
	const envs = [config, ...Object.values(config.env ?? {})];
	if (envs.some((c) => c.queues?.producers?.length && c.queues?.consumers?.length)) {
		hits.push({
			rule: "2-queue-loop",
			path,
			line: keyLine(text, "queues"),
			message: "queues に producer と consumer が両方ある（送り直しの輪になりうる）",
		});
	}
	return hits;
}

function checkCode(path, text, { inSrc }) {
	const hits = [];
	if (inSrc) {
		// (3) Durable Object の alarm は自分を呼び直せるので、止め忘れると眠らずに課金が続く
		for (const m of text.matchAll(/\balarm\s*\(/g)) {
			hits.push({ rule: "3-do-alarm", path, line: lineOf(text, m.index), message: "Durable Object の alarm( がある" });
		}
		// (4) 自分のホストへの fetch は自分を呼び直し、1 つの要求が何倍にも増える
		for (const m of text.matchAll(/\bfetch\s*\(/g)) {
			const open = m.index + m[0].length - 1;
			const args = text.slice(open, matching(text, open) + 1);
			if (SITE_HOSTS.test(args)) {
				hits.push({
					rule: "4-self-fetch",
					path,
					line: lineOf(text, m.index),
					message: "EMDASH_SITE_URL か gikou.dev を宛先にした fetch( がある",
				});
			}
		}
	}
	// (5) 回数の上限が無いやり直しは、相手が落ちている間ずっと要求を出し続ける
	for (const m of text.matchAll(/\bwhile\s*\(\s*true\s*\)\s*\{|\bfor\s*\(\s*;\s*;\s*\)\s*\{/g)) {
		const open = m.index + m[0].length - 1;
		const body = text.slice(open, matching(text, open) + 1);
		if (/\bfetch\s*\(/.test(body)) {
			hits.push({
				rule: "5-unbounded-retry",
				path,
				line: lineOf(text, m.index),
				message: "上限の無い輪（while (true) など）の中に fetch( がある",
			});
		}
	}
	return hits;
}

function walk(dir) {
	let entries;
	try {
		entries = readdirSync(dir);
	} catch {
		return [];
	}
	return entries.flatMap((name) => {
		const full = join(dir, name);
		return statSync(full).isDirectory() ? walk(full) : [full];
	});
}

// files: { "相対パス": 中身 }。ファイルを読む所と分けて、self-test が同じ道を通るようにする
export function check(files, plan = PLAN) {
	const hits = [];
	for (const [path, text] of Object.entries(files)) {
		if (path === "wrangler.jsonc") hits.push(...checkWrangler(path, text, plan));
		else if (CODE_EXT.test(path) && /^(src|scripts)\//.test(path)) {
			hits.push(...checkCode(path, text, { inSrc: path.startsWith("src/") }));
		}
	}
	return hits;
}

function readTree(root) {
	const files = { "wrangler.jsonc": readFileSync(join(root, "wrangler.jsonc"), "utf8") };
	for (const full of [...walk(join(root, "src")), ...walk(join(root, "scripts"))]) {
		// この台本は当たる文字列を self-test に持つので、自分は見ない
		if (full === SELF) continue;
		const path = relative(root, full).split(sep).join("/");
		if (CODE_EXT.test(path)) files[path] = readFileSync(full, "utf8");
	}
	return files;
}

function selfTest() {
	// Free は limits を書かない・Paid は書く。どちらも当たらないのが正しい形
	const freeWrangler = `{
	// コメントの "https://gikou.dev" は読まない
	"name": "x",
	"queues": { "producers": [{ "binding": "Q", "queue": "q" }] },
}`;
	const paidWrangler = `{
	"name": "x",
	"limits": { "subrequests": 50, },
}`;
	const okCode = {
		"src/worker.ts": `export default { fetch(req, env) { return fetch("https://example.com/"); } };`,
		"scripts/retry.mjs": `for (let i = 0; i < 3; i++) { await fetch(url); }\nwhile (true) { if (done()) break; }`,
	};
	// [決まり, 足す見本, 契約, 土台の wrangler]
	const cases = [
		["1-limits-on-free", { "wrangler.jsonc": paidWrangler }, "free"],
		["1-no-limits-on-paid", { "wrangler.jsonc": freeWrangler }, "paid"],
		[
			"2-queue-loop",
			{
				"wrangler.jsonc": `{
	"queues": {
		"producers": [{ "binding": "Q", "queue": "q" }],
		"consumers": [{ "queue": "q" }],
	},
}`,
			},
			"free",
		],
		["3-do-alarm", { "src/counter.ts": `export class Counter {\n\tasync alarm() {\n\t\tawait this.ctx.storage.setAlarm(Date.now());\n\t}\n}` }],
		["4-self-fetch", { "src/a.ts": `await fetch(new URL("/api", env.EMDASH_SITE_URL));` }],
		["4-self-fetch", { "src/b.ts": `await fetch(\n\t"https://gikou.dev/_emdash/api",\n\t{ method: "POST" },\n);` }],
		["5-unbounded-retry", { "scripts/poll.mjs": `while (true) {\n\tconst res = await fetch(url);\n\tif (res.ok) break;\n}` }],
		["5-unbounded-retry", { "src/poll.ts": `for (;;) {\n\ttry { return await fetch(url); } catch {}\n}` }],
	];

	const failures = [];
	for (const [plan, wrangler] of [
		["free", freeWrangler],
		["paid", paidWrangler],
	]) {
		const okHits = check({ "wrangler.jsonc": wrangler, ...okCode }, plan);
		if (okHits.length > 0) failures.push(`${plan}: 当たらないはずの見本で当たった: ${okHits.map((h) => h.rule).join(", ")}`);
	}
	for (const [rule, extra, plan = "free"] of cases) {
		const base = plan === "paid" ? paidWrangler : freeWrangler;
		const hits = check({ "wrangler.jsonc": base, ...extra }, plan);
		const code = exitCode(hits);
		if (code === 0 || !hits.some((h) => h.rule === rule)) {
			failures.push(`${rule}（${plan}）: 当たるはずの見本で ${code} になった（当たり: ${hits.map((h) => h.rule).join(", ") || "なし"}）`);
		} else {
			console.log(`ok ${rule}（${plan}）: 終わりの番号 ${code}・${format(hits.find((h) => h.rule === rule))}`);
		}
	}
	const covered = new Set(cases.map(([rule]) => rule));
	const missing = RULES.filter((r) => !covered.has(r));
	if (missing.length > 0) failures.push(`self-test が見ていない決まり: ${missing.join(", ")}`);

	if (failures.length > 0) {
		for (const f of failures) console.error(`NG ${f}`);
		process.exit(1);
	}
	console.log(`self-test: ${RULES.length} つの決まりは全部当たり、当たらない見本は free・paid の両方で通った`);
}

const exitCode = (hits) => (hits.length > 0 ? 1 : 0);
const format = (h) => `[${h.rule}] ${h.path}:${h.line} ${h.message}`;

if (process.argv.includes("--self-test")) {
	selfTest();
} else {
	const hits = check(readTree(ROOT));
	for (const h of hits) console.error(format(h));
	if (hits.length === 0) console.log("check-cost-shapes: 危ない形は無い");
	process.exit(exitCode(hits));
}
