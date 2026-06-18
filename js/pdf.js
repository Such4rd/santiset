import {general, service} from './analytics.js';
import {loadDB, matchSets} from './storage.js';
import {OUTCOMES, CATEGORY_LABELS} from './constants.js';

const CAT_ORDER = ['SAQUE','DERECHA','REVES','VOLEA_DERECHA','VOLEA_REVES','ESP_FONDO','ESP_RED'];
const CAT_SHORT = {SAQUE:'Saque',DERECHA:'Derecha',REVES:'Revés',VOLEA_DERECHA:'V. derecha',VOLEA_REVES:'V. revés',ESP_FONDO:'Esp. fondo',ESP_RED:'Esp. red'};
const BACK_CATS = ['DERECHA','REVES','ESP_FONDO'];
const NET_CATS = ['VOLEA_DERECHA','VOLEA_REVES','ESP_RED'];
const GREEN = [31,77,61];
const GREEN_2 = [47,105,83];
const BLUE = [40,92,150];
const ORANGE = [210,95,28];
const RED = [168,54,45];
const PURPLE = [103,75,160];
const TEAL = [31,118,128];
const GOLD = [177,115,32];
const INDIGO = [75,85,150];
const LINE = [219,207,191];
const LIGHT = [250,247,240];
const WHITE = [255,255,255];

function setPoints(db,setId){ return db.points.filter(p=>p.set_id===setId); }
function labelCat(cat){ return CAT_SHORT[cat] || CATEGORY_LABELS[cat] || cat || 'Sin dato'; }
function count(points,predicate){ return points.filter(predicate).length; }
function pct(a,b){ return b ? Math.round(a/b*100) : 0; }
function isOurServer(server){ return ['J1','J2'].includes(server); }
function isRivalServer(server){ return ['R1','R2'].includes(server); }
function isTruthy(value){ return value === true || value === 1 || String(value).toLowerCase() === 'true'; }
function safeText(value, fallback='-'){ return String(value ?? '').trim() || fallback; }
function scoreText(set){
  if(!set) return '-';
  const a = Number(set.our_games ?? 0);
  const b = Number(set.rival_games ?? 0);
  return `${a}-${b}`;
}
function resultLine(sets){ return sets.length ? sets.map(scoreText).join(' / ') : '-'; }
function setTitle(set, idx){ return `Set ${set?.set_number || idx + 1}`; }

