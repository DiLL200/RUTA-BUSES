const express = require("express");
const pool = require("./db");
const { ApiError, asyncRoute } = require("./errors");

const router = express.Router();
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
function isValidDate(value) {
  if (!datePattern.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
const scheduleSelect = `SELECT rs.id AS schedule_id, rs.route_id, r.origin, r.destination,
  DATE_FORMAT(rs.travel_date, '%Y-%m-%d') AS date,
  TIME_FORMAT(rs.departure_time, '%H:%i') AS departure_time,
  r.estimated_duration AS duration_minutes, r.price, 'COP' AS currency,
  v.id AS vehicle_id, v.brand, v.model, v.capacity,
  TIME_FORMAT(ADDTIME(rs.departure_time, SEC_TO_TIME(r.estimated_duration * 60)), '%H:%i') AS arrival_time
  FROM RouteSchedules rs
  JOIN Routes r ON r.id = rs.route_id AND r.is_active = 1
  JOIN Vehicles v ON v.id = rs.vehicle_id AND v.status = 'ACTIVE'
  WHERE rs.is_active = 1 AND TIMESTAMP(rs.travel_date, rs.departure_time) > CURRENT_TIMESTAMP`;

router.get("/search", asyncRoute(async (req, res) => {
  const { origin, destination, date } = req.query;
  const passengers = Number(req.query.passengers || 1);
  if (typeof origin !== "string" || typeof destination !== "string" || origin.trim() === "" || destination.trim() === "") {
    throw new ApiError(400, "Origen y destino son obligatorios.");
  }
  if (origin.trim() === destination.trim()) throw new ApiError(400, "El origen y el destino deben ser diferentes.");
  if (typeof date !== "string" || !isValidDate(date)) {
    throw new ApiError(400, "La fecha de viaje no es válida.");
  }
  if (!Number.isInteger(passengers) || passengers < 1 || passengers > 40) {
    throw new ApiError(400, "La cantidad de pasajeros debe estar entre 1 y 40.");
  }
  const [rows] = await pool.execute(
    `${scheduleSelect} AND r.origin = ? AND r.destination = ? AND rs.travel_date = ?
     ORDER BY rs.departure_time`,
    [origin.trim(), destination.trim(), date]
  );
  const data = [];
  for (const row of rows) {
    const [seats] = await pool.execute(
      "SELECT seat_number FROM ReservedSeats WHERE route_schedule_id = ? ORDER BY seat_number",
      [row.schedule_id]
    );
    const occupied = seats.map(seat => seat.seat_number);
    const available = Math.max(0, row.capacity - occupied.length);
    if (available < passengers) continue;
    data.push({
      schedule_id: row.schedule_id,
      route_id: row.route_id,
      origin: row.origin,
      destination: row.destination,
      date: row.date,
      departure_time: row.departure_time,
      arrival_time: row.arrival_time,
      duration_minutes: row.duration_minutes,
      price: Number(row.price),
      currency: row.currency,
      available_seats: available,
      vehicle: { id: row.vehicle_id, brand: row.brand, model: row.model },
      vehicle_id: row.vehicle_id,
      capacity: row.capacity,
      occupied_seats: occupied
    });
  }
  res.json({ data });
}));

router.get("/:id", asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) throw new ApiError(400, "Identificador de salida no válido.");
  const [[row]] = await pool.execute(`${scheduleSelect} AND rs.id = ? LIMIT 1`, [id]);
  if (!row) throw new ApiError(404, "Salida no encontrada.");
  const [seats] = await pool.execute(
    "SELECT seat_number FROM ReservedSeats WHERE route_schedule_id = ? ORDER BY seat_number",
    [id]
  );
  const occupied = seats.map(seat => seat.seat_number);
  res.json({
    data: {
      schedule_id: row.schedule_id,
      route_id: row.route_id,
      origin: row.origin,
      destination: row.destination,
      date: row.date,
      departure_time: row.departure_time,
      arrival_time: row.arrival_time,
      duration_minutes: row.duration_minutes,
      price: Number(row.price),
      currency: row.currency,
      available_seats: Math.max(0, row.capacity - occupied.length),
      occupied_seats: occupied,
      capacity: row.capacity,
      vehicle: { id: row.vehicle_id, brand: row.brand, model: row.model }
    }
  });
}));

module.exports = router;
