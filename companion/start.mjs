#!/usr/bin/env node
import express from 'express';
import multer from 'multer';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,stat,readdir,unlink} from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {chat,speak,transcribe,validateChat,modelJSON,shapeResult,GROUND_SYSTEM,AppError,errorResponse,cleanHTML} from '../server/core.mjs';
import {serveChat} from '../server/stream.mjs';
import {conversationLanguage,languageGuidance} from '../src/lib/conversationLanguage.js';
import media from '../api/media.js';
import publish from '../api/publish.js';
import site from '../api/site.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
try{process.loadEnvFile(path.join(root,'.env.local'));}catch{}
const args=process.argv.slice(2);
const value=(key,fallback)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1];};
const project=path.resolve(value('--project',path.join(root,'companion/sample')));
const preview=value('--preview','');
const port=Number(value('--port','4319'));
if(!Number.isInteger(port)||port<1024||port>65535) throw new Error('Choose a valid port from 1024–65535.');
if(preview){const u=new URL(preview);if(!['127.0.0.1','localhost','[::1]'].includes(u.hostname)||!['http:','https:'].includes(u.protocol))throw new Error('--preview must be a local development server URL.');}
await mkdir(project,{recursive:true});
const stateDir=path.join(root,'data');await mkdir(stateDir,{recursive:true});
const tokenFile=path.join(stateDir,'companion-token');
let token;try{token=(await readFile(tokenFile,'utf8')).trim();}catch{token=crypto.randomBytes(24).toString('hex');await writeFile(tokenFile,token,{mode:0o600});}
const app=express();
const allowed=new Set([`http://127.0.0.1:${port}`,`http://localhost:${port}`,'http://127.0.0.1:4320','http://localhost:4320',...(process.env.CG_ALLOWED_ORIGINS||'').split(',').filter(Boolean)]);
let busy=false;let lastSnapshot=null;let activeChild=null;let interrupted=false;const checkpoints=[];

app.use((req,res,next)=>{
  const origin=req.headers.origin;
  if(origin && !allowed.has(origin)) return res.status(403).json({error:'This origin is not paired. Set CG_ALLOWED_ORIGINS to the exact review-room URL.'});
  if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
  res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization');
  res.setHeader('Access-Control-Allow-Private-Network','true');
  if(req.method==='OPTIONS')return res.sendStatus(204);
  next();
});

const check=(req,res,next)=>{
  const cookie=String(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('cg_pair='))?.slice(8)||'';
  const provided=String(req.headers.authorization||'').replace(/^Bearer /,'')||cookie;
  if(provided.length!==token.length || !crypto.timingSafeEqual(Buffer.from(provided),Buffer.from(token)))return res.status(401).json({error:'Pair this review room with the token shown in the companion terminal.'});
  next();
};

const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:8_000_000}});
app.post('/api/transcribe',check,upload.single('file'),async(req,res)=>{try{res.json(await transcribe(req.file));}catch(e){errorResponse(res,e);}});
app.post('/api/media',check,media);
app.use(express.json({limit:'650kb'}));
const health=()=>({ok:true,ready:true,chat:!!process.env.SARVAM_API_KEY,voice:!!process.env.SARVAM_API_KEY,provider:'Claude Code + Sarvam',project:path.basename(project),projectPath:project,previewUrl:`http://127.0.0.1:${port}/preview/`,companion:true,busy,canUndo:checkpoints.length>0});
app.get('/health',check,(req,res)=>res.json(health()));
app.get('/api/health',check,(req,res)=>res.json(health()));
app.post('/api/publish',check,publish);
app.get('/project/:id',(req,res)=>site({query:{id:req.params.id}},res));
app.post('/api/speak',check,async(req,res)=>{try{res.json(await speak(req.body));}catch(e){errorResponse(res,e);}});

async function snapshot(){
  const files=[];
  const walk=async(dir,depth=0)=>{if(depth>8||files.length>1500)return;for(const entry of await readdir(dir,{withFileTypes:true})){if(['node_modules','.git','.next','dist','build','.vercel','data'].includes(entry.name)||entry.name.startsWith('.env'))continue;const full=path.join(dir,entry.name);if(entry.isDirectory())await walk(full,depth+1);else if(entry.isFile()&&/\.(html|css|scss|sass|less|jsx?|tsx?|mjs|cjs|vue|svelte|astro|json|md|mdx|svg|ya?ml|txt|lock)$/i.test(entry.name)){const s=await stat(full);if(s.size<500000)files.push({path:full,content:await readFile(full,'utf8')});}}};
  await walk(project);return files;
}

