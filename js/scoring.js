const seq = [0,15,30,40];
export function pointLabel(idx, ad){ return ad ? 'AD' : (seq[idx] ?? 40); }
export function initialScore(){
  return {ourGames:0,rivalGames:0,ourPoint:0,rivalPoint:0,ad:null,inTiebreak:false,setFinished:false,setWinner:null};
}
export function applyPoint(score, result, mode='ADVANTAGE'){
  const s = {...score};
  if(s.setFinished) return s;
  const ours = result === 'WON';

  if(s.inTiebreak){
    if(ours) s.ourPoint++; else s.rivalPoint++;
    if((s.ourPoint >= 7 || s.rivalPoint >= 7) && Math.abs(s.ourPoint - s.rivalPoint) >= 2){
      if(ours) s.ourGames++; else s.rivalGames++;
      s.setFinished = true;
      s.setWinner = ours ? 'OUR' : 'RIVAL';
    }
    return s;
  }

  if(mode === 'GOLDEN_POINT' && s.ourPoint >= 3 && s.rivalPoint >= 3){ return gameTo(s, ours); }
  if(mode === 'ADVANTAGE' && s.ourPoint >= 3 && s.rivalPoint >= 3){
    if(!s.ad){ s.ad = ours ? 'OUR' : 'RIVAL'; return s; }
    if((s.ad === 'OUR' && ours) || (s.ad === 'RIVAL' && !ours)) return gameTo(s, ours);
    s.ad = null; return s;
  }
  if(ours) s.ourPoint++; else s.rivalPoint++;
  if(s.ourPoint >= 4 && s.ourPoint - s.rivalPoint >= 2) return gameTo(s,true);
  if(s.rivalPoint >= 4 && s.rivalPoint - s.ourPoint >= 2) return gameTo(s,false);
  return s;
}
function gameTo(s, ours){
  if(ours) s.ourGames++; else s.rivalGames++;
  s.ourPoint=0; s.rivalPoint=0; s.ad=null;
  if((s.ourGames >= 6 || s.rivalGames >= 6) && Math.abs(s.ourGames - s.rivalGames) >= 2){
    s.setFinished = true;
    s.setWinner = s.ourGames > s.rivalGames ? 'OUR' : 'RIVAL';
  } else if(s.ourGames === 6 && s.rivalGames === 6){
    s.inTiebreak = true;
  }
  return s;
}
export function scoreText(s, side){
  const own = side==='OUR';
  if(s.inTiebreak) return String(own ? s.ourPoint : s.rivalPoint);
  if(s.ad === (own?'OUR':'RIVAL')) return 'AD';
  return String(pointLabel(own?s.ourPoint:s.rivalPoint,false));
}
export function setScoreClass(set){
  if(!set) return 'live';
  const finished = !!set.finished_at || !!set.set_winner || ((Math.max(Number(set.our_games||0), Number(set.rival_games||0)) >= 6) && (Math.abs(Number(set.our_games||0)-Number(set.rival_games||0)) >= 2 || Math.max(Number(set.our_games||0), Number(set.rival_games||0)) === 7));
  if(!finished) return 'live';
  if(set.set_winner === 'OUR' || (Number(set.our_games || 0) > Number(set.rival_games || 0))) return 'won';
  if(set.set_winner === 'RIVAL' || (Number(set.our_games || 0) < Number(set.rival_games || 0))) return 'lost';
  return 'live';
}
export function setScoreText(set){ return `${set?.our_games ?? 0}-${set?.rival_games ?? 0}`; }
