import { promises as fs } from "fs";
import { tmpdir } from "os";
import { join } from "path";

jest.mock("./paths", () => ({ DATA_ROOT: process.cwd() }));

import { ChangeTracker } from "./state";

describe("ChangeTracker", () => {
    let directory: string;
    let statePath: string;
    let dataPath: string;

    beforeEach(async () => {
        directory = await fs.mkdtemp(join(tmpdir(), "phaseo-import-state-"));
        statePath = join(directory, "state.json");
        dataPath = join(directory, "model.json");

        const initial = await ChangeTracker.init(statePath);
        initial.track(dataPath, "same-hash", { model_id: "example/model" });
        await initial.persist();
    });

    afterEach(async () => {
        await fs.rm(directory, { recursive: true, force: true });
    });

    it("keeps files with matching hashes unchanged by default", async () => {
        const tracker = await ChangeTracker.init(statePath);

        expect(tracker.isFullImport()).toBe(false);
        expect(tracker.track(dataPath, "same-hash").status).toBe("unchanged");
    });

    it("treats matching hashes as changed during a full import", async () => {
        const tracker = await ChangeTracker.init(statePath, { forceFull: true });

        expect(tracker.isFullImport()).toBe(true);
        expect(tracker.track(dataPath, "same-hash").status).toBe("changed");
    });
});
