// Locations with a logo in public/logos/key-storage (Simple Icons, CC0, or the
// brand's own mark). Others show a generic icon. scripts/sync-key-storage-locations.mjs checks this list.
//
// Simple Icons marks are one colour, drawn in the brand's colour (from Simple
// Icons). A brand colour that would be hard to see on the theme's background
// is swapped for the text colour: `light: false` on light themes, `dark: false`
// on dark ones. Brands whose mark is black or has no single colour use the
// text colour everywhere. `original` marks are drawn as they are.
export type KeyStorageLogo = { color?: string; light?: false; dark?: false; original?: true };

export const KEY_STORAGE_LOGOS: Readonly<Record<string, KeyStorageLogo>> = {
	"1password": { color: "#145FE4" },
	"aws": { color: "#FF9900" },
	"azure": { color: "#0078D4" },
	"bitbucket": { color: "#0052CC" },
	"bitwarden": { color: "#175DDC" },
	"circleci": {},
	"cloudflare": { color: "#F38020" },
	"convex": { color: "#EE342F" },
	"coolify": { color: "#6B16ED" },
	"deno-deploy": {},
	"digitalocean": { color: "#0080FF" },
	"doppler": { original: true },
	"expo": {},
	"firebase": { color: "#DD2C00" },
	"fly": { color: "#24175B", dark: false },
	"github": {},
	"gitlab": { color: "#FC6D26" },
	"google-cloud": { color: "#4285F4" },
	"hashicorp-vault": { color: "#FFEC6E", light: false },
	"heroku": { color: "#430098", dark: false },
	"hetzner": { color: "#D50C2D" },
	"infisical": {},
	"koyeb": {},
	"kubernetes": { color: "#326CE5" },
	"linode": { color: "#00A95C" },
	"modal": { color: "#7FEE64", light: false },
	"netlify": { color: "#00C7B7" },
	"northflank": { original: true },
	"ovhcloud": { color: "#123F6D", dark: false },
	"railway": {},
	"render": {},
	"replit": { color: "#F26207" },
	"scaleway": { color: "#4F0599", dark: false },
	"supabase": { color: "#3FCF8E" },
	"vercel": {},
	"vultr": { color: "#007BFC" },
};
