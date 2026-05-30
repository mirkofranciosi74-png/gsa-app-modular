// Wrapper asincrono per route handler — propaga eccezioni al middleware errori
export const h = fn => async (req, res, next) => {
  try { await fn(req, res); } catch (e) { next(e); }
};

// Error handler globale Express
export function errorHandler(err, _req, res, _next) {
  console.error(`❌  ${err.message}`);
  if (process.env.NODE_ENV !== "production") console.error(err.stack);
  res.status(err.status || 500).json({ error: err.message || "Errore interno" });
}
