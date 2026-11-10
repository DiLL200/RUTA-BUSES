(function () {
  const config = window.LINARES_CONFIG;

  async function request(path, options = {}) {
    let response;
    try {
      response = await fetch(`${config.API_BASE_URL}${path}`, {
        ...options,
        headers: { "Content-Type": "application/json", ...(options.headers || {}) },
        credentials: "include"
      });
    } catch (error) {
      const networkError = new Error("No se pudo conectar con el servidor. Verifica que el backend esté iniciado.");
      networkError.cause = error;
      throw networkError;
    }
    const payload = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(payload?.message || `Error HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  function entity(path) {
    return {
      list: () => request(path),
      create: data => request(path, { method: "POST", body: JSON.stringify(data) }),
      update: (id, data) => request(`${path}/${id}`, { method: "PUT", body: JSON.stringify(data) }),
      remove: id => request(`${path}/${id}`, { method: "DELETE" })
    };
  }

  window.LinaresAPI = {
    request,
    public: {
      routes: () => request("/public/routes")
    },
    auth: {
      login: data => request("/auth/login", { method: "POST", body: JSON.stringify(data) }),
      register: data => request("/auth/register", { method: "POST", body: JSON.stringify(data) }),
      me: () => request("/auth/me"),
      logout: () => request("/auth/logout", { method: "POST" })
    },
    trips: {
      search: params => request(`/trips/search?${new URLSearchParams(params)}`),
      get: id => request(`/trips/${id}`)
    },
    bookings: {
      create: data => request("/reservations", { method: "POST", body: JSON.stringify(data) }),
      mine: () => request("/reservations/mine"),
      get: id => request(`/reservations/${id}`),
      cancel: id => request(`/reservations/${id}/cancel`, { method: "PATCH" })
    },
    admin: {
      routes: entity("/routes"),
      vehicles: entity("/vehicles"),
      drivers: entity("/drivers"),
      clients: entity("/clients"),
      schedules: entity("/route-schedules"),
      driverSchedules: entity("/driver-schedules"),
      sales: { list: () => request("/sales") },
      reports: { summary: () => request("/reports/summary") }
    }
  };
})();
