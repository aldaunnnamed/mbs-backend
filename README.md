# MBS Comunicaciones — Backend

API REST y frontend estático para el e-commerce de insumos de fibra óptica MBS Comunicaciones. Construido con **Express + PostgreSQL**, con la mayor parte de la lógica de negocio implementada como funciones almacenadas (`fn_*`).

El esquema de base de datos, la documentación completa y los mockups de diseño viven en el repositorio **[mbs-comunicaciones](https://github.com/aldaunnnamed/mbs-comunicaciones)**.

## Requisitos

- Node.js 18+
- PostgreSQL 14+ con la extensión `unaccent`

## Instalación

```bash
npm install
cp .env.example .env
# completar DB_*, JWT_SECRET y, si se va a usar PayPal, PAYPAL_*
```

### Base de datos

Clonar [mbs-comunicaciones](https://github.com/aldaunnnamed/mbs-comunicaciones) y ejecutar los scripts SQL en orden (ver su README) sobre la base configurada en `.env`.

### Variables de entorno

Ver [`.env.example`](./.env.example) para la lista completa. Las más importantes:

| Variable | Descripción |
|---|---|
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Conexión a PostgreSQL |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | Firma y expiración de tokens de sesión |
| `APP_URL` | URL pública del sitio, usada para las URLs de retorno de PayPal |
| `PAYPAL_MODE`, `PAYPAL_CLIENT_ID`, `PAYPAL_SECRET`, `PAYPAL_WEBHOOK_ID` | Credenciales de PayPal Orders v2 (sandbox/live) |
| `SPEI_CLABE`, `SPEI_BANCO` | Datos de la referencia bancaria SPEI |

## Uso

```bash
npm start    # producción (node src/app.js)
npm run dev  # desarrollo, con recarga automática (nodemon)
```

El servidor sirve la API en `/api/*` y el frontend estático desde `public/`.

## Pruebas

```bash
npm test     # jest --runInBand
```

Las pruebas (`tests/`) corren contra la app real y la base de datos configurada en `.env`, usando los datos de `03_seed_data.sql` (incluye el usuario `admin@mbs.mx`). El flujo de PayPal se prueba mockeando `src/services/paypal.service.js`, sin requerir credenciales reales.

## Estructura del proyecto

```
src/
├── app.js            — Punto de entrada: middlewares, archivos estáticos, rutas
├── config/db.js      — Pool de PostgreSQL
├── middlewares/auth.js — verificarToken, soloAdmin, tokenOpcional
├── controllers/       — Lógica de cada dominio (auth, productos, carrito, pedidos, admin, pagos...)
├── routes/             — Definición de endpoints por dominio
└── services/           — paypal.service.js, factura.service.js
public/
├── js/global.js       — Helpers compartidos (fetch, sesión, carrito, toasts)
├── pages/              — Páginas HTML del sitio
└── admin/              — Panel de administración
tests/                  — Suite de pruebas (Jest + Supertest)
```

## API

| Prefijo | Descripción |
|---|---|
| `/api/auth` | Registro, login, perfil |
| `/api/productos` | Catálogo, categorías, marcas |
| `/api/carrito` | Carrito (anónimo y autenticado) |
| `/api/pedidos` | Pedidos, métodos de envío y pago |
| `/api/usuarios` | Direcciones, datos personales |
| `/api/admin` | Panel de administración (requiere rol admin) |
| `/api/pagos` | Pagos: SPEI y PayPal (Orders v2) |
| `/api/contacto` | Formulario de contacto |

Más detalles de arquitectura y convenciones en [CLAUDE.md](https://github.com/aldaunnnamed/mbs-comunicaciones/blob/master/CLAUDE.md).
