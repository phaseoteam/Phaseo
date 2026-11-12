import { describe, expect, it } from "vitest";
import { codeHostRequestUrl, parseCodeHostRemote, validateCustomCodeHosts } from "./codeHosts";
import { validateCodeHostTokenRequest } from "./codeHostSettings";

describe("parseCodeHostRemote", () => {
	it.each([
		["https://github.com/phaseo/app.git", "github", "github.com", "phaseo/app", "https://github.com/phaseo/app"],
		["git@gitlab.com:group/sub/project.git", "gitlab", "gitlab.com", "group/sub/project", "https://gitlab.com/group/sub/project"],
		["https://gitlab.example.com/team/app", "gitlab", "gitlab.example.com", "team/app", "https://gitlab.example.com/team/app"],
		["ssh://git@codeberg.org:2222/someone/thing.git", "forgejo", "codeberg.org", "someone/thing", "https://codeberg.org/someone/thing"],
		["https://gitea.example.org:3000/o/r.git", "forgejo", "gitea.example.org:3000", "o/r", "https://gitea.example.org:3000/o/r"],
		["https://user@bitbucket.org/workspace/repo.git", "bitbucket", "bitbucket.org", "workspace/repo", "https://bitbucket.org/workspace/repo"],
		["git@bitbucket.org:workspace/repo.git", "bitbucket", "bitbucket.org", "workspace/repo", "https://bitbucket.org/workspace/repo"],
		["https://org@dev.azure.com/org/My%20Project/_git/repo", "azure", "dev.azure.com", "org/My Project/repo", "https://dev.azure.com/org/My%20Project/_git/repo"],
		["git@ssh.dev.azure.com:v3/org/project/repo", "azure", "dev.azure.com", "org/project/repo", "https://dev.azure.com/org/project/_git/repo"],
		["https://org.visualstudio.com/DefaultCollection/project/_git/repo", "azure", "dev.azure.com", "org/project/repo", "https://dev.azure.com/org/project/_git/repo"],
	])("reads %s", (remote, kind, host, repository, webUrl) => {
		expect(parseCodeHostRemote(remote)).toEqual({ kind, host, repository, webUrl });
	});

	it("leaves unknown servers and odd paths alone", () => {
		expect(parseCodeHostRemote("https://git.example.com/a/b.git")).toBeUndefined();
		expect(parseCodeHostRemote("https://github.com/a/b/c")).toBeUndefined();
		expect(parseCodeHostRemote("https://gitlab.com/only")).toBeUndefined();
		expect(parseCodeHostRemote("https://gitlab.com/a/../b")).toBeUndefined();
		expect(parseCodeHostRemote("C:/projects/app")).toBeUndefined();
	});

	it("uses servers the person named", () => {
		const custom = validateCustomCodeHosts([{ host: "https://git.example.com/", kind: "gitlab" }]);
		expect(parseCodeHostRemote("git@git.example.com:a/b.git", custom)).toMatchObject({ kind: "gitlab", repository: "a/b" });
		expect(() => validateCustomCodeHosts([{ host: "git.example.com", kind: "github" }])).toThrow();
	});

	it("links each host's request page", () => {
		expect(codeHostRequestUrl(parseCodeHostRemote("git@gitlab.com:g/p.git")!, 4)).toBe("https://gitlab.com/g/p/-/merge_requests/4");
		expect(codeHostRequestUrl(parseCodeHostRemote("git@bitbucket.org:w/r.git")!, 4)).toBe("https://bitbucket.org/w/r/pull-requests/4");
		expect(codeHostRequestUrl(parseCodeHostRemote("git@ssh.dev.azure.com:v3/o/p/r")!, 4)).toBe("https://dev.azure.com/o/p/_git/r/pullrequest/4");
		expect(codeHostRequestUrl(parseCodeHostRemote("https://codeberg.org/o/r")!, 4)).toBe("https://codeberg.org/o/r/pull/4");
	});
});

describe("validateCodeHostTokenRequest", () => {
	it("files Bitbucket and Azure tokens under their one server", () => {
		expect(validateCodeHostTokenRequest({ kind: "bitbucket", host: "ignored", token: "abc", email: "me@example.com" })).toEqual({ kind: "bitbucket", host: "bitbucket.org", token: "abc", email: "me@example.com" });
		expect(validateCodeHostTokenRequest({ kind: "azure", token: "abc" }).host).toBe("dev.azure.com");
		expect(validateCodeHostTokenRequest({ kind: "gitlab", host: "https://gitlab.example.com/", token: "glpat-x" }).host).toBe("gitlab.example.com");
	});
	it("refuses tokens with spaces, GitHub, and email for other hosts", () => {
		expect(() => validateCodeHostTokenRequest({ kind: "gitlab", host: "gitlab.com", token: "a b" })).toThrow();
		expect(() => validateCodeHostTokenRequest({ kind: "github", host: "github.com", token: "x" })).toThrow();
		expect(() => validateCodeHostTokenRequest({ kind: "gitlab", host: "gitlab.com", token: "x", email: "a@b.c" })).toThrow();
	});
});
