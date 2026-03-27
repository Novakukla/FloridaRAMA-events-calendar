#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const REPO_ROOT = path.resolve(new URL('../', import.meta.url).pathname);
const MANUAL_DIR = path.join(REPO_ROOT, 'manual-events');
const OUT_FILE = path.join(REPO_ROOT, 'manual-events.json');

function isObject(v){return v && typeof v === 'object' && !Array.isArray(v)}

async function readManualDir(){
  try{
    const files = await fs.readdir(MANUAL_DIR);
    const jsonFiles = files.filter(f=>f.endsWith('.json'));
    const events = [];
    for(const f of jsonFiles){
      try{
        const txt = await fs.readFile(path.join(MANUAL_DIR,f),'utf8');
        const obj = JSON.parse(txt);
        if(Array.isArray(obj)) events.push(...obj);
        else if(isObject(obj)) events.push(obj);
      }catch(e){ console.warn('Skipping manual file',f,e.message); }
    }
    return events;
  }catch(e){
    return [];
  }
}

function dedupe(events){
  const byKey = new Map();
  for(const e of events){
    if(!isObject(e)) continue;
    const title = typeof e.title==='string' ? e.title.trim() : '';
    const start = typeof e.start==='string' ? e.start : '';
    if(!title || !start) continue;
    const key = (typeof e.id==='string' && e.id.trim()) ? `id:${e.id.trim()}` : `${title}::${start}::${e.end||''}`;
    if(!byKey.has(key)) byKey.set(key, e);
  }
  return Array.from(byKey.values()).sort((a,b)=>String(a.start||'').localeCompare(String(b.start||'')));
}

async function writeOut(events){
  const out = JSON.stringify(events, null, 2) + '\n';
  await fs.writeFile(OUT_FILE, out, 'utf8');
  console.log(`Wrote ${events.length} manual event(s) to ${OUT_FILE}`);
}

async function main(){
  const events = await readManualDir();
  if(events.length===0){
    console.log('No manual event files found under manual-events/.');
  }
  const unique = dedupe(events);
  await writeOut(unique);
}

main().catch(err=>{console.error(err); process.exitCode=1});
