import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createApp } from '../server/index.js';

test('1,000 website arrivals: throttled requests retry safely, unavailable agents recover fairly',async t=>{
 let now=Date.now();const app=createApp({dbPath:':memory:',password:'burst-test',clock:()=>now});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>app.server.close(r)));
 app.store.run("UPDATE users SET available=0 WHERE role='AGENT'");
 const url=`http://127.0.0.1:${app.server.address().port}/api/widget/messages`;
 const requests=Array.from({length:1000},(_,i)=>({requestId:randomUUID(),name:'Test customer '+i,body:'Message '+i}));
 let pending=requests,throttled=0;
 for(let round=0;pending.length&&round<8;round++){
  const retry=[];let cursor=0;
  await Promise.all(Array.from({length:100},async()=>{while(cursor<pending.length){const body=pending[cursor++];const response=await fetch(url,{method:'POST',body:JSON.stringify(body)});await response.text();if(response.status===429){retry.push(body);throttled++}else assert.equal(response.status,200)}}));
  pending=retry;now+=60001;
 }
 assert.equal(pending.length,0);assert.ok(throttled>0);
 assert.equal(app.store.get('SELECT count(*) n FROM messages').n,1000);
 assert.equal(app.store.get('SELECT count(*) n FROM conversations WHERE agent_id IS NULL').n,1000);
 // Replaying an acknowledged initial request must not create another conversation.
 for(const body of requests.slice(0,20)){const response=await fetch(url,{method:'POST',body:JSON.stringify(body)});assert.equal(response.status,200);await response.text()}
 app.store.run("UPDATE users SET available=1 WHERE id IN ('aisha','bilal')");
 for(let i=0;i<10;i++)app.store.tick();
 assert.equal(app.store.get('SELECT count(*) n FROM conversations').n,1000);
 assert.equal(app.store.get('SELECT count(*) n FROM messages').n,1000);
 assert.equal(app.store.get('SELECT count(*) n FROM conversations WHERE agent_id IS NULL').n,0);
 const counts=app.store.all('SELECT agent_id,count(*) n FROM conversations GROUP BY agent_id');
 assert.deepEqual(counts.map(r=>[r.agent_id,r.n]),[['aisha',500],['bilal',500]]);
 assert.equal(app.store.get("SELECT count(*) n FROM conversations WHERE status='NEW'").n,1000);
});
