# Linares Transport — Portal de viajeros y administración

Frontend responsive en HTML, CSS y JavaScript. Cada pantalla tiene ahora su propio archivo de entrada; el contenido compartido está dividido en fragmentos bajo `partials/`. El modo predeterminado se conecta al backend Node.js y MySQL descrito en [`backend/README.md`](../backend/README.md); los datos de demostración en `localStorage` solo se usan si `USE_MOCK_DATA` se activa manualmente en `js/config.js`.

## Iniciar el frontend

1. Configura y ejecuta el backend siguiendo [`backend/README.md`](../backend/README.md).
2. Desde esta carpeta, abre `index.html` con Live Server (origen predeterminado `http://localhost:5500`). El cargador busca los fragmentos HTML usando `fetch`, así que no abras los archivos mediante `file://`.
3. Si Live Server usa otro origen, agrégalo a `FRONTEND_ORIGINS` en `backend/.env`.
4. Verifica que `API_BASE_URL` en `js/config.js` coincida con la URL del backend.

Las cuentas de clientes se registran desde el formulario. La cuenta administradora se crea explícitamente con `npm.cmd run admin:create`; no hay contraseñas de demostración predeterminadas.

## Páginas

- `index.html`: inicio público y búsqueda de viajes.
- `login.html` y `register.html`: acceso y registro.
- `customer.html`: portal de cliente y reservas.
- `admin.html`: resumen administrativo.
- `routes.html`, `vehicles.html`, `drivers.html`, `clients.html`, `schedules.html`, `sales.html` y `reports.html`: páginas del panel administrativo.

El menú del administrador navega entre páginas completas. `js/page-loader.js` carga los fragmentos reutilizables de `partials/`, y `js/app.js` mantiene los flujos de búsqueda, sesión y operaciones.

## Funcionalidades conectadas

- Registro, inicio y cierre de sesión con cookie de sesión `HttpOnly`.
- Búsqueda de salidas y puestos disponibles.
- Reservas transaccionales con pasajeros, selección exclusiva de sillas y consulta de “Mis viajes”.
- Panel de administración: rutas, buses, conductores, clientes y programación de salidas.
- Consulta de ventas y reportes del sistema.

La reserva calcula el precio y valida la disponibilidad en el servidor. No hay integración de una pasarela de pago real; los medios de pago de la interfaz son ilustrativos.
