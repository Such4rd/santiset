# SantiSet

App web estática mobile-first para registrar eventos de pádel en directo y analizar el rendimiento de una pareja.

## Uso local

1. Abre `index.html` directamente en el navegador, o sirve la carpeta con un servidor estático:

```bash
python -m http.server 8000
```

2. Entra en `http://localhost:8000`.

## GitHub Pages

Sube todo el contenido de esta carpeta a un repositorio y activa Pages desde la rama principal.

## Funcionalidades incluidas

- Registro rápido de puntos desde `analyze.html`.
- Marcador con ventajas y punto de oro.
- Toggle de servidor, primer/segundo saque, rally y destacado `0/1`.
- Zona NF rival siempre visible.
- Catálogo completo de golpes normalizado.
- Persistencia local con `localStorage`.
- Dashboard con KPIs, servicio/resto, jugadores, golpes, rally y zonas.
- Exportación CSV legacy con columnas exactas.
- Exportación PDF con jsPDF + autoTable.
- Backup/importación JSON.

## Preparado para Supabase

El modelo local ya separa `matches`, `sets` y `points`, con claves `match_id` y `set_id`, para migrar después a PostgreSQL/Supabase.

## Cambios v4
- Marcador con cierre de set: 6 juegos con ventaja de 2.
- Tie-break automático a 7 puntos con ventaja de 2 si el set llega a 6-6.
- Historial de sets en el marcador: sets ganados en verde y perdidos en rojo.
- Pantalla Mis Partidos con resultado de todos los sets.
- Guardado de set en partido actual, creación de nuevo partido y opción Guardar y nuevo set.
- Opción Añadir set desde la pantalla de partidos.

## Cambios v13

- Logo SantiSet aplicado en todas las pantallas y como favicon.
- Al finalizar un set, si se registra otro punto se crea automáticamente el siguiente set del partido activo.
- Si el cronómetro está corriendo, se bloquea la navegación interna y se solicita detenerlo antes de cambiar de pantalla.
- Importación CSV más tolerante con categorías legacy: `ESP RED`, `esp. red`, `especiales red`, `Volea revés`, `Revés`, etc.
- Cada set mantiene su propio enlace de YouTube.
