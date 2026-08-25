# Control de Bobinas

Aplicación web para gestionar órdenes de producción, bobinas fabricadas y restos disponibles en almacén.

## Arquitectura

- Frontend: React + Vite en `artifacts/control-bobinas`.
- API: Express en `artifacts/api-server`.
- Persistencia: PostgreSQL + Drizzle ORM en `lib/db`.
- Producción: un contenedor `app` sirve la SPA y `/api/*`; PostgreSQL se ejecuta como servicio separado.
- Las migraciones versionadas están en `lib/db/drizzle` y se aplican automáticamente antes de arrancar la API.
- La fuente de verdad es PostgreSQL: la web no guarda órdenes ni inventario en el navegador.
- `GET /api/readyz` solo responde correctamente cuando la aplicación y PostgreSQL están disponibles.

## Publicar en GitHub

El repositorio no contiene secretos. Antes de publicarlo, comprueba:

```powershell
git status
git add .
git commit -m "Prepare Docker deployment"
git remote add origin https://github.com/USUARIO/REPOSITORIO.git
git push -u origin main
```

Si el remoto ya existe, omite `git remote add origin`.

## Ejecutar con Docker Compose

Requisitos: Docker Desktop y Docker Compose.

```powershell
Copy-Item .env.example .env
# Edita .env: usa una contraseña larga y la misma credencial en POSTGRES_PASSWORD y DATABASE_URL.
docker compose -f docker-compose.yml -f docker-compose.local.yml --env-file .env up --build -d --wait
```

La aplicación queda disponible en `http://localhost:3000` salvo que cambies `APP_PORT`.
Comprobaciones útiles:

```powershell
docker compose -f docker-compose.yml -f docker-compose.local.yml --env-file .env ps
Invoke-WebRequest http://localhost:3000/api/healthz
Invoke-WebRequest http://localhost:3000/api/readyz
```

Los datos PostgreSQL viven en el volumen cuyo nombre define `POSTGRES_VOLUME_NAME` (por defecto `control-almacen_postgres_data`). Mantén ese valor estable entre despliegues. Para actualizar la aplicación conserva ese volumen y ejecuta de nuevo el mismo comando `docker compose -f docker-compose.yml -f docker-compose.local.yml --env-file .env up --build -d --wait`. No uses `docker compose down -v` ni borres ese volumen salvo que quieras eliminar intencionadamente la base de datos.

El volumen protege los datos frente a redeploys del contenedor, pero no sustituye una copia de seguridad fuera del servidor. Configura en Dokploy o en el servidor una política de backup de PostgreSQL y prueba periódicamente la restauración antes de considerar el sistema tolerante a pérdida del VPS.

## Configurar Dokploy

1. Crea un proyecto y añade un servicio `Compose` con tipo `Docker Compose`.
2. Selecciona el repositorio/branch de GitHub y el archivo `docker-compose.yml`.
3. Define `POSTGRES_PASSWORD`, `DATABASE_URL` y `POSTGRES_VOLUME_NAME` como configuración persistente. Si quieres, define también `CORS_ORIGIN` y `LOG_LEVEL`.
4. En el dominio de Dokploy selecciona el servicio `app` y el puerto interno `3000`.
5. Despliega. El servicio `app` espera a que PostgreSQL esté saludable, aplica las migraciones y sirve la web.
6. Completa DNS/HTTPS desde Dokploy y no publiques el servicio `db`.
7. Verifica `/api/healthz`, `/api/readyz`, creación de una orden y una entrada de inventario. Después reinicia/redeploya sin borrar el volumen y confirma que los registros siguen presentes.

Ejemplo de `DATABASE_URL` para Compose/Dokploy:

```text
postgresql://control_bobinas:CONTRASEÑA@db:5432/control_bobinas
```

Si Dokploy proporciona PostgreSQL externo, sustituye `DATABASE_URL` por la cadena de conexión de ese servicio y no dependas del host `db`.

Cuando se use una base de datos externa, el volumen `postgres_data` deja de ser la copia de datos de la aplicación; el backup y la retención deben configurarse en ese proveedor.

## Desarrollo local sin Docker

```powershell
npx pnpm@11.23.0 install --frozen-lockfile
npx pnpm@11.23.0 run typecheck
npx pnpm@11.23.0 --filter @workspace/control-bobinas run dev
npx pnpm@11.23.0 --filter @workspace/api-server run dev
```

La API necesita `DATABASE_URL` y `PORT`. Para un entorno reproducible de despliegue, usa Compose.
