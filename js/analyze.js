import {CATEGORIES, CATEGORY_LABELS, OUTCOMES} from './constants.js';
import {activeContext, addPoint, removeLastPoint, resetCurrentSet, uid, loadDB, saveDB, createMatch, updateMatch, createSetForMatch, assignSetToMatch, activateMatch, saveCurrentSet, matchSets} from './storage.js';
import {applyPoint, initialScore, scoreText, setScoreClass} from './scoring.js';
import {mountNav} from './navigation.js';

const CAT_SHORT = {SAQUE:'S', DERECHA:'D', REVES:'R', VOLEA_DERECHA:'V.D', VOLEA_REVES:'V.R', ESP_RED:'E.R', ESP_FONDO:'E.F'};
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
// serverHistory: array de sacadores por juego, ej ['J1','R2','J2','R1',...]
// Se rellena manualmente los dos primeros juegos; a partir del 3º se calcula solo
let ui = {server:'J1', serve_number:'1º', rally:'MENOS_3', highlight:0, category:'SAQUE', mode:'ADVANTAGE', seconds:0, running:false, timer:null, score:initialScore(), serverHistory:[]};

function rebuildScore(){ const {points}=activeContext(); ui.score=points.reduce((s,p)=>applyPoint(s,p.point_result,p.deuce_mode||ui.mode),initialScore()); }
function labelRally(r){ return r==='MENOS_3'?'R:<3':r==='ENTRE_3_6'?'R:3-6':'R:>6'; }
function button(type,text){ return `<button class="toggle active" data-act="${type}">${text}</button>`; }
function dateInputValue(iso){ const d=iso?new Date(iso):new Date(); if(Number.isNaN(d.getTime())) return ''; const p=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; }
function formData(form){ return Object.fromEntries(new FormData(form).entries()); }

function hasActiveMatch(){ const db=loadDB(); return !!(db.activeMatchId && db.matches.some(m=>m.id===db.activeMatchId)); }
function openInitialFlow(){ const dlg=$('#initialFlowDialog'); if(dlg && !dlg.open) dlg.showModal(); }
function fillInitialMatchPicker(){ const db=loadDB(); const picker=$('#initialMatchPicker'); if(!picker) return; picker.innerHTML=db.matches.map(m=>`<option value="${m.id}">${new Date(m.date||m.created_at||Date.now()).toLocaleDateString('es-ES')} · ${m.rival_name||'Sin rival'}</option>`).join('') || '<option value="">No hay partidos guardados</option>'; }
function ensureActiveMatchOrPrompt(){ if(!hasActiveMatch()){ openInitialFlow(); return false; } return true; }

// --- Auto-rotación del sacador ---
// Dado el historial de juegos jugados (serverHistory), calcula quién saca en el juego N
// Los dos primeros juegos son manuales. A partir del 3º se extrapola el ciclo de 4.
function nextServerFromHistory(history){
  if(history.length < 2) return null; // aún manual
  // el ciclo es: history[0], history[1], pareja_alterna(history[0]), pareja_alterna(history[1]), ...
  // pareja_alterna: J1<->J2, R1<->R2
  const alt = {J1:'J2',J2:'J1',R1:'R2',R2:'R1'};
  const cycle = [history[0], history[1], alt[history[0]], alt[history[1]]];
  return cycle[history.length % 4];
}

// Se llama al terminar un juego (cuando el marcador de juegos cambia)
function onGameFinished(prevGames, nextGames){
  // registramos en history el sacador que acaba de completar su juego
  const totalGamesBefore = prevGames.ourGames + prevGames.rivalGames;
  if(totalGamesBefore < 2){
    // primeros dos juegos: el usuario lo eligió manualmente, lo guardamos
    ui.serverHistory.push(ui.server);
  }
  // calculamos el siguiente sacador si ya tenemos 2 en el historial
  const next = nextServerFromHistory(ui.serverHistory);
  if(next) ui.server = next;
}

