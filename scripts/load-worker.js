// Child process for the isolated crash/restart benchmark. Never connects to Meta.
import { createApp } from '../server/index.js';
const config={token:'fake',phoneId:'123',wabaId:'456',secret:'load-secret',verifyToken:'fake',version:'v23.0'};
const app=createApp({dbPath:process.env.LOAD_DB,password:'load-test-only',waConfig:config,fbConfig:config,igConfig:config,fetcher:async()=>{throw Error('External network disabled in load test')}});
app.server.listen({port:0,host:'127.0.0.1',backlog:4096},()=>process.send({port:app.server.address().port}));
process.on('message',message=>{
 if(message==='stats')process.send({stats:{messages:app.store.get('SELECT count(*) n FROM messages').n,pending:['wa','fb','ig'].reduce((n,p)=>n+app.store.get(`SELECT count(*) n FROM ${p}_inbox WHERE processed=0`).n,0)}});
 if(message==='stop')app.server.close(()=>process.exit(0));
});
