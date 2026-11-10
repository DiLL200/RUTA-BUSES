const express = require("express");
const pool = require("./db");
const { ApiError, asyncRoute, isDuplicate, isForeignKeyConflict } = require("./errors");

function parseRecord(req, spec) {
  const keys = Object.keys(req.body || {});
  const unknown = keys.filter(key => !spec.fields.includes(key));
  if (unknown.length) throw new ApiError(400, `Campo no permitido: ${unknown[0]}.`);
  const record = {};
  for (const field of spec.fields) {
    let value = req.body[field];
    if (value === undefined || value === null || value === "") {
      if (spec.required.includes(field)) throw new ApiError(400, `${field} es obligatorio.`);
      record[field] = null;
      continue;
    }
    if (spec.numbers?.includes(field)) {
      value = Number(value);
      if (!Number.isFinite(value) || value < 0) throw new ApiError(400, `${field} debe ser un número válido.`);
      if (spec.integers?.includes(field) && !Number.isInteger(value)) throw new ApiError(400, `${field} debe ser un número entero.`);
      if (spec.positive?.includes(field) && value <= 0) throw new ApiError(400, `${field} debe ser mayor que cero.`);
    } else if (spec.booleans?.includes(field)) {
      if (![true, false, 0, 1, "0", "1"].includes(value)) throw new ApiError(400, `${field} debe ser verdadero o falso.`);
      value = value === true || value === 1 || value === "1" ? 1 : 0;
    } else if (typeof value !== "string") {
      throw new ApiError(400, `${field} debe ser texto.`);
    } else {
      value = value.trim();
      if (!value && spec.required.includes(field)) throw new ApiError(400, `${field} es obligatorio.`);
      const maxLength = spec.maxLengths?.[field] || 255;
      if (value.length > maxLength) {
        throw new ApiError(400, `${field} supera el máximo de ${maxLength} caracteres.`);
      }
    }
    record[field] = value;
  }
  if (spec.enums) {
    for (const [field, values] of Object.entries(spec.enums)) {
      if (record[field] !== null && !values.includes(record[field])) throw new ApiError(400, `${field} no es válido.`);
    }
  }
  if (spec.dates) {
    for (const field of spec.dates) {
      if (record[field] !== null && !isValidDate(record[field])) {
        throw new ApiError(400, `${field} debe tener formato AAAA-MM-DD.`);
      }
    }
  }
  if (spec.emails) {
    for (const field of spec.emails) {
      if (record[field] !== null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(record[field])) {
        throw new ApiError(400, `${field} no es un correo válido.`);
      }
      if (record[field]) record[field] = record[field].toLowerCase();
    }
  }
  if (record.origin && record.destination && record.origin.toLocaleLowerCase() === record.destination.toLocaleLowerCase()) {
    throw new ApiError(400, "El origen y el destino deben ser diferentes.");
  }
  return record;
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function createCrudRouter(spec) {
  const router = express.Router();
  const table = `\`${spec.table}\``;
  const columnList = spec.fields.map(field => `\`${field}\``).join(", ");

  router.get("/", asyncRoute(async (req, res) => {
    const [rows] = await pool.query(`SELECT id, ${columnList} FROM ${table} ORDER BY id DESC`);
    res.json({ data: rows });
  }));
  router.post("/", asyncRoute(async (req, res) => {
    const record = parseRecord(req, spec);
    try {
      const [result] = await pool.execute(
        `INSERT INTO ${table} (${columnList}) VALUES (${spec.fields.map(() => "?").join(", ")})`,
        spec.fields.map(field => record[field])
      );
      const [[created]] = await pool.execute(`SELECT id, ${columnList} FROM ${table} WHERE id = ?`, [result.insertId]);
      res.status(201).json({ data: created });
    } catch (error) {
      if (isDuplicate(error)) throw new ApiError(409, "Ya existe un registro con esos datos.");
      if (isForeignKeyConflict(error)) throw new ApiError(409, "La referencia seleccionada no existe o está en uso.");
      throw error;
    }
  }));
  router.put("/:id", asyncRoute(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) throw new ApiError(400, "Identificador no válido.");
    const record = parseRecord(req, spec);
    let connection;
    try {
      const executor = spec.syncUser ? await pool.getConnection() : pool;
      connection = spec.syncUser ? executor : null;
      if (connection) await connection.beginTransaction();
      const [[existing]] = await executor.execute(`SELECT id${spec.syncUser ? ", user_id" : ""} FROM ${table} WHERE id = ?${spec.syncUser ? " FOR UPDATE" : ""}`, [id]);
      if (!existing) throw new ApiError(404, "Registro no encontrado.");
      await executor.execute(
        `UPDATE ${table} SET ${spec.fields.map(field => `\`${field}\` = ?`).join(", ")} WHERE id = ?`,
        [...spec.fields.map(field => record[field]), id]
      );
      if (spec.syncUser && existing.user_id) {
        await executor.execute(
          `UPDATE Users SET email = ?, first_name = ?, last_name = ?, phone_number = ?,
             document_type = ?, document_number = ? WHERE id = ?`,
          [record.email, record.first_name, record.last_name, record.phone_number,
            record.document_type, record.document_number, existing.user_id]
        );
      }
      if (connection) await connection.commit();
      const [[updated]] = await pool.execute(`SELECT id, ${columnList} FROM ${table} WHERE id = ?`, [id]);
      res.json({ data: updated });
    } catch (error) {
      if (connection) await connection.rollback();
      if (isDuplicate(error)) throw new ApiError(409, "Ya existe un registro con esos datos.");
      if (isForeignKeyConflict(error)) throw new ApiError(409, "La referencia seleccionada no existe o está en uso.");
      throw error;
    } finally {
      if (connection) connection.release();
    }
  }));
  router.delete("/:id", asyncRoute(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) throw new ApiError(400, "Identificador no válido.");
    let connection;
    try {
      const executor = spec.deactivateUser ? await pool.getConnection() : pool;
      connection = spec.deactivateUser ? executor : null;
      if (connection) await connection.beginTransaction();
      if (spec.deactivateUser) {
        const [[client]] = await executor.execute("SELECT user_id FROM Clients WHERE id = ? FOR UPDATE", [id]);
        if (!client) throw new ApiError(404, "Registro no encontrado.");
        if (client.user_id) await executor.execute("UPDATE Users SET is_active = 0 WHERE id = ?", [client.user_id]);
      }
      const [result] = await executor.execute(`DELETE FROM ${table} WHERE id = ?`, [id]);
      if (!result.affectedRows) throw new ApiError(404, "Registro no encontrado.");
      if (connection) await connection.commit();
      res.status(204).end();
    } catch (error) {
      if (connection) await connection.rollback();
      if (isForeignKeyConflict(error)) throw new ApiError(409, "No se puede eliminar porque el registro tiene información relacionada.");
      throw error;
    } finally {
      if (connection) connection.release();
    }
  }));
  return router;
}

const routeSpec = {
  table: "Routes",
  fields: ["origin", "destination", "distance_km", "estimated_duration", "price", "is_active"],
  required: ["origin", "destination", "distance_km", "estimated_duration", "price", "is_active"],
  numbers: ["distance_km", "estimated_duration", "price"],
  integers: ["estimated_duration"],
  positive: ["distance_km", "estimated_duration"],
  booleans: ["is_active"],
  maxLengths: { origin: 100, destination: 100 }
};
const vehicleSpec = {
  table: "Vehicles",
  fields: ["plate_number", "brand", "model", "year", "capacity", "status"],
  required: ["plate_number", "brand", "model", "year", "capacity", "status"],
  numbers: ["year", "capacity"],
  integers: ["year", "capacity"],
  positive: ["year", "capacity"],
  maxLengths: { plate_number: 20, brand: 80, model: 80 },
  enums: { status: ["ACTIVE", "MAINTENANCE", "INACTIVE"] }
};
const driverSpec = {
  table: "Drivers",
  fields: ["first_name", "last_name", "document_type", "document_number", "phone_number", "email",
    "license_number", "license_type", "license_expiry_date"],
  required: ["first_name", "last_name", "document_type", "document_number", "license_number", "license_type", "license_expiry_date"],
  dates: ["license_expiry_date"],
  emails: ["email"],
  maxLengths: { first_name: 100, last_name: 100, document_number: 50, phone_number: 30, email: 254, license_number: 50, license_type: 30 },
  enums: { document_type: ["CC", "CE", "Pasaporte"] }
};
const clientSpec = {
  table: "Clients",
  fields: ["first_name", "last_name", "document_type", "document_number", "phone_number", "email", "user_type"],
  required: ["first_name", "last_name", "document_type", "document_number", "email", "user_type"],
  emails: ["email"],
  maxLengths: { first_name: 100, last_name: 100, email: 254, phone_number: 30, document_number: 50 },
  syncUser: true,
  deactivateUser: true,
  enums: { document_type: ["CC", "CE", "Pasaporte"], user_type: ["REGULAR", "FREQUENT", "CORPORATE"] }
};
const routesRouter = createCrudRouter(routeSpec);
const vehiclesRouter = createCrudRouter(vehicleSpec);
const driversRouter = createCrudRouter(driverSpec);
const clientsRouter = createCrudRouter(clientSpec);

function scheduleRecord(req) {
  const { route_id: routeId, date, time, vehicle_id: vehicleId, driver_id: driverId } = req.body || {};
  const ids = [routeId, vehicleId, driverId].map(Number);
  if (ids.some(id => !Number.isSafeInteger(id) || id < 1)) throw new ApiError(400, "Ruta, bus y conductor son obligatorios.");
  if (typeof date !== "string" || !isValidDate(date)) throw new ApiError(400, "Fecha no válida.");
  if (typeof time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(time)) throw new ApiError(400, "Hora no válida.");
  if (date < new Date().toISOString().slice(0, 10)) throw new ApiError(400, "La salida no puede programarse en el pasado.");
  return { route_id: ids[0], date, time: time.length === 5 ? `${time}:00` : time, vehicle_id: ids[1], driver_id: ids[2] };
}

async function assertScheduleReferences(connection, record) {
  const [[route]] = await connection.execute(
    "SELECT id, is_active, estimated_duration FROM Routes WHERE id = ?",
    [record.route_id]
  );
  const [[vehicle]] = await connection.execute("SELECT id, status FROM Vehicles WHERE id = ?", [record.vehicle_id]);
  const [[driver]] = await connection.execute("SELECT id FROM Drivers WHERE id = ?", [record.driver_id]);
  if (!route || !vehicle || !driver) throw new ApiError(400, "Ruta, bus o conductor no encontrado.");
  if (!route.is_active) throw new ApiError(409, "La ruta no está activa.");
  if (vehicle.status !== "ACTIVE") throw new ApiError(409, "El bus no está activo.");
  return Number(route.estimated_duration);
}

async function assertScheduleAvailability(connection, record, duration, ignoreId = 0, ignoreDriverId = ignoreId) {
  const [vehicles] = await connection.execute(
    `SELECT rs.id FROM RouteSchedules rs
     JOIN Routes r ON r.id = rs.route_id
     WHERE rs.vehicle_id = ? AND rs.is_active = 1 AND rs.id <> ?
       AND TIMESTAMP(rs.travel_date, rs.departure_time) < DATE_ADD(TIMESTAMP(?, ?), INTERVAL ? MINUTE)
       AND DATE_ADD(TIMESTAMP(rs.travel_date, rs.departure_time), INTERVAL r.estimated_duration MINUTE) > TIMESTAMP(?, ?)`,
    [record.vehicle_id, ignoreId, record.date, record.time, duration, record.date, record.time]
  );
  if (vehicles.length) throw new ApiError(409, "El bus ya tiene una salida que se cruza con ese horario.");
  const [drivers] = await connection.execute(
    `SELECT ds.id FROM DriverSchedules ds
     JOIN RouteSchedules rs ON rs.id = ds.route_schedule_id
     JOIN Routes r ON r.id = rs.route_id
     WHERE ds.driver_id = ? AND rs.is_active = 1 AND rs.id <> ?
       AND TIMESTAMP(rs.travel_date, rs.departure_time) < DATE_ADD(TIMESTAMP(?, ?), INTERVAL ? MINUTE)
       AND DATE_ADD(TIMESTAMP(rs.travel_date, rs.departure_time), INTERVAL r.estimated_duration MINUTE) > TIMESTAMP(?, ?)`,
    [record.driver_id, ignoreDriverId, record.date, record.time, duration, record.date, record.time]
  );
  if (drivers.length) throw new ApiError(409, "El conductor ya tiene una salida que se cruza con ese horario.");
}

const schedulesRouter = express.Router();
const scheduleSelect = `SELECT rs.id, rs.route_id,
  DATE_FORMAT(rs.travel_date, '%Y-%m-%d') AS date,
  TIME_FORMAT(rs.departure_time, '%H:%i') AS time,
  rs.vehicle_id, ds.driver_id
  FROM RouteSchedules rs LEFT JOIN DriverSchedules ds ON ds.route_schedule_id = rs.id`;

schedulesRouter.get("/", asyncRoute(async (req, res) => {
  const [rows] = await pool.query(`${scheduleSelect} ORDER BY rs.travel_date DESC, rs.departure_time DESC`);
  res.json({ data: rows });
}));
schedulesRouter.post("/", asyncRoute(async (req, res) => {
  const record = scheduleRecord(req);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute("SELECT id FROM Vehicles WHERE id = ? FOR UPDATE", [record.vehicle_id]);
    await connection.execute("SELECT id FROM Drivers WHERE id = ? FOR UPDATE", [record.driver_id]);
    const duration = await assertScheduleReferences(connection, record);
    await assertScheduleAvailability(connection, record, duration);
    const [result] = await connection.execute(
      "INSERT INTO RouteSchedules (route_id, travel_date, departure_time, vehicle_id) VALUES (?, ?, ?, ?)",
      [record.route_id, record.date, record.time, record.vehicle_id]
    );
    await connection.execute(
      "INSERT INTO DriverSchedules (route_schedule_id, driver_id) VALUES (?, ?)",
      [result.insertId, record.driver_id]
    );
    await connection.commit();
    res.status(201).json({ data: { id: result.insertId, ...record } });
  } catch (error) {
    await connection.rollback();
    if (isDuplicate(error)) throw new ApiError(409, "El bus o conductor ya está asignado a esa hora.");
    throw error;
  } finally {
    connection.release();
  }
}));
schedulesRouter.put("/:id", asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) throw new ApiError(400, "Identificador de salida no válido.");
  const record = scheduleRecord(req);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[existing]] = await connection.execute("SELECT id FROM RouteSchedules WHERE id = ? FOR UPDATE", [id]);
    if (!existing) throw new ApiError(404, "Salida no encontrada.");
    await connection.execute("SELECT id FROM Vehicles WHERE id = ? FOR UPDATE", [record.vehicle_id]);
    await connection.execute("SELECT id FROM Drivers WHERE id = ? FOR UPDATE", [record.driver_id]);
    const duration = await assertScheduleReferences(connection, record);
    await assertScheduleAvailability(connection, record, duration, id);
    const [result] = await connection.execute(
      "UPDATE RouteSchedules SET route_id = ?, travel_date = ?, departure_time = ?, vehicle_id = ? WHERE id = ?",
      [record.route_id, record.date, record.time, record.vehicle_id, id]
    );
    await connection.execute(
      `INSERT INTO DriverSchedules (route_schedule_id, driver_id) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE driver_id = VALUES(driver_id)`,
      [id, record.driver_id]
    );
    await connection.commit();
    res.json({ data: { id, ...record } });
  } catch (error) {
    await connection.rollback();
    if (isDuplicate(error)) throw new ApiError(409, "El bus o conductor ya está asignado a esa hora.");
    throw error;
  } finally {
    connection.release();
  }
}));
schedulesRouter.delete("/:id", asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) throw new ApiError(400, "Identificador de salida no válido.");
  try {
    const [result] = await pool.execute("DELETE FROM RouteSchedules WHERE id = ?", [id]);
    if (!result.affectedRows) throw new ApiError(404, "Salida no encontrada.");
    res.status(204).end();
  } catch (error) {
    if (isForeignKeyConflict(error)) throw new ApiError(409, "No se puede eliminar una salida con reservas asociadas.");
    throw error;
  }
}));

const driverSchedulesRouter = express.Router();
async function validateDriverAssignment(connection, scheduleId, driverId, ignoreAssignmentScheduleId = 0) {
  const [[schedule]] = await connection.execute(
    `SELECT rs.id, rs.vehicle_id, DATE_FORMAT(rs.travel_date, '%Y-%m-%d') AS date,
      TIME_FORMAT(rs.departure_time, '%H:%i:%s') AS time, r.estimated_duration
     FROM RouteSchedules rs JOIN Routes r ON r.id = rs.route_id
     WHERE rs.id = ? AND rs.is_active = 1 FOR UPDATE`,
    [scheduleId]
  );
  if (!schedule) throw new ApiError(400, "Salida no encontrada o inactiva.");
  await connection.execute("SELECT id FROM Vehicles WHERE id = ? FOR UPDATE", [schedule.vehicle_id]);
  await connection.execute("SELECT id FROM Drivers WHERE id = ? FOR UPDATE", [driverId]);
  const record = {
    vehicle_id: schedule.vehicle_id,
    driver_id: driverId,
    date: schedule.date,
    time: schedule.time
  };
  await assertScheduleAvailability(
    connection,
    record,
    Number(schedule.estimated_duration),
    scheduleId,
    ignoreAssignmentScheduleId || scheduleId
  );
}

driverSchedulesRouter.get("/", asyncRoute(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT ds.id, ds.route_schedule_id AS schedule_id, ds.driver_id,
      DATE_FORMAT(rs.travel_date, '%Y-%m-%d') AS date,
      TIME_FORMAT(rs.departure_time, '%H:%i') AS time,
      d.first_name, d.last_name
     FROM DriverSchedules ds JOIN RouteSchedules rs ON rs.id = ds.route_schedule_id
     JOIN Drivers d ON d.id = ds.driver_id ORDER BY rs.travel_date, rs.departure_time`
  );
  res.json({ data: rows });
}));
driverSchedulesRouter.post("/", asyncRoute(async (req, res) => {
  const scheduleId = Number(req.body.schedule_id);
  const driverId = Number(req.body.driver_id);
  if (!Number.isSafeInteger(scheduleId) || !Number.isSafeInteger(driverId) || scheduleId < 1 || driverId < 1) {
    throw new ApiError(400, "Salida y conductor son obligatorios.");
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await validateDriverAssignment(connection, scheduleId, driverId);
    const [result] = await connection.execute(
      "INSERT INTO DriverSchedules (route_schedule_id, driver_id) VALUES (?, ?)",
      [scheduleId, driverId]
    );
    await connection.commit();
    res.status(201).json({ data: { id: result.insertId, schedule_id: scheduleId, driver_id: driverId } });
  } catch (error) {
    await connection.rollback();
    if (isDuplicate(error)) throw new ApiError(409, "La salida ya tiene conductor asignado.");
    if (isForeignKeyConflict(error)) throw new ApiError(400, "Salida o conductor no encontrado.");
    throw error;
  } finally {
    connection.release();
  }
}));
driverSchedulesRouter.put("/:id", asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  const scheduleId = Number(req.body.schedule_id);
  const driverId = Number(req.body.driver_id);
  if (![id, scheduleId, driverId].every(value => Number.isSafeInteger(value) && value > 0)) {
    throw new ApiError(400, "Identificadores de asignación no válidos.");
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[assignment]] = await connection.execute(
      "SELECT id, route_schedule_id FROM DriverSchedules WHERE id = ? FOR UPDATE",
      [id]
    );
    if (!assignment) throw new ApiError(404, "Asignación no encontrada.");
    await validateDriverAssignment(connection, scheduleId, driverId, assignment.route_schedule_id);
    await connection.execute(
      "UPDATE DriverSchedules SET route_schedule_id = ?, driver_id = ? WHERE id = ?",
      [scheduleId, driverId, id]
    );
    await connection.commit();
    res.json({ data: { id, schedule_id: scheduleId, driver_id: driverId } });
  } catch (error) {
    await connection.rollback();
    if (isDuplicate(error)) throw new ApiError(409, "Ya existe una asignación para esa salida.");
    if (isForeignKeyConflict(error)) throw new ApiError(400, "Salida o conductor no encontrado.");
    throw error;
  } finally {
    connection.release();
  }
}));
driverSchedulesRouter.delete("/:id", asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) throw new ApiError(400, "Identificador no válido.");
  const [result] = await pool.execute("DELETE FROM DriverSchedules WHERE id = ?", [id]);
  if (!result.affectedRows) throw new ApiError(404, "Asignación no encontrada.");
  res.status(204).end();
}));

