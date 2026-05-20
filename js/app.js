import {mountNav} from './navigation.js';
import {loadDB, createMatch, importLegacySetToMatch} from './storage.js';
import {parseCSV} from './csv.js';
mountNav('home');
const $=s=>document.querySelector(s);
let pendingRows=null;
function ensureImportDialog(){
  if($('#homeImportDialog')) return;
  document.body.insertAdjacentHTML('beforeend',`<dialog id="homeImportDialog" class="sheet-dialog"><form method="dialog" class="sheet-card"><div class="sheet-head"><strong>Importar set CSV</strong><button type="button" class="sheet-close" data-close="homeImportDialog">×</button></div><p class="small">Elige si quieres añadir el set importado a un partido existente o crear uno nuevo.</p><label>Partido existente<select id="homeImportMatch" class="field"></select></label><label>Enlace YouTube del set<input id="homeExistingYoutube" class="field" placeholder="https://youtu.be/..."></label><button type="button" id="addImportToExisting" class="primary">Añadir a partido seleccionado</button><hr><label>Nueva pareja rival<input id="homeNewRival" class="field" placeholder="Pareja rival"></label><label>Compañero<input id="homeNewPartner" class="field" placeholder="Nombre compañero"></label><label>Enlace YouTube<input id="homeNewYoutube" class="field" placeholder="https://youtu.be/..."></label><button type="button" id="addImportToNew" class="orange">Crear partido e importar</button></form></dialog>`);
}
function openImportDialog(){ ensureImportDialog(); const db=loadDB(); $('#homeImportMatch').innerHTML=db.matches.map(m=>`<option value="${m.id}">${new Date(m.date||m.created_at||Date.now()).toLocaleDateString('es-ES')} · ${m.rival_name||'Sin rival'}</option>`).join(''); $('#homeImportDialog').showModal(); }
$('#importCsv')?.addEventListener('click',()=>$('#csvFile')?.click());
$('#csvFile')?.addEventListener('change',async e=>{ const file=e.target.files[0]; if(!file) return; pendingRows=parseCSV(await file.text()); e.target.value=''; openImportDialog(); });
document.addEventListener('click',e=>{ const b=e.target.closest('button'); if(!b) return; if(b.dataset.close) document.getElementById(b.dataset.close)?.close(); if(b.id==='addImportToExisting' && pendingRows){ const id=$('#homeImportMatch').value; if(id){ importLegacySetToMatch(id,pendingRows,true,{video_url:$('#homeExistingYoutube').value||''}); location.href='matches.html'; } } if(b.id==='addImportToNew' && pendingRows){ const m=createMatch({rival_name:$('#homeNewRival').value||'Partido importado',partner_name:$('#homeNewPartner').value||'',video_url:$('#homeNewYoutube').value||''},false); importLegacySetToMatch(m.id,pendingRows,true,{video_url:$('#homeNewYoutube').value||''}); location.href='matches.html'; } });
