-- Utenti autenticati via OAuth
CREATE TABLE IF NOT EXISTS users (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email        TEXT UNIQUE NOT NULL,
  nome         TEXT,
  cognome      TEXT,
  avatar_url   TEXT,
  provider     TEXT NOT NULL CHECK (provider IN ('google','apple')),
  provider_id  TEXT NOT NULL,
  ruolo        TEXT NOT NULL DEFAULT 'viewer'
               CHECK (ruolo IN ('admin','editor','viewer')),
  attivo       BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login   TIMESTAMPTZ,
  UNIQUE (provider, provider_id)
);

-- Appartamenti visibili a un viewer (vuoto = tutti)
CREATE TABLE IF NOT EXISTS viewer_appartamenti (
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  appartamento_id  UUID NOT NULL REFERENCES appartamenti(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, appartamento_id)
);

-- Inquilini (componenti) visibili a un viewer (vuoto = tutti)
CREATE TABLE IF NOT EXISTS viewer_inquilini (
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  componente_id UUID NOT NULL REFERENCES componenti(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, componente_id)
);
