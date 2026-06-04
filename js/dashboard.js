import {loadDB} from './storage.js';
import {OUTCOMES, CATEGORY_LABELS} from './constants.js';
import {mountNav} from './navigation.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const pct = (a,b) => b ? Math.round((a/b)*100) : 0;
const CAT_ORDER = ['SAQUE','DERECHA','REVES','VOLEA_DERECHA','VOLEA_REVES','ESP_FONDO','ESP_RED'];
const CAT_SHORT = {SAQUE:'Saque',DERECHA:'Derecha',REVES:'Revés',VOLEA_DERECHA:'VD',VOLEA_REVES:'VR',ESP_FONDO:'GEF',ESP_RED:'GER'};
const BACK_CATS = ['DERECHA','REVES','ESP_FONDO'];
const NET_CATS = ['VOLEA_DERECHA','VOLEA_REVES','ESP_RED'];

let db = loadDB();
let selectedMatchId = db.activeMatchId || db.matches[0]?.id || '';
let selectedSetId = db.activeSetId || db.sets.find(s=>s.match_id===selectedMatchId)?.id || 'ALL';
let view = 'GENERAL';

function pointsForSelection(){
  let pts = db.points.filter(p => p.match_id === selectedMatchId);
  if(selectedSetId && selectedSetId !== 'ALL') pts = pts.filter(p => p.set_id === selectedSetId);
  if(view === 'J1' || view === 'J2') pts = pts.filter(p => p.player_id === view || p.outcome === OUTCOMES.RIVAL_UNFORCED_ERROR);
  return pts;
}

function match(){ return db.matches.find(m => m.id === selectedMatchId); }
function sets(){ return db.sets.filter(s => s.match_id === selectedMatchId).sort((a,b)=>(a.set_number||0)-(b.set_number||0)); }
function labelCat(cat){ return CAT_SHORT[cat] || CATEGORY_LABELS[cat] || cat || 'Sin dato'; }
function count(list, predicate){ return list.filter(predicate).length; }
function byCat(points, outcome){
  const data = Object.fromEntries(CAT_ORDER.map(c => [c,0]));
  points.filter(p => p.outcome === outcome).forEach(p => { if(p.stroke_category) data[p.stroke_category] = (data[p.stroke_category] || 0) + 1; });
  return data;
}
function metricRows(entries, variant=''){
  // Sort by value descending
  const sorted = [...entries].sort((a,b) => (b[1]||0) - (a[1]||0));
  const max = sorted[0]?.[1] || 1;
  return sorted.map(([label,value]) => {
    const intensity = max > 0 ? value / max : 0;
    const styleAttr = variant && value > 0 ? ` style="opacity:${(0.35 + 0.65 * intensity).toFixed(2)}"` : '';
    return `<div class="metric-row"><span class="metric-label">${label}</span><span class="metric-value ${variant}"${styleAttr}>${value}</span></div>`;
  }).join('');
}
function categoryMetricRows(obj, variant=''){
  return metricRows(CAT_ORDER.map(cat => [labelCat(cat), obj[cat] || 0]), variant);
}
function kpi(label, value, variant=''){
  return `<article class="dashboard-kpi ${variant}"><span>${label}</span><strong>${value}</strong></article>`;
}

function populateSelectors(){
  const matchSelect = $('#matchSelect');
  matchSelect.innerHTML = db.matches.map(m => `<option value="${m.id}" ${m.id===selectedMatchId?'selected':''}>${new Date(m.date || m.created_at || Date.now()).toLocaleDateString('es-ES')} · ${m.rival_name || 'Rival'}</option>`).join('');
  const setOptions = [`<option value="ALL" ${selectedSetId==='ALL'?'selected':''}>Todos los sets</option>`].concat(
    sets().map(s => `<option value="${s.id}" ${s.id===selectedSetId?'selected':''}>Set ${s.set_number || 1}</option>`)
  );
  $('#setSelect').innerHTML = setOptions.join('');
}

