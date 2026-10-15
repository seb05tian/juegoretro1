# VOID PULSE: Neon Rebellion

Shooter arcade vertical de un jugador. AETHER-01 combate cinco sectores de máquinas hostiles y puede convertir proyectiles con su Pulso de Resonancia. Los gráficos, la nave, los enemigos, el jefe y los efectos se dibujan con vectores originales; el audio se sintetiza con Web Audio. El juego no solicita registro ni descarga recursos al iniciarse.

## Ejecutar

Requiere Node.js 20.19 o posterior y npm. En Windows, desde esta carpeta:

```powershell
npm.cmd install
npm.cmd run dev
```

Abre la dirección local que indique Vite. Para verificar y compilar:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build
npm.cmd run test:production
```

Las pruebas de navegador de Chromium y WebKit se ejecutan con:

```powershell
npm.cmd exec playwright install chromium webkit
npm.cmd run test:e2e
```

Vite sirve el build local sin servicios de terceros. Para alojarlo, publica el contenido de `dist/` en cualquier servidor estático.

## Controles

El disparo normal lanza un proyectil recto y centrado. A los 20 s cae una caja regalo y luego cada 30 s; al recogerla, da triple disparo durante 12 s.

Desde el menú principal, **Personalizar** abre la previsualización de AETHER-01 con ocho paletas: AETHER, ECLIPSE, VERDANT, SOLAR, CRIMSON, ABYSS, AURORA y LUMEN. La nave de muestra cambia al elegir una opción, y la selección se aplica al combate y se guarda en `localStorage`.

- **Mover:** WASD o flechas. Las diagonales conservan la misma velocidad.
- **Disparar:** Espacio o Z. El disparo comparte un ciclo de 180 ms.
- **Pulso de Resonancia:** X o botón táctil al reunir 100 de energía.
- **Pausa:** Escape, P o el botón superior.
- **Silenciar:** M. Música y efectos tienen volumen separado en Ajustes.
- **Móvil:** arrastra para mover; fuego automático activo inicialmente.

El pulso protege durante 250 ms y convierte hasta 12 proyectiles dentro del radio. El escudo recoge un impacto; las mejoras de disparo caducan y la reparación respeta el máximo de vida.

## Estructura

- `src/main.ts`: configuración de Phaser 4.2.1 y entrada del navegador.
- `src/scenes/GameScene.ts`: ciclo de combate, movimiento, colisiones, oleadas y jefe; renderiza entidades y fondos con geometría vectorial.
- `src/systems/logic.ts`: reglas puras de movimiento, cadencia, daño, pulso, combos, fases y semilla aleatoria.
- `src/systems/audio.ts`: música ambiente y efectos generados localmente con Web Audio.
- `src/systems/persistence.ts`: preferencias y récord local en `localStorage`.
- `src/ui/Overlay.ts` y `src/style.css`: menú, controles, ajustes, pausa, resultado y botones táctiles.
- `tests/` y `e2e/`: pruebas unitarias y pruebas de navegador para Chromium de escritorio y WebKit móvil.

## Verificación y límites conocidos

La configuración inicial se validó con Node.js 24, Phaser 4.2.1, TypeScript, Vitest y Playwright. Las capturas E2E del menú y del combate se guardan en `artifacts/`.

La comprobación de WebKit se hace en la versión de WebKit que Playwright distribuye para Windows; no reemplaza una prueba en iPhone físico. El objetivo de 5–8 minutos y el balance de dificultad necesitan sesiones largas de juego humano para quedar medidos. La música es una secuencia sintetizada ambiental, no una pista compuesta. Phaser añade un bundle inicial grande (alrededor de 1.43 MB sin comprimir; 385 KB gzip en el build observado).

## Próxima versión

Medir y ajustar la duración por sector con sesiones de juego, añadir más variantes de patrones, configurar dificultad, ampliar opciones de accesibilidad y comparar rendimiento en dispositivos móviles físicos.