function renderScore(){
  const {db, match, set}=activeContext();
  const sets=matchSets(db, match?.id).filter(s=>s.id!==set?.id && s.finished_at);
  const gridCols = sets.length ? `1fr repeat(${sets.length + 1}, 34px) 46px` : '1fr 42px 52px';
  const our = sets.map(s=>`<div class="score-set ${setScoreClass(s)}">${s.our_games??0}</div>`).join('');
  const rival = sets.map(s=>`<div class="score-set ${setScoreClass(s)}">${s.rival_games??0}</div>`).join('');
  $('#score').innerHTML = `<div class="score-table ${sets.length?'multi-set':''} ${ui.score.setFinished?'finished':''}" style="--score-cols:${gridCols}">
    <div class="score-label">Nosotros</div>${our}<div class="score-game current-game">${ui.score.ourGames}</div><div class="score-point">${scoreText(ui.score,'OUR')}</div>
    <div class="score-label">Rivales</div>${rival}<div class="score-game current-game">${ui.score.rivalGames}</div><div class="score-point">${scoreText(ui.score,'RIVAL')}</div>
    ${ui.score.inTiebreak?'<div class="tiebreak-badge">Tie-break a 7 · ventaja de 2</div>':''}
    ${ui.score.setFinished?`<div class="set-finished ${ui.score.setWinner==='OUR'?'won':'lost'}">Set ${ui.score.setWinner==='OUR'?'ganado':'perdido'} · Guardar set o Nuevo set</div>`:''}
  </div><button id="mode" class="score-mode">${ui.mode==='ADVANTAGE'?'Ventajas':'Punto oro'}</button>`;
}

function render(){
  if(!ensureActiveMatchOrPrompt()){
    $('#score').innerHTML='<div class="empty-analyze">Crea o selecciona un partido para empezar.</div>';
    $('#quick').innerHTML=''; $('#zones').innerHTML=''; $('#cats').innerHTML=''; $('#players').innerHTML='';
    $('#last').textContent='Sin partido activo'; $('#events').textContent='0'; $('#saved-state').textContent='Esperando partido';
    return;
  }
  rebuildScore(); renderScore();
  $('#play').textContent=ui.running?'Ⅱ':'▶'; $('#time').textContent=new Date(ui.seconds*1000).toISOString().slice(14,19);
  $('#quick').innerHTML=`${button('server',`Saca ${ui.server}`)}${button('serve',ui.serve_number)}${button('rally',labelRally(ui.rally))}<button class="highlight ${ui.highlight?'active':''}" data-act="highlight" aria-label="Destacado">${ui.highlight?'★':'☆'}</button>`;
  // Botón extra contextual: 2ª Falta si saca el rival, Resto si sacamos nosotros
  const rivalSacando = ['R1','R2'].includes(ui.server);
  const extraLabel = rivalSacando ? '2ª Falta' : 'Resto';
  const extraStrokeType = rivalSacando ? 'doble_falta' : 'resto_fallado';
  $('#zones').innerHTML=['RED','MEDIO','FONDO'].map(z=>`<button class="zone" data-zone="${z}">${z}</button>`).join('')
    + `<button class="zone zone-extra" data-zone-extra="${extraStrokeType}">${extraLabel}</button>`;
  $('#cats').innerHTML=Object.keys(CATEGORY_LABELS).map(k=>`<button class="cat ${ui.category===k?'active':''}" data-cat="${k}" title="${CATEGORY_LABELS[k]}">${CAT_SHORT[k]}</button>`).join('');
  $('#players').innerHTML=['J1','J2'].map(playerPanel).join('');
  const {db, match, set, points}=activeContext(); const last=points.at(-1); const lastEl=$('#last');
  lastEl.classList.toggle('won', last?.point_result==='WON'); lastEl.classList.toggle('lost', last?.point_result==='LOST');
  lastEl.textContent=last?`${last.point_result==='WON'?'✓':'✗'} #${last.point_id} · ${last.player_id||'RIVAL'} · ${last.stroke_category||'NF RIVAL'} · ${last.stroke_type||last.court_zone||''} · ${last.outcome}${last.highlight==1?' ★':''}`:'Sin eventos';
  $('#events').textContent=points.length;
  const saved = set?.saved_at ? 'Guardado' : (points.length ? 'Cambios sin guardar' : 'Set vacío');
  if($('#analyzeMatchName')) $('#analyzeMatchName').textContent=`${match?.rival_name||'Partido'} · Set ${set?.set_number||1}`;
  $('#saved-state').textContent=`${match?.rival_name||'Partido'} · Set ${set?.set_number||1} · ${saved}`;
}

