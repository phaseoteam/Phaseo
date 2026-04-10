import { runInternalModelDiscovery } from "./run-internal";

async function main(): Promise<void> {
    const args = [...process.argv.slice(2), "--skip-hf"];
    await runInternalModelDiscovery(args);
}

main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[internal-model-check] Fatal error: ${message}`);
    process.exitCode = 1;
});
