import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const normalise = text => text.replace(/\r\n/g, '\n');

const migration = normalise(await read('../migrations/20261113112400_model_links_kinds_and_order.sql'));
const tableSchema = normalise(await read('../schemas/public/tables/v2_model_links.sql'));
const functionSchema = normalise(await read('../schemas/public/functions/mutate_v2_admin_model_graph.sql'));

const body = text => {
	const start = text.indexOf('CREATE OR REPLACE FUNCTION public.mutate_v2_admin_model_graph');
	return text.slice(start, text.indexOf('end $function$;', start));
};

try {
	assert.equal(body(migration), body(functionSchema), 'migration and declarative function bodies match');
	assert.match(tableSchema, /"sort_order" integer\s+NOT NULL DEFAULT 0/);
	assert.match(tableSchema, /v2_model_links_link_kind_check/);

	await db.exec('create role anon; create role authenticated; create role service_role;');
	for (const name of ['v2_labs', 'v2_models']) {
		const sql = await read(`../schemas/public/tables/${name}.sql`);
		await db.exec(sql.slice(0, sql.indexOf('\n);') + 3));
	}
	// The table as it was before this migration.
	await db.exec(`
		create table public.v2_model_links (
			model_slug text not null references public.v2_models(model_slug) on delete cascade,
			link_kind text not null,
			title text not null,
			url text not null,
			metadata jsonb not null default '{}'::jsonb,
			created_at timestamptz not null default now(),
			updated_at timestamptz not null default now(),
			primary key (model_slug, link_kind, url)
		);
		create table public.users (user_id uuid primary key, role text);
		create table public.v2_catalogue_admin_changes (actor_user_id uuid, resource_type text, resource_id text, action text, before_state jsonb, after_state jsonb);
		create table public.v2_catalogue_source_overrides (source_type text, source_key text, disposition text, actor_user_id uuid, resource_id text, updated_at timestamptz, primary key (source_type, source_key));
		insert into public.users values ('00000000-0000-0000-0000-000000000001', 'admin');
		insert into public.v2_labs (lab_slug, name) values ('lab', 'Lab');
		insert into public.v2_models (model_slug, lab_slug, name) values ('lab/a', 'lab', 'A'), ('lab/b', 'lab', 'B');
		insert into public.v2_model_links (model_slug, link_kind, title, url) values
			('lab/a', 'playground', 'Try it', 'https://example.com/play'),
			('lab/a', 'announcement', 'Launch post', 'https://example.com/news'),
			('lab/a', 'model', 'On Hugging Face', 'https://huggingface.co/lab/a'),
			('lab/a', 'model', 'Elsewhere', 'https://router.example/lab/a'),
			('lab/a', 'source', 'Code', 'https://github.com/lab/a'),
			('lab/a', 'release_notes', 'Changelog', 'https://example.com/changelog'),
			('lab/a', 'mystery_kind', 'Something', 'https://example.com/other'),
			('lab/b', 'website', 'Lab', 'https://lab.example/'),
			('lab/b', 'official_website', 'Lab site', 'https://lab.example/'),
			('lab/b', 'official_model_card', 'Card', 'https://lab.example/card');
	`);

	// The migration must apply cleanly to the old table.
	await db.exec(migration);

	const { rows: linksA } = await db.query(
		"select link_kind, title, url, sort_order from public.v2_model_links where model_slug = 'lab/a' order by sort_order",
	);
	assert.deepEqual(linksA.map(link => [link.link_kind, link.title]), [
		['announcement', 'Changelog'],
		['announcement', 'Launch post'],
		['weights', 'On Hugging Face'],
		['repository', 'Code'],
		['playground', 'Try it'],
		['website', 'Something'],
		['provider', 'Elsewhere'],
	]);
	assert.deepEqual(linksA.map(link => link.sort_order), [10, 20, 30, 40, 50, 60, 70]);

	const { rows: linksB } = await db.query(
		"select link_kind, title from public.v2_model_links where model_slug = 'lab/b' order by sort_order",
	);
	// The duplicate website URL collapses onto the row that already had the website kind.
	assert.deepEqual(linksB, [
		{ link_kind: 'model_card', title: 'Card' },
		{ link_kind: 'website', title: 'Lab' },
	]);

	await assert.rejects(
		db.query("insert into public.v2_model_links (model_slug, link_kind, title, url) values ('lab/a', 'docs', 'Docs', 'https://example.com/docs')"),
		/v2_model_links_link_kind_check/,
	);

	// Saving from the editor keeps the list order and the display titles.
	await db.query(
		'select public.mutate_v2_admin_model_graph($1, $2, $3)',
		['00000000-0000-0000-0000-000000000001', 'lab/a', JSON.stringify({ links: [
			{ kind: 'weights', title: 'Weights (NVFP4)', url: 'https://huggingface.co/lab/a' },
			{ kind: 'weights', title: 'Weights (MXFP8)', url: 'https://huggingface.co/lab/a-mxfp8' },
			{ kind: 'announcement', title: '', platform: 'announcement', url: ' https://example.com/news ' },
			{ kind: 'weights', title: 'Duplicate', url: 'https://huggingface.co/lab/a' },
		] })],
	);
	const { rows: saved } = await db.query(
		"select link_kind, title, url, sort_order from public.v2_model_links where model_slug = 'lab/a' order by sort_order",
	);
	assert.deepEqual(saved, [
		{ link_kind: 'weights', title: 'Weights (NVFP4)', url: 'https://huggingface.co/lab/a', sort_order: 10 },
		{ link_kind: 'weights', title: 'Weights (MXFP8)', url: 'https://huggingface.co/lab/a-mxfp8', sort_order: 20 },
		{ link_kind: 'announcement', title: 'announcement', url: 'https://example.com/news', sort_order: 30 },
	]);

	console.log('model links kinds and order: ok');
} finally {
	await db.close();
}
