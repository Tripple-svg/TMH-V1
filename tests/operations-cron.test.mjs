import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const script = async path => (await readFile(path, 'utf8')).replace(/^create extension[^;]*;/gim, '');

test('operations cron SQL removes placeholder jobs and schedules Vault-backed workers safely', async t => {
  const db = new PGlite();
  const poll = await script('supabase/migrations/20261031000003_calendly_vault_cron.sql');
  const support = await script('supabase/manual/20261031_schedule_support.sql');
  const jobs = async name => (await db.query('select * from cron.job where jobname=$1 order by jobid', [name])).rows;
  const secret = 'test-only-vault-secret-'.repeat(2);
  try {
    await db.exec(`
      create schema cron; create schema vault; create schema net;
      create table cron.job(jobid bigserial primary key,jobname text not null,schedule text not null,command text not null,active boolean default true);
      create table vault.decrypted_secrets(name text primary key,decrypted_secret text);
      create table public.fake_http_calls(id bigserial primary key,url text,headers jsonb,body jsonb);
      create table public.support_requests(id int primary key,status text,updated_at timestamptz);
      create function cron.unschedule(bigint) returns boolean language plpgsql as $$
        begin delete from cron.job where jobid=$1; return found; end;
      $$;
      create function cron.schedule(text,text,text) returns bigint language plpgsql as $$
        declare saved bigint;
        begin insert into cron.job(jobname,schedule,command) values($1,$2,$3) returning jobid into saved; return saved; end;
      $$;
      -- This is a local recording stub. It never performs an HTTP request.
      create function net.http_post(url text,headers jsonb,body jsonb) returns bigint language plpgsql as $$
        declare saved bigint;
        begin insert into public.fake_http_calls(url,headers,body) values($1,$2,$3) returning id into saved; return saved; end;
      $$;
    `);

    await t.test('all historical placeholder jobs are removed and a missing secret leaves no poller', async () => {
      await db.exec(`insert into cron.job(jobname,schedule,command) values
        ('calendly-poll-bookings','*/5 * * * *','REPLACE_WITH_INTERNAL_POLL_SECRET'),
        ('calendly-poll-bookings','*/5 * * * *','another stale job'),
        ('tmh-support-notifications','* * * * *','stale notification job');`);
      await db.exec(poll);
      assert.equal((await jobs('calendly-poll-bookings')).length, 0);
      await db.exec(support);
      assert.equal((await jobs('tmh-support-notifications')).length, 0);
      assert.equal((await jobs('tmh-support-retention')).length, 1);
      assert.equal((await db.query('select count(*)::int n from fake_http_calls')).rows[0].n, 0);
    });

    await t.test('a short secret cannot schedule a poller', async () => {
      await db.query('insert into vault.decrypted_secrets values($1,$2)', ['tmh_internal_poll_secret', 'too-short']);
      await db.exec(poll);
      await db.exec(support);
      assert.equal((await jobs('calendly-poll-bookings')).length, 0);
      assert.equal((await jobs('tmh-support-notifications')).length, 0);
      assert.equal((await jobs('tmh-support-retention')).length, 1);
    });

    await t.test('a configured secret schedules exactly one five-minute job without embedding it', async () => {
      await db.query('update vault.decrypted_secrets set decrypted_secret=$1 where name=$2', [secret, 'tmh_internal_poll_secret']);
      await db.exec(poll);
      const [job] = await jobs('calendly-poll-bookings');
      assert.equal((await jobs('calendly-poll-bookings')).length, 1);
      assert.equal(job.schedule, '*/5 * * * *'); assert.equal(job.active, true);
      assert.match(job.command, /vault\.decrypted_secrets/); assert.match(job.command, /tmh_internal_poll_secret/);
      assert.ok(!job.command.includes(secret)); assert.doesNotMatch(job.command, /REPLACE_WITH|service_role|eyJ/);
      assert.equal((await db.query('select count(*)::int n from fake_http_calls')).rows[0].n, 0);
      // Execute only against the recording stub to validate the stored SQL's
      // named arguments and runtime Vault lookup, never the external service.
      await db.exec(job.command);
      const call = (await db.query('select * from fake_http_calls order by id desc limit 1')).rows[0];
      assert.equal(call.url, 'https://dkpoygkduktusrnsbpaq.supabase.co/functions/v1/calendly-poll-bookings');
      assert.equal(call.headers['x-internal-poll-key'], secret); assert.deepEqual(call.body, {});
    });

    await t.test('rerunning the poller migration replaces its job without duplication', async () => {
      const previous = (await jobs('calendly-poll-bookings'))[0].jobid;
      await db.exec(poll); await db.exec(poll);
      const current = await jobs('calendly-poll-bookings');
      assert.equal(current.length, 1); assert.notEqual(current[0].jobid, previous);
    });

    await t.test('manual support scheduling is repeatable and reads Vault only at execution', async () => {
      await db.exec(support); await db.exec(support);
      const notification = await jobs('tmh-support-notifications');
      const retention = await jobs('tmh-support-retention');
      assert.equal(notification.length, 1); assert.equal(retention.length, 1);
      assert.equal(notification[0].schedule, '* * * * *'); assert.equal(retention[0].schedule, '31 3 * * *');
      assert.ok(!notification[0].command.includes(secret)); assert.match(notification[0].command, /vault\.decrypted_secrets/);
      await db.exec(notification[0].command);
      const call = (await db.query('select * from fake_http_calls order by id desc limit 1')).rows[0];
      assert.equal(call.url, 'https://dkpoygkduktusrnsbpaq.supabase.co/functions/v1/send-support-notification');
      assert.equal(call.headers['x-internal-poll-key'], secret); assert.deepEqual(call.body, {});
      await db.exec(`insert into support_requests values
        (1,'resolved',now()-interval '91 days'),(2,'resolved',now()-interval '1 day'),(3,'new',now()-interval '91 days');`);
      await db.exec(retention[0].command);
      assert.deepEqual((await db.query('select id from support_requests order by id')).rows.map(row => row.id), [2, 3]);
    });
  } finally { await db.close(); }
});
