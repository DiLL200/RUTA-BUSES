const test = require("node:test");
const assert = require("node:assert/strict");
const { parseRecord, routeSpec, vehicleSpec, clientSpec } = require("../src/admin");

function request(body) {
  return { body };
}

test("route records convert numeric inputs and boolean status", () => {
  const record = parseRecord(request({
    origin: "Medellín",
    destination: "Bogotá",
    distance_km: "415.5",
    estimated_duration: "540",
    price: "85000",
    is_active: "1"
  }), routeSpec);

  assert.equal(record.distance_km, 415.5);
  assert.equal(record.estimated_duration, 540);
  assert.equal(record.price, 85000);
  assert.equal(record.is_active, 1);
});

test("route records reject same-place routes and non-integer durations", () => {
  const valid = {
    origin: "Bogotá",
    destination: "Bogotá",
    distance_km: 10,
    estimated_duration: 60,
    price: 20000,
    is_active: 1
  };
  assert.throws(() => parseRecord(request(valid), routeSpec), /diferentes/);
  assert.throws(() => parseRecord(request({ ...valid, destination: "Cali", estimated_duration: 60.5 }), routeSpec), /entero/);
});

test("vehicle records reject invalid status and zero capacity", () => {
  const record = {
    plate_number: "ABC123",
    brand: "Marca",
    model: "Modelo",
    year: 2022,
    capacity: 0,
    status: "UNKNOWN"
  };
  assert.throws(() => parseRecord(request(record), vehicleSpec), /mayor que cero/);
  assert.throws(() => parseRecord(request({ ...record, capacity: 40 }), vehicleSpec), /no es válido/);
});

test("client email and document type are validated", () => {
  const client = {
    first_name: "Ana",
    last_name: "Pérez",
    document_type: "CC",
    document_number: "12345",
    phone_number: "",
    email: "correo-no-valido",
    user_type: "REGULAR"
  };
  assert.throws(() => parseRecord(request(client), clientSpec), /correo/);
  assert.throws(() => parseRecord(request({ ...client, email: "ana@example.com", document_type: "OTHER" }), clientSpec), /no es válido/);
});
