/** The family id from the route's splat: `/families/openai/gpt-5` → `openai/gpt-5`. */
export function familyIdFromSplat(splat: string | undefined): string {
	return (splat ?? "").split("/").filter(Boolean).map(decodeURIComponent).join("/");
}