function gamePointFor(attackerPoint, defenderPoint, mode='ADVANTAGE'){
  const a = String(attackerPoint ?? '0');
  const d = String(defenderPoint ?? '0');
  if(mode === 'GOLDEN_POINT' && a === '40' && d === '40') return true;
  if(a === 'AD') return true;
  return a === '40' && ['0','15','30'].includes(d);
}
function summaryForPoints(points){
  const ordered = [...points].sort((a,b) =>
    Number(a.point_id || 0) - Number(b.point_id || 0) ||
    String(a.timestamp || '').localeCompare(String(b.timestamp || ''))
  );
  const g = general(ordered);
  let bpForTotal = 0, bpForWon = 0;
  let bpAgainstTotal = 0, bpAgainstWon = 0;
  let before = {ourGames:0, rivalGames:0, ourPoint:'0', rivalPoint:'0', inTiebreak:false};

  ordered.forEach(p => {
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
      ourGames:Number(p.our_games_after || 0),
      rivalGames:Number(p.rival_games_after || 0),
      ourPoint:String(p.our_points_after ?? '0'),
      rivalPoint:String(p.rival_points_after ?? '0'),
      inTiebreak:isTruthy(p.in_tiebreak_after)
    };
  });

  return {
    pointsPlayed:g.total_points,
    pointsWon:g.won_points,
    breakFor:`${bpForWon}/${bpForTotal}`,
    breakAgainst:`${bpAgainstWon}/${bpAgainstTotal}`,
    winners:g.winner_or_forced,
    unforced:g.own_unforced_errors
  };
}
function fractionParts(value){
  const [a,b] = String(value || '0/0').split('/').map(n => Number(n || 0));
  return {won:a || 0, total:b || 0};
}
function fractionText(items, key){
  return items.reduce((acc,item) => {
    const f = fractionParts(item[key]);
    acc.won += f.won;
    acc.total += f.total;
    return acc;
  }, {won:0,total:0});
}
function totalSummaryFromSets(setSummaries, allPoints){
  const base = general(allPoints);
  const bpFor = fractionText(setSummaries, 'breakFor');
  const bpAgainst = fractionText(setSummaries, 'breakAgainst');

  return {
    pointsPlayed:base.total_points,
    pointsWon:base.won_points,
    // Importante: el total de break points se suma por sets.
    // No se recalcula recorriendo todo el partido, porque point_id se repite por set
    // y el marcador debe reiniciarse en cada set.
    breakFor:`${bpFor.won}/${bpFor.total}`,
    breakAgainst:`${bpAgainst.won}/${bpAgainst.total}`,
    winners:base.winner_or_forced,
    unforced:base.own_unforced_errors
  };
}
function summaryColumns(db, sets, matchId){
  const setCols = sets.map((s,idx) => {
    const points = setPoints(db,s.id);
    return {label:setTitle(s,idx), points, summary:summaryForPoints(points)};
  });

  const allPoints = db.points.filter(p=>p.match_id===matchId);
  setCols.push({
    label:'Partido total',
    points:allPoints,
    summary:totalSummaryFromSets(setCols.map(c => c.summary), allPoints)
  });

  return setCols;
}

function wonRivalErrorRows(points){
  return [
    ['Pareja en red', count(points, p => p.outcome === OUTCOMES.RIVAL_UNFORCED_ERROR && p.court_zone === 'RED')],
    ['Pareja en medio', count(points, p => p.outcome === OUTCOMES.RIVAL_UNFORCED_ERROR && p.court_zone === 'MEDIO')],
    ['Pareja en fondo', count(points, p => p.outcome === OUTCOMES.RIVAL_UNFORCED_ERROR && p.court_zone === 'FONDO')],
    ['Doble falta', count(points, p => p.outcome === OUTCOMES.RIVAL_UNFORCED_ERROR && p.stroke_type === 'doble_falta')],
    ['Resto', count(points, p => p.outcome === OUTCOMES.RIVAL_UNFORCED_ERROR && p.stroke_type === 'resto_fallado')]
  ];
}
function categoryRows(points, outcome){
  return CAT_ORDER.map(cat => [labelCat(cat), count(points, p => p.outcome === outcome && p.stroke_category === cat)]);
}
function rowsForDefinition(points, kind){
  if(kind === 'RIVAL_ERRORS') return wonRivalErrorRows(points);
  if(kind === 'WINNERS') return categoryRows(points, OUTCOMES.WINNER_OR_FORCED);
  if(kind === 'OWN_ERRORS') return categoryRows(points, OUTCOMES.OWN_UNFORCED_ERROR);
  if(kind === 'RIVAL_WINNERS') return categoryRows(points, OUTCOMES.RIVAL_WINNER_OR_OWN_FORCED);
  return [];
}
function tableRowsBySet(columns, kind, maxRows=7){
  const totalPoints = columns.at(-1)?.points || [];
  const labels = rowsForDefinition(totalPoints, kind).map(r => r[0]);
  const rows = labels.map(label => {
    const values = columns.map(c => (rowsForDefinition(c.points, kind).find(r => r[0] === label)?.[1]) || 0);
    return [label, ...values];
  }).sort((a,b) => Number(b.at(-1) || 0) - Number(a.at(-1) || 0));
  return rows.filter(r => r.slice(1).some(v => Number(v) > 0)).slice(0,maxRows);
}
function playerCompareRows(points, outcome, maxRows=7){
  const rows = categoryRows(points, outcome).map(([label,total]) => [
    label,
    count(points, p => p.outcome === outcome && labelCat(p.stroke_category) === label && p.player_id === 'J1'),
    count(points, p => p.outcome === outcome && labelCat(p.stroke_category) === label && p.player_id === 'J2'),
    total
  ]).sort((a,b) => Number(b[3] || 0) - Number(a[3] || 0));
  return rows.filter(r => r[3] > 0).slice(0,maxRows);
}
function playerCompareRowsTyped(points, definitions, maxRows=7){
  const rows = definitions.flatMap(def =>
    categoryRows(points, def.outcome).map(([label,total]) => [
      def.label,
      label,
      count(points, p => p.outcome === def.outcome && labelCat(p.stroke_category) === label && p.player_id === 'J1'),
      count(points, p => p.outcome === def.outcome && labelCat(p.stroke_category) === label && p.player_id === 'J2'),
      total
    ])
  ).sort((a,b) => Number(b[4] || 0) - Number(a[4] || 0));

  return rows.filter(r => Number(r[4] || 0) > 0).slice(0,maxRows);
}

