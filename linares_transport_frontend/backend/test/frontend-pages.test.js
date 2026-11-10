const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const frontend = path.join(__dirname, "..", "..", "frontend");
const read = file => fs.readFileSync(path.join(frontend, file), "utf8");

test("page entry points select distinct public and customer views", () => {
  assert.match(read("index.html"), /data-page="home"/);
  assert.match(read("login.html"), /data-page="auth" data-auth-mode="login"/);
  assert.match(read("register.html"), /data-page="auth" data-auth-mode="register"/);
  assert.match(read("customer.html"), /data-page="customer"/);
});

test("every admin section has a direct page entry", () => {
  const sections = {
    "admin.html": "overview",
    "routes.html": "routes",
    "vehicles.html": "vehicles",
    "drivers.html": "drivers",
    "clients.html": "clients",
    "schedules.html": "schedules",
    "sales.html": "sales",
    "reports.html": "reports"
  };
  for (const [file, section] of Object.entries(sections)) {
    assert.match(read(file), new RegExp(`data-page="admin" data-admin-page="${section}"`));
  }
});

test("page loader requests each shared page fragment before initializing the app", () => {
  const loader = read("js/page-loader.js");
  for (const fragment of ["home", "auth", "admin", "customer", "modals"]) {
    assert.match(loader, new RegExp(`"${fragment}\\.html"`));
  }
  assert.ok(loader.indexOf('innerHTML = fragments.join') < loader.indexOf('loadScript("js/app.js")'));
});

test("admin navigation points at the matching standalone pages", () => {
  const admin = read("partials/admin.html");
  for (const [file, section] of [
    ["admin.html", "overview"],
    ["routes.html", "routes"],
    ["vehicles.html", "vehicles"],
    ["drivers.html", "drivers"],
    ["clients.html", "clients"],
    ["schedules.html", "schedules"],
    ["sales.html", "sales"],
    ["reports.html", "reports"]
  ]) {
    assert.match(admin, new RegExp(`href="${file}" data-page="${section}"`));
  }
});