function playerPanel(player){
  const points=activeContext().points; const strokes=CATEGORIES[ui.category];
  const counts={pos:points.filter(p=>p.player_id===player&&p.stroke_category===ui.category&&p.outcome===OUTCOMES.WINNER_OR_FORCED).length, err:points.filter(p=>p.player_id===player&&p.stroke_category===ui.category&&p.outcome===OUTCOMES.OWN_UNFORCED_ERROR).length, forced:points.filter(p=>p.player_id===player&&p.stroke_category===ui.category&&p.outcome===OUTCOMES.RIVAL_WINNER_OR_OWN_FORCED).length};
  const col=(key,klass,title,outcome)=>`<div class="finish ${klass}"><h4>${title}</h4><div class="count">${counts[key]}</div><div class="stroke-grid">${strokes.map(s=>`<button data-register="${player}|${outcome}|${s}">${s}</button>`).join('')}</div></div>`;
  return `<section class="player-panel"><span class="player-name">${player==='J1'?'REVÉS':'DERECHA'}</span><div class="cols">${col('pos','pos','G-W/F',OUTCOMES.WINNER_OR_FORCED)}${col('err','err','P-NF',OUTCOMES.OWN_UNFORCED_ERROR)}${col('forced','forced','P-W/F',OUTCOMES.RIVAL_WINNER_OR_OWN_FORCED)}</div></section>`;
}
function pulse(target){ if(!target) return; target.classList.add('hit-flash'); if(navigator.vibrate) navigator.vibrate(10); setTimeout(()=>target.classList.remove('hit-flash'),130); }

function autoCreateNextSetIfFinished(){
  rebuildScore();
  if(!ui.score.setFinished) return false;
  const {match}=activeContext();
  saveCurrentSet();
  createSetForMatch(match.id,true);
  resetRuntime();
  render();
  return true;
}

function blockNavigationIfTimer(event){
  if(!ui.running) return false;
  event.preventDefault();
  event.stopPropagation();
  alert('El cronómetro está corriendo. Páralo antes de cambiar de pantalla.');
  return true;
}

function registerPoint(data, sourceButton=null){
  if(!ensureActiveMatchOrPrompt()) return;
  rebuildScore();
  if(ui.score.setFinished) autoCreateNextSetIfFinished();
  const {match,set,points}=activeContext();
  const point_result=data.point_result || ([OUTCOMES.WINNER_OR_FORCED,OUTCOMES.RIVAL_UNFORCED_ERROR].includes(data.outcome)?'WON':'LOST');
  const prevScore = {...ui.score};
  const nextScore=applyPoint(ui.score,point_result,ui.mode);
  const point={id:uid('pt'),match_id:match.id,set_id:set.id,timestamp:new Date().toISOString(),point_id:points.length+1,cause_key:data.outcome,point_result,outcome:data.outcome,player_id:data.player_id||'',player_team:data.player_id?'OUR':'',stroke_category:data.stroke_category||'',stroke_type:data.stroke_type||'',rally:ui.category==='SAQUE'?'MENOS_3':ui.rally,server:ui.server,serve_number:ui.serve_number,serve_direction:'',court_zone:data.court_zone||'',point_duration_seconds:ui.seconds,deuce_mode:ui.mode,our_games_after:nextScore.ourGames,rival_games_after:nextScore.rivalGames,our_points_after:scoreText(nextScore,'OUR'),rival_points_after:scoreText(nextScore,'RIVAL'),highlight:ui.highlight,video_second:ui.seconds,notes:'',in_tiebreak_after:nextScore.inTiebreak,set_finished:nextScore.setFinished,set_winner:nextScore.setWinner||''};
  pulse(sourceButton); addPoint(point); ui.score=nextScore; ui.serve_number='1º'; ui.highlight=0;
  // Detectar si acaba de terminar un juego (cambio en total de juegos)
  const prevTotal = prevScore.ourGames + prevScore.rivalGames;
  const nextTotal = nextScore.ourGames + nextScore.rivalGames;
  if(nextTotal > prevTotal && !nextScore.setFinished){
    onGameFinished(prevScore, nextScore);
  }
  render();
}

