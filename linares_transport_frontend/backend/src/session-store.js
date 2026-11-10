const session = require("express-session");
const pool = require("./db");

class MySqlSessionStore extends session.Store {
  get(sessionId, callback) {
    pool.execute(
      "SELECT data FROM UserSessions WHERE session_id = ? AND expires > ? LIMIT 1",
      [sessionId, Math.floor(Date.now() / 1000)]
    ).then(([rows]) => {
      if (!rows.length) return callback(null, null);
      try {
        callback(null, JSON.parse(rows[0].data));
      } catch (error) {
        callback(error);
      }
    }).catch(callback);
  }

  set(sessionId, sessionData, callback = () => {}) {
    const expiresAt = sessionData.cookie?.expires
      ? new Date(sessionData.cookie.expires).getTime()
      : Date.now() + Number(sessionData.cookie?.originalMaxAge || 8 * 60 * 60 * 1000);
    pool.execute(
      `INSERT INTO UserSessions (session_id, expires, data) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE expires = VALUES(expires), data = VALUES(data)`,
      [sessionId, Math.floor(expiresAt / 1000), JSON.stringify(sessionData)]
    ).then(() => callback()).catch(callback);
  }

  touch(sessionId, sessionData, callback = () => {}) {
    const expiresAt = sessionData.cookie?.expires
      ? new Date(sessionData.cookie.expires).getTime()
      : Date.now() + Number(sessionData.cookie?.originalMaxAge || 8 * 60 * 60 * 1000);
    pool.execute(
      "UPDATE UserSessions SET expires = ? WHERE session_id = ?",
      [Math.floor(expiresAt / 1000), sessionId]
    ).then(() => callback()).catch(callback);
  }

  destroy(sessionId, callback = () => {}) {
    pool.execute("DELETE FROM UserSessions WHERE session_id = ?", [sessionId])
      .then(() => callback()).catch(callback);
  }
}

const cleanupTimer = setInterval(() => {
  pool.execute("DELETE FROM UserSessions WHERE expires <= ?", [Math.floor(Date.now() / 1000)])
    .catch(error => console.error("No se pudieron limpiar sesiones vencidas:", error.message));
}, 15 * 60 * 1000);
cleanupTimer.unref();

module.exports = MySqlSessionStore;
