export const STORAGE_KEY = 'santiset.v1';
export const CATEGORIES = {
  SAQUE: ['saque t','saque cristal','resto'],
  DERECHA: ['cruzada','paralela','centro','globo sin cristal'],
  REVES: ['cruzada','paralela','centro','globo sin cristal'],
  VOLEA_DERECHA: ['alta paralela','alta cruzada','baja paralela','baja cruzada'],
  VOLEA_REVES: ['alta paralela','alta cruzada','baja paralela','baja cruzada'],
  ESP_FONDO: ['bajada derecha','bajada reves','chiquita cruzada','chiquita paralela','contrarremate','globo con cristal'],
  ESP_RED: ['bandeja paralela','bandeja cruzada','x3','remate','rulo','dejada','batalla ataque','batalla defensa']
};
export const CATEGORY_LABELS = {
  SAQUE: 'SAQUE', DERECHA: 'DERECHA', REVES: 'REVÉS', VOLEA_DERECHA: 'VOLEA DERECHA', VOLEA_REVES: 'VOLEA REVÉS', ESP_FONDO: 'ESP FONDO', ESP_RED: 'ESP RED'
};
export const OUTCOMES = {
  RIVAL_UNFORCED_ERROR: 'RIVAL_UNFORCED_ERROR',
  WINNER_OR_FORCED: 'WINNER_OR_FORCED',
  OWN_UNFORCED_ERROR: 'OWN_UNFORCED_ERROR',
  RIVAL_WINNER_OR_OWN_FORCED: 'RIVAL_WINNER_OR_OWN_FORCED'
};
export const CSV_COLUMNS = ['timestamp','point_id','cause_key','point_result','player_id','player_team','stroke_category','stroke_type','outcome','rally','server','serve_number','serve_direction','court_zone','point_duration_seconds','deuce_mode','our_games_after','rival_games_after','our_points_after','rival_points_after','highlight'];
export const DEFAULT_SETTINGS = { player_j1_name:'Revés', player_j2_name:'Derecha', our_pair_name:'Tu pareja', export_title:'Informe SantiSet' };
