import { put } from "@vercel/blob";

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function str(v, max) {
  return typeof v === "string" ? v.slice(0, max) : "";
}
function strList(v, maxItems, maxLen) {
  return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, maxItems).map((x) => x.slice(0, maxLen)) : [];
}
function num(v) {
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function clean(d) {
  const i = d.intake || {};
  const consent = i.consent && typeof i.consent === "object"
    ? { at: str(i.consent.at, 40), v: str(i.consent.v, 20) }
    : null;
  const notes = {};
  if (d.notes && typeof d.notes === "object") {
    for (let k = 0; k < 20; k++) {
      const n = d.notes[k] ?? d.notes[String(k)];
      if (typeof n === "string" && n.trim()) notes[k] = n.slice(0, 5000);
    }
  }
  const hours = [0, 1, 2, 3].map((w) => {
    const row = Array.isArray(d.hours) && Array.isArray(d.hours[w]) ? d.hours[w] : [];
    return Array.from({ length: 7 }, (_, day) => {
      const h = num(row[day]);
      return h === null ? null : Math.min(16, Math.max(0, h));
    });
  });
  const done = Array.isArray(d.done)
    ? [...new Set(d.done.map((x) => parseInt(x, 10)).filter((x) => x >= 0 && x < 20))].sort((a, b) => a - b)
    : [];
  return {
    intake: {
      done: !!i.done,
      step: Math.max(0, Math.min(10, parseInt(i.step, 10) || 0)),
      consent,
      nombre: str(i.nombre, 120),
      contacto: str(i.contacto, 40),
      situacion: str(i.situacion, 120),
      dedica: str(i.dedica, 1000),
      equipo: str(i.equipo, 60),
      dificultades: strList(i.dificultades, 20, 120),
      dificultadOtro: str(i.dificultadOtro, 300),
      retoDificil: str(i.retoDificil, 2000),
      aprender: strList(i.aprender, 20, 120),
      aprenderOtro: str(i.aprenderOtro, 300),
    },
    done,
    notes,
    hours,
    goal: Math.min(60, Math.max(1, num(d.goal) || 10)),
    createdAt: str(d.createdAt, 40) || null,
  };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Usa POST." });
  }
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: "JSON inválido." }); }
  }
  if (Buffer.isBuffer(body)) {
    try { body = JSON.parse(body.toString("utf8")); } catch { return res.status(400).json({ error: "JSON inválido." }); }
  }
  const id = body && String(body.id || "");
  if (!ID_RE.test(id)) return res.status(400).json({ error: "Identificador inválido." });
  const d = body.data;
  if (!d || typeof d !== "object" || !d.intake || !d.intake.consent) {
    return res.status(400).json({ error: "Falta la autorización de datos." });
  }
  const record = JSON.stringify({ id, updatedAt: new Date().toISOString(), data: clean(d) });
  if (record.length > 250000) return res.status(413).json({ error: "Datos demasiado grandes." });
  try {
    await put(`participantes/${id}.json`, record, {
      access: "private",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
  } catch (e) {
    console.error("save failed", e && e.message);
    return res.status(502).json({ error: "No se pudo guardar. Intenta de nuevo." });
  }
  return res.status(200).json({ ok: true });
}
