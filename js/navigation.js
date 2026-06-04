import {icon} from './icons.js';
export function nav(active){
  const items=[
    ['index.html',    icon('home',22),         'Inicio',    'home'],
    ['dashboard.html',icon('barChart',22),      'Dashboard', 'dash'],
    ['analyze.html',  icon('plusCircle',26),    'Analizar',  'analyze'],
    ['matches.html',  icon('trophy',22),        'Partidos',  'matches'],
    ['events.html',   icon('zap',22),           'Eventos',   'events'],
  ];
  return `<nav class="bottom-nav">${items.map(([href,ico,txt,key])=>`<a class="${key===active?'active ':''}${key==='analyze'?'analyze':''}" href="${href}"><span class="nav-icon">${ico}</span><small>${txt}</small></a>`).join('')}</nav>`;
}
export function mountNav(active){ document.body.insertAdjacentHTML('beforeend', nav(active)); }
