import test from 'node:test';
import assert from 'node:assert/strict';
import { deploymentEnvironment } from '../server/deployment.js';
import { createApp } from '../server/index.js';
import { mkdtempSync,rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
test('Production configuration requires durable path and HTTPS; Render URL is discovered',()=>{
 const env={NODE_ENV:'production',DATABASE_PATH:'/var/data/uocms.sqlite',COOKIE_SECURE:'true',RENDER_EXTERNAL_URL:'https://example.onrender.com'};
 assert.equal(deploymentEnvironment(env).publicUrl,env.RENDER_EXTERNAL_URL);
 for(const change of [{DATABASE_PATH:''},{COOKIE_SECURE:'false'},{PUBLIC_BASE_URL:'http://example.com'},{PUBLIC_BASE_URL:'https://example.com/path'}])assert.throws(()=>deploymentEnvironment({...env,...change}));
});
test('Production starts with one administrator, supports login and keeps account across restart',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'dc-deploy-')),dbPath=join(dir,'store.sqlite');let app;
 const close=async()=>{if(app){await new Promise(r=>app.server.close(r));app=null}};
 try{
  assert.throws(()=>createApp({dbPath,production:true,password:'short',adminEmail:'admin@example.com'}),/INITIAL_PASSWORD/);
  app=createApp({dbPath,production:true,password:'deployment-test-password',adminEmail:'admin@example.com'});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));let url=`http://127.0.0.1:${app.server.address().port}`;
  assert.equal(app.store.get('SELECT count(*) n FROM users').n,1);
  assert.deepEqual(await (await fetch(url+'/healthz')).json(),{ok:true});
  const login=await fetch(url+'/api/login',{method:'POST',body:JSON.stringify({email:'admin@example.com',password:'deployment-test-password'})});assert.equal(login.status,200);
  await close();app=createApp({dbPath,production:true,password:undefined,adminEmail:undefined});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  assert.equal(app.store.get('SELECT count(*) n FROM users').n,1);
  assert.equal(app.store.get("SELECT email FROM users WHERE id='admin'").email,'admin@example.com');
 }finally{await close();rmSync(dir,{recursive:true,force:true})}
});
