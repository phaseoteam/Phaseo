/** One way to start a registry agent: a downloaded binary, or a package fetched by npx or uvx at launch. */
export type AcpRegistryLaunch =
	| { kind: "binary"; archive: string; cmd: string; args: string[]; env: Record<string, string>; sha256?: string }
	| { kind: "npx" | "uvx"; package: string; args: string[]; env: Record<string, string> };
/** An agent from the public Agent Client Protocol registry that this computer can run. */
export type AcpRegistryAgent = { id: string; name: string; version: string; description: string; authors: string[]; license?: string; website?: string; repository?: string; icon?: string; launches: AcpRegistryLaunch[] };

export const launchLabel = (launch: AcpRegistryLaunch) => launch.kind === "binary" ? `Download (${launch.sha256 ? "checksum verified" : "from the registry"})` : launch.kind === "npx" ? `npx ${launch.package}` : `uvx ${launch.package}`;
