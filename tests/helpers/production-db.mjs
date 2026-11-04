import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
export const ADMIN_A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',ADMIN_B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const SESSION_A='11111111-1111-4111-8111-111111111111',SESSION_B='22222222-2222-4222-8222-222222222222';
export const NETWORK='a'.repeat(64);
export async function productionDb(){
  const db=new PGlite();
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;
      create function auth.role() returns text language sql as $$select current_setting('request.jwt.claim.role',true)$$;
      create function auth.jwt() returns jsonb language sql as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
      create function auth.uid() returns uuid language sql as $$select (auth.jwt()->>'sub')::uuid$$;
      create table auth.users(id uuid primary key,raw_app_meta_data jsonb not null default '{}',deleted_at timestamptz,banned_until timestamptz);
      create table auth.mfa_factors(id uuid primary key,user_id uuid references auth.users(id),status text);
      create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id));
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key,bucket_id text,name text);alter table storage.objects enable row level security;
      create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;
      grant usage on schema public,auth,storage to anon,authenticated,service_role;
      select set_config('request.jwt.claim.role','service_role',false);`);
    await db.exec(await readFile('supabase/schema.sql','utf8'));
    for(const name of (await readdir('supabase/migrations')).filter(name=>name.endsWith('.sql')&&!/cron/.test(name)).sort()){
      const sql=(await readFile('supabase/migrations/'+name,'utf8')).replace(/^create extension[^;]*;/gim,'');
      try{await db.exec(sql);}catch(error){throw Error(name+': '+error.message,{cause:error});}
    }
    await db.query('insert into auth.users(id,raw_app_meta_data) values($1,$3),($2,$3)',[ADMIN_A,ADMIN_B,{role:'admin'}]);
    await db.query('insert into auth.sessions(id,user_id) values($1,$2),($3,$4)',[SESSION_A,ADMIN_A,SESSION_B,ADMIN_B]);
    return db;
  }catch(error){await db.close();throw error;}
}
export async function scalar(db,sql,args=[]){return Object.values((await db.query(sql,args)).rows[0])[0];}
export async function rpc(db,name,args=[]){return scalar(db,`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')})`,args);}
export async function seedReview(db,id='review-a',email='synthetic@example.test'){
  await db.query("insert into brand_reviews(id,full_name,brand_name,email,whatsapp,platform_type) values($1,'Synthetic Owner','Synthetic Brand',$2,'+2340000000000','none')",[id,email]);
}
