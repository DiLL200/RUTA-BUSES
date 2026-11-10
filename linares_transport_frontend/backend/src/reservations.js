const express = require("express");
const pool = require("./db");
const { ApiError, asyncRoute } = require("./errors");

const router = express.Router();
const paymentMethods = ["PENDING", "TRANSFER", "CASH"];
const documentTypes = ["CC", "CE", "Pasaporte"];

function assertText(value, label, maxLength) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maxLength) {
    throw new ApiError(400, `${label} es obligatorio y debe tener máximo ${maxLength} caracteres.`);
  }
  return value.trim();
}

function reservationQuery(where) {
  return `SELECT r.id, r.client_id, r.route_schedule_id, r.seat_count, r.status,
    r.payment_method, CAST(r.total_amount AS DOUBLE) AS amount,
    DATE_FORMAT(r.created_at, '%Y-%m-%d') AS date,
    rs.route_id, DATE_FORMAT(rs.travel_date, '%Y-%m-%d') AS travel_date,
    TIME_FORMAT(rs.departure_time, '%H:%i') AS departure_time,
    ro.origin, ro.destination, c.first_name AS client_first_name, c.last_name AS client_last_name
    FROM Reservations r
    JOIN RouteSchedules rs ON rs.id = r.route_schedule_id
    JOIN Routes ro ON ro.id = rs.route_id
    JOIN Clients c ON c.id = r.client_id ${where}`;
}

async function addReservationDetails(rows) {
  const data = [];
  for (const row of rows) {
    const [seats] = await pool.execute(
      "SELECT seat_number FROM ReservationPassengers WHERE reservation_id = ? ORDER BY seat_number",
      [row.id]
    );
    const [passengers] = await pool.execute(
      `SELECT first_name, last_name, document_type, document_number, seat_number
       FROM ReservationPassengers WHERE reservation_id = ? ORDER BY id`,
      [row.id]
    );
    data.push({
      id: row.id,
      reservation_id: row.id,
      client_id: row.client_id,
      schedule_id: row.route_schedule_id,
      route_schedule_id: row.route_schedule_id,
      route_id: row.route_id,
      origin: row.origin,
      destination: row.destination,
      date: row.travel_date,
      time: row.departure_time,
      seat_count: row.seat_count,
      seat_numbers: seats.map(seat => seat.seat_number),
      status: row.status,
      payment_method: row.payment_method,
      amount: row.amount,
      created_at: row.date,
      client_name: `${row.client_first_name} ${row.client_last_name}`,
      passengers: passengers.map(passenger => ({
        ...passenger,
        full_name: `${passenger.first_name} ${passenger.last_name}`
      }))
    });
  }
  return data;
}

