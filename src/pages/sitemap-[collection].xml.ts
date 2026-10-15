import type { APIRoute } from "astro";
import { getContentSeo, getEmDashCollection, getSiteSettings } from "emdash";

// EmDash の既定は urlPattern どおり /home を出す。トップの正本は / なので差し替える。
// 置くと EmDash の sitemap-[collection].xml は全部こちらに来る。今ある集まりは pages だけ
export const GET: APIRoute = async ({ params, url }) => {
	if (params.collection !== "pages") return new Response(null, { status: 404 });
	const settings = await getSiteSettings();
	const origin = settings.url || url.origin;
	const { entries } = await getEmDashCollection("pages", { status: "published" });
	const urls = entries
		.filter((page) => !getContentSeo(page)?.noIndex)
		.map((page) => {
			const path = page.id === "home" ? "/" : `/${page.id}`;
			return `  <url>\n    <loc>${origin}${path}</loc>\n    <lastmod>${page.data.updatedAt.toISOString()}</lastmod>\n  </url>`;
		})
		.join("\n");
	const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;
	return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
};
