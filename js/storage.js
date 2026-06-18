import {STORAGE_KEY, DEFAULT_SETTINGS} from './constants.js';

const now = () => new Date().toISOString();

export function uid(prefix='id'){
  const random = (globalThis.crypto && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  return `${prefix}_${random}`;
}

export function emptyDB(){
  return {settings:{...DEFAULT_SETTINGS}, activeMatchId:null, activeSetId:null, matches:[], sets:[], points:[]};
}

export function loadDB(){
  try { return {...emptyDB(), ...(JSON.parse(localStorage.getItem(STORAGE_KEY)) || {})}; }
  catch { return emptyDB(); }
}

export function saveDB(db){ localStorage.setItem(STORAGE_KEY, JSON.stringify(db)); }

function normalizeMatch(data={}, db=loadDB(), existing={}){
  const nowIso = now();
  return {
    id: existing.id || uid('match'),
    date: data.date ? new Date(data.date).toISOString() : (existing.date || nowIso),
    rival_name: data.rival_name?.trim() || existing.rival_name || 'Rival sin nombre',
    our_pair_name: data.our_pair_name?.trim() || existing.our_pair_name || db.settings.our_pair_name,
    partner_name: data.partner_name?.trim() || existing.partner_name || '',
    player_j1_name: data.player_j1_name?.trim() || existing.player_j1_name || db.settings.player_j1_name,
    player_j2_name: data.player_j2_name?.trim() || existing.player_j2_name || db.settings.player_j2_name,
    match_type: data.match_type || existing.match_type || 'amistoso',
    court_type: data.court_type || existing.court_type || 'indoor',
    location: data.location?.trim() || existing.location || '',
    video_url: data.video_url?.trim() || existing.video_url || '',
    notes: data.notes?.trim() || existing.notes || '',
    created_at: existing.created_at || nowIso,
    updated_at: nowIso
  };
}

export function matchSets(db, matchId){
  return db.sets.filter(s => s.match_id === matchId).sort((a,b)=>(a.set_number||0)-(b.set_number||0));
}

export function setPoints(db, setId){ return db.points.filter(p => p.set_id === setId); }
export function matchPoints(db, matchId){ return db.points.filter(p => p.match_id === matchId); }

export function ensureSample(){
  const db=loadDB();
  if(db.matches.length) return db;
  const match = normalizeMatch({rival_name:'Los Martínez', match_type:'amistoso', court_type:'indoor'}, db);
  db.matches.push(match);
  const set = buildSet(db, match.id);
  db.sets.push(set);
  db.activeMatchId = match.id;
  db.activeSetId = set.id;
  db.points.push({id:uid('pt'),match_id:match.id,set_id:set.id,timestamp:now(),point_id:1,cause_key:'WINNER_OR_FORCED',point_result:'WON',outcome:'WINNER_OR_FORCED',player_id:'J1',player_team:'OUR',stroke_category:'DERECHA',stroke_type:'paralela',rally:'ENTRE_3_6',server:'J1',serve_number:'1º',serve_direction:'',court_zone:'',point_duration_seconds:12,deuce_mode:'ADVANTAGE',our_games_after:0,rival_games_after:0,our_points_after:'15',rival_points_after:'0',highlight:1,video_second:12,notes:'',in_tiebreak_after:false,set_finished:false,set_winner:''});
  saveDB(db); return db;
}

export function activeContext(){
  const db=loadDB();
  let match=db.matches.find(x=>x.id===db.activeMatchId);
  let set=db.sets.find(x=>x.id===db.activeSetId);
  if(!match && db.matches[0]) { match=db.matches[0]; db.activeMatchId=match.id; }
  if(match && (!set || set.match_id !== match.id)) {
    set = matchSets(db, match.id).find(s=>!s.finished_at) || matchSets(db, match.id).at(-1) || createSetForMatch(match.id, false, db);
    db.activeSetId = set.id;
    saveDB(db);
  }
  return {db, match, set, points:set ? db.points.filter(p=>p.set_id===set.id) : []};
}

function buildSet(db, matchId){
  const setNumber = matchSets(db, matchId).length + 1;
  return {id:uid('set'),match_id:matchId,set_number:setNumber,our_games:0,rival_games:0,in_tiebreak:false,set_winner:'',video_url:'',started_at:now(),finished_at:'',saved_at:''};
}

export function createMatch(data={}, createFirstSet=true){
  const db=loadDB();
  const match = normalizeMatch(data, db);
  db.matches.push(match);
  db.activeMatchId = match.id;
  if(createFirstSet){
    const set = buildSet(db, match.id);
    set.video_url = data.video_url?.trim?.() || match.video_url || '';
    db.sets.push(set);
    db.activeSetId = set.id;
  }
  saveDB(db);
  return match;
}

export function updateMatch(matchId, data={}){
  const db=loadDB();
  const idx=db.matches.findIndex(m=>m.id===matchId);
  if(idx < 0) return null;
  db.matches[idx] = normalizeMatch(data, db, db.matches[idx]);
  saveDB(db);
  return db.matches[idx];
}

export function deleteMatch(matchId){
  const db=loadDB();
  db.matches = db.matches.filter(m=>m.id!==matchId);
  const deletedSetIds = db.sets.filter(s=>s.match_id===matchId).map(s=>s.id);
  db.sets = db.sets.filter(s=>s.match_id!==matchId);
  db.points = db.points.filter(p=>p.match_id!==matchId && !deletedSetIds.includes(p.set_id));
  if(db.activeMatchId === matchId){
    const next = db.matches[0];
    db.activeMatchId = next?.id || null;
    db.activeSetId = next ? matchSets(db, next.id).at(-1)?.id || null : null;
  }
  saveDB(db);
}


function inferSetFinish(ourGames, rivalGames){
  const our = Number(ourGames || 0);
  const rival = Number(rivalGames || 0);
  const max = Math.max(our, rival);
  const min = Math.min(our, rival);
  const regular = max >= 6 && Math.abs(our - rival) >= 2;
  const tieBreakSet = max === 7 && min === 6;
  const finished = regular || tieBreakSet;
  return {finished, winner: finished ? (our > rival ? 'OUR' : 'RIVAL') : ''};
}

export function updateSet(setId, data={}){
  const db=loadDB();
  const set=db.sets.find(s=>s.id===setId);
  if(!set) return null;
  Object.assign(set, data);
  saveDB(db);
  return set;
}


export function deleteSet(setId){
  const db=loadDB();
  const set=db.sets.find(s=>s.id===setId);
  if(!set) return false;
  const matchId=set.match_id;
  db.points=db.points.filter(p=>p.set_id!==setId);
  db.sets=db.sets.filter(s=>s.id!==setId);
  renumberSets(db, matchId);
  if(db.activeSetId===setId){
    db.activeSetId=matchSets(db, matchId).find(s=>!s.finished_at)?.id || matchSets(db, matchId).at(-1)?.id || null;
  }
  if(db.activeMatchId===matchId && !db.activeSetId){
    db.activeMatchId=db.matches[0]?.id || null;
    db.activeSetId=db.activeMatchId ? matchSets(db, db.activeMatchId).at(-1)?.id || null : null;
  }
  saveDB(db);
  return true;
}

export function createSetForMatch(matchId, activate=true, suppliedDb=null, options={}){
  const db=suppliedDb || loadDB();
  const match=db.matches.find(m=>m.id===matchId);
  const set=buildSet(db, matchId);
  set.video_url = options.video_url?.trim?.() || match?.video_url || '';
  db.sets.push(set);
  if(activate){ db.activeMatchId=matchId; db.activeSetId=set.id; }
  saveDB(db);
  return set;
}

export function assignSetToMatch(setId, targetMatchId){
  const db=loadDB();
  const set=db.sets.find(s=>s.id===setId);
  if(!set) return null;
  set.match_id=targetMatchId;
  set.set_number=matchSets(db, targetMatchId).filter(s=>s.id!==setId).length+1;
  db.points = db.points.map(p => p.set_id===setId ? {...p, match_id:targetMatchId} : p);
  db.activeMatchId=targetMatchId;
  db.activeSetId=setId;
  renumberSets(db, targetMatchId);
  saveDB(db);
  return set;
}

export function activateMatch(matchId, setId=null){
  const db=loadDB();
  const match=db.matches.find(m=>m.id===matchId);
  if(!match) return null;
  const sets=matchSets(db, matchId);
  db.activeMatchId=matchId;
  db.activeSetId=setId || sets.find(s=>!s.finished_at)?.id || sets.at(-1)?.id || createSetForMatch(matchId,false,db).id;
  saveDB(db);
  return {matchId:db.activeMatchId,setId:db.activeSetId};
}

function renumberSets(db, matchId){
  matchSets(db, matchId).forEach((s,i)=>{ s.set_number=i+1; });
}

export function saveCurrentSet(){
  const db=loadDB();
  const set=db.sets.find(s=>s.id===db.activeSetId);
  if(set){ set.saved_at=now(); }
  saveDB(db);
  return set;
}

export function addPoint(point){
  const db=loadDB();
  db.points.push(point);
  const set=db.sets.find(s=>s.id===point.set_id);
  if(set){
    set.our_games=point.our_games_after;
    set.rival_games=point.rival_games_after;
    set.in_tiebreak=!!point.in_tiebreak_after;
    set.set_winner=point.set_winner||'';
    if(point.set_finished) set.finished_at=point.timestamp;
  }
  saveDB(db);
}

export function removeLastPoint(setId){
  const db=loadDB();
  const idx=[...db.points].map((p,i)=>[p,i]).filter(([p])=>p.set_id===setId).pop()?.[1];
  if(idx===undefined) return null;
  const [p]=db.points.splice(idx,1);
  const last=[...db.points].filter(x=>x.set_id===setId).pop();
  const set=db.sets.find(s=>s.id===setId);
  if(set){
    set.our_games=last?.our_games_after||0;
    set.rival_games=last?.rival_games_after||0;
    set.in_tiebreak=!!last?.in_tiebreak_after;
    set.set_winner=last?.set_winner||'';
    set.finished_at=last?.set_finished ? last.timestamp : '';
    set.saved_at='';
  }
  saveDB(db); return p;
}

export function resetCurrentSet(){
  const db=loadDB();
  const set=db.sets.find(x=>x.id===db.activeSetId);
  db.points=db.points.filter(p=>p.set_id!==db.activeSetId);
  if(set){set.our_games=0;set.rival_games=0;set.in_tiebreak=false;set.set_winner='';set.started_at=now();set.finished_at='';set.saved_at='';}
  saveDB(db);
}

export function saveSettings(settings){ const db=loadDB(); db.settings={...db.settings,...settings}; saveDB(db); }
export function importDB(json){ const obj=JSON.parse(json); saveDB({...emptyDB(),...obj}); }
export function exportDB(){ return JSON.stringify(loadDB(),null,2); }



function cleanKey(value=''){
  return String(value||'').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[._-]+/g,' ').replace(/\s+/g,' ');
}
function normalizeCategory(value=''){
  const k=cleanKey(value);
  const map={
    'S':'SAQUE','SAQUE':'SAQUE',
    'D':'DERECHA','DERECHA':'DERECHA',
    'R':'REVES','REVES':'REVES','RE VES':'REVES',
    'VD':'VOLEA_DERECHA','V D':'VOLEA_DERECHA','VOLEA DERECHA':'VOLEA_DERECHA',
    'VR':'VOLEA_REVES','V R':'VOLEA_REVES','VOLEA REVES':'VOLEA_REVES',
    'ER':'ESP_RED','E R':'ESP_RED','ESP RED':'ESP_RED','ESP. RED':'ESP_RED','ESPECIAL RED':'ESP_RED','ESPECIALES RED':'ESP_RED','GOLPES ESPECIALES RED':'ESP_RED','GER':'ESP_RED',
    'EF':'ESP_FONDO','E F':'ESP_FONDO','ESP FONDO':'ESP_FONDO','ESP. FONDO':'ESP_FONDO','ESPECIAL FONDO':'ESP_FONDO','ESPECIALES FONDO':'ESP_FONDO','GOLPES ESPECIALES FONDO':'ESP_FONDO','GEF':'ESP_FONDO'
  };
  return map[k] || String(value||'').trim().replace(/\s+/g,'_').toUpperCase();
}
function normalizeOutcome(value='', result=''){
  const raw = String(value || '').trim();

  // Formato canónico para claves técnicas del propio CSV:
  // RIVAL_UNFORCED_ERROR, RIVAL-WINNER-OR-OWN-FORCED, etc.
  // Antes cleanKey() cambiaba los guiones bajos por espacios y estas claves no coincidían.
  const canonical = raw
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.\s-]+/g, '_')
    .replace(/_+/g, '_');

  // Formato legible para alias escritos a mano: "ENF rival", "P WF", etc.
  const k = cleanKey(raw);

  if(['WINNER_OR_FORCED','WINNER','FORCED_ERROR'].includes(canonical) || ['WINNER','FORCED ERROR','FORZADO WINNER','ERROR FORZADO WINNER','G W F','G WF','G W','G F'].includes(k)) return 'WINNER_OR_FORCED';
  if(['RIVAL_UNFORCED_ERROR'].includes(canonical) || ['RIVAL UNFORCED ERROR','ERROR NO FORZADO RIVAL','ENF RIVAL','G NF RIVAL'].includes(k)) return 'RIVAL_UNFORCED_ERROR';
  if(['OWN_UNFORCED_ERROR'].includes(canonical) || ['OWN UNFORCED ERROR','ERROR NO FORZADO PROPIO','ENF PROPIO','P NF'].includes(k)) return 'OWN_UNFORCED_ERROR';
  if(['RIVAL_WINNER_OR_OWN_FORCED'].includes(canonical) || ['RIVAL WINNER OR OWN FORCED','WINNER RIVAL','FORZADO PROPIO','P W F','P WF','P W'].includes(k)) return 'RIVAL_WINNER_OR_OWN_FORCED';

  // Fallback solo para CSV antiguos sin outcome/cause_key fiable.
  if(result==='WON') return 'WINNER_OR_FORCED';
  if(result==='LOST') return 'OWN_UNFORCED_ERROR';
  return canonical || k || '';
}
function normalizeStroke(value=''){
  return String(value||'').trim().toLowerCase().normalize('NFC');
}
function normalizeRally(value=''){
  const k=cleanKey(value);
  if(['MENOS 3','R:<3','R <3','<3','MENOS_3'].includes(k)) return 'MENOS_3';
  if(['ENTRE 3 6','R:3 6','R 3 6','3 6','ENTRE_3_6'].includes(k)) return 'ENTRE_3_6';
  if(['MAS 6','MÁS 6','R:>6','R >6','>6','MAS_6'].includes(k)) return 'MAS_6';
  return value || '';
}
function normalizeServeNumber(value=''){
  const k=cleanKey(value);
  if(k==='1' || k==='1O' || k==='1º') return '1º';
  if(k==='2' || k==='2O' || k==='2º') return '2º';
  return value || '';
}