router.post("/", asyncRoute(async (req, res) => {
  const scheduleId = Number(req.body.route_schedule_id);
  const seatNumbers = req.body.seat_numbers;
  const passengers = req.body.passengers;
  const paymentMethod = req.body.payment_method || "PENDING";
  if (!Number.isSafeInteger(scheduleId) || scheduleId < 1) throw new ApiError(400, "Salida no válida.");
  if (!Array.isArray(seatNumbers) || !seatNumbers.length || seatNumbers.length > 40 ||
      seatNumbers.some(seat => !Number.isInteger(seat) || seat < 1) ||
      new Set(seatNumbers).size !== seatNumbers.length) {
    throw new ApiError(400, "Selecciona puestos válidos, sin repetir.");
  }
  if (!Array.isArray(passengers) || passengers.length !== seatNumbers.length) {
    throw new ApiError(400, "Debe haber un pasajero por cada puesto seleccionado.");
  }
  if (!paymentMethods.includes(paymentMethod)) throw new ApiError(400, "Medio de pago no válido.");
  for (const passenger of passengers) {
    assertText(passenger.first_name, "Nombre del pasajero", 100);
    assertText(passenger.last_name, "Apellido del pasajero", 100);
    assertText(passenger.document_number, "Documento del pasajero", 50);
    if (!documentTypes.includes(passenger.document_type)) throw new ApiError(400, "Tipo de documento no válido.");
  }

  const connection = await pool.getConnection();
  let reservationId;
  try {
    await connection.beginTransaction();
    const [schedules] = await connection.execute(
      `SELECT rs.id, rs.vehicle_id, r.price, v.capacity
       FROM RouteSchedules rs
       JOIN Routes r ON r.id = rs.route_id AND r.is_active = 1
       JOIN Vehicles v ON v.id = rs.vehicle_id AND v.status = 'ACTIVE'
       WHERE rs.id = ? AND rs.is_active = 1
         AND TIMESTAMP(rs.travel_date, rs.departure_time) > CURRENT_TIMESTAMP
       FOR UPDATE`,
      [scheduleId]
    );
    if (!schedules.length) throw new ApiError(404, "La salida no existe o ya no está disponible.");
    const schedule = schedules[0];
    if (seatNumbers.some(seat => seat > schedule.capacity)) throw new ApiError(400, "Un puesto supera la capacidad del bus.");
    const [clientRows] = await connection.execute(
      "SELECT id FROM Clients WHERE user_id = ? LIMIT 1",
      [req.user.id]
    );
    if (!clientRows.length) throw new ApiError(403, "La cuenta no tiene un perfil de cliente.");
    const clientId = clientRows[0].id;
    const [occupied] = await connection.execute(
      `SELECT seat_number FROM ReservedSeats
       WHERE route_schedule_id = ? AND seat_number IN (${seatNumbers.map(() => "?").join(",")})
       FOR UPDATE`,
      [scheduleId, ...seatNumbers]
    );
    if (occupied.length) throw new ApiError(409, "Uno o más puestos ya fueron ocupados. Actualiza el mapa de sillas.");
    const amount = Number(schedule.price) * seatNumbers.length;
    const [created] = await connection.execute(
      `INSERT INTO Reservations
        (client_id, route_schedule_id, seat_count, status, payment_method, total_amount)
       VALUES (?, ?, ?, 'PENDING', ?, ?)`,
      [clientId, scheduleId, seatNumbers.length, paymentMethod, amount]
    );
    reservationId = created.insertId;
    for (let index = 0; index < seatNumbers.length; index += 1) {
      const passenger = passengers[index];
      await connection.execute(
        `INSERT INTO ReservationPassengers
          (reservation_id, first_name, last_name, document_type, document_number, seat_number, is_client)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          reservationId,
          passenger.first_name.trim(),
          passenger.last_name.trim(),
          passenger.document_type,
          passenger.document_number.trim(),
          seatNumbers[index],
          passenger.document_type === req.user.document_type &&
            passenger.document_number.trim() === req.user.document_number ? 1 : 0
        ]
      );
      await connection.execute(
        "INSERT INTO ReservedSeats (route_schedule_id, reservation_id, seat_number) VALUES (?, ?, ?)",
        [scheduleId, reservationId, seatNumbers[index]]
      );
    }
    await connection.execute(
      `INSERT INTO Sales (reservation_id, payment_method, payment_status, amount)
       VALUES (?, ?, 'PENDING', ?)`,
      [reservationId, paymentMethod, amount]
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    if (error.code === "ER_DUP_ENTRY") {
      throw new ApiError(409, "Uno o más puestos ya fueron ocupados. Actualiza el mapa de sillas.");
    }
    throw error;
  } finally {
    connection.release();
  }

  const [[row]] = await pool.execute(reservationQuery("WHERE r.id = ?"), [reservationId]);
  const [data] = await addReservationDetails([row]);
  res.status(201).json({ data });
}));

router.get("/mine", asyncRoute(async (req, res) => {
  const [[client]] = await pool.execute("SELECT id FROM Clients WHERE user_id = ? LIMIT 1", [req.user.id]);
  if (!client) return res.json({ data: [] });
  const [rows] = await pool.execute(
    `${reservationQuery("WHERE r.client_id = ? ORDER BY r.created_at DESC")}`,
    [client.id]
  );
  res.json({ data: await addReservationDetails(rows) });
}));

router.get("/:id", asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) throw new ApiError(400, "Identificador de reserva no válido.");
  const where = req.user.role === "ADMINISTRADOR" ? "WHERE r.id = ?" : "WHERE r.id = ? AND c.user_id = ?";
  const values = req.user.role === "ADMINISTRADOR" ? [id] : [id, req.user.id];
  const [rows] = await pool.execute(reservationQuery(where), values);
  if (!rows.length) throw new ApiError(404, "Reserva no encontrada.");
  const [data] = await addReservationDetails(rows);
  res.json({ data });
}));

router.patch("/:id/cancel", asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) throw new ApiError(400, "Identificador de reserva no válido.");
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      `SELECT r.id, r.status, rs.travel_date
       FROM Reservations r JOIN RouteSchedules rs ON rs.id = r.route_schedule_id
       JOIN Clients c ON c.id = r.client_id
       WHERE r.id = ? AND (? = 'ADMINISTRADOR' OR c.user_id = ?)
       FOR UPDATE`,
      [id, req.user.role, req.user.id]
    );
    if (!rows.length) throw new ApiError(404, "Reserva no encontrada.");
    if (rows[0].status !== "PENDING" || rows[0].travel_date < new Date().toISOString().slice(0, 10)) {
      throw new ApiError(409, "Solo se pueden cancelar reservas pendientes de una salida futura.");
    }
    await connection.execute("UPDATE Reservations SET status = 'CANCELED' WHERE id = ?", [id]);
    await connection.execute("UPDATE Sales SET payment_status = 'CANCELED' WHERE reservation_id = ?", [id]);
    await connection.execute("DELETE FROM ReservedSeats WHERE reservation_id = ?", [id]);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  res.json({ data: { id, status: "CANCELED" } });
}));

module.exports = router;