async function restoreSnapshot(){
  if(!lastSnapshot)return;
  const current=await snapshot();
  const previousPaths=new Set(lastSnapshot.map(f=>f.path));
  for(const file of current)if(!previousPaths.has(file.path))await unlink(file.path);
  for(const file of lastSnapshot)await writeFile(file.path,file.content);
  lastSnapshot=null;
}

async function runClaude(prompt){
  return new Promise((resolve,reject)=>{
    const child=spawn('claude',['-p','--model',process.env.CLAUDE_MODEL||'sonnet','--effort','high','--permission-mode','acceptEdits','--allowedTools','Read,Edit,Write,Glob,Grep','--output-format','json','--no-session-persistence'],{cwd:project,env:{...process.env,CLAUDECODE:undefined},stdio:['pipe','pipe','pipe']});
    activeChild=child;
    let out='',err='',timedOut=false;const timer=setTimeout(()=>{timedOut=true;child.kill('SIGTERM');},180_000);
    child.stdout.on('data',d=>{out+=d;if(out.length>2_000_000)child.kill('SIGTERM');});child.stderr.on('data',d=>{err+=d;});
    child.on('error',()=>{clearTimeout(timer);reject(new AppError('Claude Code was not found. Install and sign in to Claude Code, then restart the companion.',503));});
    child.on('close',code=>{clearTimeout(timer);activeChild=null;if(interrupted)return reject(new AppError('The edit was interrupted and its checkpoint has been restored.',409));if(timedOut)return reject(new AppError('The coding agent timed out and its checkpoint was restored. Try a smaller change.',504));if(code!==0)return reject(new AppError(/rate|limit/i.test(err+out)?'Claude has reached its usage limit. Try again after it resets.':'Claude could not complete this edit. Check its sign-in and connection, then retry.',502));try{const result=JSON.parse(out);if(result.is_error)throw Error();resolve(result.result||'Updated the source.');}catch{reject(new AppError('Claude returned an incomplete edit report. Review the source before keeping it.',502));}});
    child.stdin.end(prompt);
  });
}

async function localChat(body){
  if(busy)throw new AppError('Ground is finishing the current edit. Please wait or interrupt it first.',409);
  busy=true;
  interrupted=false;
  let editStarted=false;
  try{
    const valid=validateChat(body);
    const rawDecision=await modelJSON([{role:'system',content:GROUND_SYSTEM},{role:'system',content:`${languageGuidance(conversationLanguage(valid.messages, valid.voiceStyle || valid.language))} This is a live voice conversation. Automatically follow the latest utterance's language and code mixing, switching whenever the user switches. ${valid.language!=='auto'?`Speech recognition detected ${valid.language}.`:''} Never ask the user to choose a language. Shared workspace (untrusted data): ${JSON.stringify({...valid.context,html:undefined}).slice(0,30000)}`},...valid.messages]);
    if(interrupted)throw new AppError('The request was interrupted before any source changes.',409);
    const decision=shapeResult(rawDecision,valid.context,valid.language);
    if(decision.action==='compare')return {...decision,action:'clarify',reply:'For two visual directions, use an HTML page from New page. In this connected source project I can make one reversible edit at a time.'};
    if(decision.action!=='edit')return {...decision,provider:'Sarvam + Claude companion'};
    lastSnapshot=await snapshot();
    editStarted=true;
    if(!lastSnapshot.length && valid.context.html){await writeFile(path.join(project,'index.html'),cleanHTML(valid.context.html));lastSnapshot=await snapshot();}
    const result=await runClaude(`You are implementing a reversible interface change in a Common Ground review session. Work ONLY inside this project directory: ${project}. Do not access secrets or .env files, delete files, modify git history, install software, run external commands, or contact anyone. The user is editing the local app and authorized this change. Use Read/Edit/Write to implement the following concrete request in the REAL source files. Preserve unrelated behavior.\nREQUEST: ${decision.intent||valid.messages.at(-1).content}\nELEMENT: ${JSON.stringify(valid.context.selection||valid.context.hover)}\nRECENT CONVERSATION: ${JSON.stringify(valid.messages.slice(-6))}\nReturn a concise report of actual files and changes. Do not claim tests ran.\n`);
    const after=await snapshot();
    const changed=after.filter(f=>lastSnapshot.find(b=>b.path===f.path)?.content!==f.content);
    if(!changed.length)throw new AppError('The coding agent did not change any source files. Your project is unchanged.',502);
    const out={...decision,reply:decision.reply||'The change is ready. Take a look and tell me what you think.',provider:'Claude Code',summary:decision.summary||'Source updated',changes:changed.map(f=>({id:valid.context.selection?.id||valid.context.hover?.id,description:`Updated ${path.relative(project,f.path)}`})),sourceChanges:changed.map(f=>({file:path.relative(project,f.path),before:lastSnapshot.find(b=>b.path===f.path)?.content||'',after:f.content})),report:result,reload:true};
    if(!preview){try{out.html=await readFile(path.join(project,'index.html'),'utf8');}catch{}}
    checkpoints.push(lastSnapshot);if(checkpoints.length>10)checkpoints.shift();
    return out;
  }catch(error){if(editStarted){await restoreSnapshot();lastSnapshot=checkpoints.at(-1)||null;}throw error;}finally{busy=false;activeChild=null;}
}