function renderSetScore(){
  const html = sets().map(s => {
    const cls = s.set_winner === 'OUR' ? 'won' : s.set_winner === 'RIVAL' ? 'lost' : 'live';
    const label = s.finished_at ? `Set ${s.set_number}: ${s.our_games}-${s.rival_games}` : `Set ${s.set_number}: ${s.our_games || 0}-${s.rival_games || 0} · en juego`;
    return `<span class="set-chip ${cls}">${label}</span>`;
  }).join('');
  $('#setScore').innerHTML = html;
}

function renderKpis(points){
  const total = points.length;
  const won = count(points, p => p.point_result === 'WON');
  const lost = count(points, p => p.point_result === 'LOST');
  const wonJD = count(points, p => p.player_id === 'J2' && p.point_result === 'WON');
  const lostJD = count(points, p => p.player_id === 'J2' && p.point_result === 'LOST');
  const wonJR = count(points, p => p.player_id === 'J1' && p.point_result === 'WON');
  const lostJR = count(points, p => p.player_id === 'J1' && p.point_result === 'LOST');
  $('#kpis').innerHTML = [
    kpi('Ptos totales', total),
    kpi('Ptos ganados J.D', wonJD, 'positive'),
    kpi('Ptos perdidos J.D', lostJD, 'negative'),
    kpi('Ptos ganados J.R', wonJR, 'positive'),
    kpi('Ptos perdidos J.R', lostJR, 'negative')
  ].join('');
}

function renderWonLost(points){
  const wonRivalErrors = [
    ['Pareja en red', count(points, p => p.outcome === OUTCOMES.RIVAL_UNFORCED_ERROR && p.court_zone === 'RED')],
    ['Pareja en medio', count(points, p => p.outcome === OUTCOMES.RIVAL_UNFORCED_ERROR && p.court_zone === 'MEDIO')],
    ['Pareja en fondo', count(points, p => p.outcome === OUTCOMES.RIVAL_UNFORCED_ERROR && p.court_zone === 'FONDO')],
    ['Doble falta', count(points, p => p.outcome === OUTCOMES.RIVAL_UNFORCED_ERROR && p.stroke_type === 'doble_falta')],
    ['Resto', count(points, p => p.outcome === OUTCOMES.RIVAL_UNFORCED_ERROR && p.stroke_type === 'resto_fallado')]
  ];
  $('#wonRivalErrors').innerHTML = metricRows(wonRivalErrors, 'positive');
  $('#wonWinners').innerHTML = categoryMetricRows(byCat(points, OUTCOMES.WINNER_OR_FORCED), 'positive');
  $('#lostOwnErrors').innerHTML = categoryMetricRows(byCat(points, OUTCOMES.OWN_UNFORCED_ERROR), 'negative');
  $('#lostForced').innerHTML = categoryMetricRows(byCat(points, OUTCOMES.RIVAL_WINNER_OR_OWN_FORCED), 'negative');
}

function topStrokes(points, result, courtGroup){
  const cats = courtGroup === 'BACK' ? BACK_CATS : NET_CATS;
  const allowed = result === 'WON'
    ? [OUTCOMES.WINNER_OR_FORCED]
    : [OUTCOMES.OWN_UNFORCED_ERROR, OUTCOMES.RIVAL_WINNER_OR_OWN_FORCED];
  const map = new Map();
  points.filter(p => allowed.includes(p.outcome) && cats.includes(p.stroke_category) && p.stroke_type).forEach(p => {
    const key = `${labelCat(p.stroke_category)} · ${p.stroke_type}`;
    const item = map.get(key) || {label:key, cat:labelCat(p.stroke_category), stroke:p.stroke_type, total:0, highlight:0};
    item.total += 1;
    if(+p.highlight === 1) item.highlight += 1;
    map.set(key,item);
  });
  return [...map.values()].sort((a,b)=> b.highlight - a.highlight || b.total - a.total).slice(0,5);
}
function rankingHtml(items){
  if(!items.length) return '<div class="empty-state">Sin datos.</div>';
  return items.map((x,i)=>`<div class="rank-row"><span class="rank-num">${i+1}</span><span class="rank-main"><b>${x.stroke}</b><small>${x.cat} · ★ ${x.highlight}</small></span><span class="metric-value">${x.total}</span></div>`).join('');
}
function renderTops(points){
  $('#topWonBack').innerHTML = rankingHtml(topStrokes(points,'WON','BACK'));
  $('#topWonNet').innerHTML = rankingHtml(topStrokes(points,'WON','NET'));
  $('#topLostBack').innerHTML = rankingHtml(topStrokes(points,'LOST','BACK'));
  $('#topLostNet').innerHTML = rankingHtml(topStrokes(points,'LOST','NET'));
}

