type Translator = { (key: never): string };

/** Translate known catalog event labels while preserving custom editorial badges. */
export function localizedUpdateBadge(t: Translator, label: string): string {
	const keys: Record<string, string> = {
		Announcement: "announced", Announced: "announced",
		Release: "released", Released: "released",
		Deprecation: "deprecated", Deprecated: "deprecated",
		Retirement: "retired", Retired: "retired",
	};
	return keys[label] ? t(keys[label] as never) : label;
}
