export const site = {
	name: "GIKOU",
	nav: [
		{ label: "トップ", href: "/" },
		{ label: "手がけているもの", href: "/works" },
	],
	// フッターにだけ出す。Google の OAuth の審査で、トップからプライバシーポリシーへのリンクが要る
	footerNav: [
		{ label: "トップ", href: "/" },
		{ label: "手がけているもの", href: "/works" },
		{ label: "プライバシーポリシー", href: "/privacy" },
	],
	poweredBy: { label: "EmDash", href: "https://emdashcms.com" },
} as const;
