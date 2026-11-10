// Which deployment this Worker is: set PHASEO_ENV to "production", "preview"
// or "development". When it is unset the code assumes production (no preview
// shortcuts) unless NODE_ENV says development, so a missing setting never
// opens anything up.
export type PhaseoEnv = "production" | "preview" | "development";

const PHASEO_ENVS: readonly PhaseoEnv[] = ["production", "preview", "development"];

/** The explicitly configured environment, or null when PHASEO_ENV is unset or invalid. */
export function readPhaseoEnv(env: NodeJS.ProcessEnv = process.env): PhaseoEnv | null {
	const value = String(env.PHASEO_ENV ?? "").trim().toLowerCase();
	return (PHASEO_ENVS as readonly string[]).includes(value) ? (value as PhaseoEnv) : null;
}

export function getPhaseoEnv(env: NodeJS.ProcessEnv = process.env): PhaseoEnv {
	return readPhaseoEnv(env) ?? (env.NODE_ENV === "development" ? "development" : "production");
}

/** This deployment's own public URL (PUBLIC_DEPLOY_URL), for previews that have no fixed domain. */
export function readDeployUrl(env: NodeJS.ProcessEnv = process.env): string | null {
	const value = String(env.PUBLIC_DEPLOY_URL ?? "").trim();
	return value || null;
}
