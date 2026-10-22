import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const workspace = '10000000-0000-4000-8000-000000000001';
const user = '20000000-0000-4000-8000-000000000001';
const other = '20000000-0000-4000-8000-000000000002';
const tables = ['mcp_oauth_clients', 'mcp_connections', 'mcp_oauth_pending', 'mcp_tool_calls'];
const connect = (owner, label, extra = '') => db.query(
    `insert into public.mcp_connections(workspace_id,user_id,label_slug,display_name,server_url${extra ? ',status' : ''})
     values($1,$2,$3,'Linear','https://mcp.linear.app/mcp'${extra ? `,'${extra}'` : ''}) returning id`,
    [workspace, owner, label],
);
try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      grant usage on schema public to anon, authenticated, service_role;
      create schema auth; create table auth.users(id uuid primary key);
      create table public.workspaces(id uuid primary key);
    `);
    for (const table of tables) await db.exec(await read(`../schemas/public/tables/${table}.sql`));
    await db.query('insert into public.workspaces values($1)', [workspace]);
    await db.query('insert into auth.users values($1),($2)', [user, other]);

    // The server runtime can write a full connection and its call log.
    await db.exec('set role service_role');
    const client = (await db.query(
        `insert into public.mcp_oauth_clients(issuer,registration_kind,redirect_uri,client_id) values('https://mcp.linear.app','cimd','https://phaseo.app/cb','https://phaseo.app/cimd.json') returning id`,
    )).rows[0].id;
    const connection = (await connect(user, 'linear')).rows[0].id;
    await db.query(`update public.mcp_connections set oauth_client_id = $1, access_token_enc = 'mcpv1.a.b' where id = $2`, [client, connection]);
    await db.query(
        `insert into public.mcp_oauth_pending(state_hash,workspace_id,user_id,oauth_client_id,server_url,resource,issuer,label_slug,display_name,code_verifier_enc)
         values('h',$1,$2,$3,'https://mcp.linear.app/mcp','https://mcp.linear.app/mcp','https://mcp.linear.app','linear','Linear','mcpv1.a.b')`,
        [workspace, user, client],
    );
    await db.query(`insert into public.mcp_tool_calls(workspace_id,user_id,connection_id,tool_name,status) values($1,$2,$3,'list_issues','ok')`, [workspace, user, connection]);

    // Labels are unique per person, not per workspace, and must be tool-name safe.
    await assert.rejects(connect(user, 'linear'), /mcp_connections_owner_label_idx/);
    await connect(other, 'linear');
    await assert.rejects(connect(user, 'Linear-Work'), /mcp_connections_label_slug_check/);
    await assert.rejects(connect(user, 'notion', 'shared'), /mcp_connections_status_check/);
    await assert.rejects(db.query(`insert into public.mcp_tool_calls(workspace_id,tool_name,status) values($1,'x','pending')`, [workspace]), /mcp_tool_calls_status_check/);
    await db.exec('reset role');

    // Browsers and API clients cannot read or write any of it, even their own rows.
    for (const role of ['anon', 'authenticated']) {
        await db.exec(`set role ${role}`);
        for (const table of tables) {
            await assert.rejects(db.query(`select * from public.${table}`), /permission denied/, `${role} select ${table}`);
            await assert.rejects(db.query(`delete from public.${table}`), /permission denied/, `${role} delete ${table}`);
        }
        await assert.rejects(connect(user, 'sneaky'), /permission denied/);
        await db.exec('reset role');
    }

    // Removing a person removes their connections and sign-ins but keeps the call log for the workspace.
    await db.query('delete from auth.users where id = $1', [user]);
    assert.equal((await db.query('select count(*)::int as n from public.mcp_connections where user_id = $1', [user])).rows[0].n, 0);
    assert.equal((await db.query('select count(*)::int as n from public.mcp_oauth_pending')).rows[0].n, 0);
    const call = (await db.query('select user_id, connection_id from public.mcp_tool_calls')).rows[0];
    assert.deepEqual(call, { user_id: null, connection_id: null });

    console.log('mcp connections access: ok');
} finally {
    await db.close();
}
