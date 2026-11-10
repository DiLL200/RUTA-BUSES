require("dotenv").config();

const app = require("./app");
const pool = require("./db");

const port = Number(process.env.PORT || 3000);

pool.getConnection()
  .then(connection => {
    connection.release();
    app.listen(port, () => console.log(`Linares Transport API disponible en http://localhost:${port}`));
  })
  .catch(error => {
    console.error("No se pudo conectar a MySQL:", error.message);
    process.exitCode = 1;
  });
