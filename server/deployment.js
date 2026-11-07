import { isAbsolute } from 'node:path';
import { passwordHash } from './store.js';
export function deploymentEnvironment(env=process.env){
 const production=env.NODE_ENV==='production';
 const publicUrl=env.PUBLIC_BASE_URL||env.RENDER_EXTERNAL_URL||'';
 if(production){
  if(!env.DATABASE_PATH||!isAbsolute(env.DATABASE_PATH))throw Error('Production requires an absolute DATABASE_PATH on persistent storage.');
  if(env.COOKIE_SECURE!=='true')throw Error('Production requires COOKIE_SECURE=true.');
  let url;try{url=new URL(publicUrl)}catch{throw Error('Set PUBLIC_BASE_URL to the public HTTPS origin.');}
  if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('PUBLIC_BASE_URL must be an HTTPS origin without a path.');
 }
 return {production,publicUrl:publicUrl.replace(/\/$/, '')};
}
export function seedProduction(store,password,email){
 if(store.get('SELECT id FROM users LIMIT 1'))return;
 if(typeof password!=='string'||password.length<16||password.length>200)throw Error('First production launch requires INITIAL_PASSWORD of 16–200 characters.');
 if(typeof email!=='string'||!/^\S+@\S+\.\S+$/.test(email)||email.length>200)throw Error('First production launch requires ADMIN_EMAIL.');
 store.run("INSERT INTO users(id,name,email,password,role) VALUES('admin','Store Administrator',?,?,'ADMIN')",email.trim().toLowerCase(),passwordHash(password));
 console.log('Production administrator created. Sign in with your configured credentials.');
}
