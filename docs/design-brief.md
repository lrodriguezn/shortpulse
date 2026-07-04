# Brief de Diseño — ShortPulse Acortador de URLs (MVP)

> Fuente de verdad para el alcance, el comportamiento del producto y las decisiones de arquitectura. Derivado de la propuesta SDD, la exploración arquitectónica y las especificaciones de capacidad (`links`, `analytics`, `health`). Ante cualquier conflicto entre este brief y las especificaciones, prevalecen las especificaciones.

---

## 1. Resumen del Proyecto

**ShortPulse** es un acortador de URLs *greenfield*, **público (sin autenticación)** con analíticas por clic. Cualquiera puede crear un enlace corto; cualquiera puede seguir la redirección; la aplicación registra datos a nivel de clic (geolocalización, navegador, referer) para que un operador pueda ver totales y un panel.

**Definición en una línea:** crear enlaces cortos, redirigir y almacenar/visualizar analíticas de uso — sin cuentas, sin fricción.

**Objetivo de despliegue:** un VPS único vía Dokploy (un contenedor sirve API + SPA).

---

## 2. Problema y Objetivos

### Problema
Los enlaces cortos son infraestructura de commodity, pero la mayoría de las opciones auto-alojables están detrás de autenticación, carecen de analíticas o requieren despliegues multi-contenedor complejos inadecuados para un VPS único.

### Objetivos
- Entregar los tres comportamientos definitorios: **crear** enlaces cortos, **redirigir** y **almacenar/visualizar analíticas**.
- Mantener el sistema lo suficientemente simple para ejecutarse en un solo contenedor en un VPS.
- Garantizar la captura de analíticas en cada redirección (correctitud sobre optimización de latencia).
- Mantener ≥90% de cobertura de pruebas con TDD estricto.

### Criterios de Éxito
- [ ] El operador crea un enlace (slug personalizado o automático) desde `/` y lo ve en la lista.
- [ ] Seguir `/:slug` devuelve 302 a la URL original y registra un evento de analítica.
- [ ] Slug personalizado duplicado → 409 con `"Ese slug ya existe, prueba otro"`; slugs reservados y variantes por mayúsculas/minúsculas rechazados.
- [ ] DELETE realiza soft-delete; la redirección posterior → 404; el historial de analíticas se conserva y se renderiza con `(deleted link)`.
- [ ] `/analytics` muestra KPIs, gráfico de series temporales y eventos paginados.
- [ ] `pnpm build`, `pnpm test`, `docker compose up` funcionan; cobertura ≥ 90%.
- [ ] `GET /health` reporta el estado de la BD; el HEALTHCHECK de Docker está en verde.

---

## 3. Usuarios Objetivo

| Usuario | Situación | Necesidad |
|---------|-----------|-----------|
| **Creador de enlaces** (cualquiera, sin login) | Quiere compartir una URL larga de forma compacta | Crear un enlace corto al instante, opcionalmente con un slug personalizado memorable |
| **Seguidor de enlaces** (cualquiera) | Hace clic en un enlace corto | Ser redirigido al destino rápidamente |
| **Operador** (único administrador) | Quiere entender el tráfico | Ver totales de clics, series temporales y detalle por evento en un panel |

Existe exactamente un *persona* de operador; la gestión ocurre en la página pública de Links — no hay panel de administración.

---

## 4. Alcance

