import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
const fail = (message,status=409) => Object.assign(new Error(message),{status});
export function whatsappConfig(env=process.env){return {token:env.WHATSAPP_ACCESS_TOKEN,phoneId:env.WHATSAPP_PHONE_NUMBER_ID,wabaId:env.WHATSAPP_BUSINESS_ACCOUNT_ID,secret:env.META_APP_SECRET,verifyToken:env.WHATSAPP_VERIFY_TOKEN,version:env.META_GRAPH_VERSION,publicUrl:env.PUBLIC_BASE_URL};}
export class WhatsApp {
 constructor(store,config=whatsappConfig(),fetcher=fetch){this.s=store;this.config=config;this.fetch=fetcher;this.busy=false;store.db.exec(`
 CREATE TABLE IF NOT EXISTS wa_inbox(id TEXT PRIMARY KEY,payload TEXT NOT NULL,processed INTEGER DEFAULT 0);
 CREATE TABLE IF NOT EXISTS wa_outbox(id TEXT PRIMARY KEY,conversation_id TEXT REFERENCES conversations(id),message_id TEXT UNIQUE,recipient TEXT,phone_id TEXT,body TEXT,actor TEXT,version INTEGER,state TEXT DEFAULT 'QUEUED',provider_id TEXT UNIQUE,error_code TEXT,created INTEGER);
 CREATE TABLE IF NOT EXISTS wa_receipts(provider_id TEXT PRIMARY KEY,state TEXT,rank INTEGER);
 CREATE TABLE IF NOT EXISTS wa_health(id INTEGER PRIMARY KEY CHECK(id=1),verified INTEGER,last_event INTEGER);
 INSERT OR IGNORE INTO wa_health(id) VALUES(1);`);
 for(const [name,type] of [['attempts','INTEGER DEFAULT 0'],['retry_at','INTEGER DEFAULT 0'],['received_at','INTEGER DEFAULT 0'],['last_error','TEXT']]){if(!store.all('PRAGMA table_info(wa_inbox)').some(c=>c.name===name))store.db.exec(`ALTER TABLE wa_inbox ADD COLUMN ${name} ${type}`)}
 store.db.exec("CREATE INDEX IF NOT EXISTS wa_inbox_pending ON wa_inbox(processed,retry_at); CREATE INDEX IF NOT EXISTS wa_outbox_pending ON wa_outbox(state,created)");
 // A crashed send has an uncertain provider outcome. Never blindly resend it.
 store.run("UPDATE wa_outbox SET state='UNKNOWN' WHERE state='SENDING'");
 store.run("UPDATE messages SET delivery='UNKNOWN' WHERE id IN (SELECT message_id FROM wa_outbox WHERE state='UNKNOWN')");
 }
 ready(){const c=this.config;return !!(c.token&&c.secret&&c.verifyToken&&/^\d+$/.test(c.phoneId||'')&&/^\d+$/.test(c.wabaId||'')&&/^v\d+\.\d+$/.test(c.version||''))}
 info(){const h=this.s.get('SELECT * FROM wa_health');return {name:'WhatsApp Business',status:this.ready()?(h.last_event?'Receiving webhooks':'Configured — awaiting webhook'):'Not configured',description:'Cloud API text messages, signed webhooks, and delivery tracking. Configure server credentials, then subscribe the messages webhook field.',missing:['token','phoneId','wabaId','secret','verifyToken','version'].filter(k=>!this.config[k]),callbackUrl:this.config.publicUrl?this.config.publicUrl.replace(/\/$/,'')+'/webhooks/whatsapp':null,verifiedAt:h.verified,lastWebhookAt:h.last_event}}
 verify(signature,raw){if(!this.config.secret||!/^sha256=[a-f0-9]{64}$/.test(signature||''))return false;return timingSafeEqual(Buffer.from(signature.slice(7),'hex'),createHmac('sha256',this.config.secret).update(raw).digest())}
 receive(raw){let payload;try{payload=JSON.parse(raw.toString('utf8'))}catch{throw fail('Invalid JSON',400)}if(payload.object!=='whatsapp_business_account'||!Array.isArray(payload.entry))throw fail('Invalid webhook payload',400);const id=createHmac('sha256',this.config.secret).update(raw).digest('hex');this.s.run('INSERT OR IGNORE INTO wa_inbox(id,payload,received_at) VALUES(?,?,?)',id,JSON.stringify(payload),this.s.clock());}
 ingest(payload){for(const entry of payload.entry||[]){if(entry.id!==this.config.wabaId)continue;for(const change of entry.changes||[]){const value=change.value;if(change.field!=='messages'||value?.metadata?.phone_number_id!==this.config.phoneId)continue;
 for(const m of value.messages||[]){if(typeof m.id!=='string'||!/^\d+$/.test(m.from||'')||!Number.isFinite(Number(m.timestamp)))throw new Error('Malformed inbound message; retained for review');let body=m.type==='text'?m.text?.body:m.type==='button'?m.button?.text:m.type==='interactive'?(m.interactive?.button_reply?.title||m.interactive?.list_reply?.title):null;body=typeof body==='string'?body:'[Attachment or unsupported message received. Ask the customer for a text description.]';const name=value.contacts?.find(c=>c.wa_id===m.from)?.profile?.name;this.s.incoming({source:'WHATSAPP',externalKey:`${this.config.phoneId}:${m.from}`,name:typeof name==='string'?name.slice(0,80):'Customer',body:body.slice(0,16000),requestId:`wa:${m.id}`,providerAt:Math.min(Number(m.timestamp)*1000,this.s.clock())});}
 for(const status of value.statuses||[]){const state=({sent:'SENT',delivered:'DELIVERED',read:'READ',failed:'FAILED'})[status.status];if(!state||typeof status.id!=='string')continue;const rank=({SENT:1,FAILED:2,DELIVERED:3,READ:4})[state];this.s.run('INSERT INTO wa_receipts VALUES(?,?,?) ON CONFLICT(provider_id) DO UPDATE SET state=excluded.state,rank=excluded.rank WHERE excluded.rank>wa_receipts.rank',status.id,state,rank);const out=this.s.get('SELECT * FROM wa_outbox WHERE provider_id=? OR id=?',status.id,status.biz_opaque_callback_data||'');if(out)this.accept(out,status.id);}
 this.s.run('UPDATE wa_health SET last_event=? WHERE id=1',this.s.clock());}}}
 queue(c,user,body,requestId){if(!this.ready())throw fail('Messaging integration is not configured. Contact your administrator.');return this.s.transaction(()=>{if(this.s.get('SELECT id FROM messages WHERE conversation_id=? AND request_id=?',c.id,requestId))return;if(!['NEW','OPEN'].includes(c.status))throw fail('Reopen this conversation before replying.');const identity=this.s.get('SELECT * FROM channel_identities WHERE conversation_id=?',c.id);if(!identity||identity.last_inbound<this.s.clock()-24*60*60*1000)throw fail('The reply window has expired. An approved template is required; contact your administrator.');const [phone,recipient]=identity.external_key.split(':');if(phone!==this.config.phoneId)throw fail('Messaging account configuration has changed. Contact your administrator.');const id=randomUUID(),message=randomUUID();this.s.run("INSERT INTO messages VALUES(?,?,'OUTBOUND',?,?,'QUEUED',?)",message,c.id,body,this.s.clock(),requestId);this.s.run('INSERT INTO wa_outbox(id,conversation_id,message_id,recipient,phone_id,body,actor,version,created) VALUES(?,?,?,?,?,?,?,?,?)',id,c.id,message,recipient,phone,body,user.id,c.version,this.s.clock());});}
 accept(out,providerId){this.s.transaction(()=>{const current=this.s.get('SELECT * FROM wa_outbox WHERE id=?',out.id);const receipt=this.s.get('SELECT state FROM wa_receipts WHERE provider_id=?',providerId);const state=receipt?.state||'SENT';this.s.run('UPDATE wa_outbox SET provider_id=?,state=? WHERE id=?',providerId,state,out.id);this.s.run('UPDATE messages SET delivery=? WHERE id=?',state,out.message_id);if(['QUEUED','SENDING','UNKNOWN','FAILED'].includes(current.state)&&state!=='FAILED'){const c=this.s.get('SELECT * FROM conversations WHERE id=?',out.conversation_id);if(['NEW','OPEN'].includes(c.status)&&c.version===out.version){this.s.run("UPDATE conversations SET status='OPEN',last_reply=?,updated=?,archive_due=NULL,reminder_due=NULL,version=version+1 WHERE id=?",this.s.clock(),this.s.clock(),c.id);this.s.event(c.id,'Agent replied',out.actor);}}if(state==='FAILED'){this.s.notify(out.actor,out.conversation_id,'Your message could not be delivered. Please review the conversation.',`send-failed:${out.id}`);const c=this.s.get('SELECT * FROM conversations WHERE id=?',out.conversation_id);if(c.status==='OPEN'&&c.version===out.version+1)this.s.run('UPDATE conversations SET reminder_due=?,version=version+1 WHERE id=?',this.s.clock(),c.id);}});}
 // Process each item independently while retaining the original payload for review.
 // A malformed sibling must not prevent healthy messages in the same delivery.
 inboxUnits(payload){
  const units=[];
  for(const entry of payload.entry||[])for(const change of entry.changes||[]){
   const value=change.value;
   if(!value||!Array.isArray(value.messages||[])||!Array.isArray(value.statuses||[])){units.push({...payload,entry:[{...entry,changes:[change]}]});continue;}
   const messages=value.messages||[],statuses=value.statuses||[];
   for(const message of messages)units.push({...payload,entry:[{...entry,changes:[{...change,value:{...value,messages:[message],statuses:[]}}]}]});
   for(const status of statuses)units.push({...payload,entry:[{...entry,changes:[{...change,value:{...value,messages:[],statuses:[status]}}]}]});
   if(!messages.length&&!statuses.length)units.push({...payload,entry:[{...entry,changes:[change]}]});
  }
  return units;
 }
 drainInbox(){
  if(!this.ready())return;
  for(const row of this.s.all('SELECT * FROM wa_inbox WHERE processed=0 AND retry_at<=? ORDER BY received_at,id LIMIT 50',this.s.clock())){
   try{let failed=false;for(const unit of this.inboxUnits(JSON.parse(row.payload))){try{this.ingest(unit)}catch{failed=true}}if(failed)throw new Error('Retained malformed item');this.s.run('UPDATE wa_inbox SET processed=1,last_error=NULL WHERE id=?',row.id)}
   catch{const attempts=row.attempts+1;this.s.run('UPDATE wa_inbox SET attempts=?,processed=?,retry_at=?,last_error=? WHERE id=?',attempts,attempts>=5?2:0,this.s.clock()+Math.min(300000,1000*2**attempts),'Processing failed; inspect the retained event and retry.',row.id);}
  }
 }
 async tick(){this.drainInbox();if(this.busy||!this.ready())return;this.busy=true;try{
  // One in-flight send per conversation, at most four requests across conversations.
  const rows=this.s.all("SELECT o.* FROM wa_outbox o WHERE o.state='QUEUED' AND NOT EXISTS(SELECT 1 FROM wa_outbox earlier WHERE earlier.conversation_id=o.conversation_id AND earlier.state IN ('QUEUED','SENDING') AND earlier.rowid<o.rowid) ORDER BY o.created LIMIT 4");
  await Promise.allSettled(rows.map(out=>this.send(out)));
 }finally{this.busy=false}}
 async send(out){
  const c=this.s.get('SELECT * FROM conversations WHERE id=?',out.conversation_id);
  const identity=this.s.get('SELECT last_inbound FROM channel_identities WHERE conversation_id=?',c.id);
  if(!['NEW','OPEN'].includes(c.status)||!identity||identity.last_inbound<this.s.clock()-86400000||out.phone_id!==this.config.phoneId){this.failed(out,'CANCELED');return;}
  this.s.run("UPDATE wa_outbox SET state='SENDING' WHERE id=?",out.id);
  try{
   const response=await this.fetch(`https://graph.facebook.com/${this.config.version}/${out.phone_id}/messages`,{method:'POST',headers:{Authorization:`Bearer ${this.config.token}`,'Content-Type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',recipient_type:'individual',to:out.recipient,type:'text',text:{preview_url:false,body:out.body},biz_opaque_callback_data:out.id}),signal:AbortSignal.timeout(15000)});
   const data=await response.json();
   if(!response.ok){this.failed(out,'FAILED',String(data.error?.code||response.status));return;}
   const id=data.messages?.[0]?.id;if(!id)throw new Error('Missing provider acknowledgment');this.accept(out,id);
  }catch{this.failed(out,'UNKNOWN');}
 }
 failed(out,state,code=null){this.s.transaction(()=>{this.s.run('UPDATE wa_outbox SET state=?,error_code=? WHERE id=?',state,code,out.id);this.s.run('UPDATE messages SET delivery=? WHERE id=?',state,out.message_id);this.s.notify(out.actor,out.conversation_id,state==='UNKNOWN'?'Message delivery is unconfirmed. Contact your administrator before sending it again.':'Your message was not sent. Please review the conversation.',`send-failed:${out.id}`)});}
}
