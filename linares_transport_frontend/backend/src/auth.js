const express = require("express");
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");
const pool = require("./db");
const { ApiError, asyncRoute, isDuplicate } = require("./errors");

const router = express.Router();
const loginLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Demasiados intentos. Intenta de nuevo más tarde." }
});

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    first_name: user.first_name,
    last_name: user.last_name,
    phone_number: user.phone_number,
    document_type: user.document_type,
    document_number: user.document_number,
    client_id: user.client_id || null,
    role: user.role
  };
}

function cleanString(value, name, maxLength, required = true) {
  const result = typeof value === "string" ? value.trim() : "";
  if ((!result && required) || result.length > maxLength) {
    throw new ApiError(400, `${name} es obligatorio y debe tener máximo ${maxLength} caracteres.`);
  }
  return result || null;
}

function validateDocumentType(value) {
  if (!["CC", "CE", "Pasaporte"].includes(value)) {
    throw new ApiError(400, "Tipo de documento no válido.");
  }
}

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save(error => error ? reject(error) : resolve());
  });
}

router.post("/register", asyncRoute(async (req, res) => {
  const firstName = cleanString(req.body.first_name, "Nombre", 100);
  const lastName = cleanString(req.body.last_name, "Apellido", 100);
  const email = cleanString(req.body.email, "Correo", 254).toLowerCase();
  const password = req.body.password;
  const documentType = req.body.document_type;
  const documentNumber = cleanString(req.body.document_number, "Documento", 50);
  const phone = cleanString(req.body.phone_number, "Teléfono", 30, false);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400, "Correo electrónico no válido.");
  if (typeof password !== "string" || password.length < 8 || Buffer.byteLength(password, "utf8") > 72) {
    throw new ApiError(400, "La contraseña debe tener entre 8 y 72 caracteres.");
  }
  validateDocumentType(documentType);

  const connection = await pool.getConnection();
  let userId;
  try {
    await connection.beginTransaction();
    const [roles] = await connection.execute("SELECT id FROM Roles WHERE name = 'CLIENTE' LIMIT 1");
    if (!roles.length) throw new Error("No existe el rol CLIENTE. Ejecuta npm run db:setup.");
    const passwordHash = await bcrypt.hash(password, 12);
    const [insert] = await connection.execute(
      `INSERT INTO Users
        (role_id, email, password_hash, first_name, last_name, phone_number, document_type, document_number)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [roles[0].id, email, passwordHash, firstName, lastName, phone, documentType, documentNumber]
    );
    userId = insert.insertId;
    await connection.execute(
      `INSERT INTO Clients
        (user_id, first_name, last_name, email, phone_number, document_type, document_number, user_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'REGULAR')`,
      [userId, firstName, lastName, email, phone, documentType, documentNumber]
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    if (isDuplicate(error)) throw new ApiError(409, "El correo o documento ya se encuentra registrado.");
    throw error;
  } finally {
    connection.release();
  }

  await new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
  req.session.userId = userId;
  await saveSession(req);
  const [[user]] = await pool.execute(
    `SELECT u.id, u.email, u.first_name, u.last_name, u.phone_number,
            u.document_type, u.document_number, c.id AS client_id, r.name AS role
     FROM Users u JOIN Roles r ON r.id = u.role_id
     LEFT JOIN Clients c ON c.user_id = u.id WHERE u.id = ?`,
    [userId]
  );
  res.status(201).json({ data: publicUser(user) });
}));

router.post("/login", loginLimit, asyncRoute(async (req, res) => {
  const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = req.body.password;
  if (!email || typeof password !== "string") throw new ApiError(400, "Correo y contraseña son obligatorios.");
  if (Buffer.byteLength(password, "utf8") > 72) throw new ApiError(400, "La contraseña excede el máximo permitido.");
  const [[user]] = await pool.execute(
    `SELECT u.id, u.email, u.password_hash, u.first_name, u.last_name, u.phone_number,
            u.document_type, u.document_number, u.is_active, c.id AS client_id, r.name AS role
     FROM Users u JOIN Roles r ON r.id = u.role_id
     LEFT JOIN Clients c ON c.user_id = u.id WHERE u.email = ? LIMIT 1`,
    [email]
  );
  if (!user || !user.is_active || !(await bcrypt.compare(password, user.password_hash))) {
    throw new ApiError(401, "Correo o contraseña incorrectos.");
  }
  await new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
  req.session.userId = user.id;
  await saveSession(req);
  res.json({ data: publicUser(user) });
}));

router.get("/me", asyncRoute(async (req, res) => {
  if (!req.session.userId) throw new ApiError(401, "Debes iniciar sesión.");
  const [[user]] = await pool.execute(
    `SELECT u.id, u.email, u.first_name, u.last_name, u.phone_number,
            u.document_type, u.document_number, c.id AS client_id, r.name AS role
     FROM Users u JOIN Roles r ON r.id = u.role_id
     LEFT JOIN Clients c ON c.user_id = u.id
     WHERE u.id = ? AND u.is_active = 1`,
    [req.session.userId]
  );
  if (!user) throw new ApiError(401, "La sesión ya no es válida.");
  res.json({ data: publicUser(user) });
}));

router.post("/logout", asyncRoute(async (req, res) => {
  if (!req.session) return res.status(204).end();
  await new Promise((resolve, reject) => req.session.destroy(error => error ? reject(error) : resolve()));
  res.clearCookie(process.env.SESSION_NAME || "linares.sid", { path: "/" });
  res.status(204).end();
}));

module.exports = { router, publicUser };
