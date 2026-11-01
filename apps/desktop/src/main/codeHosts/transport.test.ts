import { describe, expect, it, vi } from "vitest";
import { azureCliToken, glabRequester, httpRequester, teaRequester, type CliRun } from "./transport";

describe("host transports", () => {
	it("sends glab bodies on stdin with GitLab's content type, on the remote's server", async () => {
		const run = vi.fn<CliRun>(async () => ({ stdout: "{\"iid\":3}", stderr: "" }));
		expect(await glabRequester("C:/repo", "gitlab.example.com", run)("POST", "projects/a%2Fb/merge_requests", { title: "T" })).toEqual({ iid: 3 });
		expect(run).toHaveBeenCalledWith("glab", ["api", "projects/a%2Fb/merge_requests", "--method", "POST", "--input", "-", "--header", "Content-Type: application/json"], { cwd: "C:/repo", env: { GITLAB_HOST: "gitlab.example.com", NO_PROMPT: "1" }, input: "{\"title\":\"T\"}" });
	});

	it("turns glab failures into a status without the token", async () => {
		const run: CliRun = async () => { throw Object.assign(new Error("glab failed"), { stderr: "glab: 401 Unauthorized glpat-abcdefghijklmnop" }); };
		await expect(glabRequester("C:/repo", "gitlab.com", run)("GET", "user")).rejects.toMatchObject({ status: 401, detail: "glab: 401 Unauthorized [hidden]" });
	});

	it("reads tea's HTTP status, since tea exits cleanly on errors", async () => {
		const ok: CliRun = async () => ({ stdout: "[]", stderr: "HTTP/2.0 200 OK\n" });
		expect(await teaRequester("C:/repo", "https://codeberg.org", "o/r", ok)("GET", "repos/o/r/pulls")).toEqual([]);
		const denied: CliRun = async () => ({ stdout: "{\"message\":\"token is required\"}", stderr: "HTTP/2.0 401 Unauthorized\n" });
		await expect(teaRequester("C:/repo", "https://codeberg.org", "o/r", denied)("GET", "user")).rejects.toMatchObject({ status: 401, detail: "token is required" });
	});

	it("keeps fetch calls on the host's own origin", async () => {
		const fetcher = vi.fn(async () => new Response("{\"ok\":true}", { status: 200 }));
		const request = httpRequester("https://api.bitbucket.org/2.0/", { Authorization: "Bearer x" }, fetcher as unknown as typeof fetch);
		expect(await request("GET", "/repositories/w/r")).toEqual({ ok: true });
		expect(fetcher).toHaveBeenCalledWith("https://api.bitbucket.org/2.0/repositories/w/r", expect.objectContaining({ method: "GET", redirect: "error" }));
		await expect(request("GET", "https://evil.example/steal")).rejects.toThrow("Invalid host path.");
	});

	it("asks az for a DevOps token and explains a missing CLI", async () => {
		expect(await azureCliToken("C:/repo", async () => ({ stdout: "eyJ0eXAi\n", stderr: "" }))).toBe("eyJ0eXAi");
		await expect(azureCliToken("C:/repo", async () => { throw Object.assign(new Error("az was not found."), { code: "ENOENT" }); })).rejects.toThrow(/Install Azure CLI/);
	});
});
