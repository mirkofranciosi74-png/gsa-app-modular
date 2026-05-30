import jwt from "jsonwebtoken";

export function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Non autenticato" });
  }
  try {
    req.user = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    if (!req.user.attivo) return res.status(403).json({ error: "Account disabilitato" });
    next();
  } catch {
    res.status(401).json({ error: "Token non valido o scaduto" });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.ruolo)) {
      return res.status(403).json({ error: "Accesso non autorizzato" });
    }
    next();
  };
}
