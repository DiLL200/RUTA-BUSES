# Backend y base de datos

API REST de Node.js/Express con MySQL 8, sesiones almacenadas en MySQL y contraseñas con bcrypt.

## Requisitos

- Node.js 20 o posterior y npm.
- MySQL 8.0 o posterior.
- Un usuario MySQL que pueda crear la base de datos durante la instalación y administrar las tablas de `linares_transport`.

## Preparación

En PowerShell, desde la raíz del proyecto:

```powershell
cd backend
npm.cmd install
Copy-Item .env.example .env
```

Edita `backend/.env`: configura `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, un `SESSION_SECRET` aleatorio de al menos 32 caracteres y los orígenes permitidos en `FRONTEND_ORIGINS`. Ejecuta `npm.cmd run db:setup` para crear la base definida por `DB_NAME`, las tablas y los roles. La cuenta de base de datos debe tener permiso `CREATE DATABASE` para este paso.

Después crea el primer administrador de forma interactiva en el entorno (no guardes su clave en el repositorio):

```powershell
$env:ADMIN_EMAIL = "admin@tu-dominio.com"
$env:ADMIN_PASSWORD = "una-clave-aleatoria-de-12-caracteres-o-mas"
npm.cmd run admin:create
Remove-Item Env:ADMIN_EMAIL
Remove-Item Env:ADMIN_PASSWORD
npm.cmd start
```

La API queda en `http://localhost:3000/api`; comprueba su disponibilidad en `http://localhost:3000/api/health`. Para desarrollo, `npm.cmd run dev` reinicia el servidor al guardar cambios. Desde el panel administrador registra al menos rutas, buses, conductores y salidas para que haya viajes disponibles.

## Endpoints principales

- `POST /auth/register`, `POST /auth/login`, `GET /auth/me`, `POST /auth/logout`
- `GET /public/routes`, `GET /trips/search`, `GET /trips/:id`
- `POST /reservations`, `GET /reservations/mine`, `GET /reservations/:id`, `PATCH /reservations/:id/cancel`
- CRUD administrativo en `/routes`, `/vehicles`, `/drivers`, `/clients` y `/route-schedules`
- `/driver-schedules`, `GET /sales` y `GET /reports/summary`

Las operaciones administrativas requieren el rol `ADMINISTRADOR`. La reserva crea `Reservations`, pasajeros, asientos y ventas dentro de una transacción. El índice único `(route_schedule_id, seat_number)` impide vender dos veces un puesto; un conflicto devuelve `409`.

## Notas de producción

- Cambia `SESSION_SECRET`, restringe `FRONTEND_ORIGINS` y sirve el sitio mediante HTTPS.
- Configura `NODE_ENV=production` para habilitar cookies `Secure`.
- En producción, separa el usuario con permisos de creación de esquema del usuario de ejecución de la API.
- No se procesa dinero: una pasarela real debe integrarse desde el backend y confirmar pagos mediante webhook.