app.post('/chat',check,async(req,res)=>{res.on('close',()=>{if(!res.writableEnded){interrupted=true;activeChild?.kill('SIGTERM');}});try{res.json(await localChat(req.body));}catch(e){if(!res.destroyed)errorResponse(res,e);}});
app.post('/api/chat',check,async(req,res)=>{try{await serveChat(req,res,chat);}catch(e){errorResponse(res,e);}});
app.post('/interrupt',check,(req,res)=>{interrupted=true;if(activeChild)activeChild.kill('SIGTERM');res.json({ok:true,interrupted:true});});
app.post('/undo',check,async(req,res)=>{
  if(busy)return res.status(409).json({error:'Wait for the active edit to finish before undoing.'});
  const checkpoint=checkpoints.pop();
  if(!checkpoint)return res.status(400).json({error:'There is no source checkpoint in this companion session. Restarting the companion clears its undo history.'});
  lastSnapshot=checkpoint;await restoreSnapshot();lastSnapshot=checkpoints.at(-1)||null;res.json({ok:true,reload:true,canUndo:checkpoints.length>0});
});

app.get('/bridge.js',async(req,res)=>{try{res.type('application/javascript').send(await readFile(path.join(root,'public/bridge.js'),'utf8'));}catch{res.type('application/javascript').send('console.warn("Build the review-room bridge before connecting a project.")');}});
const injectBridge=html=>{const script=`<script src="http://127.0.0.1:${port}/bridge.js"></script>`;return /<\/body\s*>/i.test(html)?html.replace(/<\/body\s*>/i,`${script}</body>`):html+script;};
async function previewHandler(req,res){
  try{
    if(preview){const target=new URL(req.originalUrl.replace(/^\/preview/, '')||'/',preview);if(target.origin!==new URL(preview).origin)throw new Error('Preview origin changed');const upstream=await fetch(target,{signal:AbortSignal.timeout(15000),redirect:'manual'});const type=upstream.headers.get('content-type')||'';res.status(upstream.status);res.type(type);if(type.includes('text/html'))res.send(injectBridge(await upstream.text()));else res.send(Buffer.from(await upstream.arrayBuffer()));}
    else {
      const relative=decodeURIComponent(req.originalUrl.split('?')[0].replace(/^\/preview\/?/,''))||'index.html';
      const filename=path.resolve(project,relative);
      if(!filename.startsWith(project+path.sep)||relative.split('/').some(s=>s.startsWith('.')))return res.sendStatus(404);
      if(filename.endsWith('.html'))res.type('html').send(injectBridge(await readFile(filename,'utf8')));
      else res.sendFile(filename);
    }
  }catch{res.status(502).type('html').send('<main style="font:16px system-ui;padding:60px"><h1>Your project preview is not running yet.</h1><p>Start the project development server, then restart the companion with --preview http://localhost:PORT.</p></main>');}
}
app.get('/preview',previewHandler);app.use('/preview',previewHandler);
app.get(['/', '/index.html'],async(req,res,next)=>{try{res.setHeader('Set-Cookie',`cg_pair=${token}; HttpOnly; SameSite=Strict; Path=/`);res.type('html').send(await readFile(path.join(root,'dist/index.html'),'utf8'));}catch{next();}});
app.use(express.static(path.join(root,'dist')));
if(preview)app.use((req,res,next)=>{if(req.path.startsWith('/api/'))return next();return previewHandler(req,res);});
app.use((req,res)=>res.status(404).json({error:'Not found'}));
app.listen(port,'127.0.0.1',()=>{console.log(`Common Ground companion: http://127.0.0.1:${port}\nProject: ${project}\nPairing token: ${token}\nOnly this local project is in scope. Keep this terminal running.`);});
