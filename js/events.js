import {loadDB, matchSets, activateMatch} from './storage.js';
import {mountNav} from './navigation.js';
const $=s=>document.querySelector(s);

function youtubeMoment(url, seconds){ if(!url) return ''; const sep=url.includes('?')?'&':'?'; return `${url}${sep}t=${Math.max(0,Number(seconds||0))}s`; }
function outcomeText(outcome){
  return ({RIVAL_UNFORCED_ERROR:'ENF rival',WINNER_OR_FORCED:'Forzado/Winner',OWN_UNFORCED_ERROR:'ENF propio',RIVAL_WINNER_OR_OWN_FORCED:'Winner rival/forzado'}[outcome] || outcome || '-');
}
function youtubeIcon(){
  return `<svg class="yt-svg" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21.6 7.2a3 3 0 0 0-2.1-2.1C17.6 4.6 12 4.6 12 4.6s-5.6 0-7.5.5a3 3 0 0 0-2.1 2.1A31.2 31.2 0 0 0 2 12a31.2 31.2 0 0 0 .4 4.8 3 3 0 0 0 2.1 2.1c1.9.5 7.5.5 7.5.5s5.6 0 7.5-.5a3 3 0 0 0 2.1-2.1A31.2 31.2 0 0 0 22 12a31.2 31.2 0 0 0-.4-4.8ZM10 15.4V8.6L15.8 12 10 15.4Z"/></svg>`;
}
function shortCat(cat){ return ({SAQUE:'S',DERECHA:'D',REVES:'R',VOLEA_DERECHA:'VD',VOLEA_REVES:'VR',ESP_FONDO:'GEF',ESP_RED:'GER'}[cat] || cat || 'NF'); }
function fill(){ const db=loadDB(); $('#matchFilter').innerHTML=db.matches.map(m=>`<option value="${m.id}" ${m.id===db.activeMatchId?'selected':''}>${new Date(m.date||m.created_at||Date.now()).toLocaleDateString('es-ES')} · ${m.rival_name||'Sin rival'}</option>`).join(''); fillSets(); }
function fillSets(){ const db=loadDB(); const matchId=$('#matchFilter').value||db.activeMatchId; const sets=matchSets(db,matchId); $('#setFilter').innerHTML='<option value="ALL">Todos los sets</option>'+sets.map(s=>`<option value="${s.id}">Set ${s.set_number||1}</option>`).join(''); }
function render(){
  const db=loadDB(); const matchId=$('#matchFilter').value||db.activeMatchId; const match=db.matches.find(m=>m.id===matchId); let pts=db.points.filter(p=>p.match_id===matchId);
  const set=$('#setFilter').value, player=$('#playerFilter').value, cat=$('#categoryFilter').value, res=$('#resultFilter').value, outcome=$('#outcomeFilter')?.value || 'ALL', hi=$('#highlightFilter').value;
  if(set&&set!=='ALL') pts=pts.filter(p=>p.set_id===set);
  if(player==='RIVAL') pts=pts.filter(p=>!p.player_id); else if(player&&player!=='ALL') pts=pts.filter(p=>p.player_id===player);
  if(cat&&cat!=='ALL') pts=pts.filter(p=>p.stroke_category===cat);
  if(res&&res!=='ALL') pts=pts.filter(p=>p.point_result===res);
  if(outcome&&outcome!=='ALL') pts=pts.filter(p=>p.outcome===outcome);
  if(hi&&hi!=='ALL') pts=pts.filter(p=>String(p.highlight)===hi);
  const setOrder = new Map(matchSets(db, matchId).map((s,i)=>[s.id,i]));
  pts.sort((a,b)=>(setOrder.get(a.set_id)-setOrder.get(b.set_id)) || (Number(a.point_id||0)-Number(b.point_id||0)) || String(a.timestamp).localeCompare(String(b.timestamp)));
  $('#eventsTable').innerHTML=pts.length?`<div class="event-list">${pts.map((p,i)=>{ const s=db.sets.find(x=>x.id===p.set_id); const video=s?.video_url || match?.video_url || ''; const link=youtubeMoment(video,p.video_second||p.point_duration_seconds); const won=p.point_result==='WON'; return `<article class="event-row-card ${won?'won':'lost'}"><div class="event-main"><div class="event-topline"><strong>S${s?.set_number||'-'} · P${p.point_id||i+1}</strong><span class="result-chip ${won?'won':'lost'}">${won?'Ganado':'Perdido'}</span>${+p.highlight===1?'<span class="star-chip">★</span>':''}</div><div class="event-stroke"><b>${p.player_id||'Rival'}</b> · ${shortCat(p.stroke_category)} · ${p.stroke_type||p.court_zone||'-'}</div><div class="event-finish">${outcomeText(p.outcome)} · ${p.rally||'-'} · ${p.server||'-'} ${p.serve_number||''}</div></div><div class="event-video">${link?`<a class="youtube-icon-link" target="_blank" href="${link}" title="Abrir momento en YouTube">${youtubeIcon()}</a>`:'-'}</div></article>`; }).join('')}</div>`:'<p class="small">No hay eventos con esos filtros.</p>';
}
document.addEventListener('change',e=>{ if(e.target.id==='matchFilter'){ activateMatch(e.target.value); fillSets(); } render(); });
mountNav('events'); fill(); render();
