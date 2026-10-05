// Formulario local para dar de alta un cliente nuevo (tienda + dueño).
//
// Escucha SOLO en 127.0.0.1: no queda expuesto en la red ni en el deploy. Usa
// las credenciales del .env (DATABASE_URL, SUPABASE_SERVICE_KEY), así que
// apunta al entorno que tenga configurado ese .env.
//
// Uso:
//   node scripts/onboard-form.mjs      (o: npm run onboard)
//   Abre http://127.0.0.1:4500

import express from "express";
import { ZodError } from "zod";
import { prisma } from "../config/prisma.js";
import { onboardCliente, OnboardingError } from "../services/onboarding.service.js";
import { TIPOS_NEGOCIO } from "../modules/tenants/tiendas.schema.js";
import { RUBROS } from "../modules/tenants/rubros.js";

const PORT = Number(process.env.ONBOARD_PORT ?? 4500);
const HOST = "127.0.0.1";

const app = express();
app.use(express.json());

app.get("/", (req, res) => res.type("html").send(paginaHtml()));

app.post("/onboard", async (req, res) => {
  try {
    res.json({ ok: true, data: await onboardCliente(req.body) });
  } catch (err) {
    if (err instanceof ZodError) {
      return res.status(400).json({ ok: false, errores: err.issues.map(i => `${i.path.join(".")}: ${i.message}`) });
    }
    if (err instanceof OnboardingError) {
      return res.status(409).json({ ok: false, errores: [err.message] });
    }
    console.error(err);
    res.status(500).json({ ok: false, errores: [err.message] });
  }
});

const server = app.listen(PORT, HOST, () => {
  console.log(`Formulario de alta de clientes: http://${HOST}:${PORT}`);
  console.log("Ctrl+C para cerrar.");
});

process.on("SIGINT", () => {
  server.close();
  prisma.$disconnect().finally(() => process.exit(0));
});

