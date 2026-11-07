import { DatabaseSync, backup } from 'node:sqlite';
import { resolve } from 'node:path';
import { mkdirSync, existsSync } from 'node:fs';
const source=resolve(process.env.DATABASE_PATH||'data/uocms.sqlite');
const destination=resolve(process.argv[2]||`backups/uocms-${new Date().toISOString().replaceAll(':','-')}.sqlite`);
if(existsSync(destination))throw new Error('Backup destination already exists. Choose a new filename.');
mkdirSync(resolve(destination,'..'),{recursive:true});
const db=new DatabaseSync(source,{readOnly:true});
try { await backup(db,destination); const check=new DatabaseSync(destination,{readOnly:true});try{const result=check.prepare('PRAGMA integrity_check').get();if(Object.values(result)[0]!=='ok')throw new Error('Backup integrity check failed');console.log(JSON.stringify({backup:destination,integrity:'ok',conversations:check.prepare('SELECT count(*) count FROM conversations').get().count}));}finally{check.close()}}finally{db.close()}
