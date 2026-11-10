require("dotenv").config();

const fs = require("node:fs/promises");
const path = require("node:path");
const mysql = require("mysql2/promise");

async function main() {
  const database = process.env.DB_NAME || "linares_transport";
  if (!/^[a-zA-Z0-9_]+$/.test(database)) throw new Error("DB_NAME solo puede contener letras, números y guion bajo.");
  if (!process.env.DB_USER || !process.env.DB_PASSWORD) throw new Error("Configura DB_USER y DB_PASSWORD.");
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    multipleStatements: true
  });
  try {
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`
    );
    await connection.changeUser({ database });
    const schema = await fs.readFile(path.join(__dirname, "..", "..", "database", "schema.sql"), "utf8");
    await connection.query(schema);
    console.log(`Esquema de Linares Transport instalado en la base ${database}.`);
  } finally {
    await connection.end();
  }
}

main().catch(error => {
  console.error("No se pudo preparar la base de datos:", error.message);
  process.exitCode = 1;
});