### Dentro del Alcance
- **Monorepo**: *pnpm workspaces* (`packages/{frontend,backend,shared}`).
- **Backend**: Fastify + Drizzle ORM, capas hexagonales, contenedor DI simple.
- **Base de datos**: PostgreSQL 16; `links` (con soft-delete) + `analytics`; migraciones Drizzle Kit (up + down).
- **API (8 endpoints)**: crear/listar/eliminar enlaces, redirigir, resumen/eventos/series temporales de analíticas, salud. Los errores siguen RFC 7807.
- **Frontend (3 páginas)**: `/` Links, `/analytics`, `/*` 404.
- **Reglas de slug**: insensible a mayúsculas (almacenado en minúsculas), 3–20 caracteres, charset `[a-z0-9-]`, rutas reservadas rechazadas.
- **Comportamiento ante colisiones**: slug personalizado en uso → 409; los auto-generados reintentan hasta 3× ante violación de unicidad.
- **Flujo de redirección**: escritura síncrona de analítica → 302.
- **Geolocalización**: MaxMind GeoLite2 (BD local, *offline*); `DummyGeolocator` para pruebas.
- **Parseo de UA**: `ua-parser-js`; almacena `user_agent` crudo + `browser` parseado.
- **Docker**: contenedor único multi-etapa (Fastify sirve la SPA construida); `docker-compose` con postgres + volumen `pgdata`; migraciones en el *entrypoint*.
- *Healthcheck*: `GET /health` → 200/503; HEALTHCHECK de Docker.
- **Calidad**: ESLint, Prettier, Husky, lint-staged, Conventional Commits. TDD estricto, ≥90% de cobertura.
- **Documentación**: README + licencia MIT.

