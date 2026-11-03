import { describe, expect, it } from "vitest";
import { INTROSPECTION_SQL, RELATION_SCHEMAS, RPC_SCHEMAS, shapeMetadata } from "../scripts/relationships-introspection.mjs";
import { findRelationship } from "../src/relationships";
import { createFixtureDb, fixtureRelationships } from "./helpers";

describe("generate-relationships introspection", () => {
	it("produces the hand-made fixture from the fixture schema", async () => {
		const db = await createFixtureDb();
		await db.exec("set search_path = ''");
		const { rows } = await db.query<{ metadata: string }>(INTROSPECTION_SQL, [RELATION_SCHEMAS, RPC_SCHEMAS]);
		const generated = shapeMetadata(rows[0]!.metadata, { generatedAt: null });
		expect(generated).toEqual(fixtureRelationships);
	});
});

describe("findRelationship (PostgREST v12 findRel rules)", () => {
	const meta = fixtureRelationships;
	const from = (name: string) => ({ schema: "public", name });
	it("many-to-one, one-to-many, one-to-one and many-to-many cardinalities", () => {
		expect(findRelationship(meta, "public", from("models"), "labs", null)).toMatchObject({ cardinality: "m2o", toOne: true, constraint: "models_lab_slug_fkey" });
		expect(findRelationship(meta, "public", from("labs"), "models", null)).toMatchObject({ cardinality: "o2m", toOne: false });
		expect(findRelationship(meta, "public", from("models"), "model_details", null)).toMatchObject({ cardinality: "o2o", toOne: true });
		expect(findRelationship(meta, "public", from("model_details"), "models", null)).toMatchObject({ cardinality: "o2o", toOne: true });
		expect(findRelationship(meta, "public", from("models"), "tags", null)).toMatchObject({ cardinality: "m2m", toOne: false, junction: { table: { name: "model_tags" } } });
	});
	it("targets by FK column or constraint name, hints by constraint, column or junction", () => {
		expect(findRelationship(meta, "public", from("models"), "lab_slug", null).target.name).toBe("labs");
		expect(findRelationship(meta, "public", from("models"), "models_lab_slug_fkey", null).target.name).toBe("labs");
		expect(findRelationship(meta, "public", from("workspace_join_requests"), "users", "requester_user_id").constraint).toBe("workspace_join_requests_requester_user_id_fkey");
		expect(findRelationship(meta, "public", from("workspaces"), "users", "workspace_members")).toMatchObject({ cardinality: "m2m" });
	});
	it("self-reference: column target is M2O, table target is O2M", () => {
		expect(findRelationship(meta, "public", from("models"), "previous_model_slug", null)).toMatchObject({ cardinality: "m2o" });
		expect(findRelationship(meta, "public", from("models"), "models", null)).toMatchObject({ cardinality: "o2m" });
		expect(findRelationship(meta, "public", from("models"), "models", "previous_model_slug")).toMatchObject({ cardinality: "o2m" });
	});
	it("ambiguity and absence", () => {
		expect(() => findRelationship(meta, "public", from("workspace_join_requests"), "users", null)).toThrow(/more than one relationship/);
		expect(() => findRelationship(meta, "public", from("labs"), "tags", null)).toThrow(/Could not find a relationship/);
		expect(() => findRelationship(meta, "auth", from("models"), "labs", null)).toThrow(/Could not find a relationship/);
	});
});
