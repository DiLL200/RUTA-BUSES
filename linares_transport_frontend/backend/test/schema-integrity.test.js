const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const schema = fs.readFileSync(path.join(__dirname, "..", "..", "database", "schema.sql"), "utf8");

test("schema includes all application tables", () => {
  for (const table of [
    "Roles", "Permissions", "RolePermissions", "Users", "Clients", "Drivers", "Vehicles",
    "Routes", "RouteSchedules", "DriverSchedules", "Reservations", "ReservationPassengers",
    "ReservedSeats", "Sales", "UserSessions"
  ]) {
    assert.match(schema, new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\(`));
  }
});

test("a seat can only be reserved once per scheduled departure", () => {
  assert.match(schema, /UNIQUE KEY uq_schedule_seat \(route_schedule_id, seat_number\)/);
});

test("reservation children are transactionally tied to their reservation", () => {
  assert.match(schema, /fk_passengers_reservation FOREIGN KEY \(reservation_id\) REFERENCES Reservations\(id\) ON DELETE CASCADE/);
  assert.match(schema, /fk_reserved_seats_reservation FOREIGN KEY \(reservation_id\) REFERENCES Reservations\(id\) ON DELETE CASCADE/);
  assert.match(schema, /uq_sales_reservation \(reservation_id\)/);
});