function paginaHtml() {
  const opciones = (valores) => valores.map(v => `<option value="${v}">${v}</option>`).join("");
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Alta de cliente</title>
<style>
  :root { --bg:#f6f7f9; --card:#fff; --text:#1d2330; --muted:#677084; --border:#d9dde5; --accent:#2f6fed; --ok:#1f8f4e; --err:#c23b3b; }
  @media (prefers-color-scheme: dark) { :root { --bg:#14171d; --card:#1d2129; --text:#e7e9ee; --muted:#9aa3b5; --border:#333a46; --accent:#5b8ef5; --ok:#4cc27e; --err:#ef6b6b; } }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font:15px/1.45 system-ui, sans-serif; padding:24px 16px; }
  main { max-width:720px; margin:0 auto; }
  h1 { font-size:22px; margin:0 0 4px; }
  p.sub { color:var(--muted); margin:0 0 20px; }
  fieldset { background:var(--card); border:1px solid var(--border); border-radius:10px; padding:16px; margin:0 0 16px; }
  legend { font-weight:600; padding:0 6px; }
  .grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
  .full { grid-column:1 / -1; }
  @media (max-width:560px) { .grid { grid-template-columns:1fr; } }
  label { display:flex; flex-direction:column; gap:4px; font-size:13px; color:var(--muted); }
  label.check { flex-direction:row; align-items:center; gap:8px; color:var(--text); }
  input, select { font:inherit; color:var(--text); background:var(--bg); border:1px solid var(--border); border-radius:6px; padding:8px 10px; }
  input:focus, select:focus { outline:2px solid var(--accent); outline-offset:-1px; }
  small { color:var(--muted); font-size:12px; }
  button { font:inherit; font-weight:600; background:var(--accent); color:#fff; border:0; border-radius:8px; padding:10px 18px; cursor:pointer; }
  button:disabled { opacity:.6; cursor:wait; }
  #resultado { margin-top:16px; padding:14px 16px; border-radius:8px; display:none; white-space:pre-wrap; }
  #resultado.ok { display:block; border:1px solid var(--ok); color:var(--ok); }
  #resultado.err { display:block; border:1px solid var(--err); color:var(--err); }
</style>
</head>
<body>
<main>
  <h1>Alta de cliente</h1>
  <p class="sub">Crea la tienda, vincula al dueño como <b>owner</b> y precarga métodos de pago y envío.</p>
  <form id="f">
    <fieldset>
      <legend>Dueño</legend>
      <div class="grid">
        <label>Email *<input name="owner.email" type="email" required></label>
        <label>Contraseña inicial<input name="owner.password" type="password" minlength="8" autocomplete="new-password">
          <small>Solo si el usuario no existe aún. Vacío = se le envía invitación por email.</small></label>
      </div>
    </fieldset>
    <fieldset>
      <legend>Tienda</legend>
      <div class="grid">
        <label>Nombre comercial *<input name="tienda.nombre" required maxlength="100"></label>
        <label>Slug (subdominio) *<input name="tienda.slug" required pattern="[a-z0-9]([a-z0-9\\-]*[a-z0-9])?">
          <small id="slugPreview">&nbsp;</small></label>
        <label>WhatsApp *<input name="tienda.whatsappNumero" required inputmode="tel" placeholder="999999999"></label>
        <label>Email de la tienda<input name="tienda.email" type="email"></label>
        <label>Tipo de negocio<select name="tienda.tipoNegocio">${opciones(TIPOS_NEGOCIO)}</select></label>
        <label>Rubro<select name="tienda.rubro"><option value="">—</option>${opciones(RUBROS)}</select></label>
        <label class="check"><input name="tienda.activo" type="checkbox" checked> Activa</label>
        <label class="check"><input name="tienda.emiteFactura" type="checkbox" checked> Emite factura</label>
      </div>
    </fieldset>
    <fieldset>
      <legend>Facturación</legend>
      <div class="grid">
        <label>RUC *<input name="tienda.ruc" required pattern="\\d{11}" inputmode="numeric" maxlength="11"></label>
        <label>Razón social *<input name="tienda.razonSocial" required maxlength="200"></label>
        <label>Razón comercial *<input name="tienda.razonComercial" required maxlength="200"></label>
        <label class="full">Dirección fiscal *<input name="tienda.direccionFiscal" required></label>
      </div>
    </fieldset>
    <button id="btn" type="submit">Registrar cliente</button>
  </form>
  <div id="resultado"></div>
</main>
<script>
  const f = document.getElementById("f");
  const out = document.getElementById("resultado");
  const btn = document.getElementById("btn");
  const slug = f.elements["tienda.slug"];
  const nombre = f.elements["tienda.nombre"];
  let slugTocado = false;

  const aSlug = (s) => s.toLowerCase().normalize("NFD").replace(/[\\u0300-\\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const preview = () => document.getElementById("slugPreview").textContent = slug.value ? slug.value + ".ecompyme.com" : "\\u00a0";

  nombre.addEventListener("input", () => { if (!slugTocado) { slug.value = aSlug(nombre.value); preview(); } });
  slug.addEventListener("input", () => { slugTocado = true; preview(); });

  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = { owner: {}, tienda: {} };
    for (const el of f.elements) {
      if (!el.name) continue;
      const [grupo, campo] = el.name.split(".");
      body[grupo][campo] = el.type === "checkbox" ? el.checked : el.value;
    }
    btn.disabled = true;
    out.className = ""; out.textContent = "";
    try {
      const res = await fetch("/onboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!json.ok) throw new Error(json.errores.join("\\n"));
      const d = json.data;
      const ownerEstado = d.owner.invitado ? "usuario nuevo, invitación enviada por email"
        : d.owner.creado ? "usuario nuevo creado con la contraseña indicada" : "usuario existente";
      out.className = "ok";
      out.textContent = "Cliente registrado correctamente\\n\\n"
        + "Tienda:  " + d.tienda.nombre + " (" + d.tienda.id + ")\\n"
        + "URL:     " + d.url + "\\n"
        + "Owner:   " + d.owner.email + " — " + ownerEstado + "\\n"
        + "Pagos:   " + d.metodosPrecargados + " métodos precargados (activar en el admin)\\n"
        + "Envíos:  " + d.enviosPrecargados + " métodos precargados (Recojo en tienda activo)";
      f.reset(); slugTocado = false; preview();
    } catch (err) {
      out.className = "err";
      out.textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });
</script>
</body>
</html>`;
}