function fillMatchForm(form, match){
  form.rival_name.value=match?.rival_name||''; form.partner_name.value=match?.partner_name||''; form.match_type.value=match?.match_type||'amistoso'; form.court_type.value=match?.court_type||'indoor'; form.location.value=match?.location||''; form.date.value=dateInputValue(match?.date); form.notes.value=match?.notes||'';
}
function fillInfoForm(){ fillMatchForm($('#setInfoForm'), activeContext().match); }
function saveInfoForm(form){ updateMatch(activeContext().match.id, formData(form)); render(); }

function openSaveDialog(){
  const {db,match}=activeContext(); const form=$('#saveForm'); fillMatchForm(form, match); form.save_mode.value='current';
  $('#existingMatch').innerHTML=db.matches.filter(m=>m.id!==match?.id).map(m=>`<option value="${m.id}">${new Date(m.date||m.created_at).toLocaleDateString('es-ES')} · ${m.rival_name||'Sin rival'}</option>`).join('');
  toggleExistingMatch(); $('#saveDialog').showModal();
}
function toggleExistingMatch(){ $('#existingMatchWrap').classList.toggle('hidden',$('#saveMode').value!=='existing'); }
function resetRuntime(){ ui.score=initialScore(); ui.seconds=0; ui.highlight=0; ui.serve_number='1º'; ui.rally='MENOS_3'; ui.serverHistory=[]; }
function saveSetForm(form, action='save'){
  const data=formData(form); let targetMatchId=activeContext().match.id;
  if(data.save_mode==='new') targetMatchId=createMatch(data,false).id;
  if(data.save_mode==='existing' && data.existing_match_id) targetMatchId=data.existing_match_id;
  if(data.save_mode==='current') updateMatch(targetMatchId,data);
  else assignSetToMatch(activeContext().set.id,targetMatchId);
  saveCurrentSet();
  if(action==='new_set'){ createSetForMatch(targetMatchId,true); resetRuntime(); }
  render();
}
function createNewSetFlow(){
  const {set,points,match}=activeContext();
  if(points.length && !set.saved_at && !confirm('El set actual tiene cambios sin guardar. ¿Guardar y crear un nuevo set?')) return;
  saveCurrentSet(); createSetForMatch(match.id,true); resetRuntime(); render();
}
function openMatchFlow(){
  const {db}=activeContext();
  $('#matchPicker').innerHTML=db.matches.map(m=>`<option value="${m.id}">${new Date(m.date||m.created_at).toLocaleDateString('es-ES')} · ${m.rival_name||'Sin rival'}</option>`).join('');
  $('#flowDialog').showModal();
}