const salesRouter = express.Router();
salesRouter.get("/", asyncRoute(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT s.id, s.reservation_id, r.client_id, r.route_schedule_id AS schedule_id,
      r.seat_count, r.status, CAST(s.amount AS DOUBLE) AS amount,
      DATE_FORMAT(s.created_at, '%Y-%m-%d') AS date,
      CONCAT_WS(' ', c.first_name, c.last_name) AS client_name,
      GROUP_CONCAT(DISTINCT CONCAT_WS(' ', rp.first_name, rp.last_name) ORDER BY rp.id SEPARATOR '; ') AS passengers
     FROM Sales s JOIN Reservations r ON r.id = s.reservation_id
     JOIN Clients c ON c.id = r.client_id
     LEFT JOIN ReservationPassengers rp ON rp.reservation_id = r.id
     GROUP BY s.id, s.reservation_id, r.client_id, r.route_schedule_id, r.seat_count,
       r.status, s.amount, s.created_at, c.first_name, c.last_name
     ORDER BY s.created_at DESC`
  );
  for (const row of rows) {
    const [seats] = await pool.execute(
      "SELECT seat_number FROM ReservationPassengers WHERE reservation_id = ? ORDER BY seat_number",
      [row.reservation_id]
    );
    row.seat_numbers = seats.map(seat => seat.seat_number);
  }
  res.json({ data: rows });
}));

const summary = asyncRoute(async (req, res) => {
  const [[totals]] = await pool.query(
    `SELECT
      (SELECT COUNT(*) FROM Routes WHERE is_active = 1) AS active_routes,
      (SELECT COUNT(*) FROM Vehicles) AS vehicles,
      (SELECT COUNT(*) FROM Drivers) AS drivers,
      (SELECT COUNT(*) FROM Clients) AS clients,
      (SELECT COUNT(*) FROM RouteSchedules) AS schedules,
      (SELECT COUNT(*) FROM Sales) AS sales,
      (SELECT COALESCE(SUM(amount), 0) FROM Sales) AS revenue`
  );
  res.json({ data: totals });
});

module.exports = {
  routesRouter,
  vehiclesRouter,
  driversRouter,
  clientsRouter,
  schedulesRouter,
  driverSchedulesRouter,
  salesRouter,
  summary,
  parseRecord,
  routeSpec,
  vehicleSpec,
  driverSpec,
  clientSpec
};
