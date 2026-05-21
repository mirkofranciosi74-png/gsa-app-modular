export const euro = v =>
  Number(v || 0).toLocaleString("it-IT", { style: "currency", currency: "EUR" });

export const mesL = s => {
  if (!s) return "—";
  const [y, m] = s.split("-");
  return ["Gen","Feb","Mar","Apr","Mag","Giu",
          "Lug","Ago","Set","Ott","Nov","Dic"][parseInt(m, 10) - 1] + " " + y;
};

export const toISO = d => {
  if (!d || d === "") return "";
  return String(d).slice(0, 10);
};

export const toITdate = d => {
  if (!d || d === "") return "—";
  try {
    return new Date(toISO(d) + "T12:00:00").toLocaleDateString("it-IT");
  } catch {
    return String(d).slice(0, 10);
  }
};

export const uid = () => Math.random().toString(36).slice(2);
