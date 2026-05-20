export function nav(active){
  const items=[['index.html','⌂','Inicio','home'],['dashboard.html','▥','Dashboard','dash'],['analyze.html','+','Analizar','analyze'],['matches.html','▣','Partidos','matches'],['events.html','🎾','Eventos','events']];
  return `<nav class="bottom-nav">${items.map(([href,ico,txt,key])=>`<a class="${key===active?'active ':''}${key==='analyze'?'analyze':''}" href="${href}"><span>${ico}</span><small>${txt}</small></a>`).join('')}</nav>`;
}
export function mountNav(active){ document.body.insertAdjacentHTML('beforeend', nav(active)); }