function strokeLabel(p){
  const cat = labelCat(p.stroke_category);
  const type = safeText(p.stroke_type, 'Sin golpe');
  return `${cat} · ${type}`;
}
function filterCourt(points, courtGroup){
  if(courtGroup === 'BACK') return points.filter(p => BACK_CATS.includes(p.stroke_category));
  if(courtGroup === 'NET') return points.filter(p => NET_CATS.includes(p.stroke_category));
  return points;
}
function highlightedGeneralRows(columns, outcomes, courtGroup, maxRows=8){
  const allowed = Array.isArray(outcomes) ? outcomes : [outcomes];
  const totalPoints = filterCourt(columns.at(-1)?.points || [], courtGroup)
    .filter(p => allowed.includes(p.outcome) && p.stroke_category && p.stroke_type);

  const totals = new Map();
  totalPoints.forEach(p => {
    const key = strokeLabel(p);
    totals.set(key, (totals.get(key) || 0) + 1);
  });

  const labels = [...totals.entries()]
    .filter(([,total]) => total > 1)
    .sort((a,b) => b[1] - a[1])
    .map(([label]) => label);

  const rows = labels.map(label => {
    const values = columns.map(c => {
      const pts = filterCourt(c.points || [], courtGroup);
      return count(pts, p => allowed.includes(p.outcome) && p.stroke_category && p.stroke_type && strokeLabel(p) === label);
    });
    return [label, ...values];
  });

  return rows
    .filter(r => Number(r.at(-1) || 0) > 1)
    .slice(0,maxRows);
}
function highlightedPlayerRows(sets, allPoints, outcomes, courtGroup){
  // Golpes destacados del PDF: NO usa la estrellita/highlight.
  // Agrupa todos los golpes registrados con total > 0 y los ordena por total descendente.
  const allowed = Array.isArray(outcomes) ? outcomes : [outcomes];
  const base = filterCourt(allPoints || [], courtGroup)
    .filter(p => allowed.includes(p.outcome) && p.stroke_category && p.stroke_type && ['J1','J2'].includes(p.player_id));

  const totals = new Map();
  base.forEach(p => {
    const key = strokeLabel(p);
    if(!totals.has(key)) totals.set(key, {total:0, j1:0, j2:0});
    const item = totals.get(key);
    item.total++;
    if(p.player_id === 'J1') item.j1++;
    if(p.player_id === 'J2') item.j2++;
  });

  const labels = [...totals.entries()]
    .filter(([,t]) => (t.j1 + t.j2) > 0)
    .sort((a,b) => b[1].total - a[1].total || a[0].localeCompare(b[0]))
    .map(([label]) => label);

  return labels.map(label => {
    const values = [];
    let totalJ1 = 0;
    let totalJ2 = 0;

    sets.forEach(set => {
      const setPts = base.filter(p => p.set_id === set.id && strokeLabel(p) === label);
      const j1 = count(setPts, p => p.player_id === 'J1');
      const j2 = count(setPts, p => p.player_id === 'J2');
      values.push(j1, j2);
      totalJ1 += j1;
      totalJ2 += j2;
    });

    return [label, ...values, totalJ1, totalJ2];
  });
}
function highlightedGeneralHeaders(columns){
  return ['Golpe', ...columns.map(c => c.label.replace('Partido total','TOTAL'))];
}
function highlightedPlayerHeaders(sets){
  return [
    'Golpe',
    ...sets.flatMap((s,idx) => [`${setTitle(s,idx)} J1`, `${setTitle(s,idx)} J2`]),
    'TOTAL J1',
    'TOTAL J2'
  ];
}
function serviceRows(points, mode='SERVE'){
  const isServe = mode === 'SERVE';
  return ['1º','2º'].map(num => {
    const list = points.filter(p => (isServe ? isOurServer(p.server) : isRivalServer(p.server)) && p.serve_number === num);
    const won = count(list, p => p.point_result === 'WON');
    const lost = count(list, p => p.point_result === 'LOST');
    return [`${num} ${isServe ? 'saque' : 'resto'}`, list.length, won, lost, `${pct(won,list.length)}%`];
  });
}
function serveNumberMatches(value, num){
  const raw = String(value || '').trim().toUpperCase();
  if(num === '1º') return ['1','1º','1O','PRIMERO','PRIMER'].includes(raw);
  if(num === '2º') return ['2','2º','2O','SEGUNDO','SEGUNDA'].includes(raw);
  return raw === String(num || '').trim().toUpperCase();
}
function explicitReturnPlayer(p){
  const candidates = [p.returner_id, p.receiver_id, p.return_player_id, p.returner, p.receiver];
  const found = candidates.find(v => ['J1','J2'].includes(String(v || '').trim().toUpperCase()));
  return found ? String(found).trim().toUpperCase() : '';
}
function serviceCompareRows(points, mode='SERVE'){
  const isServe = mode === 'SERVE';

  if(isServe){
    // Servicio por jugador: se calcula por p.server.
    // player_id NO sirve aquí, porque representa el jugador del golpe final.
    return ['J1','J2'].flatMap(player => ['1º','2º'].map(num => {
      const list = points.filter(p => p.server === player && serveNumberMatches(p.serve_number, num));
      const won = count(list, p => p.point_result === 'WON');
      return [player, `${num}`, list.length, won, `${pct(won,list.length)}%`];
    })).filter(r => r[2] > 0);
  }

  const hasExplicitReturner = points.some(p => explicitReturnPlayer(p));
  if(hasExplicitReturner){
    return ['J1','J2'].flatMap(player => ['1º','2º'].map(num => {
      const list = points.filter(p =>
        explicitReturnPlayer(p) === player &&
        isRivalServer(p.server) &&
        serveNumberMatches(p.serve_number, num)
      );
      const won = count(list, p => p.point_result === 'WON');
      return [player, `${num}`, list.length, won, `${pct(won,list.length)}%`];
    })).filter(r => r[2] > 0);
  }

  // Sin campo de restador en el CSV no se puede separar J1/J2 de forma fiable.
  // En ese caso mostramos el rendimiento de la pareja al resto para no falsear datos con player_id.
  return ['1º','2º'].map(num => {
    const list = points.filter(p => isRivalServer(p.server) && serveNumberMatches(p.serve_number, num));
    const won = count(list, p => p.point_result === 'WON');
    return ['Pareja', `${num}`, list.length, won, `${pct(won,list.length)}%`];
  }).filter(r => r[2] > 0);
}

