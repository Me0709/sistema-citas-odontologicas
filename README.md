# Sistema inteligente para la gestión dinámica de citas odontológicas

API REST (NestJS + TypeScript) para programar citas odontológicas y reordenar la agenda del día
cuando hay retrasos, cancelaciones o inasistencias.

## Requisitos

- Node.js 20 o superior
- PostgreSQL 14 o superior (base de datos `citas`)

## Configuración

Copiar `.env.example` a `.env` y ajustar las credenciales de PostgreSQL.

## Comandos

```bash
npm ci              # instalar dependencias
npm run start:dev   # servidor en desarrollo (http://localhost:3000)
npm run lint        # análisis estático
npm run build       # compilar
npm test            # pruebas unitarias
npm run test:cov    # pruebas unitarias con cobertura (mínimo 80 %)
npm run test:e2e    # pruebas de aceptación sobre la API
```

## Estructura

```
src/
  base-de-datos/  conexión a PostgreSQL (TypeORM)
  comun/      componentes compartidos (p. ej. Reloj inyectable)
  salud/      endpoint GET /salud
test/         pruebas de aceptación (*.e2e-spec.ts)
```

Las pruebas unitarias van junto al código (`*.spec.ts`).

## Flujo de trabajo

- Ramas: `main` (estable), `develop` (integración) y una rama por historia: `feature/HU-XX-descripcion`.
- Todo cambio entra a `develop` mediante Pull Request revisado por otro integrante y con el CI en verde.
- Commits con formato Conventional Commits: `feat(HU-04): programar cita`, `test(HU-04): ...`, `fix: ...`.
- Los PR se fusionan con «Create a merge commit».

## Integración continua

El flujo de [GitHub Actions](.github/workflows/ci.yml) ejecuta en cada push y Pull Request:
instalación, lint, compilación, pruebas unitarias con cobertura y pruebas de aceptación
(con un servicio PostgreSQL).
