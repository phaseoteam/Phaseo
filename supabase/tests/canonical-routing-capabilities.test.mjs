import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const migration = await readFile(new URL("../migrations/20261004220029_canonical_routing_capabilities.sql", import.meta.url), "utf8");
const db = new PGlite();
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table v2_route_capabilities (
      provider_model_id text, capability_id text, status text,
      max_input_tokens integer,max_output_tokens integer,params jsonb default '{}',
      effective_from timestamptz,effective_to timestamptz,metadata jsonb default '{}',
      primary key(provider_model_id,capability_id)
    );
    create table v2_execution_plans(provider_model_id text,capability_id text,
      foreign key(provider_model_id,capability_id) references v2_route_capabilities on delete cascade);
    create table v2_route_parameter_support(provider_model_id text,capability_id text,
      foreign key(provider_model_id,capability_id) references v2_route_capabilities on delete cascade);
    create table v2_capability_adapters(capability_id text);
    create table v2_capability_constraints(capability_id text);
    create table v2_capability_evidence(capability_id text);
    create table v2_capability_parameters(capability_id text);
    create table v2_provider_capability_adapters(capability_id text);
    create table v2_provider_endpoints(capability_id text);
    insert into v2_route_capabilities(provider_model_id,capability_id,status,effective_to,params,max_input_tokens) values
      ('whisper','audio.transcribe','active',null,'["language"]',123),
      ('reranker','rerank','active',null,'["query","documents"]',456),
      ('reranker','text.rerank','disabled','2026-09-01','[]',null),
      ('old-whisper','audio.transcribe','disabled','2026-09-01','[]',null),
      ('old-whisper','audio.transcription','active',null,'["language"]',789);
  `);
  await db.exec("insert into v2_route_capabilities(provider_model_id,capability_id,status) values ('whisper','audio.transcription','active')");
  await assert.rejects(db.exec(`begin; ${migration} commit;`), /Conflicting current capability aliases/);
  await db.exec("rollback; delete from v2_route_capabilities where provider_model_id='whisper' and capability_id='audio.transcription'; insert into v2_execution_plans values ('whisper','audio.transcribe');");
  await assert.rejects(db.exec(`begin; ${migration} commit;`), /dependent routing records/);
  await db.exec("rollback; delete from v2_execution_plans;");
  await db.exec(`begin; ${migration} commit;`);
  const rows = (await db.query("select * from v2_route_capabilities order by provider_model_id,capability_id")).rows;
  assert.equal(rows.length, 6, "historical rows are retained");
  const whisper = rows.find(r => r.provider_model_id === "whisper" && r.capability_id === "audio.transcription");
  assert.equal(whisper.status, "active");
  assert.equal(whisper.max_input_tokens, 123);
  assert.deepEqual(whisper.params, ["language"]);
  const reranker = rows.find(r => r.provider_model_id === "reranker" && r.capability_id === "text.rerank");
  assert.equal(reranker.status, "active");
  assert.equal(reranker.max_input_tokens, 456);
  assert.deepEqual(reranker.params, ["query", "documents"]);
  assert.equal(rows.find(r => r.provider_model_id === "old-whisper" && r.capability_id === "audio.transcribe").status,"disabled");
  await db.exec("insert into v2_route_capabilities(provider_model_id,capability_id,status) values ('new','images.generations','active')");
  assert.equal((await db.query("select capability_id from v2_route_capabilities where provider_model_id='new'")).rows[0].capability_id,"image.generate");
  await db.exec("insert into v2_capability_evidence(capability_id) values ('embeddings')");
  assert.equal((await db.query("select capability_id from v2_capability_evidence")).rows[0].capability_id,"text.embed");
  await db.exec("insert into v2_route_parameter_support values ('whisper','audio.transcribe')");
  assert.equal((await db.query("select capability_id from v2_route_parameter_support")).rows[0].capability_id,"audio.transcription");
  await assert.rejects(db.exec("insert into v2_capability_evidence values ('transcription_typo')"), /Unsupported routing capability/);
  await assert.rejects(db.exec("insert into v2_route_capabilities(provider_model_id,capability_id,status) values ('bad','audio.typo','active')"), /Unsupported routing capability/);
  await assert.rejects(db.exec("update v2_route_capabilities set status='active',effective_to=null where provider_model_id='whisper' and capability_id='audio.transcribe'"), /duplicate key/);
  assert.equal((await db.query("select canonical_routing_capability_id('audio.generate') value")).rows[0].value,"audio.generate", "generic audio generation must not be promoted to speech");
  console.log("Canonical capability migration preserves historical records and routing configuration, normalizes aliases, and rejects unknown writes.");
} finally { await db.close(); }