export function importLegacySetToMatch(matchId, rows=[], activate=true, options={}){
  const db=loadDB();
  const match=db.matches.find(m=>m.id===matchId);
  if(!match) return null;
  const set=buildSet(db, matchId);
  set.video_url = options.video_url?.trim?.() || '';
  db.sets.push(set);
  const normalized = rows.map((r,i)=>({
    id: uid('pt'),
    match_id: matchId,
    set_id: set.id,
    timestamp: r.timestamp || now(),
    point_id: Number(r.point_id || i+1),
    cause_key: normalizeOutcome(r.outcome || r.cause_key || '', r.point_result || ''),
    point_result: r.point_result || '',
    player_id: r.player_id || '',
    player_team: r.player_team || (r.player_id ? 'OUR' : ''),
    stroke_category: normalizeCategory(r.stroke_category || ''),
    stroke_type: normalizeStroke(r.stroke_type || ''),
    outcome: normalizeOutcome(r.outcome || r.cause_key || '', r.point_result || ''),
    rally: normalizeRally(r.rally || ''),
    server: r.server || '',
    serve_number: normalizeServeNumber(r.serve_number || ''),
    serve_direction: r.serve_direction || '',
    court_zone: r.court_zone || '',
    point_duration_seconds: Number(r.point_duration_seconds || r.video_second || 0),
    deuce_mode: r.deuce_mode || 'ADVANTAGE',
    our_games_after: Number(r.our_games_after || 0),
    rival_games_after: Number(r.rival_games_after || 0),
    our_points_after: r.our_points_after || '0',
    rival_points_after: r.rival_points_after || '0',
    highlight: Number(r.highlight || 0),
    video_second: Number(r.video_second || r.point_duration_seconds || 0),
    notes: r.notes || '',
    in_tiebreak_after: String(r.in_tiebreak_after||'').toLowerCase()==='true',
    set_finished: String(r.set_finished||'').toLowerCase()==='true',
    set_winner: r.set_winner || ''
  }));
  db.points.push(...normalized);
  const last=normalized.at(-1);
  if(last){
    set.our_games=last.our_games_after;
    set.rival_games=last.rival_games_after;
    set.in_tiebreak=!!last.in_tiebreak_after;
    const inferred=inferSetFinish(last.our_games_after,last.rival_games_after);
    set.set_winner=last.set_winner || inferred.winner || '';
    set.finished_at=(last.set_finished || inferred.finished) ? last.timestamp : '';
    set.saved_at=now();
  }
  renumberSets(db, matchId);
  if(activate){ db.activeMatchId=matchId; db.activeSetId=set.id; }
  saveDB(db);
  return set;
}
