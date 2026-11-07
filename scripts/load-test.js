// Isolated real-HTTP, on-disk mixed-channel burst and abrupt-crash recovery.
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { createHmac } from 'node:crypto';
import { mkdtempSync,rmSync,writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
const count=Number(process.env.LOAD_MESSAGES||12000),concurrency=Number(process.env.LOAD_CONCURRENCY||1000);
assert.ok(Number.isInteger(count)&&count>=300&&count%6===0,'LOAD_MESSAGES must be a multiple of 6, at least 300');
assert.ok(Number.isInteger(concurrency)&&concurrency>0);
const dir=mkdtempSync(join(tmpdir(),'daddu-load-')),dbPath=join(dir,'test.sqlite');
let child,url,accepted=0,transportRetries=0;const latencies=[];const stamp=Math.floor(Date.now()/1000);
async function start(){child=fork(new URL('./load-worker.js',import.meta.url),{env:{...process.env,LOAD_DB:dbPath},stdio:['ignore','ignore','inherit','ipc']});const [m]=await once(child,'message');url='http://127.0.0.1:'+m.port;}
async function stop(crash=false){const exited=once(child,'exit');if(crash)child.kill('SIGKILL');else child.send('stop');await exited;child=null;}
async function stats(){const result=once(child,'message');child.send('stats');return (await result)[0].stats;}
function event(i){const channel=['whatsapp','facebook','instagram'][i%3],sender=String(923000000000+Math.floor(i/6)),id='load-'+i;return {channel,payload:channel==='whatsapp'?{object:'whatsapp_business_account',entry:[{id:'456',changes:[{field:'messages',value:{metadata:{phone_number_id:'123'},messages:[{id,from:sender,timestamp:String(stamp),type:'text',text:{body:id}}]}}]}]}:{object:channel==='facebook'?'page':'instagram',entry:[{id:'123',messaging:[{sender:{id:sender},recipient:{id:'123'},timestamp:stamp*1000,message:{mid:id,text:id}}]}]}};}
async function send(i,wrapped=false,attempt=0){try{const {channel,payload}=event(i);if(wrapped)payload.retry_marker=true;const body=JSON.stringify(payload),begin=performance.now();const response=await fetch(url+'/webhooks/'+channel,{method:'POST',headers:{'x-hub-signature-256':'sha256='+createHmac('sha256','load-secret').update(body).digest('hex')},body,signal:AbortSignal.timeout(60000)});await response.text();assert.equal(response.status,200);accepted++;latencies.push(performance.now()-begin);}catch(error){if(attempt>=5)throw error;transportRetries++;await new Promise(r=>setTimeout(r,100*2**attempt));return send(i,wrapped,attempt+1)}}
async function burst(n,wrapped=false){let cursor=0;await Promise.all(Array.from({length:Math.min(concurrency,n)},async()=>{while(cursor<n)await send(cursor++,wrapped)}));}
try{
 await start();const begin=performance.now();await burst(count);const ackSeconds=(performance.now()-begin)/1000;const beforeCrash=await stats();
 assert.ok(beforeCrash.pending>0,'Crash test requires a nonempty persisted backlog');
 await stop(true);await start();await burst(Math.min(1200,count),true);
 const deadline=Date.now()+120000;let state;do{state=await stats();if(!state.pending)break;await new Promise(r=>setTimeout(r,100));}while(Date.now()<deadline);
 assert.equal(state.pending,0,'Queue did not drain');await stop();
 const db=new DatabaseSync(dbPath);const scalar=sql=>db.prepare(sql).get().n;
 assert.equal(scalar('SELECT count(*) n FROM messages'),count);
 assert.equal(scalar('SELECT count(*) n FROM conversations'),count/2);
 assert.equal(scalar('SELECT count(*) n FROM conversations WHERE agent_id IS NULL'),0);
 assert.equal(scalar('SELECT count(*) n FROM (SELECT conversation_id FROM messages GROUP BY conversation_id HAVING count(*)<>2)'),0);
 const actual=new Set(db.prepare('SELECT request_id,body FROM messages').all().map(r=>{assert.equal(r.body,r.request_id.split(':').at(-1));return r.request_id}));
 for(let i=0;i<count;i++)assert.ok(actual.has(`${['wa','FACEBOOK','INSTAGRAM'][i%3]}:load-${i}`),'Missing ID '+i);
 const assignments=db.prepare('SELECT agent_id,count(*) count FROM conversations GROUP BY agent_id').all();assert.equal(assignments.length,3);assert.ok(Math.max(...assignments.map(a=>a.count))-Math.min(...assignments.map(a=>a.count))<=1);
 for(const p of ['wa','fb','ig'])assert.equal(scalar(`SELECT count(*) n FROM ${p}_inbox WHERE processed<>1`),0);
 assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);db.close();latencies.sort((a,b)=>a-b);
 const report={testedAt:new Date().toISOString(),uniqueMessages:count,expectedConversations:count/2,channels:['WhatsApp','Facebook','Instagram'],concurrentClients:concurrency,acceptedRequests:accepted,transportRetries,rewrappedDuplicateRequests:Math.min(1200,count),beforeAbruptCrash:beforeCrash,recoveredMessages:count-beforeCrash.messages,missingMessages:0,duplicateMessages:0,unassignedConversations:0,acknowledgmentSeconds:+ackSeconds.toFixed(2),totalSeconds:+((performance.now()-begin)/1000).toFixed(2),p95SuccessfulAttemptMs:+latencies[Math.floor(latencies.length*.95)].toFixed(1),assignments,integrity:'ok',note:'Synthetic signed HTTP traffic, persistent SQLite, SIGKILL/restart; no Meta calls. Concurrent clients are in-flight requests, not guaranteed simultaneous socket arrival.'};
 console.log(JSON.stringify(report,null,2));if(process.env.LOAD_REPORT)writeFileSync(process.env.LOAD_REPORT,JSON.stringify(report,null,2)+'\n');
}finally{if(child)await stop(true);rmSync(dir,{recursive:true,force:true})}
