CREATE TABLE IF NOT EXISTS Roles (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(40) NOT NULL,
  description VARCHAR(255) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_roles_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS Permissions (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(80) NOT NULL,
  description VARCHAR(255) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_permissions_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS RolePermissions (
  role_id INT UNSIGNED NOT NULL,
  permission_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  CONSTRAINT fk_role_permissions_role FOREIGN KEY (role_id) REFERENCES Roles(id) ON DELETE CASCADE,
  CONSTRAINT fk_role_permissions_permission FOREIGN KEY (permission_id) REFERENCES Permissions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS Users (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  role_id INT UNSIGNED NOT NULL,
  email VARCHAR(254) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  phone_number VARCHAR(30) NULL,
  document_type ENUM('CC', 'CE', 'Pasaporte') NULL,
  document_number VARCHAR(50) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_document (document_type, document_number),
  KEY idx_users_role_active (role_id, is_active),
  CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES Roles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS Clients (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(254) NOT NULL,
  phone_number VARCHAR(30) NULL,
  document_type ENUM('CC', 'CE', 'Pasaporte') NOT NULL,
  document_number VARCHAR(50) NOT NULL,
  user_type ENUM('REGULAR', 'FREQUENT', 'CORPORATE') NOT NULL DEFAULT 'REGULAR',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_clients_user (user_id),
  UNIQUE KEY uq_clients_email (email),
  UNIQUE KEY uq_clients_document (document_type, document_number),
  CONSTRAINT fk_clients_user FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS Drivers (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  document_type ENUM('CC', 'CE', 'Pasaporte') NOT NULL,
  document_number VARCHAR(50) NOT NULL,
  phone_number VARCHAR(30) NULL,
  email VARCHAR(254) NULL,
  license_number VARCHAR(50) NOT NULL,
  license_type VARCHAR(30) NOT NULL,
  license_expiry_date DATE NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_drivers_document (document_type, document_number),
  UNIQUE KEY uq_drivers_license (license_number),
  UNIQUE KEY uq_drivers_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS Vehicles (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  plate_number VARCHAR(20) NOT NULL,
  brand VARCHAR(80) NOT NULL,
  model VARCHAR(80) NOT NULL,
  year SMALLINT UNSIGNED NOT NULL,
  capacity SMALLINT UNSIGNED NOT NULL,
  status ENUM('ACTIVE', 'MAINTENANCE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_vehicles_plate (plate_number),
  CONSTRAINT chk_vehicle_capacity CHECK (capacity > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS Routes (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  origin VARCHAR(100) NOT NULL,
  destination VARCHAR(100) NOT NULL,
  distance_km DECIMAL(8,2) NOT NULL,
  estimated_duration INT UNSIGNED NOT NULL,
  price DECIMAL(12,2) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_routes_origin_destination (origin, destination),
  CONSTRAINT chk_route_different_places CHECK (origin <> destination),
  CONSTRAINT chk_route_price CHECK (price >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS RouteSchedules (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  route_id INT UNSIGNED NOT NULL,
  travel_date DATE NOT NULL,
  departure_time TIME NOT NULL,
  vehicle_id INT UNSIGNED NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_schedule_vehicle_departure (vehicle_id, travel_date, departure_time),
  KEY idx_schedule_route_date (route_id, travel_date, departure_time, is_active),
  CONSTRAINT fk_route_schedules_route FOREIGN KEY (route_id) REFERENCES Routes(id),
  CONSTRAINT fk_route_schedules_vehicle FOREIGN KEY (vehicle_id) REFERENCES Vehicles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS DriverSchedules (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  route_schedule_id INT UNSIGNED NOT NULL,
  driver_id INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_driver_schedule_assignment (route_schedule_id),
  KEY idx_driver_schedules_driver (driver_id),
  CONSTRAINT fk_driver_schedules_schedule FOREIGN KEY (route_schedule_id) REFERENCES RouteSchedules(id) ON DELETE CASCADE,
  CONSTRAINT fk_driver_schedules_driver FOREIGN KEY (driver_id) REFERENCES Drivers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS Reservations (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  client_id INT UNSIGNED NOT NULL,
  route_schedule_id INT UNSIGNED NOT NULL,
  seat_count SMALLINT UNSIGNED NOT NULL,
  status ENUM('PENDING', 'CONFIRMED', 'CANCELED') NOT NULL DEFAULT 'PENDING',
  payment_method ENUM('PENDING', 'TRANSFER', 'CASH') NOT NULL DEFAULT 'PENDING',
  total_amount DECIMAL(12,2) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_reservations_client_created (client_id, created_at),
  KEY idx_reservations_schedule_status (route_schedule_id, status),
  CONSTRAINT fk_reservations_client FOREIGN KEY (client_id) REFERENCES Clients(id),
  CONSTRAINT fk_reservations_schedule FOREIGN KEY (route_schedule_id) REFERENCES RouteSchedules(id),
  CONSTRAINT chk_reservation_seat_count CHECK (seat_count > 0),
  CONSTRAINT chk_reservation_amount CHECK (total_amount >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS ReservationPassengers (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  reservation_id INT UNSIGNED NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  document_type ENUM('CC', 'CE', 'Pasaporte') NOT NULL,
  document_number VARCHAR(50) NOT NULL,
  seat_number SMALLINT UNSIGNED NOT NULL,
  is_client TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_reservation_passenger_seat (reservation_id, seat_number),
  KEY idx_passenger_document (document_type, document_number),
  CONSTRAINT fk_passengers_reservation FOREIGN KEY (reservation_id) REFERENCES Reservations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS ReservedSeats (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  route_schedule_id INT UNSIGNED NOT NULL,
  reservation_id INT UNSIGNED NOT NULL,
  seat_number SMALLINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_schedule_seat (route_schedule_id, seat_number),
  UNIQUE KEY uq_reserved_seat_reservation (reservation_id, seat_number),
  CONSTRAINT fk_reserved_seats_schedule FOREIGN KEY (route_schedule_id) REFERENCES RouteSchedules(id),
  CONSTRAINT fk_reserved_seats_reservation FOREIGN KEY (reservation_id) REFERENCES Reservations(id) ON DELETE CASCADE,
  CONSTRAINT chk_reserved_seat_number CHECK (seat_number > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS Sales (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  reservation_id INT UNSIGNED NOT NULL,
  payment_method ENUM('PENDING', 'TRANSFER', 'CASH') NOT NULL DEFAULT 'PENDING',
  payment_status ENUM('PENDING', 'PAID', 'FAILED', 'CANCELED', 'REFUNDED') NOT NULL DEFAULT 'PENDING',
  amount DECIMAL(12,2) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sales_reservation (reservation_id),
  KEY idx_sales_created (created_at),
  CONSTRAINT fk_sales_reservation FOREIGN KEY (reservation_id) REFERENCES Reservations(id),
  CONSTRAINT chk_sale_amount CHECK (amount >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT IGNORE INTO Roles (name, description) VALUES
  ('ADMINISTRADOR', 'Administra la operación de Linares Transport'),
  ('CLIENTE', 'Consulta viajes y gestiona sus reservas');

INSERT IGNORE INTO Permissions (name, description) VALUES
  ('manage_routes', 'Crear, editar y eliminar rutas'),
  ('manage_fleet', 'Administrar buses y conductores'),
  ('manage_schedules', 'Programar salidas y conductores'),
  ('manage_clients', 'Administrar perfiles de clientes'),
  ('view_sales', 'Consultar ventas y reportes'),
  ('book_trips', 'Buscar y reservar viajes');

INSERT IGNORE INTO RolePermissions (role_id, permission_id)
SELECT r.id, p.id FROM Roles r CROSS JOIN Permissions p
WHERE r.name = 'ADMINISTRADOR';

INSERT IGNORE INTO RolePermissions (role_id, permission_id)
SELECT r.id, p.id FROM Roles r JOIN Permissions p ON p.name = 'book_trips'
WHERE r.name = 'CLIENTE';

CREATE TABLE IF NOT EXISTS UserSessions (
  session_id VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
  expires INT UNSIGNED NOT NULL,
  data MEDIUMTEXT NULL,
  PRIMARY KEY (session_id),
  KEY idx_user_sessions_expires (expires)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