// Clicks
document.addEventListener('click',async event=>{
  const target=event.target.closest('button,a'); if(!target) return;
  if(target.tagName === 'A' && blockNavigationIfTimer(event)) return;
  if(target.dataset.act==='server'){
    ui.server={J1:'J2',J2:'R1',R1:'R2',R2:'J1'}[ui.server];
    // Si cambia manualmente en los dos primeros juegos, actualizamos el historial
    const totalGames = ui.score.ourGames + ui.score.rivalGames;
    if(totalGames < 2) ui.serverHistory = ui.serverHistory.slice(0, totalGames); // reset parcial si corrige
    render();
  }
  if(target.dataset.act==='serve'){ ui.serve_number=ui.serve_number==='1º'?'2º':'1º'; render(); }
  if(target.dataset.act==='rally'){ ui.rally={MENOS_3:'ENTRE_3_6',ENTRE_3_6:'MAS_6',MAS_6:'MENOS_3'}[ui.rally]; render(); }
  if(target.dataset.act==='highlight'){ ui.highlight=ui.highlight?0:1; render(); }
  if(target.dataset.cat){ ui.category=target.dataset.cat; if(ui.category==='SAQUE') ui.rally='MENOS_3'; render(); }
  if(target.dataset.zone) registerPoint({outcome:OUTCOMES.RIVAL_UNFORCED_ERROR,court_zone:target.dataset.zone,point_result:'WON'},target);
  if(target.dataset.zoneExtra) registerPoint({outcome:OUTCOMES.RIVAL_UNFORCED_ERROR,stroke_type:target.dataset.zoneExtra,court_zone:'',point_result:'WON'},target);
  if(target.dataset.register){ const [player,outcome,stroke]=target.dataset.register.split('|'); registerPoint({player_id:player,outcome,stroke_category:ui.category,stroke_type:stroke},target); }
  if(target.id==='undo'){ removeLastPoint(activeContext().set.id); render(); }
  if(target.id==='reset' && confirm('¿Resetear set actual?')){ resetCurrentSet(); resetRuntime(); render(); }
  if(target.id==='mode'){ ui.mode=ui.mode==='ADVANTAGE'?'GOLDEN_POINT':'ADVANTAGE'; render(); }
  if(target.id==='info'){ fillInfoForm(); $('#setInfoDialog').showModal(); }
  if(target.id==='save') openSaveDialog();
  if(target.id==='newSet') createNewSetFlow();
  if(target.id==='matchFlow') openMatchFlow();
  if(target.id==='flowLoad'){ activateMatch($('#matchPicker').value); resetRuntime(); $('#flowDialog').close(); render(); }
  if(target.id==='flowCreate'){ const m=createMatch({rival_name:'Nuevo rival'},true); activateMatch(m.id); resetRuntime(); $('#flowDialog').close(); render(); }
  if(target.id==='initialCreateMatch'){ $('#initialFlowDialog').close(); $('#createMatchDialog').showModal(); }
  if(target.id==='initialOpenExisting'){ fillInitialMatchPicker(); $('#initialFlowDialog').close(); $('#selectMatchDialog').showModal(); }
  if(target.id==='initialLoadMatch'){ const id=$('#initialMatchPicker').value; if(id){ activateMatch(id); resetRuntime(); $('#selectMatchDialog').close(); render(); } }
  if(target.dataset.close) $(`#${target.dataset.close}`).close();
  if(target.id==='play'){ ui.running=!ui.running; if(ui.running){ ui.timer=setInterval(()=>{ui.seconds++; $('#time').textContent=new Date(ui.seconds*1000).toISOString().slice(14,19);},1000);} else clearInterval(ui.timer); render(); }
  if(target.id==='minus'){ ui.seconds=Math.max(0,ui.seconds-5); render(); }
  if(target.id==='plus'){ ui.seconds+=5; render(); }
});

$('#setInfoForm').addEventListener('submit',e=>{ saveInfoForm(e.currentTarget); });
$('#createMatchForm')?.addEventListener('submit',e=>{ const m=createMatch(formData(e.currentTarget),true); activateMatch(m.id); resetRuntime(); render(); });
$('#saveForm').addEventListener('submit',e=>{ saveSetForm(e.currentTarget,e.submitter?.dataset.action||'save'); });
$('#saveMode').addEventListener('change',toggleExistingMatch);
window.addEventListener('beforeunload', e=>{ if(ui.running){ e.preventDefault(); e.returnValue=''; } });
document.addEventListener('visibilitychange',()=>{ if(document.hidden && ui.running && navigator.vibrate) navigator.vibrate([60,40,60]); });
mountNav('analyze'); render();
