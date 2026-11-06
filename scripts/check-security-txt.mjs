// /.well-known/security.txt の Expires を見張る（RFC 9116）。
// 使い方: node scripts/check-security-txt.mjs
//
// 期限の正本はファイルそのもの（Expires の行）。人の記憶に頼らず、切れる 30 日前から
// この検査が落ちて気づく。直し方は Expires の日付を 1 年先に書き換えて PR を出すだけ。
// 期限が切れた security.txt は、読む側（RFC 9116 の 2.5.5）に「古い」と扱われる。
import { readFileSync } from "node:fs";

const path = "public/.well-known/security.txt";
const WARN_DAYS = 30;
const MAX_DAYS = 366; // RFC 9116 は 1 年より短くすることを勧める

const text = readFileSync(path, "utf8");
const field = (name) => {
	const line = text
		.split("\n")
		.find((l) => l.toLowerCase().startsWith(`${name.toLowerCase()}:`));
	return line ? line.slice(line.indexOf(":") + 1).trim() : null;
};

const problems = [];
if (!field("Contact")) problems.push("Contact の行が無い（RFC 9116 の必須）");

const expires = field("Expires");
if (!expires) {
	problems.push("Expires の行が無い（RFC 9116 の必須）");
} else {
	const at = new Date(expires);
	if (Number.isNaN(at.getTime())) {
		problems.push(`Expires が日時として読めない: ${expires}`);
	} else {
		const days = Math.floor((at.getTime() - Date.now()) / 86400000);
		if (days < 0) problems.push(`Expires が ${-days} 日前に切れている（${expires}）`);
		else if (days <= WARN_DAYS)
			problems.push(
				`Expires まで ${days} 日（${expires}）。1 年先の日付に書き換える PR を出す`,
			);
		else if (days > MAX_DAYS)
			problems.push(`Expires が ${days} 日先（${expires}）。1 年より先には置かない`);
	}
}

if (problems.length > 0) {
	console.error(`${path}:`);
	for (const p of problems) console.error(`  - ${p}`);
	process.exit(1);
}
console.log(`${path}: Contact と Expires は ok（Expires ${expires}）`);
