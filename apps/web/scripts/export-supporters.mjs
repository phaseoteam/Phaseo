import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const GRAPHQL_URL = "https://api.github.com/graphql";
const TOKEN = process.env.SUPPORTERS_TOKEN ?? process.env.GITHUB_TOKEN;
const LOGIN =
	process.env.SUPPORTERS_LOGIN ?? process.env.GITHUB_REPOSITORY_OWNER;
const OWNER =
	process.env.SUPPORTERS_OWNER ?? process.env.GITHUB_REPOSITORY_OWNER ?? LOGIN;
const REPO =
	process.env.SUPPORTERS_REPO ??
	(process.env.GITHUB_REPOSITORY?.split("/")?.[1] ?? null);

if (!TOKEN) {
	throw new Error("GITHUB_TOKEN or SUPPORTERS_TOKEN must be provided");
}

if (!LOGIN) {
	throw new Error("SUPPORTERS_LOGIN or repository owner must be provided");
}

if (!OWNER) {
	throw new Error("SUPPORTERS_OWNER or repository owner must be provided");
}

if (!REPO) {
	throw new Error(
		"SUPPORTERS_REPO or GITHUB_REPOSITORY must be provided (owner/repo)"
	);
}

const publicDir = path.join(process.cwd(), "public");
const contributorsPath = path.join(publicDir, "contributors.json");
const sponsorsPath = path.join(publicDir, "sponsors.json");

function sponsorQuery(kind) {
	return `
		query($login: String!, $after: String) {
			${kind}(login: $login) {
				sponsors(first: 100, privacy: PUBLIC, after: $after) {
					nodes {
						__typename
						... on User { login name avatarUrl url }
						... on Organization { login name avatarUrl url }
					}
					pageInfo { hasNextPage endCursor }
				}
			}
		}
	`;
}

async function fetchGraphQL(query, variables) {
	const response = await fetch(GRAPHQL_URL, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${TOKEN}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ query, variables }),
	});

	const body = await response.json();
	if (!response.ok) {
		throw new Error(
			`GraphQL error: ${JSON.stringify(body, null, 2)}`
		);
	}
	if (body.errors?.length) {
		throw new Error(`GraphQL errors: ${JSON.stringify(body.errors, null, 2)}`);
	}

	return body.data;
}

async function fetchSponsorsFor(kind) {
	const nodes = [];
	let after = null;

	while (true) {
		const data = await fetchGraphQL(sponsorQuery(kind), {
			login: LOGIN,
			after,
		});

		const collection = data?.[kind]?.sponsors;
		if (!collection) break;

		nodes.push(...(collection.nodes ?? []));
		if (!collection.pageInfo?.hasNextPage) break;
		after = collection.pageInfo.endCursor;
	}

	return nodes;
}

async function fetchAllSponsors() {
	const kinds = ["user", "organization"];
	const seen = new Set();
	const sponsors = [];

	for (const kind of kinds) {
		const nodes = await fetchSponsorsFor(kind);
		for (const node of nodes) {
			const login = node?.login ?? node?.name;
			if (!login || seen.has(login)) continue;
			seen.add(login);
			sponsors.push({
				login,
				name: node?.name ?? null,
				avatarUrl: node?.avatarUrl ?? null,
				url: node?.url ?? null,
			});
		}
		if (sponsors.length) {
			// stop after the first kind that returns data
			break;
		}
	}

	return sponsors;
}

async function fetchContributors() {
	const response = await fetch(
		`https://api.github.com/repos/${OWNER}/${REPO}/contributors?per_page=100&anon=1`,
		{
			headers: {
				Authorization: `Bearer ${TOKEN}`,
				Accept: "application/vnd.github+json",
				"User-Agent": "phaseo-supporters-export",
			},
		}
	);

	if (!response.ok) {
		const text = await response.text();
		throw new Error(
			`Failed to fetch contributors: ${response.status} ${text.trim()}`
		);
	}

	const payload = await response.json();
	const contributors = (Array.isArray(payload) ? payload : []).map((entry) => {
		const login = entry.login ?? null;
		const name = entry.name ?? login ?? entry.email ?? null;
		return {
			login,
			name,
			avatarUrl: entry.avatar_url ?? null,
			htmlUrl: entry.html_url ?? null,
			contributions: Number(entry.contributions ?? 0),
		};
	});

	return contributors.filter((contributor) => contributor.name || contributor.login);
}

async function run() {
	await mkdir(publicDir, { recursive: true });

	const [sponsors, contributors] = await Promise.all([
		fetchAllSponsors(),
		fetchContributors(),
	]);

	await writeFile(sponsorsPath, JSON.stringify({ sponsors }, null, 2));
	await writeFile(contributorsPath, JSON.stringify({ contributors }, null, 2));
}

run().catch((error) => {
	console.error(error);
	process.exit(1);
});
