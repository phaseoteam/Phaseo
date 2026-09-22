import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migration = await readFile(
	new URL("../migrations/20260922113000_order_public_catalogue_by_availability.sql", import.meta.url),
	"utf8",
);

test("orders same-day catalogue models by when they became available", async () => {
	const db = new PGlite();
	try {
		await db.exec(`
			create role anon;
			create role authenticated;
			create role service_role;
			create table public.v2_models (
				model_slug text primary key,
				created_at timestamptz
			);
			insert into public.v2_models (model_slug, created_at) values
				('spacex-ai/grok-4.7', '2026-08-13T00:00:00Z'),
				('xiaomi/mimo-v2.6-flash', '2026-09-21T12:00:00Z'),
				('upstage/solar-mini-4', '2026-09-22T08:00:00Z');

			create function public.get_public_models_page_rows()
			returns setof jsonb language sql stable as $$
				select payload from (values
					(1, jsonb_build_object('model_id', 'spacex-ai/grok-4.7', 'organisation_id', 'spacex-ai', 'primary_timestamp', 1789948800000)),
					(2, jsonb_build_object('model_id', 'xiaomi/mimo-v2.6-flash', 'organisation_id', 'xiaomi', 'primary_timestamp', 1789948800000)),
					(3, jsonb_build_object('model_id', 'upstage/solar-mini-4', 'organisation_id', 'upstage', 'primary_timestamp', 1790035200000))
				) rows(position, payload) order by position
			$$;

			create function public.get_v2_public_models_page_rows(text, text)
			returns setof jsonb language sql stable as $$
				select * from public.get_public_models_page_rows()
			$$;
		`);

		await db.exec(migration);

		for (const query of [
			"select public.get_public_models_page_payload() as payload",
			"select public.get_public_models_page_payload('us', 'standard') as payload",
		]) {
			const payload = (await db.query(query)).rows[0].payload;
			assert.deepEqual(payload.map((model) => model.model_id), [
				"upstage/solar-mini-4",
				"xiaomi/mimo-v2.6-flash",
				"spacex-ai/grok-4.7",
			]);
		}
	} finally {
		await db.close();
	}
});
