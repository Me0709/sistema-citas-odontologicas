# Sistema inteligente para la gestión dinámica de citas odontológicas

API REST (NestJS + TypeScript) para programar citas odontológicas y reordenar la agenda del día
cuando hay retrasos, cancelaciones o inasistencias.

## Requisitos

- Node.js 20 o superior
- PostgreSQL 14 o superior, con dos bases de datos: `citas` (desarrollo) y `citas_test` (pruebas de aceptación)

## Configuración

Copiar `.env.example` a `.env` y ajustar las credenciales de PostgreSQL.

Para que las tablas se creen solas en el entorno de desarrollo, agregar `DB_SYNC=true` al `.env`.
Las pruebas de aceptación ya lo activan y usan la base `citas_test`.

## Comandos

```bash
npm ci              # instalar dependencias
npm run start:dev   # servidor en desarrollo (http://localhost:3000)
npm run lint        # análisis estático
npm run build       # compilar
npm test            # pruebas unitarias
npm run test:cov    # pruebas unitarias con cobertura (mínimo 80 %)
npm run test:e2e    # pruebas de aceptación sobre la API
npm run demo:datos  # carga datos de ejemplo en el servidor en ejecución
```

## Interfaz web

Con el servidor en marcha, la interfaz queda en `http://localhost:3000/`. Es una aplicación estática
(`public/`, JavaScript sin dependencias ni paso de compilación) que consume la misma API y se adapta
a escritorio y celular. Permite ver y operar la agenda del día (llegada, atención, retrasos,
cancelaciones, flexibilidad, propuestas de nuevo horario y análisis de alternativas), programar citas,
gestionar pacientes y procedimientos, configurar el horario de atención y consultar los avisos.

Para verla con datos de ejemplo: `npm run start:dev` y, en otra terminal, `npm run demo:datos`
(solo sobre una base de desarrollo vacía).

## Estructura

```
src/
  base-de-datos/   conexión a PostgreSQL (TypeORM)
  comun/           Reloj inyectable, bus de eventos de la agenda y utilidades de tiempo
  procedimientos/  catálogo de procedimientos (HU-01)
  pacientes/       registro de pacientes e historial de citas (HU-02)
  disponibilidad/  horario semanal del odontólogo (HU-03)
  citas/           programación, llegada, atención, aviso de retraso, cancelación e inasistencia
                   (HU-04, HU-06, HU-07, HU-08)
  flexibilidad/    preferencia de horario del paciente (HU-05)
  estimacion/      hora estimada en tiempo real y notificaciones (HU-09)
  reordenamiento/  alternativas de reprogramación y su evaluación automática (HU-10)
  reprogramacion/  propuestas de nuevo horario: confirmar o rechazar (HU-11)
  agenda/          agenda diaria del odontólogo (HU-12)
  salud/           endpoint GET /salud
  interfaz/        publicación de la interfaz web
public/            interfaz web (HTML, CSS y módulos JS)
scripts/           datos de demostración
test/              pruebas de aceptación (*.e2e-spec.ts)
```

Las pruebas unitarias van junto al código (`*.spec.ts`). Las reglas de reprogramación están
aisladas como funciones puras en `src/reordenamiento/dominio`.

## API

| Recurso | Rutas |
|---|---|
| Procedimientos | `POST /procedimientos`, `GET /procedimientos`, `GET /procedimientos/:id`, `PATCH /procedimientos/:id`, `PATCH /procedimientos/:id/desactivar` |
| Pacientes | `POST /pacientes`, `GET /pacientes`, `GET /pacientes/:id` |
| Disponibilidad | `PUT /disponibilidad`, `GET /disponibilidad`, `GET /disponibilidad/espacios` |
| Citas | `POST /citas`, `GET /citas`, `GET /citas/:id` |
| Flexibilidad | `PUT /citas/:id/flexibilidad`, `GET /citas/:id/flexibilidad` |
| Jornada | `POST /citas/:id/llegada`, `POST /citas/:id/inicio-atencion`, `POST /citas/:id/fin-atencion` |
| Incidencias | `POST /citas/:id/aviso-retraso`, `POST /citas/:id/cancelacion`, `POST /citas/:id/inasistencia` |
| Hora estimada | `GET /citas/:id/hora-estimada`, `GET /notificaciones` |
| Agenda | `GET /agenda?fecha=AAAA-MM-DD`, `POST /agenda/alternativas` |
| Reprogramación | `POST /citas/:id/propuestas-reprogramacion`, `GET /propuestas-reprogramacion/:id`, `POST /propuestas-reprogramacion/:id/aceptacion`, `POST /propuestas-reprogramacion/:id/rechazo`, `POST /propuestas-reprogramacion/vencimientos` |

## Limitaciones conocidas

- Las notificaciones quedan registradas en el sistema (`GET /notificaciones`); no hay un proveedor real de correo o SMS.
- La hora estimada de un paciente flexible puede adelantarse hasta dentro del descanso del odontólogo (por ejemplo, de las 14:00 a las 12:15), porque el recálculo no considera el horario de atención.
- La inasistencia se registra a mano; no hay un proceso programado que la marque al vencer el tiempo de espera.
- El sistema asume un solo odontólogo y una sola agenda.
- Las alternativas de reprogramación se calculan para la agenda del día y no se convierten automáticamente en propuestas de la HU-11.

## Flujo de trabajo

- Ramas: `main` (estable), `develop` (integración) y una rama por historia: `feature/HU-XX-descripcion`.
- Todo cambio entra a `develop` mediante Pull Request revisado por otro integrante y con el CI en verde.
- Commits con formato Conventional Commits: `feat(HU-04): programar cita`, `test(HU-04): ...`, `fix: ...`.
- Los PR se fusionan con «Create a merge commit».

## Integración continua

El flujo de [GitHub Actions](.github/workflows/ci.yml) ejecuta en cada push y Pull Request:
instalación, lint, compilación, pruebas unitarias con cobertura y pruebas de aceptación
(con un servicio PostgreSQL).
