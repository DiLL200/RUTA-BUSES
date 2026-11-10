require("dotenv").config();

const express = require("express");
const session = require("express-session");
const cors = require("cors");
const helmet = require("helmet");
const pool = require("./db");
const MySqlSessionStore = require("./session-store");
const auth = require("./auth");
const trips = require("./trips");
const reservations = require("./reservations");
const admin = require("./admin");
const { ApiError, asyncRoute } = require("./errors");

const app = express();
const allowedOrigins = (process.env.FRONTEND_ORIGINS || "http://localhost:5500")
  .split(",").map(value => value.trim()).filter(Boolean);
const sessionName = process.env.SESSION_NAME || "linares.sid";
const isProduction = process.env.NODE_ENV === "production";

if (!process.env.DB_USER || !process.env.DB_PASSWORD) {
  throw new Error("Configura DB_USER y DB_PASSWORD en backend/.env.");
}
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  throw new Error("SESSION_SECRET debe tener al menos 32 caracteres.");
}

app.disable("x-powered-by");
app.set("trust proxy", isProduction ? 1 : false);
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new ApiError(403, "Origen no autorizado."));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type"]
}));
app.use((req, res, next) => {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method) && req.headers.origin &&
      !allowedOrigins.includes(req.headers.origin)) {
    return next(new ApiError(403, "Origen no autorizado."));
  }
  next();
});
app.use(express.json({ limit: "100kb" }));
app.use((req, res, next) => {
  if (["POST", "PUT", "PATCH"].includes(req.method) &&
      (!req.body || typeof req.body !== "object" || Array.isArray(req.body))) {
    req.body = {};
  }
  next();
});

const sessionStore = new MySqlSessionStore();
app.use(session({
  name: sessionName,
  secret: process.env.SESSION_SECRET,
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    maxAge: Number(process.env.SESSION_MAX_AGE_MS || 8 * 60 * 60 * 1000),
    path: "/"
  }
}));

app.use("/api", asyncRoute(async (req, res, next) => {
  if (!req.session.userId || req.path.startsWith("/auth/")) return next();
  const [[user]] = await pool.execute(
    `SELECT u.id, u.email, u.first_name, u.last_name, u.phone_number,
            u.document_type, u.document_number, c.id AS client_id, r.name AS role
     FROM Users u JOIN Roles r ON r.id = u.role_id
     LEFT JOIN Clients c ON c.user_id = u.id
     WHERE u.id = ? AND u.is_active = 1`,
    [req.session.userId]
  );
  if (!user) {
    req.session.destroy(() => {});
    throw new ApiError(401, "La sesión ya no es válida.");
  }
  req.user = user;
  next();
}));

function requireAuth(req, res, next) {
  if (!req.user) return next(new ApiError(401, "Debes iniciar sesión."));
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user) return next(new ApiError(401, "Debes iniciar sesión."));
  if (req.user.role !== "ADMINISTRADOR") return next(new ApiError(403, "No tienes permisos para esta operación."));
  next();
}

app.get("/api/health", (req, res) => res.json({ status: "ok" }));
app.get("/api/public/routes", asyncRoute(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT id, origin, destination, distance_km, estimated_duration,
      CAST(price AS DOUBLE) AS price, is_active
     FROM Routes WHERE is_active = 1 ORDER BY origin, destination`
  );
  res.json({ data: rows });
}));
app.use("/api/auth", auth.router);
app.use("/api/trips", trips);
app.use("/api/reservations", requireAuth, reservations);
app.use("/api/routes", requireAdmin, admin.routesRouter);
app.use("/api/vehicles", requireAdmin, admin.vehiclesRouter);
app.use("/api/drivers", requireAdmin, admin.driversRouter);
app.use("/api/clients", requireAdmin, admin.clientsRouter);
app.use("/api/route-schedules", requireAdmin, admin.schedulesRouter);
app.use("/api/driver-schedules", requireAdmin, admin.driverSchedulesRouter);
app.use("/api/sales", requireAdmin, admin.salesRouter);
app.get("/api/reports/summary", requireAdmin, admin.summary);

app.use((req, res) => res.status(404).json({ message: "Endpoint no encontrado." }));
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = Number(error.status) || 500;
  if (status >= 500) console.error(error);
  const message = status >= 500 ? "Error interno del servidor." : error.message;
  res.status(status).json({ message });
});

module.exports = app;
