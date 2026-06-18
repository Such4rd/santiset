import {loadDB, createMatch, updateMatch, deleteMatch, deleteSet, createSetForMatch, updateSet, activateMatch, matchSets} from './storage.js';
import {general} from './analytics.js';
import {downloadCSV} from './csv.js';
import {downloadPDF} from './pdf.js';
import {mountNav} from './navigation.js';
import {setScoreClass, setScoreText} from './scoring.js';

const $ = s => document.querySelector(s);

function icon(name){
  const icons = {
    info:`<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 10v7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="7" r="1.2" fill="currentColor"/></svg>`,
    edit:`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 16.8V20h3.2L18.7 8.5l-3.2-3.2L4 16.8Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="m14.7 6.1 3.2 3.2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
    chart:`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19V5M5 19h15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M9 16V11M13 16V7M17 16v-4" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>`,
    racket:`<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="10" cy="8" rx="5" ry="6.5" transform="rotate(35 10 8)" fill="none" stroke="currentColor" stroke-width="2"/><path d="m13.8 12.8 5.1 5.1M17.3 19.4l2.1-2.1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="8.2" cy="7.2" r=".7" fill="currentColor"/><circle cx="10.7" cy="8.7" r=".7" fill="currentColor"/><circle cx="7.7" cy="10" r=".7" fill="currentColor"/></svg>`,
    pdf:`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l4 4v14H7z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M14 3v5h5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8.5 16.5h7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M8.5 13h7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
    csv:`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l4 4v14H7z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M14 3v5h5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9 14h6M9 17h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
    play:`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7L8 5Z" fill="currentColor"/></svg>`,
    trash:`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 11v6M14 11v6M8 7l1-3h6l1 3M7 7l1 14h8l1-14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  };
  return icons[name] || '';
}


function dateInputValue(iso){ const d=iso?new Date(iso):new Date(); if(Number.isNaN(d.getTime())) return ''; const p=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; }
function formData(form){ return Object.fromEntries(new FormData(form).entries()); }
function filenameSafe(x){ return String(x||'santiset').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''); }
function resultLine(sets){
  if(!sets.length) return '<span class="set-chip live">Sin sets</span>';
  return sets.map(s=>`<span class="set-chip ${setScoreClass(s)}">S${s.set_number||1} ${setScoreText(s)}<button class="set-mini video" title="Cambiar vídeo del set" data-set-video="${s.id}">🎬</button><button class="set-mini remove" title="Borrar set" data-delete-set="${s.id}">×</button></span>`).join('');
}
function infoHTML(m, sets, g){ return `<div><span>Rival</span><strong>${m.rival_name||'-'}</strong></div><div><span>Compañero</span><strong>${m.partner_name||'-'}</strong></div><div><span>Tipo</span><strong>${m.match_type||'-'}</strong></div><div><span>Lugar</span><strong>${m.location||'-'}</strong></div><div><span>Fecha</span><strong>${new Date(m.date||m.created_at||Date.now()).toLocaleString('es-ES')}</strong></div><div><span>Pista</span><strong>${m.court_type||'-'}</strong></div><div><span>Sets</span><strong>${sets.length}</strong></div><div><span>Vídeos set</span><strong>${sets.filter(s=>s.video_url).length}</strong></div><div><span>Puntos</span><strong>${g.total_points}</strong></div><div><span>Notas</span><strong>${m.notes||'-'}</strong></div>`; }



function isOurServer(server){ return ['J1','J2'].includes(server); }
function isRivalServer(server){ return ['R1','R2'].includes(server); }
function isTruthy(value){ return value === true || value === 1 || String(value).toLowerCase() === 'true'; }
function gamePointFor(attackerPoint, defenderPoint, mode='ADVANTAGE'){
  const a = String(attackerPoint ?? '0');
  const d = String(defenderPoint ?? '0');

  // Punto de oro: en 40-40 ambos tienen punto para llevarse el juego.
  if(mode === 'GOLDEN_POINT' && a === '40' && d === '40') return true;

  // Ventaja normal: AD o 40 con margen suficiente antes del deuce.
  if(a === 'AD') return true;
  return a === '40' && ['0','15','30'].includes(d);
}
function matchSummary(points, sets=[]){
  const g = general(points);
  const bySet = new Map();
  points.forEach(p => {
    const key = p.set_id || 'sin_set';
    if(!bySet.has(key)) bySet.set(key, []);
    bySet.get(key).push(p);
  });

  let bpForTotal = 0, bpForWon = 0;
  let bpAgainstTotal = 0, bpAgainstWon = 0;
  const orderedSetIds = sets.length ? sets.map(s => s.id) : [...bySet.keys()];

  orderedSetIds.forEach(setId => {
    const setPoints = (bySet.get(setId) || []).slice().sort((a,b) =>
      Number(a.point_id || 0) - Number(b.point_id || 0) ||
      String(a.timestamp || '').localeCompare(String(b.timestamp || ''))
    );

    // Estado ANTES del punto actual. Se actualiza con los campos *_after del punto guardado.
    let before = {ourGames:0, rivalGames:0, ourPoint:'0', rivalPoint:'0', inTiebreak:false};

    setPoints.forEach(p => {
      const mode = p.deuce_mode || 'ADVANTAGE';

      if(!before.inTiebreak && isRivalServer(p.server) && gamePointFor(before.ourPoint, before.rivalPoint, mode)){
        bpForTotal++;
        if(Number(p.our_games_after || 0) > before.ourGames) bpForWon++;
      }

      if(!before.inTiebreak && isOurServer(p.server) && gamePointFor(before.rivalPoint, before.ourPoint, mode)){
        bpAgainstTotal++;
        if(Number(p.rival_games_after || 0) > before.rivalGames) bpAgainstWon++;
      }

      before = {
        ourGames: Number(p.our_games_after || 0),
        rivalGames: Number(p.rival_games_after || 0),
        ourPoint: String(p.our_points_after ?? '0'),
        rivalPoint: String(p.rival_points_after ?? '0'),
        inTiebreak: isTruthy(p.in_tiebreak_after)
      };
    });
  });

  return {
    pointsPlayed: g.total_points,
    pointsWon: g.won_points,
    breakPointsFor: `${bpForWon}/${bpForTotal}`,
    breakPointsAgainst: `${bpAgainstWon}/${bpAgainstTotal}`,
    winners: g.winner_or_forced,
    unforcedErrors: g.own_unforced_errors,
    highlighted: g.highlighted_points
  };
}
function matchSummaryHTML(summary){
  return `<div class="match-summary"><div class="match-summary__title">Resumen del partido</div><div class="match-summary__grid"><div class="summary-item"><span class="summary-item__label">Ptos jugados</span><span class="summary-item__value">${summary.pointsPlayed}</span></div><div class="summary-item"><span class="summary-item__label">Ptos ganados</span><span class="summary-item__value">${summary.pointsWon}</span></div><div class="summary-item bp-favor"><span class="summary-item__label">Break a favor</span><span class="summary-item__value">${summary.breakPointsFor}</span></div><div class="summary-item bp-contra"><span class="summary-item__label">Break en contra</span><span class="summary-item__value">${summary.breakPointsAgainst}</span></div><div class="summary-item"><span class="summary-item__label">Winners</span><span class="summary-item__value">${summary.winners}</span></div><div class="summary-item"><span class="summary-item__label">Unforced errors</span><span class="summary-item__value">${summary.unforcedErrors}</span></div><div class="summary-item highlighted"><span class="summary-item__label">★ Ptos destacados</span><span class="summary-item__value">${summary.highlighted}</span></div></div></div>`;
}

function render(){
  const db=loadDB(); const q=($('#search')?.value||'').toLowerCase().trim();
  const matches=db.matches.filter(m=>!q || [m.rival_name,m.partner_name,m.location,m.match_type,m.court_type].join(' ').toLowerCase().includes(q));
  $('#matches').innerHTML=matches.map(m=>{
    const pts=db.points.filter(p=>p.match_id===m.id); const sets=matchSets(db,m.id); const summary=matchSummary(pts,sets);
    return `<article class="card match-card"><div class="match-head"><div><span class="small">${new Date(m.date||m.created_at||Date.now()).toLocaleString('es-ES')}</span><h3>${m.rival_name||'Rival sin nombre'}</h3><p class="small">${m.partner_name?`Compañero: ${m.partner_name} · `:''}${m.match_type||'amistoso'} · ${m.court_type||'pista'} ${m.location?`· ${m.location}`:''}</p></div></div><div class="set-scoreline">${resultLine(sets)}</div>${matchSummaryHTML(summary)}<div class="match-actions"><button class="icon-btn info" title="Info" aria-label="Info" data-info="${m.id}">${icon('info')}</button><button class="icon-btn edit" title="Editar datos" aria-label="Editar datos" data-edit="${m.id}">${icon('edit')}</button><button class="icon-btn dash" title="Dashboard" aria-label="Dashboard" data-dashboard="${m.id}">${icon('chart')}</button><button class="icon-btn events" title="Eventos" aria-label="Eventos" data-events="${m.id}">${icon('racket')}</button><button class="icon-btn pdf" title="Descargar PDF" aria-label="Descargar PDF" data-pdf="${m.id}">${icon('pdf')}</button><button class="icon-btn csv" title="Exportar CSV por set" aria-label="Exportar CSV por set" data-csv="${m.id}">${icon('csv')}</button><button class="icon-btn analyze" title="Analizar este partido" aria-label="Analizar este partido" data-edit-analysis="${m.id}">${icon('play')}</button><button class="icon-btn delete" title="Eliminar" aria-label="Eliminar" data-delete="${m.id}">${icon('trash')}</button></div></article>`;
  }).join('') || '<p class="small">Todavía no hay partidos guardados.</p>';
}
function openForm(match=null){ const form=$('#matchForm'); $('#matchDialogTitle').textContent=match?'Editar partido':'Crear partido'; form.id.value=match?.id||''; form.rival_name.value=match?.rival_name||''; form.partner_name.value=match?.partner_name||''; form.match_type.value=match?.match_type||'amistoso'; form.court_type.value=match?.court_type||'indoor'; form.location.value=match?.location||''; form.date.value=dateInputValue(match?.date); form.video_url.value=match?.video_url||''; form.notes.value=match?.notes||''; $('#matchDialog').showModal(); }

function openSetVideoDialog(setId){
  const db=loadDB(); const set=db.sets.find(s=>s.id===setId); if(!set) return;
  $('#setVideoForm').set_id.value=set.id;
  $('#setVideoForm').video_url.value=set.video_url||'';
  $('#setVideoDialog').showModal();
}

document.addEventListener('click',async e=>{
  const btn=e.target.closest('button'); if(!btn) return; const db=loadDB();
  if(btn.id==='newMatch') openForm(null);
  if(btn.dataset.edit) openForm(db.matches.find(m=>m.id===btn.dataset.edit));
  if(btn.dataset.info){ const m=db.matches.find(x=>x.id===btn.dataset.info); const sets=matchSets(db,m.id); $('#infoContent').innerHTML=infoHTML(m,sets,general(db.points.filter(p=>p.match_id===m.id))); $('#infoDialog').showModal(); }
  if(btn.dataset.delete && confirm('¿Eliminar este partido con todos sus sets y puntos?')){ deleteMatch(btn.dataset.delete); render(); }
  if(btn.dataset.deleteSet && confirm('¿Borrar este set y todos sus eventos?')){ deleteSet(btn.dataset.deleteSet); render(); }
  if(btn.dataset.setVideo) openSetVideoDialog(btn.dataset.setVideo);
  if(btn.dataset.editAnalysis){ const sets=matchSets(db,btn.dataset.editAnalysis); const open=sets.find(s=>!s.finished_at) || sets.at(-1) || createSetForMatch(btn.dataset.editAnalysis,false); activateMatch(btn.dataset.editAnalysis, open.id); location.href='analyze.html'; }
  if(btn.dataset.dashboard){ activateMatch(btn.dataset.dashboard); location.href='dashboard.html'; }
  if(btn.dataset.events){ activateMatch(btn.dataset.events); location.href='events.html'; }
  if(btn.dataset.csv){ const m=db.matches.find(x=>x.id===btn.dataset.csv); const sets=matchSets(db,m.id); sets.forEach(s=>downloadCSV(db.points.filter(p=>p.set_id===s.id),`${filenameSafe(m.rival_name)}-set-${s.set_number||1}.csv`)); }
  if(btn.dataset.pdf){ const m=db.matches.find(x=>x.id===btn.dataset.pdf); if(m) await downloadPDF(db.points.filter(p=>p.match_id===m.id),m,`${filenameSafe(m.rival_name)}-informe.pdf`); }
  if(btn.dataset.close) $(`#${btn.dataset.close}`).close();
});
$('#matchForm').addEventListener('submit',e=>{ const data=formData(e.currentTarget); if(data.id) updateMatch(data.id,data); else createMatch(data,true); render(); });
$('#setVideoForm').addEventListener('submit',e=>{ const data=formData(e.currentTarget); updateSet(data.set_id,{video_url:(data.video_url||'').trim()}); render(); });
$('#search').addEventListener('input',render);
mountNav('matches'); render();
