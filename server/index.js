import http from 'node:http';
import { SocialMessaging, socialConfig } from './social.js';
import { IntegrationSettings } from './integration-settings.js';
import { Product } from './product.js';
import { WhatsApp, whatsappConfig } from './whatsapp.js';
import { randomBytes } from 'node:crypto';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, extname } from 'node:path';
import { Store, passwordMatches } from './store.js';
const root=fileURLToPath(new URL('../',import.meta.url));
export function createApp({dbPath=resolve(root,'data/uocms.sqlite'),password=process.env.INITIAL_PASSWORD,clock=Date.now,waConfig=whatsappConfig(),fetcher=fetch,fbConfig=socialConfig('FACEBOOK'),igConfig=socialConfig('INSTAGRAM')}={}){
 if(dbPath!==':memory:')mkdirSync(resolve(dbPath,'..'),{recursive:true});const store=new Store(dbPath,clock);
 if(!store.get('SELECT id FROM users LIMIT 1')){password ||=randomBytes(15).toString('base64url');store.seed(password);console.log(`Initial account password: ${password}\nAdmin: admin@uocms.local | Agents: aisha@uocms.local, bilal@uocms.local, sara@uocms.local`)}
 const wa=new WhatsApp(store,waConfig,fetcher);
 const facebook=new SocialMessaging(store,'FACEBOOK',fbConfig,fetcher),instagram=new SocialMessaging(store,'INSTAGRAM',igConfig,fetcher);
 const channels={whatsapp:wa,facebook,instagram};
 const integrationSettings=new IntegrationSettings(store,channels,dbPath);
 const product=new Product(store,channels);
 const buckets=new Map();
 const server=http.createServer(async(req,res)=>{
 const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data))};
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('Content-Security-Policy',"default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'self'");
 try{
 const url=new URL(req.url,'http://localhost'),path=url.pathname;if(path==='/widget')res.setHeader('Content-Security-Policy',"default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors *");
 if(/^\/webhooks\/(whatsapp|facebook|instagram)$/.test(path)){const channel=channels[path.split('/').pop()];
 if(req.method==='GET'){if(!channel.config.verifyToken||url.searchParams.get('hub.mode')!=='subscribe'||url.searchParams.get('hub.verify_token')!==channel.config.verifyToken)return send(403,{error:'Verification failed'});channel.s.run('UPDATE wa_health SET verified=? WHERE id=1',clock());res.writeHead(200,{'Content-Type':'text/plain','Cache-Control':'no-store'});return res.end(url.searchParams.get('hub.challenge')||'');}
 if(req.method==='POST'){if(!channel.ready())return send(503,{error:'Integration not configured'});let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>1048576)return send(413,{error:'Request too large'});chunks.push(chunk)}const raw=Buffer.concat(chunks);if(!channel.verify(req.headers['x-hub-signature-256'],raw))return send(401,{error:'Invalid signature'});channel.receive(raw);return send(200,{received:true});}
 return send(405,{error:'Method not allowed'});
 }
 if(!path.startsWith('/api/')){const files={'/':'index.html','/logo.png':'logo.png','/dashboard-ui.js':'dashboard-ui.js','/product-ui.js':'product-ui.js','/theme.js':'theme.js','/app.js':'app.js','/styles.css':'styles.css','/widget':'widget.html','/widget.js':'widget.js','/embed.js':'embed.js'};const file=files[path];if(!file){res.writeHead(404);return res.end('Not found')}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'})[extname(file)]);return res.end(readFileSync(resolve(root,'public',file)))}
 if(req.method!=='GET'){
 const origin=req.headers.origin;if(origin&&origin!==`${req.socket.encrypted?'https':'http'}://${req.headers.host}`&&origin!==(process.env.PUBLIC_BASE_URL||'').replace(/\/$/,''))return send(403,{error:'Cross-origin request denied'});
 const sessionKey=req.headers.cookie?.match(/(?:^|; )session=([a-zA-Z0-9]+)/)?.[1];const key=`${req.socket.remoteAddress}:${path==='/api/login'?'login':sessionKey||'public'}`;const limit=path==='/api/login'?20:sessionKey?600:180;const bucket=buckets.get(key)||{count:0,until:clock()+60000};if(bucket.until<clock()){bucket.count=0;bucket.until=clock()+60000}bucket.count++;buckets.set(key,bucket);if(bucket.count>limit)return send(429,{error:'Too many requests. Try again shortly.'});
 }
 let body={};if(['POST','PATCH'].includes(req.method)){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>16000)return send(413,{error:'Request too large'})}try{body=JSON.parse(raw||'{}')}catch{return send(400,{error:'Invalid JSON'})}}
 const text=(value,max=4000)=>{if(typeof value!=='string'||!value.trim()||value.length>max)throw Object.assign(new Error('Please supply valid text.'),{status:400});return value.trim()};
 if(path==='/api/login'&&req.method==='POST'){const u=store.get('SELECT * FROM users WHERE email=? AND active=1',text(body.email,200).toLowerCase());if(!u||!passwordMatches(text(body.password,200),u.password))return send(401,{error:'Invalid email or password'});const token=randomBytes(32).toString('hex');store.run('INSERT INTO sessions VALUES(?,?,?)',token,u.id,clock()+86400000);res.setHeader('Set-Cookie',`session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400${process.env.COOKIE_SECURE==='true'?'; Secure':''}`);return send(200,{ok:true})}
 if(path==='/api/widget/feedback'&&req.method==='POST'){const bearer=req.headers.authorization?.replace(/^Bearer /,'');const c=store.get("SELECT id FROM conversations WHERE widget_token=? AND source='WEBSITE' AND status='CLOSED'",bearer||'');if(!c)return send(403,{error:'Feedback is available after your conversation is closed'});const rating=Number(body.rating);if(!Number.isInteger(rating)||rating<1||rating>5)return send(400,{error:'Choose a rating from 1 to 5'});const comment=typeof body.comment==='string'?body.comment.trim().slice(0,1000):'';store.run('INSERT INTO feedback VALUES(?,?,?,?) ON CONFLICT(conversation_id) DO UPDATE SET rating=excluded.rating,comment=excluded.comment,created=excluded.created',c.id,rating,comment,clock());return send(200,{ok:true})}
 if(path==='/api/widget/messages'){
 if(req.method==='POST'){if(!body.token&&!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.requestId||''))return send(400,{error:'A random UUID requestId is required for a new chat'});const c=store.incoming({token:body.token,name:body.name?text(body.name,80):'Website visitor',body:text(body.body),requestId:text(body.requestId,100)});return send(200,{token:c.widget_token,id:c.id})}
 if(req.method==='GET'){const token=req.headers.authorization?.replace(/^Bearer /,'');const c=store.get('SELECT id,status FROM conversations WHERE widget_token=?',token||'');if(!c)return send(401,{error:'Chat session not found'});return send(200,{status:c.status,messages:store.all('SELECT id,direction,body,created FROM messages WHERE conversation_id=? ORDER BY rowid',c.id)})}
 }
 const token=req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith('session='))?.slice(8);const user=store.get('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>? AND u.active=1',token||'',clock());if(!user)return send(401,{error:'Please sign in'});
 const admin=()=>{if(user.role!=='ADMIN')throw Object.assign(new Error('Administrator access required'),{status:403})};
 const productResult=await product.handle(path,req.method,body,user,url);if(productResult!==undefined)return send(200,productResult);
 const settingsMatch=path.match(/^\/api\/admin\/integrations\/(whatsapp|facebook|instagram)$/);if(settingsMatch){admin();if(req.method==='GET')return send(200,integrationSettings.view(settingsMatch[1]));if(req.method==='PATCH'){const result=integrationSettings.save(settingsMatch[1],body);product.audit(user,`Updated ${settingsMatch[1]} integration configuration`);return send(200,result)}}
 if(path==='/api/me')return send(200,{id:user.id,name:user.name,email:user.email,role:user.role,available:!!user.available});
 if(path==='/api/logout'&&req.method==='POST'){store.run('DELETE FROM sessions WHERE token=?',token);res.setHeader('Set-Cookie','session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return send(200,{ok:true})}
 if(path==='/api/availability'&&req.method==='PATCH'){store.run('UPDATE users SET available=? WHERE id=?',body.available?1:0,user.id);return send(200,{ok:true})}
 if(path.startsWith('/api/admin/'))admin();
 if(path==='/api/admin/agents'&&req.method==='GET')return send(200,store.all("SELECT id,name,email,active,available,(SELECT count(*) FROM conversations WHERE agent_id=users.id AND status IN ('NEW','OPEN')) AS workload FROM users WHERE role='AGENT'"));
 if(path.match(/^\/api\/admin\/agents\/[^/]+$/)&&req.method==='PATCH'){const id=path.split('/').pop();if(typeof body.available!=='boolean'||typeof body.active!=='boolean')return send(400,{error:'Availability and active flags required'});store.run("UPDATE users SET available=?,active=? WHERE id=? AND role='AGENT'",+body.available,+body.active,id);return send(200,{ok:true})}
 if(path==='/api/admin/integrations')return send(200,[{name:'Website live chat',status:'Connected'},wa.info(),instagram.info(),facebook.info()]);
 if(path==='/api/notifications'&&req.method==='GET')return send(200,store.all('SELECT id,conversation_id,body,created,read FROM notifications WHERE user_id=? ORDER BY created DESC LIMIT 100',user.id));
 if(path.match(/^\/api\/notifications\/[^/]+\/read$/)&&req.method==='PATCH'){store.run('UPDATE notifications SET read=1 WHERE id=? AND user_id=?',path.split('/')[3],user.id);return send(200,{ok:true})}
 if(path==='/api/conversations'&&req.method==='GET'){const rows=user.role==='ADMIN'?store.all('SELECT * FROM conversations ORDER BY updated DESC LIMIT 100'):store.all('SELECT * FROM conversations WHERE agent_id=? ORDER BY updated DESC LIMIT 100',user.id);return send(200,rows.map(c=>store.serialize(c,user)))}
 const match=path.match(/^\/api\/conversations\/([^/]+)(?:\/(replies|close|reopen|reassign))?$/);
 if(match){const [,id,action]=match;const c=store.get('SELECT * FROM conversations WHERE id=?',id);if(!c)return send(404,{error:'Conversation not found'});if(user.role!=='ADMIN'&&c.agent_id!==user.id)return send(403,{error:'This conversation is not assigned to you'});
 if(!action&&req.method==='GET')return send(200,{...store.serialize(c,user),messages:store.all('SELECT id,direction,body,created,delivery FROM messages WHERE conversation_id=? ORDER BY rowid',id),events:store.all('SELECT type,created FROM events WHERE conversation_id=? ORDER BY rowid',id)});
 if(req.method==='POST'){if(action==='replies'){const message=text(body.body),requestId=text(body.requestId,100);if(channels[c.source.toLowerCase()])channels[c.source.toLowerCase()].queue(c,user,message,requestId);else store.reply(id,user,message,requestId);}else if(action==='close'){if(c.status==='ARCHIVED')admin();store.transition(id,'CLOSED',user)}else if(action==='reopen')store.transition(id,'NEW',user);else if(action==='reassign'){admin();const a=store.get("SELECT id FROM users WHERE id=? AND role='AGENT' AND active=1 AND available=1",body.agentId||'');if(!a)return send(400,{error:'Select an active, available agent'});store.transaction(()=>{store.run('UPDATE conversations SET agent_id=?,version=version+1 WHERE id=?',a.id,id);store.event(id,`Reassigned to ${a.id}`,user.id)});}else return send(404,{error:'Not found'});return send(200,{ok:true})}}
 send(404,{error:'Not found'});
 }catch(e){if(!e.status)console.error(e);send(e.status||500,{error:e.status?e.message:'An unexpected error occurred'})}
 });
 const ingestTimer=setInterval(()=>{try{Object.values(channels).forEach(channel=>channel.drainInbox())}catch{console.error('Inbound worker error; persisted events retained')}},100);ingestTimer.unref();
 const timer=setInterval(()=>{try{for(const channel of Object.values(channels))void channel.tick().catch(()=>console.error('Messaging worker failed; persisted work will be retried.'));store.tick();store.run('DELETE FROM sessions WHERE expires<=?',clock());for(const [k,v]of buckets)if(v.until<clock())buckets.delete(k)}catch(e){console.error('Timer worker failed',e)}},1000);timer.unref();store.tick();server.on('close',()=>{clearInterval(timer);clearInterval(ingestTimer);const finish=()=>{if(Object.values(channels).some(channel=>channel.busy))setTimeout(finish,25);else store.close()};finish()});return {server,store,wa,product,channels};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const {server}=createApp();for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>server.close());server.listen({port:Number(process.env.PORT||3000),host:process.env.HOST||'127.0.0.1',backlog:4096},()=>console.log(`UOCMS running at http://localhost:${process.env.PORT||3000}`));}
