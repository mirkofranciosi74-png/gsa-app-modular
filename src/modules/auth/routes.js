import { Router }    from "express";
import jwt            from "jsonwebtoken";
import { h }          from "../../shared/middleware.js";
import { userRepo }   from "./userRepo.js";
import { requireAuth, requireRole } from "./middleware.js";

export const authRouter = Router();

const FRONTEND = process.env.FRONTEND_URL || "http://localhost:5173";

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, nome: user.nome, ruolo: user.ruolo, attivo: user.attivo },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

// ── Profilo utente corrente ───────────────────────────────────────────────────
authRouter.get("/me", requireAuth, h(async (req, res) => {
  const user = await userRepo.findById(req.user.id);
  if (!user) return res.status(404).json({ error: "Utente non trovato" });

  const appartamenti = user.ruolo === "viewer"
    ? await userRepo.getAppartamenti(user.id)
    : [];
  const inquilini = user.ruolo === "viewer"
    ? await userRepo.getInquilini(user.id)
    : [];

  res.json({
    id:         user.id,
    email:      user.email,
    nome:       user.nome,
    cognome:    user.cognome,
    avatar_url: user.avatar_url,
    ruolo:      user.ruolo,
    attivo:     user.attivo,
    allowedAppartamenti: appartamenti.map(a => a.id),
    allowedInquilini:    inquilini.map(c => c.id),
  });
}));

authRouter.post("/logout", (_, res) => res.json({ ok: true }));

// ── Login locale (email + password) ──────────────────────────────────────────
authRouter.post("/login", h(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: "Email e password obbligatorie" });

  const user = await userRepo.verifyPassword(email, password);
  if (!user)
    return res.status(401).json({ error: "Credenziali non valide" });

  res.json({ token: signToken(user) });
}));