async function imageDataUrl(src){
  try{
    const res = await fetch(src);
    const blob = await res.blob();
    return await new Promise(resolve => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  }catch(_err){ return null; }
}
function sectionTitle(doc, title, x, y, w, color=GREEN){
  doc.setFillColor(...color);
  doc.roundedRect(x,y,w,10,2.5,2.5,'F');
  doc.setFont('helvetica','bold');
  doc.setFontSize(5.2);
  doc.setTextColor(255,255,255);
  doc.text(title,x+4,y+7);
  doc.setTextColor(0,0,0);
}
function drawTable(doc, {x, y, w, head, body, color=GREEN, fontSize=5.3, rowHeight=10, headerHeight=11, alternate=true}){
  if(!body.length) body = [['Sin datos', ...head.slice(1).map(() => '-')]];
  doc.autoTable({
    startY:y,
    margin:{left:x,right:842-x-w},
    tableWidth:w,
    head:[head],
    body,
    theme:'grid',
    styles:{fontSize, cellPadding:{top:0.45,right:1.3,bottom:0.45,left:1.3}, lineColor:LINE, lineWidth:0.3, minCellHeight:rowHeight, overflow:'ellipsize', valign:'middle'},
    headStyles:{fillColor:color, textColor:255, fontStyle:'bold', minCellHeight:headerHeight},
    alternateRowStyles: alternate ? {fillColor:[252,250,246]} : {},
    columnStyles:{0:{cellWidth:Math.max(48, w * 0.34), fontStyle:'bold'}},
    pageBreak:'avoid',
    rowPageBreak:'avoid',
    didParseCell:data => {
      if(data.section === 'body' && data.column.index > 0){ data.cell.styles.halign = 'center'; }
      if(data.section === 'head' && data.column.index > 0){ data.cell.styles.halign = 'center'; }
    }
  });
  return doc.lastAutoTable.finalY;
}
function drawSmallBlock(doc, title, rows, x, y, w, color=GREEN, maxRows=5){
  sectionTitle(doc,title,x,y,w,color);
  return drawTable(doc,{x,y:y+15,w,head:['Concepto','Total','★','J1','J2'],body:rows.slice(0,maxRows),color,fontSize:4.9,rowHeight:8.6,headerHeight:9});
}
function drawMiniStats(doc, title, head, rows, x, y, w, color=BLUE){
  sectionTitle(doc,title,x,y,w,color);
  return drawTable(doc,{x,y:y+11,w,head,body:rows,color,fontSize:3.7,rowHeight:5.4,headerHeight:6.3});
}

export async function downloadPDF(points, match, name='santiset-informe.pdf'){
  const {jsPDF} = window.jspdf;
  const doc = new jsPDF({unit:'pt',format:'a4',orientation:'landscape'});
  const db = loadDB();
  const sets = matchSets(db, match?.id).sort((a,b)=>(a.set_number||0)-(b.set_number||0));
  const allPoints = db.points.filter(p => p.match_id === match?.id);
  const columns = summaryColumns(db, sets, match?.id);
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  const usableW = pageW - margin*2;

  // Una sola página: cabecera mínima y tablas compactas.
  doc.setFillColor(...WHITE);
  doc.rect(0,0,pageW,pageH,'F');
  doc.setFillColor(...LIGHT);
  doc.roundedRect(margin,10,usableW,30,7,7,'F');

  const logo = await imageDataUrl('assets/images/logo-santiset-round.png') || await imageDataUrl('assets/images/logo-santiset.jpg');
  if(logo){
    try{ doc.addImage(logo,'PNG',20,15,20,20); }catch(_err){ try{ doc.addImage(logo,'JPEG',20,15,20,20); }catch(_e){} }
  }

  doc.setFont('helvetica','bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...GREEN);
  doc.text('SantiSet',45,22);
  doc.setFontSize(4.8);
  doc.setFont('helvetica','normal');
  doc.setTextColor(80,80,80);
  doc.text('Informe compacto',45,31);

  const title = `${safeText(match?.partner_name,'Compañero')} vs ${safeText(match?.rival_name,'Rivales')}`;
  doc.setFont('helvetica','bold');
  doc.setFontSize(9.5);
  doc.setTextColor(35,32,28);
  doc.text(title,pageW/2,22,{align:'center'});
  doc.setFontSize(5.8);
  doc.setFont('helvetica','normal');
  doc.setTextColor(80,80,80);
  doc.text(`Resultado: ${resultLine(sets)} · ${new Date(match?.date || match?.created_at || Date.now()).toLocaleDateString('es-ES')}`,pageW/2,32,{align:'center'});

  const headers = ['Métrica', ...columns.map(c => c.label.replace('Partido total','TOTAL'))];
  const summaryBody = [
    ['Ptos jugados', ...columns.map(c => c.summary.pointsPlayed)],
    ['Ptos ganados', ...columns.map(c => c.summary.pointsWon)],
    ['Break a favor', ...columns.map(c => c.summary.breakFor)],
    ['Break en contra', ...columns.map(c => c.summary.breakAgainst)],
    ['Winners', ...columns.map(c => c.summary.winners)],
    ['Unforced errors', ...columns.map(c => c.summary.unforced)]
  ];

  sectionTitle(doc,'RESUMEN DEL PARTIDO',margin,45,usableW,GREEN);
  let y = drawTable(doc,{x:margin,y:59,w:usableW,head:headers,body:summaryBody,color:GREEN,fontSize:4.8,rowHeight:7.2,headerHeight:8.1});

  const leftX = margin;
  const rightX = margin + usableW/2 + 4;
  const colW = usableW/2 - 4;
  const headBySet = ['Categoría', ...columns.map(c => c.label.replace('Partido total','TOTAL'))];

  y += 6;
  let yL = y;
  let yR = y;

  sectionTitle(doc,'BLOQUE GENERAL - PUNTOS GANADOS',leftX,yL,colW,GREEN_2);
  yL = drawTable(doc,{x:leftX,y:yL+11,w:colW,head:headBySet,body:tableRowsBySet(columns,'RIVAL_ERRORS',5),color:GREEN_2,fontSize:3.9,rowHeight:6.4,headerHeight:7.2});
  yL = drawTable(doc,{x:leftX,y:yL+3,w:colW,head:headBySet,body:tableRowsBySet(columns,'WINNERS',6),color:GREEN_2,fontSize:3.9,rowHeight:6.4,headerHeight:7.2});

  sectionTitle(doc,'BLOQUE GENERAL - PUNTOS PERDIDOS',rightX,yR,colW,RED);
  yR = drawTable(doc,{x:rightX,y:yR+11,w:colW,head:headBySet,body:tableRowsBySet(columns,'OWN_ERRORS',6),color:RED,fontSize:3.9,rowHeight:6.4,headerHeight:7.2});
  yR = drawTable(doc,{x:rightX,y:yR+3,w:colW,head:headBySet,body:tableRowsBySet(columns,'RIVAL_WINNERS',6),color:RED,fontSize:3.9,rowHeight:6.4,headerHeight:7.2});

  y = Math.max(yL,yR) + 5;
  const halfW = usableW/2 - 4;
  const leftHalfX = margin;
  const rightHalfX = margin + usableW/2 + 4;

  sectionTitle(doc,'POR JUGADOR - PUNTOS GANADOS',leftHalfX,y,halfW,GREEN);
  const yJG = drawTable(doc,{x:leftHalfX,y:y+11,w:halfW,head:['Categoría','J1','J2','TOTAL'],body:playerCompareRows(allPoints,OUTCOMES.WINNER_OR_FORCED,6),color:GREEN,fontSize:3.9,rowHeight:6.2,headerHeight:7.1});
  sectionTitle(doc,'POR JUGADOR - PUNTOS PERDIDOS',rightHalfX,y,halfW,RED);
  const yJP = drawTable(doc,{
    x:rightHalfX,
    y:y+11,
    w:halfW,
    head:['Tipo','Categoría','J1','J2','TOTAL'],
    body:playerCompareRowsTyped(allPoints,[
      {label:'ENF propio', outcome:OUTCOMES.OWN_UNFORCED_ERROR},
      {label:'W rival/F propio', outcome:OUTCOMES.RIVAL_WINNER_OR_OWN_FORCED}
    ],7),
    color:RED,
    fontSize:3.65,
    rowHeight:6.0,
    headerHeight:7.0
  });

  y = Math.max(yJG,yJP) + 5;
  const playerHighlightHead = highlightedPlayerHeaders(sets);

  // Paneles de golpes: comparativa por jugador, sin usar estrella/highlight.
  // Se muestran todos los golpes registrados con total > 0, ordenados de mayor a menor.
  sectionTitle(doc,'GOLPES GANADOS - FONDO',leftHalfX,y,halfW,GREEN_2);
  const yGF = drawTable(doc,{x:leftHalfX,y:y+11,w:halfW,head:playerHighlightHead,body:highlightedPlayerRows(sets,allPoints,OUTCOMES.WINNER_OR_FORCED,'BACK'),color:GREEN_2,fontSize:3.05,rowHeight:5.3,headerHeight:6.4});
  sectionTitle(doc,'GOLPES GANADOS - RED',rightHalfX,y,halfW,TEAL);
  const yGR = drawTable(doc,{x:rightHalfX,y:y+11,w:halfW,head:playerHighlightHead,body:highlightedPlayerRows(sets,allPoints,OUTCOMES.WINNER_OR_FORCED,'NET'),color:TEAL,fontSize:3.05,rowHeight:5.3,headerHeight:6.4});

  y = Math.max(yGF,yGR) + 4;
  sectionTitle(doc,'GOLPES PERDIDOS - FONDO',leftHalfX,y,halfW,ORANGE);
  const yPF = drawTable(doc,{x:leftHalfX,y:y+11,w:halfW,head:playerHighlightHead,body:highlightedPlayerRows(sets,allPoints,[OUTCOMES.OWN_UNFORCED_ERROR,OUTCOMES.RIVAL_WINNER_OR_OWN_FORCED],'BACK'),color:ORANGE,fontSize:3.05,rowHeight:5.3,headerHeight:6.4});
  sectionTitle(doc,'GOLPES PERDIDOS - RED',rightHalfX,y,halfW,PURPLE);
  const yPR = drawTable(doc,{x:rightHalfX,y:y+11,w:halfW,head:playerHighlightHead,body:highlightedPlayerRows(sets,allPoints,[OUTCOMES.OWN_UNFORCED_ERROR,OUTCOMES.RIVAL_WINNER_OR_OWN_FORCED],'NET'),color:PURPLE,fontSize:3.05,rowHeight:5.3,headerHeight:6.4});

  y = Math.max(yPF,yPR) + 5;
  const serviceY = Math.min(y, pageH - 52);
  drawMiniStats(doc,'COMPARATIVA JUGADORES - SERVICIO',['Jugador','Saq.','Jug.','Gan.','%'],serviceCompareRows(allPoints,'SERVE'),leftHalfX,serviceY,halfW,BLUE);
  drawMiniStats(doc,'COMPARATIVA JUGADORES - RESTO',['Jugador','Resto','Jug.','Gan.','%'],serviceCompareRows(allPoints,'RETURN'),rightHalfX,serviceY,halfW,INDIGO);

  doc.setFont('helvetica','normal');
  doc.setFontSize(4.8);
  doc.setTextColor(120,120,120);
  doc.text('Break point: convertidos/oportunidades. Golpes: total > 0, sin usar la estrella. Resto por jugador solo si el CSV trae restador explícito.', pageW/2, pageH - 8, {align:'center'});

  // Descarga directa; no se abre vista previa ni iframe.
  doc.save(name);
}
