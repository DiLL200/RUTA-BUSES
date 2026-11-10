class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function notFound(res, resource = "Registro") {
  res.status(404).json({ message: `${resource} no encontrado.` });
}

function isDuplicate(error) {
  return error && error.code === "ER_DUP_ENTRY";
}

function isForeignKeyConflict(error) {
  return error && ["ER_ROW_IS_REFERENCED_2", "ER_NO_REFERENCED_ROW_2"].includes(error.code);
}

module.exports = { ApiError, asyncRoute, notFound, isDuplicate, isForeignKeyConflict };
