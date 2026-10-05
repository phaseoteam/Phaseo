// This exception applies only to disposable replay, never deployment history.
export const duplicateMigrationPairs = [
	["20261004220029_canonical_routing_capabilities.sql", "20261004221046_canonical_routing_capabilities.sql"],
	["20261004221956_retire_generic_audio_capabilities.sql", "20261004222307_retire_generic_audio_capabilities.sql"],
	["20261004222339_tighten_canonical_capability_boundaries.sql", "20261004222834_tighten_canonical_capability_boundaries.sql"],
];

export function recordedMigrationSql(sql) {
	const lines = sql.replaceAll("\r\n", "\n").split("\n");
	if (!lines[0]?.startsWith("-- Restored from Phaseo Prod migration records;") ||
		!lines[1]?.startsWith("-- phaseo:allow-production-history-backfill reason:")) {
		throw new Error("Duplicate routing capability migrations differ: missing production history provenance");
	}
	return lines.slice(2).join("\n").trim();
}

export function prepareReplayMigration(name, sql, readMigration) {
	const pair = duplicateMigrationPairs.find(([duplicate]) => name === duplicate);
	if (!pair) return sql;
	const [, recorded] = pair;
	if (sql.replaceAll("\r\n", "\n").trim() !== recordedMigrationSql(readMigration(recorded))) {
		throw new Error("Duplicate routing capability migrations differ; review replay history before proceeding");
	}
	return `-- Disposable replay only: identical SQL is applied by ${recorded}.\n`;
}
