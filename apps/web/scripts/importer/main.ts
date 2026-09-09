// Catalog writes moved to audited database mutations. Never reconcile archived JSON
// against live tables: that can overwrite newer edits and retire database-only rows.
console.error("The JSON catalog importer is retired. Edit /internal/data; use catalog:export:database for JSON snapshots.");
process.exitCode = 1;