// ── Google OAuth ──────────────────────────────────────────────────────────────
authRouter.get("/google", (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID) {
    return res.status(503).send("Google OAuth non configurato (manca GOOGLE_CLIENT_ID)");
  }
  const params = new URLSearchParams({
    client_id:     process.env.GOOGLE_CLIENT_ID,
    redirect_uri:  `${process.env.BACKEND_URL || "http://localhost:3001"}/auth/google/callback`,
    response_type: "code",
    scope:         "openid email profile",
    access_type:   "offline",
    prompt:        "select_account",
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

authRouter.get("/google/callback", h(async (req, res) => {
  const { code, error } = req.query;
  if (error || !code) {
    return res.redirect(`${FRONTEND}/?auth_error=${encodeURIComponent(error || "cancelled")}`);
  }

  const backendUrl = process.env.BACKEND_URL || "http://localhost:3001";

  // Scambio code → token
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    new URLSearchParams({
      code,
      client_id:     process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri:  `${backendUrl}/auth/google/callback`,
      grant_type:    "authorization_code",
    }),
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    return res.redirect(`${FRONTEND}/?auth_error=token_exchange_failed`);
  }

  // Profilo utente
  const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  const profile = await profileRes.json();

  const user = await userRepo.upsert({
    email:       profile.email,
    nome:        profile.given_name  || profile.name || "",
    cognome:     profile.family_name || "",
    avatar_url:  profile.picture     || null,
    provider:    "google",
    provider_id: profile.id,
  });

  if (!user.attivo) {
    return res.redirect(`${FRONTEND}/?auth_error=account_disabled`);
  }

  const token = signToken(user);
  res.redirect(`${FRONTEND}/?token=${token}`);
}));

// ── Apple Sign In ─────────────────────────────────────────────────────────────
// Richiede HTTPS per il redirect_uri. Per l'ambiente locale usa ngrok o simili.
authRouter.get("/apple", (req, res) => {
  if (!process.env.APPLE_CLIENT_ID) {
    return res.status(503).send("Apple Sign In non configurato (manca APPLE_CLIENT_ID)");
  }
  const params = new URLSearchParams({
    client_id:     process.env.APPLE_CLIENT_ID,
    redirect_uri:  `${process.env.BACKEND_URL || "http://localhost:3001"}/auth/apple/callback`,
    response_type: "code id_token",
    scope:         "name email",
    response_mode: "form_post",
  });
  res.redirect(`https://appleid.apple.com/auth/authorize?${params}`);
});

authRouter.post("/apple/callback", h(async (req, res) => {
  const { code, id_token, error, user: userJson } = req.body;
  if (error || !id_token) {
    return res.redirect(`${FRONTEND}/?auth_error=${encodeURIComponent(error || "cancelled")}`);
  }

  // Decodifica id_token (JWT firmato da Apple — la verifica firma richiederebbe le chiavi pubbliche di Apple)
  let applePayload;
  try {
    applePayload = JSON.parse(Buffer.from(id_token.split(".")[1], "base64url").toString());
  } catch {
    return res.redirect(`${FRONTEND}/?auth_error=invalid_token`);
  }

  // Apple invia nome/email solo al primo login
  let nome = "", cognome = "";
  if (userJson) {
    try {
      const u = typeof userJson === "string" ? JSON.parse(userJson) : userJson;
      nome    = u.name?.firstName || "";
      cognome = u.name?.lastName  || "";
    } catch { /* ignore */ }
  }

  const user = await userRepo.upsert({
    email:       applePayload.email || "",
    nome,
    cognome,
    avatar_url:  null,
    provider:    "apple",
    provider_id: applePayload.sub,
  });

  if (!user.attivo) {
    return res.redirect(`${FRONTEND}/?auth_error=account_disabled`);
  }

  const token = signToken(user);
  res.redirect(`${FRONTEND}/?token=${token}`);
}));

// ── Gestione utenti (admin only) ──────────────────────────────────────────────
authRouter.get("/users", requireAuth, requireRole("admin"), h(async (_, res) => {
  res.json(await userRepo.listAll());
}));

authRouter.post("/users", requireAuth, requireRole("admin"), h(async (req, res) => {
  const { email, nome, cognome, ruolo } = req.body;
  if (!email || !email.includes("@")) {
    return res.status(400).json({ error: "Email non valida" });
  }
  if (!["admin","editor","viewer"].includes(ruolo)) {
    return res.status(400).json({ error: "Ruolo non valido" });
  }
  const user = await userRepo.createManual({ email, nome, cognome, ruolo });
  res.status(201).json(user);
}));

authRouter.put("/users/:id/ruolo", requireAuth, requireRole("admin"), h(async (req, res) => {
  const { ruolo } = req.body;
  if (!["admin","editor","viewer"].includes(ruolo)) {
    return res.status(400).json({ error: "Ruolo non valido" });
  }
  res.json(await userRepo.updateRuolo(req.params.id, ruolo));
}));

authRouter.put("/users/:id/attivo", requireAuth, requireRole("admin"), h(async (req, res) => {
  res.json(await userRepo.updateAttivo(req.params.id, !!req.body.attivo));
}));

authRouter.delete("/users/:id", requireAuth, requireRole("admin"), h(async (req, res) => {
  if (req.params.id === req.user.id) {
    return res.status(400).json({ error: "Non puoi eliminare te stesso" });
  }
  await userRepo.remove(req.params.id);
  res.status(204).end();
}));

// Imposta / rimuove password locale (admin)
authRouter.put("/users/:id/password", requireAuth, requireRole("admin"), h(async (req, res) => {
  const { password } = req.body;
  if (password && password.length < 6)
    return res.status(400).json({ error: "La password deve essere di almeno 6 caratteri" });
  if (password) {
    await userRepo.setPassword(req.params.id, password);
  } else {
    await userRepo.removePassword(req.params.id);
  }
  res.json({ ok: true });
}));

// Restrizioni viewer
authRouter.get("/users/:id/appartamenti", requireAuth, requireRole("admin"), h(async (req, res) => {
  res.json(await userRepo.getAppartamenti(req.params.id));
}));

authRouter.put("/users/:id/appartamenti", requireAuth, requireRole("admin"), h(async (req, res) => {
  await userRepo.setAppartamenti(req.params.id, req.body.ids || []);
  res.json({ ok: true });
}));

authRouter.get("/users/:id/inquilini", requireAuth, requireRole("admin"), h(async (req, res) => {
  res.json(await userRepo.getInquilini(req.params.id));
}));

authRouter.put("/users/:id/inquilini", requireAuth, requireRole("admin"), h(async (req, res) => {
  await userRepo.setInquilini(req.params.id, req.body.ids || []);
  res.json({ ok: true });
}));
