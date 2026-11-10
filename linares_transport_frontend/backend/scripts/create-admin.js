require("dotenv").config();

const bcrypt = require("bcryptjs");
const pool = require("../src/db");

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const firstName = process.env.ADMIN_FIRST_NAME?.trim() || "Administrador";
  const lastName = process.env.ADMIN_LAST_NAME?.trim() || "Linares";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Define ADMIN_EMAIL con un correo válido.");
  if (!password || password.length < 12 || Buffer.byteLength(password, "utf8") > 72) {
    throw new Error("ADMIN_PASSWORD debe tener entre 12 y 72 caracteres.");
  }
  const [[role]] = await pool.execute("SELECT id FROM Roles WHERE name = 'ADMINISTRADOR' LIMIT 1");
  if (!role) throw new Error("No existe el rol ADMINISTRADOR. Ejecuta npm run db:setup.");
  const hash = await bcrypt.hash(password, 12);
  await pool.execute(
    `INSERT INTO Users (role_id, email, password_hash, first_name, last_name)
     VALUES (?, ?, ?, ?, ?)`,
    [role.id, email, hash, firstName, lastName]
  );
  console.log(`Administrador creado: ${email}`);
}

main()
  .catch(error => {
    console.error("No se pudo crear el administrador:", error.code === "ER_DUP_ENTRY" ? "Ese correo ya existe." : error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
