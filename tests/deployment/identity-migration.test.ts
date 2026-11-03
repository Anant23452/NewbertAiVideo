import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";
import { startCluster, freePort, connectionUrl } from "../../scripts/db/local-cluster.mjs";

test("namespace migration preserves accounts, password hashes, sessions and workspaces and avoids managed auth", {timeout:180000}, async()=>{
  const local=await startCluster({directory:resolve("test-results/identity-migration",randomUUID()),port:await freePort()});
  const db=new pg.Client({connectionString:connectionUrl(local.config,"postgres")});await db.connect();
  try {
    const directory="packages/database/migrations";
    const names=(await readdir(directory)).filter(n=>n.endsWith('.sql')).sort();
    const last=names.pop()!;
    assert.equal(last,"1793664000015_private-identity-schema.sql");
    await db.query("BEGIN");
    for(const name of names) await db.query((await readFile(directory+'/'+name,'utf8')).split('-- Down Migration')[0]!);
    await db.query("COMMIT");
    await db.query(`INSERT INTO auth."user"(id,name,email,"emailVerified","updatedAt") VALUES('preserved-user','Existing creator','existing@example.test',true,now())`);
    await db.query(`INSERT INTO auth.account(id,"accountId","providerId","userId",password,"updatedAt") VALUES('preserved-account','preserved-user','credential','preserved-user','existing-hash-fixture',now())`);
    await db.query(`INSERT INTO auth.session(id,"expiresAt",token,"updatedAt","userId") VALUES('preserved-session',now()+interval '1 day','existing-token-fixture',now(),'preserved-user')`);
    const binding=(await db.query("SELECT * FROM auth.workspace_binding WHERE auth_user_id='preserved-user'")).rows[0];
    const migration=(await readFile(directory+'/'+last,'utf8')).split('-- Down Migration')[0]!;
    await db.query("CREATE TABLE auth.users(id text primary key); INSERT INTO auth.users VALUES('guard-sentinel')");
    await db.query("BEGIN");
    await assert.rejects(db.query(migration),/managed auth is not eligible/);
    await db.query("ROLLBACK");
    assert.equal((await db.query("SELECT id FROM auth.users")).rows[0].id,'guard-sentinel');
    await db.query("DROP TABLE auth.users"); // This isolated test owns the sentinel fixture.
    await db.query("BEGIN");
    await db.query(migration);
    await db.query("COMMIT");
    assert.equal((await db.query("SELECT password FROM newbert_auth.account WHERE id='preserved-account'")).rows[0].password,'existing-hash-fixture');
    assert.equal((await db.query("SELECT token FROM newbert_auth.session WHERE id='preserved-session'")).rows[0].token,'existing-token-fixture');
    assert.deepEqual((await db.query("SELECT * FROM newbert_auth.workspace_binding WHERE auth_user_id='preserved-user'")).rows[0],binding);
    await db.query("CREATE SCHEMA auth; CREATE TABLE auth.users(id text primary key); INSERT INTO auth.users VALUES('managed-sentinel')");
    await db.query(`INSERT INTO newbert_auth."user"(id,name,email,"emailVerified","updatedAt") VALUES('new-user','New creator','new@example.test',true,now())`);
    assert.equal((await db.query("SELECT count(*)::int n FROM newbert_auth.workspace_binding")).rows[0].n,2);
    assert.equal((await db.query("SELECT * FROM newbert.resolve_identity('preserved-user')")).rows[0].workspace_id,binding.workspace_id);
    assert.equal((await db.query("SELECT id FROM auth.users")).rows[0].id,'managed-sentinel');
  } finally {await db.end();await local.cluster.stop();}
});
