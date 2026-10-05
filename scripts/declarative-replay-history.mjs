// This exception applies only to disposable replay, never deployment history.
const duplicate = "20261004220029_canonical_routing_capabilities.sql";
const recorded = "20261004221046_canonical_routing_capabilities.sql";

export function prepareReplayMigration(name, sql, readMigration) {
	if (name !== duplicate) return sql;
	const recordedSql = readMigration(recorded).replaceAll("\r\n", "\n");
	const lines = recordedSql.split("\n");
	if (!lines[0]?.startsWith("-- Restored from Phaseo Prod migration records;") ||
		!lines[1]?.startsWith("-- phaseo:allow-production-history-backfill reason:") ||
		sql.replaceAll("\r\n", "\n").trim() !== lines.slice(2).join("\n").trim()) {
		throw new Error("Duplicate routing capability migrations differ; review replay history before proceeding");
	}
	return `-- Disposable replay only: identical SQL is applied by ${recorded}.\n`;
}