### Fuera del Alcance (No objetivos)
- Autenticación / cuentas de usuario / sesiones / multi-tenencia.
- *Rate limiting*, blocklist de IP, Safe Browsing / filtrado de abuso (riesgo aceptado).
- Expiración de enlaces, dominios personalizados, códigos QR, etiquetas, importación masiva.
- UI de panel de administración.
- Apps móviles nativas, SSR/Next, optimización SEO.
- *Pipeline* de analíticas con cola/*worker*; topología multi-contenedor (nginx).

---

## 5. Comportamientos del Producto (Resumen del Contrato)

### Enlaces
| Comportamiento | Contrato |
|----------------|----------|
| Crear (slug auto) | `POST /api/links` sin `slug` → 201, slug auto de 7 caracteres |
| Crear (slug personalizado) | `POST /api/links` con `slug` → validar (minúsculas, 3–20, `[a-z0-9-]`, no reservado) → 201 o 409 en colisión |
| Listar | `GET /api/links` con paginación/búsqueda/orden; excluye soft-deleted; incluye `click_count` |
| Eliminar | `DELETE /api/links/:id` → soft-delete (204); idempotente si ya estaba eliminado; 404 si no existe |
| Redirigir | `GET /:slug` insensible a mayúsculas → registrar analítica → 302; no encontrado/eliminado → 404 |
| Generación de slug | `crypto.randomBytes`, 7 caracteres, alfabeto de 54 caracteres (sin `0`, `O`, `1`, `l`); reintentar 3×; 500 tras fallos |
| Slugs reservados | `{analytics, api, health, admin, links, www, favicon, ""}` |

### Analíticas
| Comportamiento | Contrato |
|----------------|----------|
| Registro de eventos | Un evento síncrono por redirección: `link_id`, `timestamp` (UTC timestamptz), `ip` (text), `user_agent`, `referer`, `country`, `city`, `browser` |
| KPIs de resumen | `GET /api/analytics/summary` → `{total_links, total_clicks, clicks_today, clicks_last_7_days}`; los totales incluyen clics de enlaces soft-deleted |
| Consulta de eventos | `GET /api/analytics` con filtros `link_id`/`date_from`/`date_to`/`country` + paginación; ordenado por `timestamp` desc; enlace eliminado se renderiza como `"(deleted link)"` |
| Series temporales | `GET /api/analytics/timeseries?granularity=day\|week\|month`; límites de bucket en UTC; por defecto últimos 30 días |
| Retención | Los eventos de enlaces soft-deleted permanecen en totales, eventos y series temporales |

### Salud
| Comportamiento | Contrato |
|----------------|----------|
| Conectado | `GET /health` → 200 `{status:"ok", db:"connected"}` |
| Desconectado | `GET /health` → 503 `{status:"degraded", db:"disconnected"}` |

### Semántica de Errores
- Cuerpo/parámetros de petición inválidos → 400.
- Colisión de slug personalizado o slug reservado → 409 con cuerpo `"Ese slug ya existe, prueba otro"`.
- No encontrado (slug inexistente/eliminado, id de enlace inexistente) → 404.
- Todas las respuestas de error siguen **RFC 7807 Problem Details**.

---

## 6. Superficie de la API

| Método | Ruta | Propósito | Éxito |
|--------|------|-----------|-------|
| `POST` | `/api/links` | Crear enlace | 201 |
| `GET` | `/api/links` | Listar enlaces (paginado) | 200 |
| `DELETE` | `/api/links/:id` | Soft-delete de enlace | 204 |
| `GET` | `/:slug` | Redirigir (público, fuera de `/api`) | 302 / 404 |
| `GET` | `/api/analytics/summary` | Totales KPI | 200 |
| `GET` | `/api/analytics` | Eventos paginados | 200 |
| `GET` | `/api/analytics/timeseries` | Buckets agregados | 200 |
| `GET` | `/health` | Salud de app + BD | 200 / 503 |

---

## 7. Enfoque Arquitectónico

### Backend — Capas Hexagonales
```
Presentation (rutas/plugins Fastify)
  └─ Application (servicios de casos de uso)
       └─ Domain (entidades, value objects, interfaces de repositorio)
  Infrastructure (repos Drizzle, Geolocalización, parseo UA)
```

- **Domain**: `Link`, `AnalyticsEvent`, `SlugGenerator`, `SlugValidator`, `UrlValidator`, interfaces de repositorio — puro, sin dependencias externas.
- **Application**: `CreateLinkService`, `RedirectService`, `AnalyticsService`, `DeleteLinkService`, `ListLinksService`.
- **Infrastructure**: `DrizzleLinkRepository`, `DrizzleAnalyticsRepository`, `MaxMindGeolocator`, `UaParserJsAdapter`.
- **Presentation**: plugins Fastify delgados por dominio.
- **DI**: contenedor simple hecho a mano (sin librería); los servicios reciben dependencias vía constructor; Fastify `decorate()`.

### Frontend — SPA basada en features
- TanStack Router (basado en archivos), TanStack Query, TanStack Table, React Hook Form + Zod, Recharts, sonner.
- `fetch` nativo con un *wrapper* delgado (sin axios).
- Esquemas Zod compartidos en `@shortpulse/shared` consumidos tanto por formularios del FE como por validación del BE — **un esquema, dos consumidores, sin divergencia**.

### Base de Datos — PostgreSQL 16
- `links`: filas de enlaces con una columna `deleted_at` para soft-delete.
- `analytics`: eventos de clic; FK retenida tras el soft-delete del enlace; las consultas coalescen el nombre a `"(deleted link)"` vía LEFT JOIN.
- Migraciones Drizzle Kit (up + down), ejecutadas en el *entrypoint* del contenedor.

### Despliegue — Contenedor Único
- Dockerfile multi-etapa: dependencias → build → runtime.
- Fastify sirve la SPA construida como archivos estáticos (un contenedor, un puerto, sin CORS, sin nginx).
- `docker-compose` con postgres + volumen `pgdata`; las migraciones se ejecutan antes de iniciar la app.
- Objetivo: Dokploy en un VPS.

---

## 8. Decisiones Arquitectónicas Clave

| Decisión | Elección | Justificación |
|----------|----------|---------------|
| Monorepo | pnpm workspaces `packages/{frontend,backend,shared}` | Contrato Zod compartido, toolchain único |
| Arquitectura de backend | Clean/Hexagonal | Testabilidad, inversión de dependencias |
| DI | Contenedor hecho a mano | Sin overhead de librería a esta escala |
| Generación de slug | `crypto.randomBytes`, 7 caracteres, alfabeto de 54 | Seguro, sin dependencia, ~1,4T combinaciones |
| Manejo de colisiones | Auto: reintenta 3×; personalizado: 409 | Correctitud sin *fallbacks* silenciosos |
| Escritura de analítica | **Síncrona**, antes del 302 | Captura garantizada; +5–15ms imperceptible a escala VPS |
| Geolocalización | MaxMind GeoLite2 (BD local) | Offline, gratuito, testeable vía interfaz |
| Parseo de UA | `ua-parser-js`, almacena crudo + parseado | A prueba de futuro + consultas rápidas |
| Toasts | sonner | Ligero, moderno, sin configuración |
| Gráficos | Recharts | Componible, popular, encaja en el panel |
| Cliente HTTP | *Wrapper* de `fetch` nativo | Sin axios para una API simple |
| Migraciones de BD | Drizzle Kit en el *entrypoint* | Idempotente, amigable para contenedor único |
| Topología Docker | Contenedor único sirve SPA + API | Despliegue Dokploy más simple; divisible después |
| Testing | Vitest (unit/integration) + Playwright (E2E) + testcontainers | TDD estricto, ≥90% de cobertura |

---

## 9. Estrategia de Testing

| Capa | Alcance | Herramientas | Mocking |
|------|---------|--------------|---------|
| **Unit** | Gen/validación de slug, validación de URL, lógica de servicios, esquemas Zod | Vitest | Mock de interfaces de repositorio |
| **Integration** | Ciclo HTTP completo, operaciones de BD, flujo redirección + analítica | Vitest + Fastify inject + testcontainers | PostgreSQL real, `DummyGeolocator`, `DummyUA` |
| **E2E** | Crear → redirigir → analítica visible, eliminar, 404 | Playwright | Stack completo de docker-compose |

- Geolocalización en pruebas: inyectar `DummyGeolocator` que devuelve `{country, city}` fijo.
- Las pruebas de integración usan `app.inject()` (sin socket real), testcontainers para un PostgreSQL real.

---

## 10. Restricciones y Dependencias

- **Runtime**: Node 20+, pnpm 9+, PostgreSQL 16+.
- **Datos externos**: MaxMind GeoLite2 City DB (descargada en la imagen; refresco vía rebuild/cron).
- **Librerías clave**: Fastify, Drizzle ORM/Kit, TanStack Router/Query/Table, Recharts, sonner, ua-parser-js, Vitest, Playwright, testcontainers.
- **Convención**: Conventional Commits; commits por unidad de trabajo (no por tipo de archivo).

---

## 11. Riesgos y Mitigaciones

| Riesgo | Probabilidad | Mitigación |
|--------|--------------|------------|
| Abuso / spam de creación de enlaces sin auth | Media | Decisión de producto aceptada; validación solo de URL; revisar *rate-limit* después |
| Obsolescencia de la BD de MaxMind GeoLite2 | Media | Reconstruir imagen regularmente / cron de refresco; la BD local mantiene las redirecciones seguras offline |
| Latencia de escritura síncrona bajo carga de BD | Baja–Media | Aceptable a escala VPS; salida documentada a cola asíncrona si el crecimiento lo exige |
| Complejidad de consultas con soft-delete en reportes | Media | FK de analítica retenida; LEFT JOIN coalescea a `"(deleted link)"` |
| Techo de escalabilidad del contenedor único | Baja | Dividir a nginx + API después; correcto para VPS/Dokploy |
| Race condition en colisión de slug (creaciones concurrentes) | Baja | Restricción UNIQUE de BD + reintento (auto) / 409 (personalizado) |

---

## 12. Plan de Rollback

Rollback *greenfield* = revertir el PR / borrar la rama de feature. Las migraciones de BD son reversibles (Drizzle Kit genera migraciones *down*). Si ya está desplegado, redesplegar el tag de imagen anterior (Dokploy) y luego ejecutar la migración *down*.

---

## 13. Preguntas Abiertas (para resolución en spec)

Estas fueron planteadas en la propuesta y resueltas en las especificaciones de capacidad; listadas aquí para trazabilidad.

1. Columnas y tipos de la tabla de analíticas — **resuelto**: `timestamp` como timestamptz UTC, `ip` como text, geo/browser/referer text *nullable*.
2. Semántica de granularidad de series temporales — **resuelto**: límites de bucket en UTC; día=00:00 UTC, semana=lunes 00:00 UTC, mes=día 1 00:00 UTC; rango por defecto = últimos 30 días.
3. Definiciones de KPI — **resuelto**: `clicks_today` desde 00:00 UTC; `clicks_last_7_days` en 168h rodantes; los clics de enlaces soft-deleted cuentan en los totales.
4. Lista de rutas reservadas — **resuelto**: `{analytics, api, health, admin, links, www, favicon, ""}`, *case-fold* puro.
5. Token de renderizado de soft-delete — **resuelto**: literal `"(deleted link)"`.
6. Límites de paginación — **resuelto**: `page` ≥ 1, `page_size` por defecto 20, máx 100; eventos ordenados por `timestamp` desc.
7. Composición de `BASE_URL` / `short_url` — **resuelto**: `short_url = ${BASE_URL}/${slug}`.

---

## 14. Sistema de Diseño — Kanagawa Dragon

> Paleta de colores basada en [kanagawa.nvim](https://github.com/rebelot/kanagawa.nvim). Soporta dark mode (Dragon) y light mode (Lotus).

### Paleta Principal (Dark Mode — Dragon)

| Token | Hex | Uso |
|-------|-----|-----|
| `--sp-bg` | `#181616` | Background principal |
| `--sp-bg-surface` | `#282727` | Cards, inputs, navbar |
| `--sp-bg-m1` | `#1D1C19` | Headers de tabla, pagination |
| `--sp-border` | `#393836` | Borradores de cards, inputs |
| `--sp-fg` | `#c5c9c5` | Texto principal |
| `--sp-fg-dim` | `#a6a69c` | Texto secundario |
| `--sp-fg-muted` | `#737c73` | Placeholders, timestamps |
| `--sp-accent` | `#658594` | Botones, links, chips slug |
| `--sp-accent-subtle` | `#223249` | Chip slug bg, KPI icon bg |
| `--sp-success` | `#87a987` | Estado activo, trends |
| `--sp-warning` | `#c4b28a` | Warning states |
| `--sp-error` | `#c4746e` | Eliminar, enlace inactivo |

### Paleta Light Mode (Lotus)

| Token | Hex | Uso |
|-------|-----|-----|
| `--sp-bg` | `#e7dba0` | Background principal |
| `--sp-bg-surface` | `#dcd5ac` | Cards, surfaces |
| `--sp-fg` | `#545464` | Texto principal |
| `--sp-accent` | `#4d699b` | Links, botones |
| `--sp-success` | `#6f894e` | Estado activo |
| `--sp-error` | `#c84053` | Error states |

### Toggle de Tema

El navbar incluye un botón de toggle (sol/luna) que cambia `data-theme` entre `"dark"` y `"light"` en el elemento `<html>`. Los CSS custom properties se actualizan automáticamente.

### Archivos del Sistema de Diseño

- `docs/kanagawa-dragon.optheme` — Theme preset para OpenPencil
- `docs/kanagawa-dragon.css` — CSS custom properties (importable)
- `docs/kanagawa-design-system.md` — Documentación completa del sistema

---

## Referencias

- `openspec/changes/add-shortpulse-app/proposal.md` — propuesta de cambio (intent, alcance, riesgos)
- `openspec/changes/add-shortpulse-app/exploration.md` — 12 decisiones arquitectónicas
- `openspec/specs/links/spec.md` — especificación de capacidad de enlaces
- `openspec/specs/analytics/spec.md` — especificación de capacidad de analíticas
- `openspec/specs/health/spec.md` — especificación de capacidad de salud
- `docs/kanagawa-design-system.md` — sistema de diseño Kanagawa Dragon
