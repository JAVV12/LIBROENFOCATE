import { list, get, del } from "@vercel/blob";
import { createHash, timingSafeEqual } from "node:crypto";

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function authorized(req) {
  const expected = process.env.PANEL_PASSWORD || "";
  if (!expected) return false;
  const given = String(req.headers["x-panel-key"] || "");
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

async function readRecord(pathname) {
  const r = await get(pathname, { access: "private", useCache: false });
  if (!r || r.statusCode !== 200 || !r.stream) return null;
  const text = await new Response(r.stream).text();
  try { return JSON.parse(text); } catch { return null; }
}

async function allRecords() {
  const paths = [];
  let cursor;
  do {
    const page = await list({ prefix: "participantes/", cursor, limit: 1000 });
    for (const b of page.blobs) paths.push(b.pathname);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  const out = [];
  for (let i = 0; i < paths.length; i += 10) {
    const chunk = await Promise.all(paths.slice(i, i + 10).map((p) => readRecord(p).catch(() => null)));
    for (const rec of chunk) if (rec && rec.id) out.push(rec);
  }
  return out;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex");
  if (!authorized(req)) return res.status(401).json({ error: "Contraseña incorrecta." });
  try {
    if (req.method === "GET") {
      const participants = await allRecords();
      return res.status(200).json({ participants, generatedAt: new Date().toISOString() });
    }
    if (req.method === "DELETE") {
      const id = String((req.query && req.query.id) || "");
      if (!ID_RE.test(id)) return res.status(400).json({ error: "Identificador inválido." });
      await del(`participantes/${id}.json`);
      return res.status(200).json({ ok: true });
    }
    res.setHeader("Allow", "GET, DELETE");
    return res.status(405).json({ error: "Método no permitido." });
  } catch (e) {
    console.error("panel failed", e && e.message);
    return res.status(502).json({ error: "No se pudieron leer los datos. Intenta de nuevo." });
  }
}
