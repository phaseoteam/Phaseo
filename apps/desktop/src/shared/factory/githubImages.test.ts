import { describe, expect, it } from "vitest";
import { githubImageSource, isGithubImage } from "./githubImages";

describe("isGithubImage", () => {
	it("takes GitHub's own image addresses, and nothing else gets gh's sign-in", () => {
		expect(isGithubImage("https://github.com/user-attachments/assets/d32a0c18-a853-4e96-9ef9-fb0e2c7e11de")).toBe(true);
		expect(isGithubImage("https://github.com/owner/repo/assets/123/abc")).toBe(true);
		expect(isGithubImage("https://private-user-images.githubusercontent.com/1/2.png?jwt=x")).toBe(true);
		expect(isGithubImage("https://github.com/owner/repo/pull/3")).toBe(false);
		expect(isGithubImage("https://github.com.evil.example/user-attachments/assets/x")).toBe(false);
		expect(isGithubImage("http://github.com/user-attachments/assets/x")).toBe(false);
		expect(isGithubImage("https://example.com/user-attachments/assets/x")).toBe(false);
		expect(githubImageSource("https://github.com/user-attachments/assets/a b")).toBe("factory-image://image/?url=https%3A%2F%2Fgithub.com%2Fuser-attachments%2Fassets%2Fa%20b");
	});
});
