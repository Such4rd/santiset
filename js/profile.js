import {loadDB, saveSettings, exportDB, importDB} from './storage.js';
import {mountNav} from './navigation.js';
const db=loadDB(); ['player_j1_name','player_j2_name','our_pair_name','export_title'].forEach(k=>{document.querySelector(`[name=${k}]`).value=db.settings[k]||''});
document.querySelector('#save').addEventListener('click',()=>{ const data=Object.fromEntries(new FormData(document.querySelector('form')).entries()); saveSettings(data); alert('Ajustes guardados'); });
document.querySelector('#exportJson').addEventListener('click',()=>{ const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([exportDB()],{type:'application/json'})); a.download='santiset-backup.json'; a.click(); });
document.querySelector('#importJson').addEventListener('change',async e=>{ const file=e.target.files[0]; if(file){ importDB(await file.text()); location.reload(); }});
document.querySelector('#wipe').addEventListener('click',()=>{ if(confirm('Borrar todos los datos locales?')){localStorage.clear(); location.href='index.html';} });
mountNav('profile');