function serveBlock(points, serveNumber, mode){
  const isServe = mode === 'SERVE';
  const list = points.filter(p => (isServe ? ['J1','J2'].includes(p.server) : ['R1','R2'].includes(p.server)) && p.serve_number === serveNumber);
  const won = count(list, p => p.point_result === 'WON');
  const lost = count(list, p => p.point_result === 'LOST');
  return {played:list.length, won, lost, pct:pct(won,list.length)};
}
function serveCard(title, data){
  const pctJugados = pct(data.played, data.played + data._total_not_played);
  const pctGanados = pct(data.won, data.played);
  const pctPerdidos = pct(data.lost, data.played);
  return `<article class="card serve-card"><h4>${title}</h4><div class="serve-numbers"><div class="serve-mini"><span>Jugados</span><strong>${data.played}</strong><small class="serve-mini-pct">${data._pct_played}%</small></div><div class="serve-mini"><span>Ganados</span><strong>${data.won}</strong><small class="serve-mini-pct positive">${pctGanados}%</small></div><div class="serve-mini"><span>Perdidos</span><strong>${data.lost}</strong><small class="serve-mini-pct negative">${pctPerdidos}%</small></div></div><div class="serve-pct">${data.pct}% ganados</div></article>`;
}
function renderServeReturn(points){
  const totalPoints = points.length;
  function serveBlockEx(serveNumber, mode){
    const isServe = mode === 'SERVE';
    const list = points.filter(p => (isServe ? ['J1','J2'].includes(p.server) : ['R1','R2'].includes(p.server)) && p.serve_number === serveNumber);
    const won = count(list, p => p.point_result === 'WON');
    const lost = count(list, p => p.point_result === 'LOST');
    return {played:list.length, won, lost, pct:pct(won,list.length), _pct_played:pct(list.length, totalPoints), _total_not_played: totalPoints - list.length};
  }
  $('#serveStats').innerHTML = [serveCard('1º saque', serveBlockEx('1º','SERVE')), serveCard('2º saque', serveBlockEx('2º','SERVE'))].join('');
  $('#returnStats').innerHTML = [serveCard('1º saque', serveBlockEx('1º','RETURN')), serveCard('2º saque', serveBlockEx('2º','RETURN'))].join('');
}

function render(){
  db = loadDB();
  if(!db.matches.length){ $('#meta').textContent = 'Sin partidos guardados'; return; }
  if(!db.matches.some(m=>m.id===selectedMatchId)) selectedMatchId = db.activeMatchId || db.matches[0].id;
  const availableSets = sets();
  if(selectedSetId !== 'ALL' && !availableSets.some(s=>s.id===selectedSetId)) selectedSetId = availableSets[0]?.id || 'ALL';
  populateSelectors();
  const m = match();
  const pts = pointsForSelection();
  $('#title').textContent = 'Dashboard';
  $('#meta').textContent = `${m?.rival_name || 'Partido'} · ${selectedSetId === 'ALL' ? 'Todos los sets' : $('#setSelect').selectedOptions[0]?.textContent || 'Set'} · ${pts.length} puntos`;
  $$('.seg').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  renderSetScore();
  renderKpis(pts);
  renderWonLost(pts);
  renderTops(pts);
  renderServeReturn(pts);
}

document.addEventListener('change', e => {
  if(e.target.id === 'matchSelect') { selectedMatchId = e.target.value; selectedSetId = 'ALL'; render(); }
  if(e.target.id === 'setSelect') { selectedSetId = e.target.value; render(); }
});
document.addEventListener('click', e => {
  const btn = e.target.closest('[data-view]');
  if(!btn) return;
  view = btn.dataset.view;
  render();
});

mountNav('dash');
render();
