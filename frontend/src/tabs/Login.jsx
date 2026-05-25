import { authApi } from "../api.js";

const APPLE_CONFIGURED = !!(import.meta.env.VITE_APPLE_CONFIGURED);

export default function Login() {
  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "var(--bg)",
    }}>
      <div style={{
        width: 380, background: "var(--bg2)", borderRadius: 16,
        border: "1px solid var(--border)", padding: "40px 32px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 24,
      }}>
        {/* Logo */}
        <div style={{ textAlign: "center" }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14, background: "var(--accent)",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 12px",
          }}>
            <i className="ti ti-home-2" style={{ fontSize: 28, color: "#fff" }} />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>GSA</h1>
          <p style={{ fontSize: 13, color: "var(--text2)", margin: "4px 0 0" }}>
            Gestione Spese Appartamenti
          </p>
        </div>

        <p style={{ fontSize: 13, color: "var(--text2)", textAlign: "center", margin: 0 }}>
          Accedi con il tuo account per continuare
        </p>

        {/* Bottone Google */}
        <button
          onClick={authApi.loginGoogle}
          style={{
            width: "100%", padding: "12px 20px",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
            background: "#fff", color: "#222", border: "1px solid #ddd",
            borderRadius: 10, cursor: "pointer", fontSize: 14, fontWeight: 500,
            transition: "box-shadow 0.15s",
          }}
          onMouseOver={e => e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.12)"}
          onMouseOut={e  => e.currentTarget.style.boxShadow = "none"}
        >
          <GoogleIcon />
          Accedi con Google
        </button>

        {/* Bottone Apple */}
        <button
          onClick={APPLE_CONFIGURED ? authApi.loginApple : () => alert("Apple Sign In non ancora configurato. Vedi README per istruzioni.")}
          style={{
            width: "100%", padding: "12px 20px",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
            background: "#000", color: "#fff", border: "1px solid #000",
            borderRadius: 10, cursor: "pointer", fontSize: 14, fontWeight: 500,
            opacity: APPLE_CONFIGURED ? 1 : 0.5,
            transition: "opacity 0.15s",
          }}
        >
          <AppleIcon />
          Accedi con Apple
          {!APPLE_CONFIGURED && (
            <span style={{ fontSize: 10, opacity: 0.7, marginLeft: 4 }}>(non configurato)</span>
          )}
        </button>

        <p style={{ fontSize: 11, color: "var(--text2)", textAlign: "center", margin: 0 }}>
          L'accesso è riservato agli utenti autorizzati.
          <br />Contatta l'amministratore per richiedere l'accesso.
        </p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
      <path fill="#FBBC05" d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.55 0 9s.348 2.825.957 4.039l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z"/>
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 814 1000" fill="white">
      <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105-42.8-150.3-111.7C138.3 744 96 633.1 96 531.3 96 323.5 235.4 212 372.2 212c66.1 0 121.3 43.4 162.6 43.4 39.5 0 101.8-46 176.3-46 28.5 0 130.9 2.6 198.3 99.2zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z"/>
    </svg>
  );
}
