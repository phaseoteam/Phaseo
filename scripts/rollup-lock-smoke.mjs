import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';

/** Two real PostgreSQL sessions in the disposable replay database. */
export async function runRollupLockSmoke(container) {
  const args = ['exec', '-i', container, 'psql', '-XqAt', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'];
  const holder = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });
  let output = '';
  let errors = '';
  const finished = new Promise(resolve => holder.once('close', resolve));
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Peer advisory lock was not acquired within 15 seconds')), 15000);
      holder.stdout.on('data', chunk => {
        output += chunk;
        if (output.includes('rollup_lock_ready')) { clearTimeout(timer); resolve(); }
      });
      holder.stderr.on('data', chunk => { errors += chunk; });
      holder.once('error', error => { clearTimeout(timer); reject(error); });
      holder.once('close', code => { clearTimeout(timer); reject(new Error(`Peer session closed (${code}): ${errors}`)); });
      holder.stdin.write("begin; select pg_advisory_xact_lock(hashtextextended('public.process_v2_analytics_outbox',0)); select 'rollup_lock_ready';\n");
    });
    const query = sql => {
      const result = spawnSync('docker', args, { input: sql, encoding: 'utf8', timeout: 15000 });
      if (result.error) throw result.error;
      assert.equal(result.status,0,result.stderr);
      return result.stdout.trim();
    };
    const skipped = JSON.parse(query('select public.process_v2_analytics_outbox(1);'));
    assert.equal(skipped.skipped_locked,true);
    assert.equal(skipped.selected,0);
    query(`do $$ begin
      begin
        perform public.refresh_v2_analytics_range(now(),now());
        raise exception 'Busy range refresh incorrectly reported success';
      exception when lock_not_available then null; end;
    end $$;`);
    console.log('Two-session rollup lock test passed: scheduled overlap skips; synchronous refresh fails before enqueueing.');
  } finally {
    holder.stdin.end('rollback;\n');
    const timer = setTimeout(() => holder.kill(),15000);
    await finished;
    clearTimeout(timer);
  }
}
