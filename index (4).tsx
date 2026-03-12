// index.tsx — Torre TUXPAN 45A · Bun v1.3 + Hono@4 + SQLite
// ═══════════════════════════════════════════════════════════
//  INSTRUCCIONES RAILWAY:
//  1. En Railway → tu servicio → Settings → Volumes
//     Montar volumen en /data
//  2. Variables de entorno:
//     DB_PATH=/data/tuxpan.db
//     UPLOAD_DIR=/data/uploads
//  3. El volumen persiste entre deploys
// ═══════════════════════════════════════════════════════════
import { Hono } from "hono@4";
import { cors } from "hono/cors";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";

// ── Directorios persistentes ──
const UPLOAD_DIR = process.env.UPLOAD_DIR ?? "./uploads";
const DB_PATH    = process.env.DB_PATH    ?? "./tuxpan.db";
for (const dir of [
  UPLOAD_DIR,
  join(UPLOAD_DIR, "comprobantes"),
  join(UPLOAD_DIR, "solicitudes"),
  join(UPLOAD_DIR, "situaciones"),
  join(UPLOAD_DIR, "elevador"),
  join(UPLOAD_DIR, "bitacora"),
  join(UPLOAD_DIR, "recibos"),
  join(UPLOAD_DIR, "presupuestos"),
]) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

// ── Base de datos ──
const db = new Database(DB_PATH, { create: true });
db.run("PRAGMA journal_mode = WAL");
db.run("PRAGMA foreign_keys = ON");

// ════════════════════════════════════════════
//  TABLAS
// ════════════════════════════════════════════

db.run(`CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  nombre TEXT NOT NULL,
  rol TEXT NOT NULL DEFAULT 'admin',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

db.run(`CREATE TABLE IF NOT EXISTS condominios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  unidad TEXT UNIQUE NOT NULL,
  propietario TEXT NOT NULL,
  email TEXT,
  telefono TEXT,
  cuota_mensual REAL NOT NULL DEFAULT 0,
  indiviso REAL DEFAULT 0,
  activo INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

db.run(`CREATE TABLE IF NOT EXISTS pagos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  condominio_id INTEGER NOT NULL,
  mes INTEGER NOT NULL,
  anio INTEGER NOT NULL,
  monto REAL NOT NULL,
  fecha_pago DATE,
  metodo_pago TEXT,
  referencia TEXT,
  numero_recibo TEXT,
  notas TEXT,
  comprobante_path TEXT,
  tipo_pago TEXT DEFAULT 'ordinario',
  gasto_ext_id INTEGER,
  registrado_por INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (condominio_id) REFERENCES condominios(id),
  UNIQUE(condominio_id, mes, anio, tipo_pago)
)`);

db.run(`CREATE TABLE IF NOT EXISTS gastos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  concepto TEXT NOT NULL,
  categoria TEXT NOT NULL,
  monto REAL NOT NULL,
  mes INTEGER NOT NULL,
  anio INTEGER NOT NULL,
  fecha DATE NOT NULL,
  proveedor TEXT,
  notas TEXT,
  comprobante_path TEXT,
  es_recurrente INTEGER DEFAULT 0,
  registrado_por INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

db.run(`CREATE TABLE IF NOT EXISTS gastos_plantilla (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  concepto TEXT NOT NULL,
  categoria TEXT NOT NULL,
  monto REAL NOT NULL,
  proveedor TEXT,
  activo INTEGER DEFAULT 1
)`);

db.run(`CREATE TABLE IF NOT EXISTS gastos_extraordinarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo TEXT NOT NULL,
  descripcion TEXT,
  monto_total REAL NOT NULL,
  num_cuotas INTEGER DEFAULT 1,
  mes_inicio INTEGER NOT NULL,
  anio_inicio INTEGER NOT NULL,
  estado TEXT DEFAULT 'activo',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

db.run(`CREATE TABLE IF NOT EXISTS avisos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo TEXT NOT NULL,
  contenido TEXT NOT NULL,
  tipo TEXT DEFAULT 'info',
  urgente INTEGER DEFAULT 0,
  autor TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

db.run(`CREATE TABLE IF NOT EXISTS situaciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero INTEGER NOT NULL,
  titulo TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  urgencia TEXT DEFAULT 'media',
  estado TEXT DEFAULT 'pendiente',
  resolucion TEXT,
  fecha_resolucion DATE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

db.run(`CREATE TABLE IF NOT EXISTS situacion_archivos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  situacion_id INTEGER NOT NULL,
  archivo_path TEXT NOT NULL,
  tipo TEXT DEFAULT 'foto',
  descripcion TEXT,
  autor TEXT,
  es_resolucion INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (situacion_id) REFERENCES situaciones(id)
)`);

db.run(`CREATE TABLE IF NOT EXISTS solicitudes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  despacho TEXT,
  autor TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  prioridad TEXT DEFAULT 'media',
  estado TEXT DEFAULT 'pendiente',
  respuesta TEXT,
  foto_problema_path TEXT,
  foto_resolucion_path TEXT,
  fecha_resolucion DATE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

db.run(`CREATE TABLE IF NOT EXISTS bitacora_semanal (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  semana_inicio DATE NOT NULL,
  semana_fin DATE NOT NULL,
  personal TEXT NOT NULL,
  estado TEXT DEFAULT 'pendiente',
  observaciones_generales TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(semana_inicio)
)`);

db.run(`CREATE TABLE IF NOT EXISTS bitacora_areas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bitacora_id INTEGER NOT NULL,
  area TEXT NOT NULL,
  completada INTEGER DEFAULT 0,
  observaciones TEXT,
  foto_path TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (bitacora_id) REFERENCES bitacora_semanal(id)
)`);

db.run(`CREATE TABLE IF NOT EXISTS areas_limpieza (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  activa INTEGER DEFAULT 1
)`);

db.run(`CREATE TABLE IF NOT EXISTS insumos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  unidad TEXT DEFAULT 'pieza',
  activo INTEGER DEFAULT 1
)`);

db.run(`CREATE TABLE IF NOT EXISTS insumos_inventario (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bitacora_id INTEGER NOT NULL,
  insumo_id INTEGER NOT NULL,
  cantidad REAL NOT NULL,
  foto_path TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (bitacora_id) REFERENCES bitacora_semanal(id)
)`);

db.run(`CREATE TABLE IF NOT EXISTS elevador_bitacora (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mes INTEGER NOT NULL,
  anio INTEGER NOT NULL,
  tecnico TEXT,
  empresa TEXT,
  tipo_revision TEXT DEFAULT 'rutina',
  estado_general TEXT,
  observaciones TEXT,
  trabajo_realizado TEXT,
  piezas_cambiadas TEXT,
  costo REAL,
  proxima_revision DATE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(mes, anio)
)`);

db.run(`CREATE TABLE IF NOT EXISTS elevador_fotos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  elevador_id INTEGER NOT NULL,
  foto_path TEXT NOT NULL,
  descripcion TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (elevador_id) REFERENCES elevador_bitacora(id)
)`);

db.run(`CREATE TABLE IF NOT EXISTS recibos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  categoria TEXT NOT NULL,
  subcategoria TEXT,
  mes INTEGER,
  anio INTEGER,
  monto REAL,
  proveedor TEXT,
  archivo_path TEXT NOT NULL,
  descripcion TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

db.run(`CREATE TABLE IF NOT EXISTS presupuestos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gasto_ext_id INTEGER NOT NULL,
  despacho TEXT NOT NULL,
  nombre_presentante TEXT NOT NULL,
  firma TEXT NOT NULL,
  empresa TEXT NOT NULL,
  monto REAL NOT NULL,
  descripcion TEXT,
  archivo_path TEXT,
  numero_presupuesto INTEGER NOT NULL,
  fecha DATE NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (gasto_ext_id) REFERENCES gastos_extraordinarios(id)
)`);

db.run(`CREATE TABLE IF NOT EXISTS mensajes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  de TEXT NOT NULL,
  texto TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

db.run(`CREATE TABLE IF NOT EXISTS votaciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo TEXT NOT NULL,
  descripcion TEXT,
  tipo TEXT DEFAULT 'general',
  gasto_ext_id INTEGER,
  opciones TEXT NOT NULL,
  fecha_cierre DATETIME,
  despachos_habilitados TEXT,
  estado TEXT DEFAULT 'activa',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

db.run(`CREATE TABLE IF NOT EXISTS votos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  votacion_id INTEGER NOT NULL,
  despacho TEXT NOT NULL,
  nombre_votante TEXT NOT NULL,
  firma TEXT NOT NULL,
  opcion TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (votacion_id) REFERENCES votaciones(id),
  UNIQUE(votacion_id, despacho)
)`);

db.run(`CREATE TABLE IF NOT EXISTS actas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  folio INTEGER,
  fecha DATE NOT NULL,
  temas TEXT NOT NULL,
  asistentes TEXT,
  num_asistentes INTEGER,
  total_condominos INTEGER,
  resoluciones TEXT,
  estado TEXT DEFAULT 'borrador',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// Columnas nuevas en tablas existentes (ALTER TABLE seguro)
try { db.run("ALTER TABLE situaciones ADD COLUMN resolucion TEXT"); } catch {}
try { db.run("ALTER TABLE situaciones ADD COLUMN fecha_resolucion DATE"); } catch {}
try { db.run("ALTER TABLE solicitudes ADD COLUMN despacho TEXT"); } catch {}
try { db.run("ALTER TABLE solicitudes ADD COLUMN foto_problema_path TEXT"); } catch {}
try { db.run("ALTER TABLE solicitudes ADD COLUMN foto_resolucion_path TEXT"); } catch {}
try { db.run("ALTER TABLE solicitudes ADD COLUMN fecha_resolucion DATE"); } catch {}
try { db.run("ALTER TABLE condominios ADD COLUMN indiviso REAL DEFAULT 0"); } catch {}
try { db.run("ALTER TABLE pagos ADD COLUMN numero_recibo TEXT"); } catch {}
try { db.run("ALTER TABLE pagos ADD COLUMN tipo_pago TEXT DEFAULT 'ordinario'"); } catch {}
try { db.run("ALTER TABLE pagos ADD COLUMN gasto_ext_id INTEGER"); } catch {}
try { db.run("ALTER TABLE votaciones ADD COLUMN tipo TEXT DEFAULT 'general'"); } catch {}
try { db.run("ALTER TABLE votaciones ADD COLUMN gasto_ext_id INTEGER"); } catch {}
try { db.run("ALTER TABLE actas ADD COLUMN folio INTEGER"); } catch {}

// ════════════════════════════════════════════
//  SEED
// ════════════════════════════════════════════
async function seed() {
  const { password } = await import("bun");

  // ── Usuarios ──
  const adminExists = db.query("SELECT id FROM usuarios WHERE username = ?").get("admin");
  if (!adminExists) {
    const hash = await password.hash("edificio2026", "bcrypt");
    db.run("INSERT INTO usuarios (username,password,nombre,rol) VALUES (?,?,?,?)",
      ["admin", hash, "Ing. Gastón Sozzi", "admin"]);
    console.log("✓ Admin creado: admin / edificio2026");
  }
  const sergiExists = db.query("SELECT id FROM usuarios WHERE username = ?").get("sergio");
  if (!sergiExists) {
    const hash = await password.hash("mantenimiento2026", "bcrypt");
    db.run("INSERT INTO usuarios (username,password,nombre,rol) VALUES (?,?,?,?)",
      ["sergio", hash, "Sergio Guerrero", "mantenimiento"]);
    console.log("✓ Mantenimiento creado: sergio / mantenimiento2026");
  }

  // ── Condóminos con cuotas reales ──
  const { c: cc } = db.query("SELECT COUNT(*) as c FROM condominios").get() as any;
  if (cc === 0) {
    // Cuota total = suma de todas = 43910
    // Indiviso = cuota_propia / 43910 * 100
    const total = 43910;
    const condos = [
      ["101","Manuel Vargas",1800],
      ["102","Alejandro Valladares",2000],
      ["103","Alejandro Hidalgo",1800],
      ["201","",0],
      ["202","Gustavo Garnica",1900],
      ["203","Jesús Alarcón",1800],
      ["301-302","Lic. Sibaja",5200],
      ["303","Yolanda Salcedo",1900],
      ["401","Diana Romero",1750],
      ["402","Roberto",1900],
      ["403","Evelyn",1760],
      ["5to piso","Proviant",6200],
      ["6to piso","Rafael Martínez",5500],
      ["7to piso","Lourdes Vázquez",4400],
      ["8vo piso","Centro Quirúrgico Tuxpan",5500],
      ["9no piso","Gastón Sozzi",5500],
    ];
    const ins = db.prepare("INSERT INTO condominios (unidad,propietario,cuota_mensual,indiviso) VALUES (?,?,?,?)");
    condos.forEach(([u,p,q]) => {
      const indiviso = q > 0 ? Math.round((Number(q) / total) * 10000) / 100 : 0;
      ins.run([u, p, q, indiviso]);
    });
    console.log("✓ Condóminos creados con cuotas reales");
  }

  // ── Gastos plantilla (recurrentes por defecto) ──
  const { c: gpc } = db.query("SELECT COUNT(*) as c FROM gastos_plantilla").get() as any;
  if (gpc === 0) {
    const ins = db.prepare("INSERT INTO gastos_plantilla (concepto,categoria,monto,proveedor) VALUES (?,?,?,?)");
    ins.run(["Seguridad e intendencia","seguridad",31100,"Sergio Guerrero"]);
    ins.run(["Mantenimiento elevador","elevador",2000,"OTIS / Empresa"]);
    ins.run(["Servicio de luz","servicios",4000,"CFE"]);
    ins.run(["Recolección de basura","servicios",1000,"Municipio"]);
    ins.run(["Mantenimiento general","mantenimiento",2000,"Sergio Guerrero"]);
    console.log("✓ Plantilla de gastos recurrentes creada");
  }

  // ── Áreas de limpieza ──
  const { c: ac } = db.query("SELECT COUNT(*) as c FROM areas_limpieza").get() as any;
  if (ac === 0) {
    const ins = db.prepare("INSERT INTO areas_limpieza (nombre,descripcion) VALUES (?,?)");
    ins.run(["Baños piso 1","Limpieza completa: sanitarios, lavabos, espejos, pisos"]);
    ins.run(["Baños piso 2","Limpieza completa: sanitarios, lavabos, espejos, pisos"]);
    ins.run(["Baños piso 3","Limpieza completa: sanitarios, lavabos, espejos, pisos"]);
    ins.run(["Baños piso 4","Limpieza completa: sanitarios, lavabos, espejos, pisos"]);
    ins.run(["Estacionamiento","Barrer, trapear rampas y cajones"]);
    ins.run(["Recepción / Lobby","Pisos, ventanas, mostrador"]);
    ins.run(["Escaleras piso 1-2","Barrer y trapear"]);
    ins.run(["Escaleras piso 3-4","Barrer y trapear"]);
    ins.run(["Escaleras piso 5-6","Barrer y trapear"]);
    ins.run(["Escaleras piso 7-9","Barrer y trapear"]);
    ins.run(["Cuarto de basura","Limpiar y desinfectar"]);
    ins.run(["Área de elevadores","Pisos y paredes de cabina"]);
    console.log("✓ Áreas de limpieza creadas");
  }

  // ── Insumos ──
  const { c: ic } = db.query("SELECT COUNT(*) as c FROM insumos").get() as any;
  if (ic === 0) {
    const ins = db.prepare("INSERT INTO insumos (nombre,unidad) VALUES (?,?)");
    ins.run(["Cloro","litros"]);
    ins.run(["Detergente para pisos","litros"]);
    ins.run(["Limpiavidrios","litros"]);
    ins.run(["Desengrasante","litros"]);
    ins.run(["Bolsas de basura chicas","piezas"]);
    ins.run(["Bolsas de basura grandes","piezas"]);
    ins.run(["Fibras","piezas"]);
    ins.run(["Trapeadores","piezas"]);
    ins.run(["Escobas","piezas"]);
    ins.run(["Papel de baño","rollos"]);
    ins.run(["Jabón líquido","litros"]);
    console.log("✓ Insumos creados");
  }

  // ── Situaciones ──
  const { c: sc } = db.query("SELECT COUNT(*) as c FROM situaciones").get() as any;
  if (sc === 0) {
    const ins = db.prepare("INSERT INTO situaciones (numero,titulo,descripcion,urgencia) VALUES (?,?,?,?)");
    [
      [1,"DRO y revisión estructural","Se requiere la intervención de un Director Responsable de Obra para evaluar el estado estructural del inmueble.","alta"],
      [2,"Adeudo en cuenta de agua","Existe un adeudo pendiente cuya procedencia y obligación de pago deberá determinarse en asamblea.","media"],
      [3,"Medidores CFE","Verificar y regularizar la situación de los medidores de energía eléctrica ante la CFE.","media"],
      [4,"Escaleras destruidas","Las escaleras presentan daños que representan riesgo de accidente. Requieren atención urgente.","alta"],
      [5,"Repellado de fachada (Depto. 401)","Trabajos de repellado necesarios para prevenir posibles acciones legales.","alta"],
      [6,"Apoyo estructural edificio vecino No.45","El edificio colindante apoya su estructura en la nuestra. Se requiere revisión y deslinde.","media"],
      [7,"Alcances del servicio de seguridad","Definir y documentar funciones y responsabilidades del personal de seguridad e intendencia.","baja"],
      [8,"Deslinde patronal — personal de seguridad","Formalizar el deslinde de responsabilidades laborales con el personal.","media"],
      [9,"Adeudo por enfermedad Sra. Yolanda","Adeudo pendiente relacionado con la situación de salud de la encargada.","media"],
      [10,"Falta de pago recurrente — despacho","Un despacho presenta historial de incumplimiento de pago. Requiere atención inmediata.","alta"],
      [11,"Adeudos anteriores a Marzo 2026","Determinar montos, responsables y planes de regularización de adeudos previos a la administración actual.","media"],
    ].forEach(s => ins.run(s));

    // Avisos iniciales
    const insA = db.prepare("INSERT INTO avisos (titulo,contenido,tipo,urgente,autor) VALUES (?,?,?,?,?)");
    insA.run(["Asunción de la nueva administración","A partir del 1° de marzo de 2026 la nueva administración está en funciones. Realizar pagos únicamente a la cuenta del Ing. Gastón Sozzi.","comunicado",0,"Dra. Lourdes Vázquez — Presidenta Interina"]);
    insA.run(["Escaleras — precaución urgente","Las escaleras del área norte presentan daños considerables. Transitar con precaución y evitar cargas pesadas.","urgente",1,"Ing. Gastón Sozzi — Tesorero"]);
    insA.run(["Revisión de elevador Martes 11/03","El martes 11 de marzo se realizará revisión de rutina entre las 10:00 y 12:00 hrs.","mantenimiento",0,"Sergio Guerrero"]);
    console.log("✓ Situaciones y avisos creados");
  }

  // ── Folio inicial de actas ──
  const { c: folc } = db.query("SELECT COUNT(*) as c FROM actas").get() as any;
  if (folc === 0) {
    db.run(`INSERT INTO actas (folio,fecha,temas,asistentes,num_asistentes,total_condominos,resoluciones,estado)
      VALUES (1,'2026-03-01',
      'Asunción de nueva administración\nRevisión de situaciones pendientes\nEstado de cuenta general',
      'Dra. Lourdes Vázquez, Ing. Gastón Sozzi, Lic. Sibaja, Rafael Martínez, Lourdes Vázquez, Gustavo Garnica',
      6,16,
      'Se acepta nueva administración encabezada por Ing. Gastón Sozzi como tesorero.\nSe listan 11 situaciones pendientes de resolución.\nSe acuerda cuota de mantenimiento mensual.',
      'firmada')`);
    console.log("✓ Primer acta creada (folio 1)");
  }

  // ── Limpieza de archivos de +1 año ──
  cleanOldFiles();
}

function cleanOldFiles() {
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 1);
  // Limpiar registros de DB con archivos viejos y borrar físico
  const oldRecibos = db.query("SELECT archivo_path FROM recibos WHERE created_at < ?").all(cutoff.toISOString()) as any[];
  oldRecibos.forEach(r => { try { require("fs").unlinkSync(r.archivo_path); } catch {} });
  db.run("DELETE FROM recibos WHERE created_at < ?", [cutoff.toISOString()]);
}

await seed();

// ════════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════════
const sessions = new Map<string, { userId: number; username: string; nombre: string; rol: string }>();

function randomId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function getSession(c: any) {
  const sid = getCookie(c, "sid");
  return sid ? sessions.get(sid) : null;
}

function requireAdmin(c: any, next: any) {
  const sess = getSession(c);
  if (!sess || sess.rol !== "admin") return c.json({ error: "No autorizado" }, 401);
  (c as any).session = sess;
  return next();
}

function requireAuth(c: any, next: any) {
  const sess = getSession(c);
  if (!sess) return c.json({ error: "No autorizado" }, 401);
  (c as any).session = sess;
  return next();
}

function requireManto(c: any, next: any) {
  const sess = getSession(c);
  if (!sess || (sess.rol !== "admin" && sess.rol !== "mantenimiento"))
    return c.json({ error: "No autorizado" }, 401);
  (c as any).session = sess;
  return next();
}

async function saveFile(file: any, subdir: string): Promise<string | null> {
  if (!file || typeof file === "string") return null;
  const ext = (file.name || "file").split(".").pop() || "bin";
  const fname = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  const path = join(UPLOAD_DIR, subdir, fname);
  const buf = await file.arrayBuffer();
  await Bun.write(path, buf);
  return `/uploads/${subdir}/${fname}`;
}

function getResultados(votacion_id: number) {
  const votos = db.query("SELECT opcion, COUNT(*) as total FROM votos WHERE votacion_id=? GROUP BY opcion").all(votacion_id) as any[];
  const total = (db.query("SELECT COUNT(*) as c FROM votos WHERE votacion_id=?").get(votacion_id) as any).c;
  return { por_opcion: votos, total };
}

// ════════════════════════════════════════════
//  HONO APP
// ════════════════════════════════════════════
const app = new Hono();
app.use("/*", cors());

// ── Servir archivos del volumen ──
app.get("/uploads/*", async (c) => {
  const p = c.req.path.replace("/uploads/", "");
  const full = join(UPLOAD_DIR, p);
  if (!existsSync(full)) return c.text("Not found", 404);
  const file = Bun.file(full);
  return new Response(file);
});

// ════════════════════════════════════════════
//  AUTH
// ════════════════════════════════════════════
app.post("/api/auth/login", async (c) => {
  const { username, password } = await c.req.json();
  const user = db.query("SELECT * FROM usuarios WHERE username=?").get(username) as any;
  if (!user) return c.json({ ok: false, error: "Credenciales inválidas" }, 401);
  const { password: bunPass } = await import("bun");
  const ok = await bunPass.verify(password, user.password);
  if (!ok) return c.json({ ok: false, error: "Credenciales inválidas" }, 401);
  const sid = randomId();
  sessions.set(sid, { userId: user.id, username: user.username, nombre: user.nombre, rol: user.rol });
  setCookie(c, "sid", sid, { httpOnly: true, path: "/", maxAge: 86400 * 7 });
  return c.json({ ok: true, nombre: user.nombre, rol: user.rol });
});

app.post("/api/auth/logout", (c) => {
  const sid = getCookie(c, "sid");
  if (sid) sessions.delete(sid);
  deleteCookie(c, "sid");
  return c.json({ ok: true });
});

app.get("/api/auth/me", (c) => {
  const sess = getSession(c);
  if (!sess) return c.json({ ok: false }, 401);
  return c.json({ ok: true, ...sess });
});

// ════════════════════════════════════════════
//  CONDÓMINOS
// ════════════════════════════════════════════
app.get("/api/condominios", (c) => {
  const mes  = Number(c.req.query("mes")  ?? new Date().getMonth() + 1);
  const anio = Number(c.req.query("anio") ?? new Date().getFullYear());
  const condos = db.query("SELECT * FROM condominios WHERE activo=1 ORDER BY cuota_mensual DESC").all() as any[];
  const totalCuotas = condos.reduce((s, co) => s + co.cuota_mensual, 0);
  const result = condos.map(co => {
    const pagos = db.query(
      "SELECT mes FROM pagos WHERE condominio_id=? AND anio=? AND tipo_pago='ordinario'"
    ).all(co.id, anio) as any[];
    const meses_pagados = pagos.map((p: any) => p.mes);
    const now = new Date();
    const maxM = anio < now.getFullYear() ? 12 : now.getMonth() + 1;
    const meses_deudores: number[] = [];
    for (let m = 1; m <= maxM; m++) if (!meses_pagados.includes(m)) meses_deudores.push(m);
    const adeudo_anio = meses_deudores.length * co.cuota_mensual;
    const indiviso = totalCuotas > 0 ? Math.round((co.cuota_mensual / totalCuotas) * 10000) / 100 : 0;
    return { ...co, indiviso, meses_pagados, meses_deudores, adeudo_anio };
  });
  return c.json(result);
});

app.get("/api/condominios/:id", (c) => {
  const co = db.query("SELECT * FROM condominios WHERE id=?").get(Number(c.req.param("id"))) as any;
  if (!co) return c.json({ error: "No encontrado" }, 404);
  const pagos = db.query("SELECT * FROM pagos WHERE condominio_id=? ORDER BY anio,mes").all(co.id);
  return c.json({ ...co, pagos });
});

app.put("/api/condominios/:id", requireAdmin, async (c) => {
  const b = await c.req.json();
  db.run("UPDATE condominios SET unidad=?,propietario=?,email=?,telefono=?,cuota_mensual=? WHERE id=?",
    [b.unidad, b.propietario, b.email || null, b.telefono || null, Number(b.cuota_mensual), Number(c.req.param("id"))]);
  return c.json({ ok: true });
});

app.post("/api/condominios", requireAdmin, async (c) => {
  const b = await c.req.json();
  db.run("INSERT INTO condominios (unidad,propietario,email,telefono,cuota_mensual) VALUES (?,?,?,?,?)",
    [b.unidad, b.propietario, b.email || null, b.telefono || null, Number(b.cuota_mensual)]);
  return c.json({ ok: true });
});

// ════════════════════════════════════════════
//  PAGOS
// ════════════════════════════════════════════
app.get("/api/pagos/resumen", (c) => {
  const mes  = Number(c.req.query("mes")  ?? new Date().getMonth() + 1);
  const anio = Number(c.req.query("anio") ?? new Date().getFullYear());
  const condos = db.query("SELECT * FROM condominios WHERE activo=1").all() as any[];
  let recaudado = 0, pagaron = 0, cuota_total = 0;
  condos.forEach((co: any) => {
    cuota_total += co.cuota_mensual;
    const p = db.query(
      "SELECT monto FROM pagos WHERE condominio_id=? AND mes=? AND anio=? AND tipo_pago='ordinario'"
    ).get(co.id, mes, anio) as any;
    if (p) { recaudado += p.monto; pagaron++; }
  });
  const pendientes = condos.length - pagaron;
  const porcentaje = cuota_total > 0 ? Math.round((recaudado / cuota_total) * 100) : 0;

  // Gastos del mes
  const gastosRes = db.query("SELECT SUM(monto) as t FROM gastos WHERE mes=? AND anio=?").get(mes, anio) as any;
  const total_gastos = gastosRes?.t ?? 0;

  // Gastos extraordinarios activos
  const gex = db.query("SELECT * FROM gastos_extraordinarios WHERE estado='activo'").all() as any[];
  const total_ext = gex.reduce((s, g) => s + g.monto_total, 0);
  const recaudado_ext = gex.reduce((g_acc, g) => {
    const r = db.query("SELECT SUM(monto) as t FROM pagos WHERE gasto_ext_id=? AND mes=? AND anio=?").get(g.id, mes, anio) as any;
    return g_acc + (r?.t ?? 0);
  }, 0);

  return c.json({ pagaron, pendientes, recaudado, cuota_total, porcentaje,
    total_condominios: condos.length, total_gastos, total_ext, recaudado_ext });
});

app.get("/api/pagos/deudores", (c) => {
  const anio = Number(c.req.query("anio") ?? new Date().getFullYear());
  const condos = db.query("SELECT * FROM condominios WHERE activo=1").all() as any[];
  const now = new Date();
  const maxM = anio < now.getFullYear() ? 12 : now.getMonth() + 1;
  const result: any[] = [];
  condos.forEach((co: any) => {
    const pagos = db.query(
      "SELECT mes FROM pagos WHERE condominio_id=? AND anio=? AND tipo_pago='ordinario'"
    ).all(co.id, anio) as any[];
    const meses_sin_pagar: number[] = [];
    for (let m = 1; m <= maxM; m++)
      if (!pagos.find((p: any) => p.mes === m)) meses_sin_pagar.push(m);
    if (meses_sin_pagar.length > 0)
      result.push({ ...co, meses_sin_pagar, adeudo: meses_sin_pagar.length * co.cuota_mensual });
  });
  return c.json(result.sort((a, b) => b.adeudo - a.adeudo));
});

// Estado de cuenta anual (mar 2026 → mar 2027)
app.get("/api/pagos/estado-cuenta", (c) => {
  const condos = db.query("SELECT * FROM condominios WHERE activo=1 ORDER BY cuota_mensual DESC").all() as any[];
  const meses = [
    {mes:3,anio:2026},{mes:4,anio:2026},{mes:5,anio:2026},{mes:6,anio:2026},
    {mes:7,anio:2026},{mes:8,anio:2026},{mes:9,anio:2026},{mes:10,anio:2026},
    {mes:11,anio:2026},{mes:12,anio:2026},{mes:1,anio:2027},{mes:2,anio:2027},{mes:3,anio:2027},
  ];
  const totalCuotas = condos.reduce((s, co) => s + co.cuota_mensual, 0);
  const result = condos.map(co => {
    const pagosMap: Record<string, any> = {};
    const pagos = db.query(
      "SELECT * FROM pagos WHERE condominio_id=? ORDER BY anio,mes"
    ).all(co.id) as any[];
    pagos.forEach((p: any) => { pagosMap[`${p.anio}-${p.mes}`] = p; });
    const indiviso = totalCuotas > 0 ? Math.round((co.cuota_mensual / totalCuotas) * 10000) / 100 : 0;
    return { ...co, indiviso, meses: meses.map(({ mes, anio }) => ({
      mes, anio,
      pago: pagosMap[`${anio}-${mes}`] || null,
    }))};
  });
  return c.json({ condos: result, meses });
});

app.post("/api/pagos", requireAdmin, async (c) => {
  try {
    const body = await c.req.parseBody();
    let comprobante_path: string | null = null;
    if (body.comprobante && typeof body.comprobante !== "string") {
      comprobante_path = await saveFile(body.comprobante, "comprobantes");
    }
    db.run(
      `INSERT OR REPLACE INTO pagos
        (condominio_id,mes,anio,monto,fecha_pago,metodo_pago,referencia,numero_recibo,notas,comprobante_path,tipo_pago,gasto_ext_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        Number(body.condominio_id), Number(body.mes), Number(body.anio),
        Number(body.monto), body.fecha_pago || null, body.metodo_pago || null,
        body.referencia || null, body.numero_recibo || null,
        body.notas || null, comprobante_path,
        body.tipo_pago || "ordinario",
        body.gasto_ext_id ? Number(body.gasto_ext_id) : null,
      ]
    );
    return c.json({ ok: true });
  } catch (e: any) { return c.json({ ok: false, error: e.message }, 400); }
});

app.delete("/api/pagos/:id", requireAdmin, (c) => {
  db.run("DELETE FROM pagos WHERE id=?", [Number(c.req.param("id"))]);
  return c.json({ ok: true });
});

// ════════════════════════════════════════════
//  GASTOS ORDINARIOS
// ════════════════════════════════════════════
app.get("/api/gastos", (c) => {
  const mes = c.req.query("mes"); const anio = c.req.query("anio") ?? "2026";
  const gastos = mes
    ? db.query("SELECT * FROM gastos WHERE mes=? AND anio=? ORDER BY fecha DESC").all(Number(mes), Number(anio))
    : db.query("SELECT * FROM gastos WHERE anio=? ORDER BY fecha DESC").all(Number(anio));
  const total = (gastos as any[]).reduce((s, g) => s + g.monto, 0);
  return c.json({ gastos, total });
});

app.post("/api/gastos", requireAdmin, async (c) => {
  const b = await c.req.parseBody();
  db.run(
    "INSERT INTO gastos (concepto,categoria,monto,mes,anio,fecha,proveedor,notas,es_recurrente) VALUES (?,?,?,?,?,?,?,?,?)",
    [b.concepto, b.categoria, Number(b.monto), Number(b.mes), Number(b.anio),
     b.fecha, b.proveedor || null, b.notas || null, b.es_recurrente ? 1 : 0]
  );
  return c.json({ ok: true });
});

app.delete("/api/gastos/:id", requireAdmin, (c) => {
  db.run("DELETE FROM gastos WHERE id=?", [Number(c.req.param("id"))]);
  return c.json({ ok: true });
});

// ── Plantilla de gastos recurrentes ──
app.get("/api/gastos/plantilla", (c) =>
  c.json(db.query("SELECT * FROM gastos_plantilla WHERE activo=1").all())
);

app.post("/api/gastos/plantilla", requireAdmin, async (c) => {
  const b = await c.req.json();
  db.run("INSERT INTO gastos_plantilla (concepto,categoria,monto,proveedor) VALUES (?,?,?,?)",
    [b.concepto, b.categoria, Number(b.monto), b.proveedor || null]);
  return c.json({ ok: true });
});

app.delete("/api/gastos/plantilla/:id", requireAdmin, (c) => {
  db.run("UPDATE gastos_plantilla SET activo=0 WHERE id=?", [Number(c.req.param("id"))]);
  return c.json({ ok: true });
});

// Generar gastos del mes desde plantilla
app.post("/api/gastos/generar-mes", requireAdmin, async (c) => {
  const b = await c.req.json();
  const { mes, anio } = b;
  const plantilla = db.query("SELECT * FROM gastos_plantilla WHERE activo=1").all() as any[];
  const fecha = `${anio}-${String(mes).padStart(2,"0")}-01`;
  let creados = 0;
  plantilla.forEach((g: any) => {
    const existe = db.query(
      "SELECT id FROM gastos WHERE concepto=? AND mes=? AND anio=? AND es_recurrente=1"
    ).get(g.concepto, mes, anio);
    if (!existe) {
      db.run(
        "INSERT INTO gastos (concepto,categoria,monto,mes,anio,fecha,proveedor,es_recurrente) VALUES (?,?,?,?,?,?,?,1)",
        [g.concepto, g.categoria, g.monto, mes, anio, fecha, g.proveedor || null]
      );
      creados++;
    }
  });
  return c.json({ ok: true, creados });
});

// ════════════════════════════════════════════
//  GASTOS EXTRAORDINARIOS
// ════════════════════════════════════════════
app.get("/api/gastos-ext", (c) => {
  const gex = db.query("SELECT * FROM gastos_extraordinarios ORDER BY created_at DESC").all() as any[];
  const condos = db.query("SELECT * FROM condominios WHERE activo=1").all() as any[];
  const totalCuotas = condos.reduce((s: number, co: any) => s + co.cuota_mensual, 0);
  return c.json(gex.map(g => {
    // Cuánto debe pagar cada condo por indiviso
    const cuotas_por_condo = condos.map((co: any) => ({
      ...co,
      cuota_ext: totalCuotas > 0 ? Math.round((co.cuota_mensual / totalCuotas) * g.monto_total * 100) / 100 : 0,
    }));
    const recaudado = (db.query("SELECT SUM(monto) as t FROM pagos WHERE gasto_ext_id=?").get(g.id) as any)?.t ?? 0;
    const presupuestos = db.query("SELECT * FROM presupuestos WHERE gasto_ext_id=? ORDER BY numero_presupuesto").all(g.id);
    return { ...g, cuotas_por_condo, recaudado, presupuestos };
  }));
});

app.post("/api/gastos-ext", requireAdmin, async (c) => {
  const b = await c.req.json();
  const r = db.run(
    "INSERT INTO gastos_extraordinarios (titulo,descripcion,monto_total,num_cuotas,mes_inicio,anio_inicio) VALUES (?,?,?,?,?,?)",
    [b.titulo, b.descripcion || "", Number(b.monto_total), Number(b.num_cuotas) || 1,
     Number(b.mes_inicio), Number(b.anio_inicio)]
  );
  return c.json({ ok: true, id: r.lastInsertRowid });
});

app.put("/api/gastos-ext/:id", requireAdmin, async (c) => {
  const b = await c.req.json();
  db.run(
    "UPDATE gastos_extraordinarios SET titulo=?,descripcion=?,monto_total=?,num_cuotas=?,estado=? WHERE id=?",
    [b.titulo, b.descripcion || "", Number(b.monto_total), Number(b.num_cuotas), b.estado || "activo",
     Number(c.req.param("id"))]
  );
  return c.json({ ok: true });
});

// ── Presupuestos para gastos extraordinarios ──
app.post("/api/gastos-ext/:id/presupuestos", async (c) => {
  const gasto_ext_id = Number(c.req.param("id"));
  const b = await c.req.parseBody();
  // Solo 3 presupuestos por gasto
  const count = (db.query("SELECT COUNT(*) as c FROM presupuestos WHERE gasto_ext_id=?").get(gasto_ext_id) as any).c;
  if (count >= 3) return c.json({ error: "Máximo 3 presupuestos por gasto" }, 400);
  let archivo_path: string | null = null;
  if (b.archivo && typeof b.archivo !== "string") {
    archivo_path = await saveFile(b.archivo, "presupuestos");
  }
  const fecha = new Date().toISOString().slice(0, 10);
  db.run(
    `INSERT INTO presupuestos (gasto_ext_id,despacho,nombre_presentante,firma,empresa,monto,descripcion,archivo_path,numero_presupuesto,fecha)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [gasto_ext_id, b.despacho, b.nombre_presentante, b.firma, b.empresa,
     Number(b.monto), b.descripcion || "", archivo_path, count + 1, fecha]
  );
  return c.json({ ok: true });
});

// ════════════════════════════════════════════
//  AVISOS
// ════════════════════════════════════════════
app.get("/api/avisos", (c) =>
  c.json(db.query("SELECT * FROM avisos ORDER BY created_at DESC").all())
);

app.post("/api/avisos", requireAdmin, async (c) => {
  const b = await c.req.json();
  db.run("INSERT INTO avisos (titulo,contenido,tipo,urgente,autor) VALUES (?,?,?,?,?)",
    [b.titulo, b.contenido, b.tipo || "info", b.urgente ? 1 : 0, b.autor || "Administración"]);
  return c.json({ ok: true });
});

app.delete("/api/avisos/:id", requireAdmin, (c) => {
  db.run("DELETE FROM avisos WHERE id=?", [Number(c.req.param("id"))]);
  return c.json({ ok: true });
});

// ════════════════════════════════════════════
//  SITUACIONES
// ════════════════════════════════════════════
app.get("/api/situaciones", (c) => {
  const sits = db.query("SELECT * FROM situaciones ORDER BY numero").all() as any[];
  return c.json(sits.map(s => ({
    ...s,
    archivos: db.query("SELECT * FROM situacion_archivos WHERE situacion_id=? ORDER BY created_at").all(s.id),
  })));
});

app.post("/api/situaciones", requireAdmin, async (c) => {
  const b = await c.req.json();
  const num = ((db.query("SELECT MAX(numero) as m FROM situaciones").get() as any)?.m ?? 0) + 1;
  db.run("INSERT INTO situaciones (numero,titulo,descripcion,urgencia) VALUES (?,?,?,?)",
    [num, b.titulo, b.descripcion, b.urgencia || "media"]);
  return c.json({ ok: true });
});

app.put("/api/situaciones/:id", requireAdmin, async (c) => {
  const b = await c.req.json();
  db.run(
    "UPDATE situaciones SET titulo=?,descripcion=?,urgencia=?,estado=?,resolucion=?,fecha_resolucion=? WHERE id=?",
    [b.titulo, b.descripcion, b.urgencia || "media", b.estado || "pendiente",
     b.resolucion || null, b.estado === "resuelto" ? new Date().toISOString().slice(0,10) : null,
     Number(c.req.param("id"))]
  );
  return c.json({ ok: true });
});

// Subir archivos de evidencia (problema o resolución)
app.post("/api/situaciones/:id/archivos", requireAdmin, async (c) => {
  const id = Number(c.req.param("id"));
  const b = await c.req.parseBody();
  const path = await saveFile(b.archivo, "situaciones");
  if (!path) return c.json({ error: "No se recibió archivo" }, 400);
  db.run(
    "INSERT INTO situacion_archivos (situacion_id,archivo_path,tipo,descripcion,autor,es_resolucion) VALUES (?,?,?,?,?,?)",
    [id, path, b.tipo || "foto", b.descripcion || "", b.autor || "Admin",
     b.es_resolucion === "1" ? 1 : 0]
  );
  return c.json({ ok: true, path });
});

// ════════════════════════════════════════════
//  SOLICITUDES DE MANTENIMIENTO
// ════════════════════════════════════════════
app.get("/api/solicitudes", (c) =>
  c.json(db.query("SELECT * FROM solicitudes ORDER BY created_at DESC").all())
);

// Crear solicitud con foto del problema
app.post("/api/solicitudes", async (c) => {
  const b = await c.req.parseBody();
  let foto_path: string | null = null;
  if (b.foto && typeof b.foto !== "string") {
    foto_path = await saveFile(b.foto, "solicitudes");
  }
  db.run(
    "INSERT INTO solicitudes (despacho,autor,descripcion,prioridad,foto_problema_path) VALUES (?,?,?,?,?)",
    [b.despacho || "", b.autor || "Condómino", b.descripcion, b.prioridad || "media", foto_path]
  );
  return c.json({ ok: true });
});

// Resolver solicitud con foto de resolución (admin/mantenimiento)
app.put("/api/solicitudes/:id", requireManto, async (c) => {
  const id = Number(c.req.param("id"));
  const b = await c.req.parseBody();
  let foto_path: string | null = null;
  if (b.foto_resolucion && typeof b.foto_resolucion !== "string") {
    foto_path = await saveFile(b.foto_resolucion, "solicitudes");
  }
  const updates: any[] = [];
  const vals: any[] = [];
  if (b.estado) { updates.push("estado=?"); vals.push(b.estado); }
  if (b.respuesta) { updates.push("respuesta=?"); vals.push(b.respuesta); }
  if (foto_path) { updates.push("foto_resolucion_path=?"); vals.push(foto_path); }
  if (b.estado === "resuelto") {
    updates.push("fecha_resolucion=?");
    vals.push(new Date().toISOString().slice(0,10));
  }
  updates.push("updated_at=CURRENT_TIMESTAMP");
  vals.push(id);
  db.run(`UPDATE solicitudes SET ${updates.join(",")} WHERE id=?`, vals);
  return c.json({ ok: true });
});

// ════════════════════════════════════════════
//  BITÁCORA SEMANAL DE LIMPIEZA
// ════════════════════════════════════════════
app.get("/api/bitacora", (c) => {
  const semanas = db.query("SELECT * FROM bitacora_semanal ORDER BY semana_inicio DESC LIMIT 20").all() as any[];
  return c.json(semanas.map(s => ({
    ...s,
    areas: db.query("SELECT ba.*, al.nombre as area_nombre FROM bitacora_areas ba JOIN areas_limpieza al ON ba.area=al.nombre WHERE ba.bitacora_id=? ORDER BY al.id").all(s.id),
    insumos: db.query(`
      SELECT ii.*, ins.nombre as insumo_nombre, ins.unidad
      FROM insumos_inventario ii
      JOIN insumos ins ON ii.insumo_id=ins.id
      WHERE ii.bitacora_id=?
    `).all(s.id),
  })));
});

app.get("/api/bitacora/semana-actual", (c) => {
  // Obtener lunes de la semana actual
  const now = new Date();
  const day = now.getDay() || 7;
  const lunes = new Date(now);
  lunes.setDate(now.getDate() - day + 1);
  const domingo = new Date(lunes);
  domingo.setDate(lunes.getDate() + 6);
  const fmtDate = (d: Date) => d.toISOString().slice(0,10);
  const sem = db.query("SELECT * FROM bitacora_semanal WHERE semana_inicio=?").get(fmtDate(lunes)) as any;
  const areas = db.query("SELECT * FROM areas_limpieza WHERE activa=1").all();
  const insumos = db.query("SELECT * FROM insumos WHERE activo=1").all();
  return c.json({ semana: sem || null, semana_inicio: fmtDate(lunes), semana_fin: fmtDate(domingo), areas, insumos });
});

// Crear/actualizar bitácora semanal (mantenimiento o admin)
app.post("/api/bitacora", requireManto, async (c) => {
  const b = await c.req.parseBody();
  const sem_ini = b.semana_inicio as string;
  const sem_fin = b.semana_fin as string;
  const sess = (c as any).session;
  let sem = db.query("SELECT * FROM bitacora_semanal WHERE semana_inicio=?").get(sem_ini) as any;
  if (!sem) {
    const r = db.run(
      "INSERT INTO bitacora_semanal (semana_inicio,semana_fin,personal,estado,observaciones_generales) VALUES (?,?,?,?,?)",
      [sem_ini, sem_fin, sess.nombre, "en_progreso", b.observaciones || ""]
    );
    sem = { id: r.lastInsertRowid };
  } else {
    db.run("UPDATE bitacora_semanal SET estado='en_progreso',observaciones_generales=? WHERE id=?",
      [b.observaciones || "", sem.id]);
  }
  return c.json({ ok: true, id: sem.id });
});

// Actualizar un área de la bitácora con foto
app.post("/api/bitacora/:id/area", requireManto, async (c) => {
  const bitacora_id = Number(c.req.param("id"));
  const b = await c.req.parseBody();
  let foto_path: string | null = null;
  if (b.foto && typeof b.foto !== "string") {
    foto_path = await saveFile(b.foto, "bitacora");
  }
  const existe = db.query("SELECT id FROM bitacora_areas WHERE bitacora_id=? AND area=?").get(bitacora_id, b.area);
  if (existe) {
    db.run("UPDATE bitacora_areas SET completada=1,observaciones=?,foto_path=? WHERE bitacora_id=? AND area=?",
      [b.observaciones || "", foto_path, bitacora_id, b.area]);
  } else {
    db.run("INSERT INTO bitacora_areas (bitacora_id,area,completada,observaciones,foto_path) VALUES (?,?,1,?,?)",
      [bitacora_id, b.area, b.observaciones || "", foto_path]);
  }
  return c.json({ ok: true });
});

// Registrar inventario de insumos
app.post("/api/bitacora/:id/insumos", requireManto, async (c) => {
  const bitacora_id = Number(c.req.param("id"));
  const b = await c.req.parseBody();
  let foto_path: string | null = null;
  if (b.foto && typeof b.foto !== "string") {
    foto_path = await saveFile(b.foto, "bitacora");
  }
  // b.insumos = JSON string array [{insumo_id, cantidad}]
  const items = JSON.parse((b.insumos as string) || "[]");
  items.forEach((item: any) => {
    const existe = db.query("SELECT id FROM insumos_inventario WHERE bitacora_id=? AND insumo_id=?").get(bitacora_id, item.insumo_id);
    if (existe) {
      db.run("UPDATE insumos_inventario SET cantidad=?,foto_path=? WHERE bitacora_id=? AND insumo_id=?",
        [item.cantidad, foto_path, bitacora_id, item.insumo_id]);
    } else {
      db.run("INSERT INTO insumos_inventario (bitacora_id,insumo_id,cantidad,foto_path) VALUES (?,?,?,?)",
        [bitacora_id, item.insumo_id, item.cantidad, foto_path]);
    }
  });
  db.run("UPDATE bitacora_semanal SET estado='completada' WHERE id=?", [bitacora_id]);
  return c.json({ ok: true });
});

// Gestión de áreas e insumos (solo admin)
app.get("/api/areas-limpieza", (c) =>
  c.json(db.query("SELECT * FROM areas_limpieza WHERE activa=1").all())
);
app.post("/api/areas-limpieza", requireAdmin, async (c) => {
  const b = await c.req.json();
  db.run("INSERT INTO areas_limpieza (nombre,descripcion) VALUES (?,?)", [b.nombre, b.descripcion || ""]);
  return c.json({ ok: true });
});
app.delete("/api/areas-limpieza/:id", requireAdmin, (c) => {
  db.run("UPDATE areas_limpieza SET activa=0 WHERE id=?", [Number(c.req.param("id"))]);
  return c.json({ ok: true });
});

app.get("/api/insumos", (c) =>
  c.json(db.query("SELECT * FROM insumos WHERE activo=1").all())
);
app.post("/api/insumos", requireAdmin, async (c) => {
  const b = await c.req.json();
  db.run("INSERT INTO insumos (nombre,unidad) VALUES (?,?)", [b.nombre, b.unidad || "pieza"]);
  return c.json({ ok: true });
});
app.delete("/api/insumos/:id", requireAdmin, (c) => {
  db.run("UPDATE insumos SET activo=0 WHERE id=?", [Number(c.req.param("id"))]);
  return c.json({ ok: true });
});

// ════════════════════════════════════════════
//  ELEVADOR
// ════════════════════════════════════════════
app.get("/api/elevador", (c) => {
  const registros = db.query("SELECT * FROM elevador_bitacora ORDER BY anio DESC, mes DESC").all() as any[];
  return c.json(registros.map(r => ({
    ...r,
    fotos: db.query("SELECT * FROM elevador_fotos WHERE elevador_id=?").all(r.id),
  })));
});

app.get("/api/elevador/:mes/:anio", (c) => {
  const r = db.query("SELECT * FROM elevador_bitacora WHERE mes=? AND anio=?")
    .get(Number(c.req.param("mes")), Number(c.req.param("anio"))) as any;
  if (!r) return c.json(null);
  return c.json({ ...r, fotos: db.query("SELECT * FROM elevador_fotos WHERE elevador_id=?").all(r.id) });
});

app.post("/api/elevador", requireManto, async (c) => {
  const b = await c.req.parseBody();
  const existe = db.query("SELECT id FROM elevador_bitacora WHERE mes=? AND anio=?").get(Number(b.mes), Number(b.anio));
  let id: number;
  if (existe) {
    db.run(
      `UPDATE elevador_bitacora SET tecnico=?,empresa=?,tipo_revision=?,estado_general=?,
       observaciones=?,trabajo_realizado=?,piezas_cambiadas=?,costo=?,proxima_revision=? WHERE mes=? AND anio=?`,
      [b.tecnico||"", b.empresa||"", b.tipo_revision||"rutina", b.estado_general||"",
       b.observaciones||"", b.trabajo_realizado||"", b.piezas_cambiadas||"",
       b.costo ? Number(b.costo) : null, b.proxima_revision||null, Number(b.mes), Number(b.anio)]
    );
    id = (existe as any).id;
  } else {
    const r = db.run(
      `INSERT INTO elevador_bitacora (mes,anio,tecnico,empresa,tipo_revision,estado_general,
       observaciones,trabajo_realizado,piezas_cambiadas,costo,proxima_revision) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [Number(b.mes), Number(b.anio), b.tecnico||"", b.empresa||"", b.tipo_revision||"rutina",
       b.estado_general||"", b.observaciones||"", b.trabajo_realizado||"", b.piezas_cambiadas||"",
       b.costo ? Number(b.costo) : null, b.proxima_revision||null]
    );
    id = Number(r.lastInsertRowid);
  }
  // Fotos adjuntas
  const files = ["foto1","foto2","foto3"];
  for (const f of files) {
    if (b[f] && typeof b[f] !== "string") {
      const path = await saveFile(b[f], "elevador");
      if (path) db.run("INSERT INTO elevador_fotos (elevador_id,foto_path,descripcion) VALUES (?,?,?)",
        [id, path, b[`desc_${f}`] || ""]);
    }
  }
  return c.json({ ok: true, id });
});

// ════════════════════════════════════════════
//  RECIBOS Y FACTURAS
// ════════════════════════════════════════════
app.get("/api/recibos", (c) => {
  const recibos = db.query("SELECT * FROM recibos ORDER BY created_at DESC").all() as any[];
  // Agrupar por categoría
  const grupos: Record<string, any[]> = {};
  recibos.forEach(r => {
    if (!grupos[r.categoria]) grupos[r.categoria] = [];
    grupos[r.categoria].push(r);
  });
  return c.json(grupos);
});

app.post("/api/recibos", requireAdmin, async (c) => {
  const b = await c.req.parseBody();
  if (!b.archivo || typeof b.archivo === "string") return c.json({ error: "Se requiere archivo" }, 400);
  const path = await saveFile(b.archivo, "recibos");
  db.run(
    "INSERT INTO recibos (categoria,subcategoria,mes,anio,monto,proveedor,archivo_path,descripcion) VALUES (?,?,?,?,?,?,?,?)",
    [b.categoria, b.subcategoria||null, b.mes?Number(b.mes):null, b.anio?Number(b.anio):null,
     b.monto?Number(b.monto):null, b.proveedor||null, path, b.descripcion||null]
  );
  return c.json({ ok: true });
});

app.delete("/api/recibos/:id", requireAdmin, (c) => {
  const r = db.query("SELECT archivo_path FROM recibos WHERE id=?").get(Number(c.req.param("id"))) as any;
  if (r?.archivo_path) try { require("fs").unlinkSync(r.archivo_path.replace("/uploads/",`${UPLOAD_DIR}/`)); } catch {}
  db.run("DELETE FROM recibos WHERE id=?", [Number(c.req.param("id"))]);
  return c.json({ ok: true });
});

// ════════════════════════════════════════════
//  MENSAJES
// ════════════════════════════════════════════
app.get("/api/mensajes", (c) =>
  c.json(db.query("SELECT * FROM mensajes ORDER BY created_at ASC LIMIT 100").all())
);
app.post("/api/mensajes", async (c) => {
  const b = await c.req.json();
  db.run("INSERT INTO mensajes (de,texto) VALUES (?,?)", [b.de, b.texto]);
  return c.json({ ok: true });
});

// ════════════════════════════════════════════
//  ACTAS (foliadas)
// ════════════════════════════════════════════
app.get("/api/actas", (c) =>
  c.json(db.query("SELECT * FROM actas ORDER BY folio DESC").all())
);

app.post("/api/actas", requireAdmin, async (c) => {
  const b = await c.req.json();
  const ultimo = db.query("SELECT MAX(folio) as f FROM actas").get() as any;
  const folio = (ultimo?.f ?? 0) + 1;
  db.run(
    "INSERT INTO actas (folio,fecha,temas,asistentes,num_asistentes,total_condominos,resoluciones) VALUES (?,?,?,?,?,?,?)",
    [folio, b.fecha, b.temas, b.asistentes||"", Number(b.num_asistentes)||0, Number(b.total_condominos)||16, b.resoluciones||""]
  );
  return c.json({ ok: true, folio });
});

app.put("/api/actas/:id/firmar", requireAdmin, (c) => {
  db.run("UPDATE actas SET estado='firmada' WHERE id=?", [Number(c.req.param("id"))]);
  return c.json({ ok: true });
});

// ════════════════════════════════════════════
//  VOTACIONES
// ════════════════════════════════════════════
app.get("/api/votaciones", (c) => {
  const vots = db.query("SELECT * FROM votaciones ORDER BY created_at DESC").all() as any[];
  return c.json(vots.map(v => ({
    ...v, opciones: JSON.parse(v.opciones || "[]"), resultados: getResultados(v.id)
  })));
});

app.get("/api/votaciones/:id", (c) => {
  const v = db.query("SELECT * FROM votaciones WHERE id=?").get(Number(c.req.param("id"))) as any;
  if (!v) return c.json({ error: "No encontrada" }, 404);
  const votos = db.query("SELECT * FROM votos WHERE votacion_id=? ORDER BY created_at").all(v.id);
  return c.json({ ...v, opciones: JSON.parse(v.opciones||"[]"), votos, resultados: getResultados(v.id) });
});

app.post("/api/votaciones", requireAdmin, async (c) => {
  const b = await c.req.json();
  if (!b.titulo || !b.opciones || b.opciones.length < 2)
    return c.json({ error: "Se requiere título y al menos 2 opciones" }, 400);
  const r = db.run(
    "INSERT INTO votaciones (titulo,descripcion,tipo,gasto_ext_id,opciones,fecha_cierre,despachos_habilitados,estado) VALUES (?,?,?,?,?,?,?,'activa')",
    [b.titulo, b.descripcion||"", b.tipo||"general", b.gasto_ext_id||null,
     JSON.stringify(b.opciones), b.fecha_cierre||null, JSON.stringify(b.despachos_habilitados||[])]
  );
  return c.json({ ok: true, id: r.lastInsertRowid });
});

app.put("/api/votaciones/:id/estado", requireAdmin, async (c) => {
  const b = await c.req.json();
  db.run("UPDATE votaciones SET estado=? WHERE id=?", [b.estado, Number(c.req.param("id"))]);
  return c.json({ ok: true });
});

app.post("/api/votaciones/:id/votar", async (c) => {
  const { despacho, nombre_votante, firma, opcion } = await c.req.json();
  if (!despacho||!nombre_votante||!firma||!opcion)
    return c.json({ error: "Todos los campos son requeridos" }, 400);
  const v = db.query("SELECT * FROM votaciones WHERE id=?").get(Number(c.req.param("id"))) as any;
  if (!v) return c.json({ error: "Votación no encontrada" }, 404);
  if (v.estado !== "activa") return c.json({ error: "Esta votación ya está cerrada" }, 400);
  if (v.fecha_cierre && new Date() > new Date(v.fecha_cierre)) {
    db.run("UPDATE votaciones SET estado='cerrada' WHERE id=?", [v.id]);
    return c.json({ error: "El período de votación ha cerrado" }, 400);
  }
  const yaVoto = db.query("SELECT id FROM votos WHERE votacion_id=? AND despacho=?").get(v.id, despacho);
  if (yaVoto) return c.json({ error: `El despacho ${despacho} ya emitió su voto` }, 400);
  const opciones = JSON.parse(v.opciones);
  if (!opciones.includes(opcion)) return c.json({ error: "Opción inválida" }, 400);
  db.run("INSERT INTO votos (votacion_id,despacho,nombre_votante,firma,opcion) VALUES (?,?,?,?,?)",
    [v.id, despacho, nombre_votante, firma, opcion]);
  return c.json({ ok: true, mensaje: `Voto del despacho ${despacho} registrado` });
});

// ════════════════════════════════════════════
//  FRONTEND HTML
//  Pegar esto DESPUÉS del Bloque 2, antes del
//  export default app / app.listen(...)
// ════════════════════════════════════════════
const HTML = `<!DOCTYPE html>
<html lang='es'>
<head>
<meta charset='UTF-8'><meta name='viewport' content='width=device-width, initial-scale=1.0'>
<title>Torre TUXPAN 45A</title>
<link href='https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700;900&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap' rel='stylesheet'>
<style>
:root{
  --bg:#0a0c10;--bg2:#111318;--bg3:#181c24;--card:#1a1e28;
  --border:rgba(255,255,255,0.07);--border2:rgba(255,255,255,0.12);
  --gold:#c9a84c;--gold2:#e8c96b;--gold-dim:rgba(201,168,76,0.15);
  --green:#4caf87;--green-dim:rgba(76,175,135,0.15);
  --red:#e05555;--red-dim:rgba(224,85,85,0.15);
  --blue:#5b8dee;--blue-dim:rgba(91,141,238,0.15);
  --purple:#a855f7;--purple-dim:rgba(168,85,247,0.15);
  --text:#f0f0f0;--text2:#8a8fa0;--text3:#5a5f70;
  --r:16px;--rs:10px
}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'DM Sans',sans-serif;background:var(--bg);color:var(--text);min-height:100vh;overflow-x:hidden}
.sidebar{position:fixed;left:0;top:0;bottom:0;width:262px;background:var(--bg2);border-right:1px solid var(--border);display:flex;flex-direction:column;z-index:100;transition:transform .3s}
.logo{padding:22px 24px 16px;border-bottom:1px solid var(--border)}
.logo-name{font-family:'Playfair Display',serif;font-size:17px;font-weight:700;color:var(--gold2);line-height:1.2}
.logo-sub{font-size:9px;color:var(--text3);letter-spacing:2px;text-transform:uppercase;margin-top:3px}
.nav{flex:1;padding:12px 10px;overflow-y:auto}
.nav-sec{margin-bottom:18px}
.nav-sec-label{font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--text3);padding:0 10px;margin-bottom:5px}
.nav-item{display:flex;align-items:center;gap:9px;padding:9px 12px;border-radius:var(--rs);cursor:pointer;color:var(--text2);font-size:13px;font-weight:500;border:none;background:none;width:100%;text-align:left;transition:all .2s}
.nav-item:hover{background:rgba(255,255,255,0.05);color:var(--text)}
.nav-item.active{background:var(--gold-dim);color:var(--gold2)}
.nav-badge{margin-left:auto;background:var(--red);color:#fff;font-size:10px;font-weight:700;padding:2px 7px;border-radius:20px}
.nav-badge-g{margin-left:auto;background:var(--green);color:#fff;font-size:10px;font-weight:700;padding:2px 7px;border-radius:20px}
.sidebar-foot{padding:12px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:7px}
.admin-btn-side{display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--gold-dim);border:1px solid rgba(201,168,76,.3);border-radius:var(--rs);cursor:pointer;color:var(--gold2);font-size:12.5px;font-weight:600;width:100%;transition:all .2s}
.admin-btn-side:hover{background:rgba(201,168,76,.25)}
.manto-btn-side{display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--blue-dim);border:1px solid rgba(91,141,238,.3);border-radius:var(--rs);cursor:pointer;color:var(--blue);font-size:12.5px;font-weight:600;width:100%;transition:all .2s}
.manto-btn-side:hover{background:rgba(91,141,238,.25)}
.main{margin-left:262px;min-height:100vh;display:flex;flex-direction:column}
.topbar{padding:16px 28px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;background:rgba(10,12,16,.9);backdrop-filter:blur(20px);position:sticky;top:0;z-index:50}
.tb-title{font-family:'Playfair Display',serif;font-size:22px;font-weight:700}
.tb-date{font-size:11px;color:var(--text3);font-family:'DM Mono',monospace;margin-top:2px}
.content{padding:28px;flex:1}
.page{display:none}.page.active{display:block}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.g3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px}
.g4{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
.card{background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:20px}
.ctitle{font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--text3);margin-bottom:14px;font-weight:600}
.stat{background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:20px;position:relative;overflow:hidden;transition:all .2s}
.stat::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:var(--ac,var(--gold))}
.stat:hover{transform:translateY(-2px);box-shadow:0 8px 28px rgba(0,0,0,.3)}
.stat-lbl{font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--text3);margin-bottom:8px}
.stat-val{font-family:'Playfair Display',serif;font-size:28px;font-weight:700;color:var(--ac,var(--gold2));line-height:1}
.stat-sub{font-size:11px;color:var(--text3);margin-top:5px}
.sec-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px}
.sec-title{font-family:'Playfair Display',serif;font-size:20px;font-weight:700}
.sec-sub{font-size:11px;color:var(--text3);margin-top:2px}
.tw{overflow-x:auto;border-radius:var(--rs);border:1px solid var(--border)}
table{width:100%;border-collapse:collapse}
th{background:var(--bg3);font-size:9px;letter-spacing:1.5px;text-transform:uppercase;color:var(--text3);padding:10px 13px;text-align:left;font-weight:600}
td{padding:11px 13px;border-top:1px solid var(--border);font-size:13px}
tr:hover td{background:rgba(255,255,255,.02)}
.badge{display:inline-block;padding:3px 9px;border-radius:20px;font-size:11px;font-weight:600}
.bg{background:var(--green-dim);color:var(--green)}.br{background:var(--red-dim);color:var(--red)}
.bo{background:var(--gold-dim);color:var(--gold2)}.bb{background:var(--blue-dim);color:var(--blue)}
.bpu{background:var(--purple-dim);color:var(--purple)}
.prog{background:var(--bg3);border-radius:99px;height:7px;overflow:hidden}
.prog-b{height:100%;border-radius:99px;transition:width .6s}
.form-g{margin-bottom:14px}
.form-l{display:block;font-size:9px;letter-spacing:1.5px;text-transform:uppercase;color:var(--text3);margin-bottom:6px;font-weight:600}
.fi,.fs,.fta{width:100%;padding:10px 13px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--rs);color:var(--text);font-family:'DM Sans',sans-serif;font-size:13px;outline:none;transition:border-color .2s}
.fi:focus,.fs:focus,.fta:focus{border-color:var(--gold)}
.fta{resize:vertical;min-height:80px}.fs option{background:var(--bg3)}
.btn{padding:10px 20px;border-radius:var(--rs);border:none;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;transition:all .2s;display:inline-flex;align-items:center;gap:7px}
.btn-g{background:var(--gold);color:#1a1400}.btn-g:hover{background:var(--gold2);transform:translateY(-1px)}
.btn-o{background:transparent;border:1px solid var(--border2);color:var(--text2)}.btn-o:hover{border-color:var(--gold);color:var(--gold2)}
.btn-r{background:var(--red-dim);border:1px solid var(--red);color:var(--red)}
.btn-b{background:var(--blue-dim);border:1px solid var(--blue);color:var(--blue)}
.btn-gr{background:var(--green-dim);border:1px solid var(--green);color:var(--green)}
.btn-sm{padding:6px 13px;font-size:12px}.btn-full{width:100%;justify-content:center}
.modal-ov{position:fixed;inset:0;background:rgba(0,0,0,.82);backdrop-filter:blur(10px);z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px;opacity:0;pointer-events:none;transition:opacity .25s}
.modal-ov.open{opacity:1;pointer-events:all}
.modal{background:var(--bg2);border:1px solid var(--border2);border-radius:20px;padding:28px;width:100%;max-width:560px;transform:translateY(20px);transition:transform .25s;max-height:92vh;overflow-y:auto}
.modal-ov.open .modal{transform:translateY(0)}
.modal-title{font-family:'Playfair Display',serif;font-size:21px;font-weight:700;margin-bottom:20px}
.mw{max-width:720px}.ml{max-width:960px}
.log-entry{display:flex;gap:13px;padding:13px 0;border-bottom:1px solid var(--border)}
.log-entry:last-child{border-bottom:none}
.ldot{width:9px;height:9px;border-radius:50%;background:var(--gold);margin-top:5px;flex-shrink:0;box-shadow:0 0 0 3px var(--gold-dim)}
.ldot.g{background:var(--green);box-shadow:0 0 0 3px var(--green-dim)}.ldot.b{background:var(--blue);box-shadow:0 0 0 3px var(--blue-dim)}.ldot.r{background:var(--red);box-shadow:0 0 0 3px var(--red-dim)}
.aviso-card{background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:18px;margin-bottom:13px}
.aviso-card.urgente{border-left:3px solid var(--red)}
.toast{position:fixed;bottom:24px;right:24px;background:var(--card);border:1px solid var(--gold);border-radius:var(--rs);padding:12px 18px;font-size:13px;z-index:9998;transform:translateY(80px);opacity:0;transition:all .3s;max-width:320px}
.toast.show{transform:translateY(0);opacity:1}
.pill-tabs{display:flex;gap:4px;background:var(--bg3);border-radius:11px;padding:4px;margin-bottom:18px;flex-wrap:wrap}
.pill-tab{padding:6px 14px;border-radius:8px;cursor:pointer;font-size:12.5px;font-weight:500;color:var(--text3);border:none;background:none;transition:all .2s;white-space:nowrap}
.pill-tab.active{background:var(--card);color:var(--text)}
.hburger{display:none;position:fixed;top:14px;left:14px;z-index:200;background:var(--card);border:1px solid var(--border);border-radius:10px;width:38px;height:38px;align-items:center;justify-content:center;cursor:pointer;font-size:17px}
.mes-dot{width:26px;height:26px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;cursor:default}
.mes-dot.pagado{background:var(--green-dim);color:var(--green);border:1px solid rgba(76,175,135,.3)}
.mes-dot.debe{background:var(--red-dim);color:var(--red);border:1px solid rgba(224,85,85,.3)}
.mes-dot.futuro{background:var(--bg3);color:var(--text3);border:1px solid var(--border)}
.photo-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px}
.photo-item{aspect-ratio:1;border-radius:10px;overflow:hidden;border:1px solid var(--border);background:var(--bg3);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:transform .2s;position:relative}
.photo-item:hover{transform:scale(1.04)}
.photo-item img{width:100%;height:100%;object-fit:cover}
.photo-cap{position:absolute;bottom:0;left:0;right:0;background:linear-gradient(transparent,rgba(0,0,0,.84));padding:18px 7px 7px;font-size:10px;color:rgba(255,255,255,.9)}
.sdot{width:8px;height:8px;border-radius:50%;display:inline-block}
.sdot.pendiente{background:var(--gold)}.sdot.en-proceso{background:var(--blue)}.sdot.resuelto{background:var(--green)}.sdot.alta{background:var(--red)}
.detalle-btn{background:transparent;border:1px solid var(--border);border-radius:7px;padding:4px 10px;color:var(--text3);cursor:pointer;font-size:12px;transition:all .2s}
.detalle-btn:hover{border-color:var(--gold);color:var(--gold2)}
.upzone{border:2px dashed var(--border2);border-radius:var(--rs);padding:22px;text-align:center;cursor:pointer;transition:all .2s;background:var(--bg3)}
.upzone:hover{border-color:var(--gold);background:var(--gold-dim)}
/* Votaciones */
.vot-card{background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:22px;margin-bottom:16px}
.despacho-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-bottom:4px}
.desp-opt{padding:9px 4px;border:2px solid var(--border2);border-radius:10px;cursor:pointer;text-align:center;transition:all .2s;background:var(--bg3);font-size:11px;font-weight:700;color:var(--text2)}
.desp-opt:hover{border-color:var(--gold);color:var(--gold2)}
.desp-opt.selected{border-color:var(--gold);background:var(--gold-dim);color:var(--gold2)}
.desp-opt.ya-voto{border-color:var(--green);background:var(--green-dim);color:var(--green);cursor:not-allowed}
.opcion-voto{padding:12px 15px;border:2px solid var(--border2);border-radius:12px;cursor:pointer;transition:all .2s;font-size:13.5px;font-weight:500;margin-bottom:9px;display:flex;align-items:center;gap:12px}
.opcion-voto:hover{border-color:var(--blue);background:var(--blue-dim)}
.opcion-voto.selected{border-color:var(--gold);background:var(--gold-dim);color:var(--gold2)}
.op-radio{width:17px;height:17px;border-radius:50%;border:2px solid var(--border2);flex-shrink:0;display:flex;align-items:center;justify-content:center}
.opcion-voto.selected .op-radio{border-color:var(--gold);background:var(--gold)}
.opcion-voto.selected .op-radio::after{content:'';width:6px;height:6px;border-radius:50%;background:#fff}
.res-bar-track{background:var(--bg3);border-radius:99px;height:28px;overflow:hidden}
.res-bar-fill{height:100%;border-radius:99px;display:flex;align-items:center;padding:0 11px;font-size:12px;font-weight:700;color:#fff;transition:width 1s ease;min-width:3px}
#canvas-firma{cursor:crosshair;width:100%;touch-action:none;display:block}
/* Situaciones */
.sit-card{background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:20px;transition:all .2s}
.sit-card:hover{border-color:var(--border2)}
.sit-card.alta{border-top:3px solid var(--red)}
.sit-card.media{border-top:3px solid var(--gold)}
.sit-card.baja{border-top:3px solid var(--blue)}
.sit-card.resuelto{border-top:3px solid var(--green);opacity:.7}
/* Bitácora semanal */
.bit-week{background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:20px;margin-bottom:14px}
.area-item{display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)}
.area-item:last-child{border-bottom:none}
.area-check{width:20px;height:20px;border-radius:6px;border:2px solid var(--border2);flex-shrink:0;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all .2s}
.area-check.done{background:var(--green);border-color:var(--green)}
/* Recibos/carpetas */
.folder-card{background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:18px;cursor:pointer;transition:all .2s;text-align:center}
.folder-card:hover{border-color:var(--gold);transform:translateY(-2px)}
.folder-icon{font-size:36px;margin-bottom:10px}
/* Elevador */
.elev-status{display:inline-flex;align-items:center;gap:7px;padding:5px 13px;border-radius:20px;font-size:12px;font-weight:600}
.elev-status.ok{background:var(--green-dim);color:var(--green)}
.elev-status.alerta{background:var(--red-dim);color:var(--red)}
.elev-status.revision{background:var(--gold-dim);color:var(--gold2)}
/* Gastos extra */
.gext-card{background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:20px;margin-bottom:14px}
.presup-slot{background:var(--bg3);border:1px dashed var(--border2);border-radius:12px;padding:16px;text-align:center}
.presup-slot.filled{background:var(--card);border-style:solid;border-color:var(--border);text-align:left}
/* Indiviso */
.indiviso-bar{height:5px;background:var(--blue);border-radius:3px;margin-top:4px}
@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
.page.active>*{animation:fadeUp .3s ease both}
::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:var(--border2);border-radius:99px}
@media(max-width:900px){
  .sidebar{transform:translateX(-100%)}.sidebar.open{transform:translateX(0)}.main{margin-left:0}.hburger{display:flex}
  .g2,.g3,.g4{grid-template-columns:1fr}.content{padding:16px}.topbar{padding:14px 16px;padding-left:56px}
  .despacho-grid{grid-template-columns:repeat(3,1fr)}
}
</style>
</head>
<body>
<button class='hburger' id='hbtn' onclick='document.getElementById("sb").classList.toggle("open")'>☰</button>
<aside class='sidebar' id='sb'>
  <div class='logo'>
    <div class='logo-name'>Torre<br>TUXPAN 45A</div>
    <div class='logo-sub'>Portal Condóminos · 2026</div>
  </div>
  <nav class='nav'>
    <div class='nav-sec'>
      <div class='nav-sec-label'>Finanzas</div>
      <button class='nav-item active' onclick='go("dashboard",this)'>🏛️ Dashboard</button>
      <button class='nav-item' onclick='go("cuentas",this)'>💰 Estado de Cuenta</button>
      <button class='nav-item' onclick='go("deudores",this)'>⚠️ Deudores</button>
      <button class='nav-item' onclick='go("gastos",this)'>📊 Gastos Ordinarios</button>
      <button class='nav-item' id='nav-gext' onclick='go("gastos-ext",this)'>💎 Gastos Extraordinarios</button>
    </div>
    <div class='nav-sec'>
      <div class='nav-sec-label'>Gestión</div>
      <button class='nav-item' onclick='go("votaciones",this)'>🗳️ Votaciones <span class='nav-badge-g' id='bdg-vot' style='display:none'>0</span></button>
      <button class='nav-item' onclick='go("situaciones",this)'>🔧 Situaciones <span class='nav-badge' id='bdg-sit'>11</span></button>
      <button class='nav-item' onclick='go("mantenimiento",this)'>🛠️ Mantenimiento</button>
      <button class='nav-item' onclick='go("bitacora",this)'>🧹 Bitácora Limpieza</button>
      <button class='nav-item' onclick='go("elevador",this)'>🛗 Elevador</button>
    </div>
    <div class='nav-sec'>
      <div class='nav-sec-label'>Comunidad</div>
      <button class='nav-item' onclick='go("avisos",this)'>📢 Avisos <span class='nav-badge' id='bdg-av'>0</span></button>
      <button class='nav-item' onclick='go("mensajes",this)'>💬 Mensajes</button>
      <button class='nav-item' onclick='go("actas",this)'>📖 Libro de Actas</button>
      <button class='nav-item' onclick='go("recibos",this)'>🗂️ Recibos y Facturas</button>
    </div>
  </nav>
  <div class='sidebar-foot'>
    <button class='admin-btn-side' id='btn-admin-side' onclick='showLoginModal("admin")'>🔐 <span id='admin-side-lbl'>Acceso Admin</span></button>
    <button class='manto-btn-side' id='btn-manto-side' onclick='showLoginModal("manto")'>🔧 <span id='manto-side-lbl'>Acceso Mantenimiento</span></button>
  </div>
</aside>

<main class='main'>
  <header class='topbar'>
    <div><div class='tb-title' id='page-title'>Dashboard</div><div class='tb-date' id='tb-date'></div></div>
    <div id='session-bar' style='display:none;align-items:center;gap:10px'>
      <span class='badge bo' id='session-badge'>🔐 Admin</span>
      <button class='btn btn-o btn-sm' onclick='doLogout()'>Cerrar sesión</button>
    </div>
  </header>
  <div class='content'>

    <!-- DASHBOARD -->
    <div class='page active' id='page-dashboard'>
      <div class='g4' style='margin-bottom:18px' id='dash-stats'></div>
      <div class='g4' style='margin-bottom:18px' id='dash-ext-stats'></div>
      <div class='g2'>
        <div class='card'><div class='ctitle'>Recaudación del mes</div><div id='dash-prog'></div></div>
        <div class='card'><div class='ctitle'>Últimos avisos</div><div id='dash-avisos'></div></div>
      </div>
    </div>

    <!-- ESTADO DE CUENTA ANUAL -->
    <div class='page' id='page-cuentas'>
      <div class='sec-hdr'>
        <div><div class='sec-title'>Estado de Cuenta</div><div class='sec-sub'>Marzo 2026 — Marzo 2027</div></div>
        <div id='btn-reg-pago' style='display:none'><button class='btn btn-g' onclick='openModal("modal-pago")'>+ Registrar pago</button></div>
      </div>
      <div id='cuenta-tabla'></div>
    </div>

    <!-- DEUDORES -->
    <div class='page' id='page-deudores'>
      <div class='sec-hdr'><div><div class='sec-title'>Deudores 2026</div></div></div>
      <div id='deudores-content'></div>
    </div>

    <!-- GASTOS ORDINARIOS -->
    <div class='page' id='page-gastos'>
      <div class='sec-hdr'>
        <div><div class='sec-title'>Gastos Ordinarios</div></div>
        <div style='display:flex;gap:9px;align-items:center'>
          <select class='fs' style='width:80px' id='fil-mes-g' onchange='loadGastos()'>
            <option value=''>Todos</option>
            <option value='1'>Ene</option><option value='2'>Feb</option><option value='3' selected>Mar</option>
            <option value='4'>Abr</option><option value='5'>May</option><option value='6'>Jun</option>
            <option value='7'>Jul</option><option value='8'>Ago</option><option value='9'>Sep</option>
            <option value='10'>Oct</option><option value='11'>Nov</option><option value='12'>Dic</option>
          </select>
          <div id='btn-nuevo-gasto' style='display:none;gap:9px' class='flex'>
            <button class='btn btn-o btn-sm' onclick='generarGastosMes()'>⚡ Generar del mes</button>
            <button class='btn btn-g btn-sm' onclick='openModal("modal-gasto")'>+ Agregar</button>
          </div>
        </div>
      </div>
      <div class='g2' id='gasto-stats' style='margin-bottom:18px'></div>
      <div class='g2' style='margin-bottom:18px'>
        <div class='card'>
          <div class='ctitle'>Plantilla recurrente <span id='btn-plantilla-edit' style='display:none'><button class='btn btn-sm btn-o' onclick='openModal("modal-plantilla")' style='margin-left:8px'>Editar</button></span></div>
          <div id='plantilla-list'></div>
        </div>
        <div class='card'><div class='ctitle'>Gastos registrados este mes</div><div class='tw'><table><thead><tr><th>Concepto</th><th>Categoría</th><th>Proveedor</th><th>Monto</th><th id='gasto-th-del'></th></tr></thead><tbody id='gasto-tbody'></tbody></table></div></div>
      </div>
    </div>

    <!-- GASTOS EXTRAORDINARIOS -->
    <div class='page' id='page-gastos-ext'>
      <div class='sec-hdr'>
        <div><div class='sec-title'>Gastos Extraordinarios</div><div class='sec-sub'>Cuotas especiales por indiviso</div></div>
        <div id='btn-nuevo-gext' style='display:none'><button class='btn btn-g' onclick='openModal("modal-nuevo-gext")'>+ Nuevo gasto</button></div>
      </div>
      <div id='gext-list'></div>
    </div>

    <!-- VOTACIONES -->
    <div class='page' id='page-votaciones'>
      <div class='sec-hdr'>
        <div><div class='sec-title'>Votaciones</div><div class='sec-sub'>Proceso transparente con firma digital</div></div>
        <div id='btn-nueva-vot' style='display:none'><button class='btn btn-g' onclick='openModal("modal-nueva-vot")'>🗳️ Nueva votación</button></div>
      </div>
      <div id='vot-list'></div>
    </div>

    <!-- SITUACIONES -->
    <div class='page' id='page-situaciones'>
      <div class='sec-hdr'>
        <div><div class='sec-title'>Situaciones</div><div class='sec-sub' id='sit-sub'>11 puntos heredados</div></div>
        <div id='btn-nueva-sit' style='display:none'><button class='btn btn-g btn-sm' onclick='openModal("modal-nueva-sit")'>+ Nueva</button></div>
      </div>
      <div class='g2' id='sits-grid'></div>
    </div>

    <!-- MANTENIMIENTO -->
    <div class='page' id='page-mantenimiento'>
      <div class='sec-hdr'>
        <div class='sec-title'>Solicitudes de Mantenimiento</div>
        <button class='btn btn-g' onclick='openModal("modal-solicitud")'>+ Nueva solicitud</button>
      </div>
      <div id='man-list'></div>
    </div>

    <!-- BITÁCORA SEMANAL -->
    <div class='page' id='page-bitacora'>
      <div class='sec-hdr'>
        <div><div class='sec-title'>Bitácora de Limpieza</div><div class='sec-sub'>Semanal · Sergio Guerrero</div></div>
        <div style='display:flex;gap:9px' id='btn-bit-actions' style='display:none'>
          <button class='btn btn-o btn-sm' id='btn-admin-areas' onclick='openModal("modal-admin-areas")' style='display:none'>⚙️ Gestionar áreas</button>
          <button class='btn btn-g btn-sm' id='btn-cargar-semana' onclick='openSemana()'>📋 Cargar semana</button>
        </div>
      </div>
      <div id='bitacora-list'></div>
    </div>

    <!-- ELEVADOR -->
    <div class='page' id='page-elevador'>
      <div class='sec-hdr'>
        <div><div class='sec-title'>Bitácora de Elevador</div><div class='sec-sub'>Revisión mensual obligatoria</div></div>
        <div id='btn-nuevo-elev' style='display:none'><button class='btn btn-g' onclick='openModal("modal-elevador")'>+ Registrar revisión</button></div>
      </div>
      <div id='elevador-list'></div>
    </div>

    <!-- AVISOS -->
    <div class='page' id='page-avisos'>
      <div class='sec-hdr'>
        <div class='sec-title'>Avisos & Comunicados</div>
        <div id='btn-nuevo-aviso' style='display:none'><button class='btn btn-g' onclick='openModal("modal-aviso")'>✍️ Publicar aviso</button></div>
      </div>
      <div id='avisos-list'></div>
    </div>

    <!-- MENSAJES -->
    <div class='page' id='page-mensajes'>
      <div class='sec-hdr'><div><div class='sec-title'>Mensajes a Mantenimiento</div></div></div>
      <div class='g2'>
        <div class='card' style='display:flex;flex-direction:column;height:480px'>
          <div class='ctitle'>Conversación</div>
          <div id='chat-msgs' style='flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:9px;padding-right:4px'></div>
          <div style='margin-top:13px;display:flex;gap:8px'>
            <input class='fi' id='chat-in' placeholder='Mensaje...' onkeydown='if(event.key==="Enter")sendMsg()' style='flex:1'>
            <input class='fi' id='chat-de' placeholder='Tu nombre' style='width:120px'>
            <button class='btn btn-g' onclick='sendMsg()'>Enviar</button>
          </div>
        </div>
        <div class='card'>
          <div class='ctitle'>Reportes rápidos</div>
          <div style='display:flex;flex-direction:column;gap:7px;margin-bottom:18px'>
            <button class='btn btn-o btn-full' onclick='quickMsg("Fuga de agua en baño de área común")'>🚿 Fuga de baño</button>
            <button class='btn btn-o btn-full' onclick='quickMsg("El elevador está fuera de servicio o hace ruido anormal")'>🛗 Rotura de elevador</button>
            <button class='btn btn-o btn-full' onclick='quickMsg("Luminaria rota o fundida en área común")'>💡 Luminaria rota</button>
            <button class='btn btn-o btn-full' onclick='quickMsg("Problema en recepción o acceso al edificio")'>🚪 Problema en recepción</button>
            <button class='btn btn-o btn-full' onclick='quickMsg("Problema en el estacionamiento")'>🅿️ Problema estacionamiento</button>
            <button class='btn btn-o btn-full' onclick='quickMsg("Olores o plagas detectadas en área común")'>🐀 Plagas / olores</button>
            <button class='btn btn-o btn-full' onclick='quickMsg("Daño en pintura, paredes o pisos del edificio")'>🎨 Daño en acabados</button>
          </div>
          <div style='padding:13px;background:var(--bg3);border-radius:10px'>
            <div style='font-weight:600;margin-bottom:3px'>👷 Sergio Guerrero</div>
            <div style='font-size:11px;color:var(--text3)'>Seguridad & Intendencia</div>
            <div style='font-size:11px;color:var(--green);margin-top:4px'>● Disponible</div>
          </div>
        </div>
      </div>
    </div>

    <!-- ACTAS -->
    <div class='page' id='page-actas'>
      <div class='sec-hdr'>
        <div><div class='sec-title'>Libro de Actas</div><div class='sec-sub'>Foliado y numerado</div></div>
        <div id='btn-acta' style='display:none'><button class='btn btn-g' onclick='openModal("modal-acta")'>📝 Nueva acta</button></div>
      </div>
      <div id='actas-list'></div>
    </div>

    <!-- RECIBOS Y FACTURAS -->
    <div class='page' id='page-recibos'>
      <div class='sec-hdr'>
        <div><div class='sec-title'>Recibos y Facturas</div><div class='sec-sub'>Documentos del edificio</div></div>
        <div id='btn-nuevo-recibo' style='display:none'><button class='btn btn-g' onclick='openModal("modal-recibo")'>+ Subir recibo</button></div>
      </div>
      <div id='recibos-carpetas'></div>
      <div id='recibos-detalle' style='display:none'>
        <div style='display:flex;align-items:center;gap:12px;margin-bottom:18px'>
          <button class='btn btn-o btn-sm' onclick='volverRecibos()'>← Volver</button>
          <div class='sec-title' id='recibos-folder-title'></div>
        </div>
        <div id='recibos-archivos'></div>
      </div>
    </div>

  </div><!-- /content -->
</main>

<!-- ══════════════════════════════════════
     MODALES
══════════════════════════════════════ -->

<!-- Login unificado -->
<div class='modal-ov' id='modal-login' onclick='closeOv(event,"modal-login")'><div class='modal'>
  <div class='modal-title' id='login-title'>🔐 Acceso</div>
  <div class='form-g'><label class='form-l'>Usuario</label><input class='fi' id='au' type='text'></div>
  <div class='form-g'><label class='form-l'>Contraseña</label><input class='fi' id='ap' type='password' onkeydown='if(event.key==="Enter")doLogin()'></div>
  <div style='display:flex;gap:9px'><button class='btn btn-g' onclick='doLogin()'>Ingresar</button><button class='btn btn-o' onclick='closeModal("modal-login")'>Cancelar</button></div>
  <div id='login-err' style='color:var(--red);font-size:12px;margin-top:9px;display:none'>Usuario o contraseña incorrectos.</div>
</div></div>

<!-- Registrar pago -->
<div class='modal-ov' id='modal-pago' onclick='closeOv(event,"modal-pago")'><div class='modal mw'>
  <div class='modal-title'>💰 Registrar Pago</div>
  <div class='g2'>
    <div class='form-g'><label class='form-l'>Condominio</label><select class='fs' id='pago-condo'></select></div>
    <div class='form-g'><label class='form-l'>Mes</label><select class='fs' id='pago-mes'>
      <option value='1'>Enero</option><option value='2'>Febrero</option><option value='3'>Marzo</option>
      <option value='4'>Abril</option><option value='5'>Mayo</option><option value='6'>Junio</option>
      <option value='7'>Julio</option><option value='8'>Agosto</option><option value='9'>Septiembre</option>
      <option value='10'>Octubre</option><option value='11'>Noviembre</option><option value='12'>Diciembre</option>
    </select></div>
    <div class='form-g'><label class='form-l'>Año</label><select class='fs' id='pago-anio'><option>2026</option><option>2027</option></select></div>
    <div class='form-g'><label class='form-l'>Monto ($)</label><input class='fi' id='pago-monto' type='number'></div>
    <div class='form-g'><label class='form-l'>Fecha de pago</label><input class='fi' id='pago-fecha' type='date'></div>
    <div class='form-g'><label class='form-l'>Método</label><select class='fs' id='pago-metodo'>
      <option value='transferencia'>Transferencia</option><option value='efectivo'>Efectivo</option><option value='cheque'>Cheque</option>
    </select></div>
    <div class='form-g'><label class='form-l'>Número de recibo</label><input class='fi' id='pago-recibo' placeholder='Ej: REC-2026-0042'></div>
    <div class='form-g'><label class='form-l'>Referencia</label><input class='fi' id='pago-ref' placeholder='Folio / referencia bancaria'></div>
  </div>
  <div class='form-g'><label class='form-l'>Notas</label><input class='fi' id='pago-notas' placeholder='Observaciones opcionales'></div>
  <div class='form-g'><label class='form-l'>Comprobante (archivo)</label><input class='fi' id='pago-comp' type='file' accept='image/*,.pdf'></div>
  <div style='display:flex;gap:9px'><button class='btn btn-g' onclick='registrarPago()'>Guardar</button><button class='btn btn-o' onclick='closeModal("modal-pago")'>Cancelar</button></div>
</div></div>

<!-- Gasto ordinario -->
<div class='modal-ov' id='modal-gasto' onclick='closeOv(event,"modal-gasto")'><div class='modal mw'>
  <div class='modal-title'>📊 Registrar Gasto</div>
  <div class='g2'>
    <div class='form-g'><label class='form-l'>Concepto</label><input class='fi' id='g-concepto'></div>
    <div class='form-g'><label class='form-l'>Categoría</label><select class='fs' id='g-cat'>
      <option value='seguridad'>Seguridad</option><option value='elevador'>Elevador</option>
      <option value='servicios'>Servicios</option><option value='mantenimiento'>Mantenimiento</option><option value='otro'>Otro</option>
    </select></div>
    <div class='form-g'><label class='form-l'>Monto ($)</label><input class='fi' id='g-monto' type='number'></div>
    <div class='form-g'><label class='form-l'>Proveedor</label><input class='fi' id='g-prov'></div>
    <div class='form-g'><label class='form-l'>Mes</label><select class='fs' id='g-mes'>
      <option value='1'>Ene</option><option value='2'>Feb</option><option value='3' selected>Mar</option>
      <option value='4'>Abr</option><option value='5'>May</option><option value='6'>Jun</option>
      <option value='7'>Jul</option><option value='8'>Ago</option><option value='9'>Sep</option>
      <option value='10'>Oct</option><option value='11'>Nov</option><option value='12'>Dic</option>
    </select></div>
    <div class='form-g'><label class='form-l'>Fecha</label><input class='fi' id='g-fecha' type='date'></div>
  </div>
  <div class='form-g'><label class='form-l'>Notas</label><textarea class='fta' id='g-notas'></textarea></div>
  <div style='display:flex;gap:9px'><button class='btn btn-g' onclick='registrarGasto()'>Guardar</button><button class='btn btn-o' onclick='closeModal("modal-gasto")'>Cancelar</button></div>
</div></div>

<!-- Plantilla gastos -->
<div class='modal-ov' id='modal-plantilla' onclick='closeOv(event,"modal-plantilla")'><div class='modal mw'>
  <div class='modal-title'>⚙️ Plantilla Recurrente</div>
  <div id='plantilla-admin-list'></div>
  <hr style='border-color:var(--border);margin:16px 0'>
  <div style='font-size:12px;color:var(--text2);margin-bottom:12px'>Agregar nuevo concepto recurrente:</div>
  <div class='g2'>
    <div class='form-g'><label class='form-l'>Concepto</label><input class='fi' id='pl-concepto'></div>
    <div class='form-g'><label class='form-l'>Categoría</label><select class='fs' id='pl-cat'>
      <option value='seguridad'>Seguridad</option><option value='elevador'>Elevador</option>
      <option value='servicios'>Servicios</option><option value='mantenimiento'>Mantenimiento</option>
    </select></div>
    <div class='form-g'><label class='form-l'>Monto ($)</label><input class='fi' id='pl-monto' type='number'></div>
    <div class='form-g'><label class='form-l'>Proveedor</label><input class='fi' id='pl-prov'></div>
  </div>
  <button class='btn btn-g btn-full' onclick='addPlantilla()'>+ Agregar a plantilla</button>
</div></div>

<!-- Gasto extraordinario -->
<div class='modal-ov' id='modal-nuevo-gext' onclick='closeOv(event,"modal-nuevo-gext")'><div class='modal mw'>
  <div class='modal-title'>💎 Gasto Extraordinario</div>
  <div class='form-g'><label class='form-l'>Título del gasto</label><input class='fi' id='gext-titulo' placeholder='Ej: Reparación DRO estructural'></div>
  <div class='form-g'><label class='form-l'>Descripción</label><textarea class='fta' id='gext-desc'></textarea></div>
  <div class='g2'>
    <div class='form-g'><label class='form-l'>Monto total ($)</label><input class='fi' id='gext-monto' type='number'></div>
    <div class='form-g'><label class='form-l'>Número de cuotas extra</label><input class='fi' id='gext-cuotas' type='number' value='1' min='1' max='12'></div>
    <div class='form-g'><label class='form-l'>Mes inicio</label><select class='fs' id='gext-mes-ini'>
      <option value='4'>Abril</option><option value='5'>Mayo</option><option value='6'>Junio</option>
      <option value='7'>Julio</option><option value='8'>Agosto</option>
    </select></div>
    <div class='form-g'><label class='form-l'>Año inicio</label><select class='fs' id='gext-anio-ini'><option>2026</option><option>2027</option></select></div>
  </div>
  <div style='display:flex;gap:9px'><button class='btn btn-g' onclick='crearGastoExt()'>Crear</button><button class='btn btn-o' onclick='closeModal("modal-nuevo-gext")'>Cancelar</button></div>
</div></div>

<!-- Presupuesto -->
<div class='modal-ov' id='modal-presupuesto' onclick='closeOv(event,"modal-presupuesto")'><div class='modal mw'>
  <div class='modal-title'>📋 Subir Presupuesto</div>
  <input type='hidden' id='presup-gext-id'>
  <div class='form-g'><label class='form-l'>Despacho</label><select class='fs' id='presup-despacho'></select></div>
  <div class='form-g'><label class='form-l'>Nombre del presentante</label><input class='fi' id='presup-nombre'></div>
  <div class='form-g'><label class='form-l'>Empresa / Proveedor</label><input class='fi' id='presup-empresa'></div>
  <div class='form-g'><label class='form-l'>Monto del presupuesto ($)</label><input class='fi' id='presup-monto' type='number'></div>
  <div class='form-g'><label class='form-l'>Descripción</label><textarea class='fta' id='presup-desc'></textarea></div>
  <div class='form-g'><label class='form-l'>Archivo (cotización / PDF)</label><input class='fi' id='presup-archivo' type='file' accept='image/*,.pdf'></div>
  <div class='form-g'><label class='form-l'>Firma digital</label>
    <div style='background:#fff;border-radius:var(--rs);border:2px solid var(--border2);overflow:hidden;margin-bottom:8px'><canvas id='canvas-firma-presup' height='110'></canvas></div>
    <button class='btn btn-o btn-sm' onclick='limpiarFirmaPresup()'>🗑️ Limpiar</button>
  </div>
  <div style='display:flex;gap:9px'><button class='btn btn-g' onclick='enviarPresupuesto()'>Enviar</button><button class='btn btn-o' onclick='closeModal("modal-presupuesto")'>Cancelar</button></div>
</div></div>

<!-- Nueva votación -->
<div class='modal-ov' id='modal-nueva-vot' onclick='closeOv(event,"modal-nueva-vot")'><div class='modal mw'>
  <div class='modal-title'>🗳️ Crear Votación</div>
  <div class='form-g'><label class='form-l'>Título</label><input class='fi' id='vt-titulo'></div>
  <div class='form-g'><label class='form-l'>Descripción</label><textarea class='fta' id='vt-desc'></textarea></div>
  <div class='form-g'><label class='form-l'>Tipo</label><select class='fs' id='vt-tipo'>
    <option value='general'>General</option><option value='presupuesto'>Votación de presupuesto</option>
  </select></div>
  <div class='form-g' id='vt-gext-wrap' style='display:none'><label class='form-l'>Gasto extraordinario</label><select class='fs' id='vt-gext-id'></select></div>
  <div class='form-g'><label class='form-l'>Opciones (una por línea)</label><textarea class='fta' id='vt-opciones' placeholder='A favor&#10;En contra&#10;Abstención'></textarea></div>
  <div class='form-g'><label class='form-l'>Fecha cierre</label><input class='fi' id='vt-cierre' type='datetime-local'></div>
  <div style='display:flex;gap:9px'><button class='btn btn-g' onclick='crearVotacion()'>Crear</button><button class='btn btn-o' onclick='closeModal("modal-nueva-vot")'>Cancelar</button></div>
</div></div>

<!-- Votar -->
<div class='modal-ov' id='modal-votar' onclick='closeOv(event,"modal-votar")'><div class='modal mw'>
  <div class='modal-title' id='votar-titulo'>Emitir voto</div>
  <div id='votar-desc' style='font-size:13px;color:var(--text2);margin-bottom:18px;line-height:1.6;padding:13px;background:var(--bg3);border-radius:10px;border-left:3px solid var(--gold)'></div>
  <div class='form-g'><label class='form-l'>Tu despacho</label><div class='despacho-grid' id='despacho-grid'></div><input type='hidden' id='v-despacho'></div>
  <div class='form-g'><label class='form-l'>Nombre del representante</label><input class='fi' id='v-nombre'></div>
  <div class='form-g'><label class='form-l'>Opción</label><div id='opciones-voto'></div><input type='hidden' id='v-opcion'></div>
  <div class='form-g'><label class='form-l'>Firma digital</label>
    <div style='background:#fff;border-radius:var(--rs);border:2px solid var(--border2);overflow:hidden;margin-bottom:8px'><canvas id='canvas-firma' height='120'></canvas></div>
    <button class='btn btn-o btn-sm' onclick='limpiarFirma()'>🗑️ Limpiar firma</button>
  </div>
  <div id='v-error' style='color:var(--red);font-size:12px;margin-bottom:11px;display:none;padding:9px;background:var(--red-dim);border-radius:8px'></div>
  <div style='display:flex;gap:9px'><button class='btn btn-g' id='btn-emitir' onclick='emitirVoto()'>✅ Confirmar voto</button><button class='btn btn-o' onclick='closeModal("modal-votar")'>Cancelar</button></div>
</div></div>

<!-- Resultados votación -->
<div class='modal-ov' id='modal-resultados' onclick='closeOv(event,"modal-resultados")'><div class='modal ml'>
  <div class='modal-title' id='res-titulo'>Resultados</div><div id='res-content'></div>
</div></div>

<!-- Nueva situación -->
<div class='modal-ov' id='modal-nueva-sit' onclick='closeOv(event,"modal-nueva-sit")'><div class='modal mw'>
  <div class='modal-title'>🔧 Nueva Situación</div>
  <div class='form-g'><label class='form-l'>Título</label><input class='fi' id='sit-titulo'></div>
  <div class='form-g'><label class='form-l'>Descripción</label><textarea class='fta' id='sit-desc'></textarea></div>
  <div class='form-g'><label class='form-l'>Urgencia</label><select class='fs' id='sit-urgencia'>
    <option value='alta'>Alta</option><option value='media' selected>Media</option><option value='baja'>Baja</option>
  </select></div>
  <div style='display:flex;gap:9px'><button class='btn btn-g' onclick='crearSituacion()'>Crear</button><button class='btn btn-o' onclick='closeModal("modal-nueva-sit")'>Cancelar</button></div>
</div></div>

<!-- Detalle situación (admin edita) -->
<div class='modal-ov' id='modal-sit-detalle' onclick='closeOv(event,"modal-sit-detalle")'><div class='modal ml'>
  <div class='modal-title' id='sit-det-titulo'></div>
  <div id='sit-det-content'></div>
</div></div>

<!-- Solicitud de mantenimiento -->
<div class='modal-ov' id='modal-solicitud' onclick='closeOv(event,"modal-solicitud")'><div class='modal'>
  <div class='modal-title'>🛠️ Nueva Solicitud</div>
  <div class='form-g'><label class='form-l'>Despacho</label><select class='fs' id='sol-despacho'></select></div>
  <div class='form-g'><label class='form-l'>Tu nombre</label><input class='fi' id='sol-autor'></div>
  <div class='form-g'><label class='form-l'>Descripción del problema</label><textarea class='fta' id='sol-desc'></textarea></div>
  <div class='form-g'><label class='form-l'>Prioridad</label><select class='fs' id='sol-pri'>
    <option value='alta'>🔴 Alta</option><option value='media' selected>🟡 Media</option><option value='baja'>🟢 Baja</option>
  </select></div>
  <div class='form-g'><label class='form-l'>Foto del problema (opcional)</label><input class='fi' id='sol-foto' type='file' accept='image/*'></div>
  <div style='display:flex;gap:9px'><button class='btn btn-g' onclick='crearSolicitud()'>Enviar</button><button class='btn btn-o' onclick='closeModal("modal-solicitud")'>Cancelar</button></div>
</div></div>

<!-- Resolver solicitud (mantenimiento/admin) -->
<div class='modal-ov' id='modal-resolver' onclick='closeOv(event,"modal-resolver")'><div class='modal'>
  <div class='modal-title'>✅ Resolver Solicitud</div>
  <input type='hidden' id='resolver-id'>
  <div class='form-g'><label class='form-l'>Respuesta / descripción de lo realizado</label><textarea class='fta' id='resolver-resp'></textarea></div>
  <div class='form-g'><label class='form-l'>Foto de resolución / evidencia</label><input class='fi' id='resolver-foto' type='file' accept='image/*'></div>
  <div class='form-g'><label class='form-l'>Estado</label><select class='fs' id='resolver-estado'>
    <option value='en-proceso'>En proceso</option><option value='resuelto'>Resuelto</option>
  </select></div>
  <div style='display:flex;gap:9px'><button class='btn btn-g' onclick='resolverSolicitud()'>Guardar</button><button class='btn btn-o' onclick='closeModal("modal-resolver")'>Cancelar</button></div>
</div></div>

<!-- Bitácora semanal - carga -->
<div class='modal-ov' id='modal-semana' onclick='closeOv(event,"modal-semana")'><div class='modal ml'>
  <div class='modal-title'>🧹 Bitácora de la Semana</div>
  <input type='hidden' id='sem-id'><input type='hidden' id='sem-ini'><input type='hidden' id='sem-fin'>
  <div style='font-size:12px;color:var(--text2);margin-bottom:16px' id='sem-rango'></div>
  <div id='sem-areas-list'></div>
  <hr style='border-color:var(--border);margin:16px 0'>
  <div style='font-size:13px;font-weight:600;margin-bottom:12px'>Inventario de insumos</div>
  <div id='sem-insumos-list'></div>
  <div style='margin-top:10px'><label class='form-l'>Foto de inventario</label><input class='fi' id='sem-insumo-foto' type='file' accept='image/*'></div>
  <div class='form-g' style='margin-top:12px'><label class='form-l'>Observaciones generales</label><textarea class='fta' id='sem-obs'></textarea></div>
  <div style='display:flex;gap:9px;margin-top:8px'>
    <button class='btn btn-g' onclick='guardarSemana()'>Guardar bitácora</button>
    <button class='btn btn-o' onclick='closeModal("modal-semana")'>Cancelar</button>
  </div>
</div></div>

<!-- Admin: gestión áreas/insumos -->
<div class='modal-ov' id='modal-admin-areas' onclick='closeOv(event,"modal-admin-areas")'><div class='modal mw'>
  <div class='modal-title'>⚙️ Áreas e Insumos</div>
  <div class='pill-tabs'>
    <button class='pill-tab active' onclick='tabAdminAreas("areas",this)'>Áreas</button>
    <button class='pill-tab' onclick='tabAdminAreas("insumos",this)'>Insumos</button>
  </div>
  <div id='admin-areas-content'></div>
</div></div>

<!-- Elevador -->
<div class='modal-ov' id='modal-elevador' onclick='closeOv(event,"modal-elevador")'><div class='modal mw'>
  <div class='modal-title'>🛗 Registro de Revisión</div>
  <div class='g2'>
    <div class='form-g'><label class='form-l'>Mes</label><select class='fs' id='elev-mes'>
      <option value='1'>Ene</option><option value='2'>Feb</option><option value='3' selected>Mar</option>
      <option value='4'>Abr</option><option value='5'>May</option><option value='6'>Jun</option>
      <option value='7'>Jul</option><option value='8'>Ago</option><option value='9'>Sep</option>
      <option value='10'>Oct</option><option value='11'>Nov</option><option value='12'>Dic</option>
    </select></div>
    <div class='form-g'><label class='form-l'>Año</label><select class='fs' id='elev-anio'><option>2026</option><option>2027</option></select></div>
    <div class='form-g'><label class='form-l'>Técnico</label><input class='fi' id='elev-tecnico'></div>
    <div class='form-g'><label class='form-l'>Empresa</label><input class='fi' id='elev-empresa'></div>
    <div class='form-g'><label class='form-l'>Tipo de revisión</label><select class='fs' id='elev-tipo'>
      <option value='rutina'>Rutina mensual</option><option value='correctivo'>Correctivo</option>
      <option value='preventivo'>Preventivo</option><option value='emergencia'>Emergencia</option>
    </select></div>
    <div class='form-g'><label class='form-l'>Estado general</label><select class='fs' id='elev-estado-gen'>
      <option value='bueno'>Bueno</option><option value='regular'>Regular</option><option value='requiere-atencion'>Requiere atención</option>
    </select></div>
    <div class='form-g'><label class='form-l'>Costo ($)</label><input class='fi' id='elev-costo' type='number'></div>
    <div class='form-g'><label class='form-l'>Próxima revisión</label><input class='fi' id='elev-proxima' type='date'></div>
  </div>
  <div class='form-g'><label class='form-l'>Observaciones</label><textarea class='fta' id='elev-obs'></textarea></div>
  <div class='form-g'><label class='form-l'>Trabajo realizado</label><textarea class='fta' id='elev-trabajo'></textarea></div>
  <div class='form-g'><label class='form-l'>Piezas cambiadas</label><textarea class='fta' id='elev-piezas' placeholder='Detallar pieza, número de parte, cantidad'></textarea></div>
  <div class='g3'>
    <div class='form-g'><label class='form-l'>Foto 1</label><input class='fi' id='elev-f1' type='file' accept='image/*'><input class='fi' id='elev-d1' placeholder='Descripción' style='margin-top:5px'></div>
    <div class='form-g'><label class='form-l'>Foto 2</label><input class='fi' id='elev-f2' type='file' accept='image/*'><input class='fi' id='elev-d2' placeholder='Descripción' style='margin-top:5px'></div>
    <div class='form-g'><label class='form-l'>Foto 3</label><input class='fi' id='elev-f3' type='file' accept='image/*'><input class='fi' id='elev-d3' placeholder='Descripción' style='margin-top:5px'></div>
  </div>
  <div style='display:flex;gap:9px'><button class='btn btn-g' onclick='guardarElevador()'>Guardar</button><button class='btn btn-o' onclick='closeModal("modal-elevador")'>Cancelar</button></div>
</div></div>

<!-- Aviso -->
<div class='modal-ov' id='modal-aviso' onclick='closeOv(event,"modal-aviso")'><div class='modal'>
  <div class='modal-title'>📢 Publicar Aviso</div>
  <div class='form-g'><label class='form-l'>Título</label><input class='fi' id='av-titulo'></div>
  <div class='form-g'><label class='form-l'>Tipo</label><select class='fs' id='av-tipo'>
    <option value='info'>📢 General</option><option value='urgente'>🚨 Urgente</option>
    <option value='comunicado'>📄 Comunicado</option><option value='mantenimiento'>🔧 Mantenimiento</option>
  </select></div>
  <div class='form-g'><label class='form-l'>Mensaje</label><textarea class='fta' id='av-texto'></textarea></div>
  <div style='display:flex;gap:9px'><button class='btn btn-g' onclick='postAviso()'>Publicar</button><button class='btn btn-o' onclick='closeModal("modal-aviso")'>Cancelar</button></div>
</div></div>

<!-- Acta -->
<div class='modal-ov' id='modal-acta' onclick='closeOv(event,"modal-acta")'><div class='modal mw'>
  <div class='modal-title'>📖 Nueva Acta</div>
  <div class='g2'>
    <div class='form-g'><label class='form-l'>Fecha</label><input class='fi' id='acta-fecha' type='date'></div>
    <div class='form-g'><label class='form-l'>Asistentes (nombres)</label><input class='fi' id='acta-asist'></div>
    <div class='form-g'><label class='form-l'>Nro. asistentes</label><input class='fi' id='acta-num' type='number'></div>
    <div class='form-g'><label class='form-l'>Total condóminos</label><input class='fi' id='acta-tot' type='number' value='16'></div>
  </div>
  <div class='form-g'><label class='form-l'>Temas (uno por línea)</label><textarea class='fta' id='acta-temas' style='min-height:80px'></textarea></div>
  <div class='form-g'><label class='form-l'>Resoluciones</label><textarea class='fta' id='acta-res' style='min-height:80px'></textarea></div>
  <div style='display:flex;gap:9px'><button class='btn btn-g' onclick='crearActa()'>Guardar</button><button class='btn btn-o' onclick='closeModal("modal-acta")'>Cancelar</button></div>
</div></div>

<!-- Recibo -->
<div class='modal-ov' id='modal-recibo' onclick='closeOv(event,"modal-recibo")'><div class='modal mw'>
  <div class='modal-title'>🗂️ Subir Recibo / Factura</div>
  <div class='g2'>
    <div class='form-g'><label class='form-l'>Categoría</label><select class='fs' id='rec-cat'>
      <option value='Luz'>💡 Recibos de Luz</option>
      <option value='Mantenimiento'>🔧 Recibos de Mantenimiento</option>
      <option value='Elevador'>🛗 Mantenimiento de Elevador</option>
      <option value='Basura'>🗑️ Recolección de Basura</option>
      <option value='Agua'>💧 Servicio de Agua</option>
      <option value='Seguridad'>🔐 Seguridad</option>
      <option value='Varios'>📁 Varios</option>
    </select></div>
    <div class='form-g'><label class='form-l'>Subcategoría / Descripción</label><input class='fi' id='rec-subcat' placeholder='Ej: Recibo 1, Recibo 2...'></div>
    <div class='form-g'><label class='form-l'>Mes</label><select class='fs' id='rec-mes'>
      <option value=''>—</option>
      <option value='1'>Ene</option><option value='2'>Feb</option><option value='3'>Mar</option>
      <option value='4'>Abr</option><option value='5'>May</option><option value='6'>Jun</option>
      <option value='7'>Jul</option><option value='8'>Ago</option><option value='9'>Sep</option>
      <option value='10'>Oct</option><option value='11'>Nov</option><option value='12'>Dic</option>
    </select></div>
    <div class='form-g'><label class='form-l'>Monto ($)</label><input class='fi' id='rec-monto' type='number' placeholder='Opcional'></div>
    <div class='form-g'><label class='form-l'>Proveedor</label><input class='fi' id='rec-prov'></div>
    <div class='form-g'><label class='form-l'>Año</label><select class='fs' id='rec-anio'><option>2026</option><option>2027</option></select></div>
  </div>
  <div class='form-g'><label class='form-l'>Archivo (imagen o PDF)</label><input class='fi' id='rec-archivo' type='file' accept='image/*,.pdf'></div>
  <div style='display:flex;gap:9px'><button class='btn btn-g' onclick='subirRecibo()'>Subir</button><button class='btn btn-o' onclick='closeModal("modal-recibo")'>Cancelar</button></div>
</div></div>

<!-- Condóminos (admin) -->
<div class='modal-ov' id='modal-condos' onclick='closeOv(event,"modal-condos")'><div class='modal ml'>
  <div class='modal-title'>🏢 Gestión de Condóminos</div>
  <div id='condos-admin-list'></div>
</div></div>

<!-- Editar condómino -->
<div class='modal-ov' id='modal-edit-condo' onclick='closeOv(event,"modal-edit-condo")'><div class='modal'>
  <div class='modal-title'>Editar Condómino</div>
  <input type='hidden' id='ec-id'>
  <div class='form-g'><label class='form-l'>Despacho / Unidad</label><input class='fi' id='ec-unidad'></div>
  <div class='form-g'><label class='form-l'>Propietario</label><input class='fi' id='ec-prop'></div>
  <div class='form-g'><label class='form-l'>Email</label><input class='fi' id='ec-email' type='email'></div>
  <div class='form-g'><label class='form-l'>Teléfono</label><input class='fi' id='ec-tel'></div>
  <div class='form-g'><label class='form-l'>Cuota mensual ($)</label><input class='fi' id='ec-cuota' type='number'></div>
  <div style='display:flex;gap:9px'><button class='btn btn-g' onclick='guardarCondo()'>Guardar</button><button class='btn btn-o' onclick='closeModal("modal-edit-condo")'>Cancelar</button></div>
</div></div>

<!-- Lightbox fotos -->
<div class='modal-ov' id='modal-foto' onclick='closeModal("modal-foto")'><div style='max-width:90vw;max-height:90vh'>
  <img id='foto-grande' src='' style='max-width:90vw;max-height:85vh;border-radius:12px;display:block'>
  <div id='foto-caption' style='text-align:center;color:#fff;font-size:13px;margin-top:10px'></div>
</div></div>

<div class='toast' id='toast'></div>
<script>
// ════════════════════════════════════════════
//  BLOQUE 4 — JavaScript frontend
//  Va dentro del <script> al final del HTML,
//  justo antes de </script></body></html>`
//  (reemplaza el <script>...</script> original)
// ════════════════════════════════════════════
//
// INSTRUCCIÓN DE PEGADO:
//  En bloque3.ts, al final del const HTML = `...`,
//  antes del cierre  </body></html>`
//  pegá todo esto entre <script> y </script>
// ════════════════════════════════════════════

/*
<script>
*/

// ── Estado global ──────────────────────────
let sesion = null; // { userId, username, nombre, rol }
let condosCache = [];
let votActiva = null;
let firmaCanvas, firmaCtx, dibujandoFirma = false;
let firmaPresupCanvas, firmaPresupCtx, dibujandoPresup = false;
let tabAreasActual = 'areas';

const DESPACHOS = ['101','102','103','201','202','203','301-302','303','401','402','403','5to','6to','7mo','8vo','9no'];
const MESES     = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const MESES_FULL= ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const COLORES   = ['#5b8dee','#4caf87','#e8c96b','#e05555','#a855f7','#f97316','#06b6d4','#84cc16'];
const CATICONS  = {seguridad:'🛡️',elevador:'🛗',servicios:'💡',mantenimiento:'🔧',admin:'📋',otro:'📦',Luz:'💡',Elevador:'🛗',Basura:'🗑️',Agua:'💧',Seguridad:'🔐',Varios:'📁'};

const PT = {
  dashboard:'Dashboard', cuentas:'Estado de Cuenta', deudores:'Deudores',
  gastos:'Gastos Ordinarios', 'gastos-ext':'Gastos Extraordinarios',
  votaciones:'Votaciones', situaciones:'Situaciones', mantenimiento:'Mantenimiento',
  bitacora:'Bitácora Limpieza', elevador:'Elevador', avisos:'Avisos',
  mensajes:'Mensajes', actas:'Libro de Actas', recibos:'Recibos y Facturas',
};

// ── Helpers ────────────────────────────────
async function api(u, o = {}) {
  const r = await fetch(u, { headers: { 'Content-Type': 'application/json' }, ...o });
  return r.json();
}
async function apiF(u, fd) {
  const r = await fetch(u, { method: 'POST', body: fd });
  return r.json();
}
async function apiPutF(u, fd) {
  const r = await fetch(u, { method: 'PUT', body: fd });
  return r.json();
}
function $id(id) { return document.getElementById(id); }
function qs(sel) { return document.querySelector(sel); }
function openModal(id)  { $id(id).classList.add('open'); }
function closeModal(id) { $id(id).classList.remove('open'); }
function closeOv(e, id) { if (e.target === $id(id)) closeModal(id); }
function showToast(msg, ok = true) {
  const t = $id('toast');
  t.textContent = msg;
  t.style.borderColor = ok ? 'var(--gold)' : 'var(--red)';
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3200);
}
function fmtM(n) { return `$${Number(n).toLocaleString('es-MX')}`; }
function esVencida(f) { return f && new Date() > new Date(f); }

// ── Navegación ─────────────────────────────
function go(p, b) {
  document.querySelectorAll('.page').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
  $id('page-' + p).classList.add('active');
  if (b) b.classList.add('active');
  $id('page-title').textContent = PT[p] || p;
  if (window.innerWidth <= 900) $id('sb').classList.remove('open');
  ({
    dashboard: loadDash, cuentas: loadCuentas, deudores: loadDeudores,
    gastos: loadGastos, 'gastos-ext': loadGastosExt,
    votaciones: loadVotaciones, situaciones: loadSits,
    mantenimiento: loadMan, bitacora: loadBit, elevador: loadElevador,
    avisos: loadAvisos, mensajes: loadChat, actas: loadActas,
    recibos: loadRecibos,
  })[p]?.();
}

// ── Auth ───────────────────────────────────
function showLoginModal(tipo) {
  if (sesion) { doLogout(); return; }
  $id('login-title').textContent = tipo === 'admin' ? '🔐 Acceso Administrador' : '🔧 Acceso Mantenimiento';
  $id('au').value = '';
  $id('ap').value = '';
  $id('login-err').style.display = 'none';
  openModal('modal-login');
}

async function doLogin() {
  const r = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: $id('au').value, password: $id('ap').value }),
  });
  if (r.ok) {
    sesion = r;
    closeModal('modal-login');
    aplicarSesion();
    showToast(`✓ Bienvenido, ${r.nombre}`);
    loadVotaciones();
    loadDash();
  } else {
    $id('login-err').style.display = 'block';
  }
}

async function doLogout() {
  await api('/api/auth/logout', { method: 'POST' });
  sesion = null;
  aplicarSesion();
  showToast('Sesión cerrada');
}

function aplicarSesion() {
  const isAdmin = sesion?.rol === 'admin';
  const isManto = sesion?.rol === 'mantenimiento' || isAdmin;

  $id('session-bar').style.display = sesion ? 'flex' : 'none';
  if (sesion) {
    $id('session-badge').textContent = isAdmin ? '🔐 Administrador' : '🔧 Mantenimiento';
  }
  $id('admin-side-lbl').textContent  = isAdmin  ? `Cerrar sesión (${sesion.nombre})` : 'Acceso Admin';
  $id('manto-side-lbl').textContent  = isManto && !isAdmin ? `Cerrar sesión (${sesion.nombre})` : 'Acceso Mantenimiento';

  // botones que dependen del rol
  const adminEls = ['btn-reg-pago','btn-nuevo-gasto','btn-acta','btn-nueva-vot',
                    'btn-nuevo-gext','btn-nuevo-recibo','btn-nueva-sit','btn-plantilla-edit',
                    'gasto-th-del'];
  adminEls.forEach(id => { const el = $id(id); if (el) el.style.display = isAdmin ? '' : 'none'; });

  const mantoEls = ['btn-bit-actions','btn-nuevo-elev'];
  mantoEls.forEach(id => { const el = $id(id); if (el) el.style.display = isManto ? '' : 'none'; });

  const adminAreaBtn = $id('btn-admin-areas');
  if (adminAreaBtn) adminAreaBtn.style.display = isAdmin ? '' : 'none';

  // Rellena select de despachos en modales
  const selDesp = $id('sol-despacho');
  if (selDesp) selDesp.innerHTML = DESPACHOS.map(d => `<option>${d}</option>`).join('');
  const presupDesp = $id('presup-despacho');
  if (presupDesp) presupDesp.innerHTML = DESPACHOS.map(d => `<option>${d}</option>`).join('');
}

// ── DASHBOARD ─────────────────────────────
async function loadDash() {
  const now = new Date();
  const mes = now.getMonth() + 1, anio = now.getFullYear();
  const [r, av] = await Promise.all([
    api(`/api/pagos/resumen?mes=${mes}&anio=${anio}`),
    api('/api/avisos'),
  ]);
  $id('dash-stats').innerHTML = `
    <div class="stat" style="--ac:var(--green)">
      <div class="stat-lbl">Pagaron este mes</div>
      <div class="stat-val">${r.pagaron}</div>
      <div class="stat-sub">de ${r.total_condominios} unidades</div>
    </div>
    <div class="stat" style="--ac:var(--red)">
      <div class="stat-lbl">Pendientes</div>
      <div class="stat-val">${r.pendientes}</div>
    </div>
    <div class="stat" style="--ac:var(--gold)">
      <div class="stat-lbl">Recaudado ${MESES[mes]}</div>
      <div class="stat-val" style="font-size:21px">${fmtM(r.recaudado)}</div>
      <div class="stat-sub">Meta: ${fmtM(r.cuota_total)}</div>
    </div>
    <div class="stat" style="--ac:var(--blue)">
      <div class="stat-lbl">Cobertura ordinaria</div>
      <div class="stat-val">${r.porcentaje}%</div>
    </div>`;

  // Stats gastos extraordinarios
  if (r.total_ext > 0) {
    const pctExt = r.total_ext > 0 ? Math.round((r.recaudado_ext / r.total_ext) * 100) : 0;
    $id('dash-ext-stats').innerHTML = `
      <div class="stat" style="--ac:var(--purple)">
        <div class="stat-lbl">Gastos extraordinarios activos</div>
        <div class="stat-val" style="font-size:21px">${fmtM(r.total_ext)}</div>
      </div>
      <div class="stat" style="--ac:var(--purple)">
        <div class="stat-lbl">Recaudado extra ${MESES[mes]}</div>
        <div class="stat-val" style="font-size:21px">${fmtM(r.recaudado_ext)}</div>
        <div class="stat-sub">${pctExt}% cubierto</div>
      </div>`;
  } else {
    $id('dash-ext-stats').innerHTML = '';
  }

  // Barra de recaudación
  const faltante = r.cuota_total - r.recaudado;
  $id('dash-prog').innerHTML = `
    <div style="margin-bottom:7px;font-size:13px;color:var(--text2)">${fmtM(r.recaudado)} de ${fmtM(r.cuota_total)}</div>
    <div class="prog"><div class="prog-b" style="width:${r.porcentaje}%;background:var(--gold)"></div></div>
    <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text3);margin-top:6px">
      <span>${r.porcentaje}% recaudado</span>
      <span>Faltante: ${fmtM(faltante < 0 ? 0 : faltante)}</span>
    </div>
    <div style="margin-top:14px;padding-top:13px;border-top:1px solid var(--border)">
      <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:5px">
        <span style="color:var(--text2)">Gastos fijos (plantilla)</span>
        <span style="color:var(--red);font-family:'DM Mono',monospace">${fmtM(r.total_gastos || 0)}</span>
      </div>
    </div>`;

  const dcol = { info:'', urgente:'r', comunicado:'b', mantenimiento:'g' };
  $id('dash-avisos').innerHTML = av.slice(0, 4).map(a => `
    <div class="log-entry">
      <div class="ldot ${dcol[a.tipo] || ''}"></div>
      <div>
        <div style="font-size:11px;color:var(--text3);font-family:'DM Mono',monospace">${a.created_at?.slice(0,10) || ''}</div>
        <div style="font-size:13px;font-weight:600">${a.titulo}</div>
        <div style="font-size:11px;color:var(--text3)">${a.autor}</div>
      </div>
    </div>`).join('') || '<div style="color:var(--text3);font-size:13px">Sin avisos recientes</div>';
}

// ── ESTADO DE CUENTA ANUAL ─────────────────
async function loadCuentas() {
  const [data] = await Promise.all([api('/api/pagos/estado-cuenta')]);
  condosCache = data.condos;
  const { condos, meses } = data;

  // Poblar select de pagos
  $id('pago-condo').innerHTML = condos.map(c =>
    `<option value="${c.id}">${c.unidad} — ${c.propietario}</option>`
  ).join('');

  // Encabezados de meses
  const thMeses = meses.map(({ mes, anio }) =>
    `<th style="text-align:center">${MESES[mes]}<br><span style="font-size:8px">${anio}</span></th>`
  ).join('');

  const rows = condos.map(co => {
    const celdas = co.meses.map(({ mes, anio, pago }) => {
      const now = new Date();
      const esFuturo = anio > now.getFullYear() || (anio === now.getFullYear() && mes > now.getMonth() + 1);
      if (esFuturo) return `<td style="text-align:center"><span class="mes-dot futuro">—</span></td>`;
      if (pago) return `<td style="text-align:center"><span class="mes-dot pagado" title="${fmtM(pago.monto)} · ${pago.numero_recibo || ''}">✓</span></td>`;
      return `<td style="text-align:center"><span class="mes-dot debe">${MESES[mes]}</span></td>`;
    }).join('');
    return `
      <tr>
        <td><span class="badge bb" style="font-family:'DM Mono',monospace">${co.unidad}</span></td>
        <td><strong>${co.propietario}</strong></td>
        <td style="font-family:'DM Mono',monospace;font-size:12px">${fmtM(co.cuota_mensual)}</td>
        <td style="font-size:12px;color:var(--blue);font-family:'DM Mono',monospace">${co.indiviso}%</td>
        ${celdas}
      </tr>`;
  }).join('');

  $id('cuenta-tabla').innerHTML = `
    <div class="tw">
      <table>
        <thead>
          <tr>
            <th>Despacho</th><th>Propietario</th><th>Cuota</th><th>Indiviso</th>
            ${thMeses}
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  if (sesion?.rol === 'admin') $id('btn-reg-pago').style.display = '';
}

// ── DEUDORES ──────────────────────────────
async function loadDeudores() {
  const d = await api('/api/pagos/deudores?anio=2026');
  if (!d.length) {
    $id('deudores-content').innerHTML = '<div style="text-align:center;padding:60px;color:var(--text3)"><div style="font-size:48px;margin-bottom:14px">🎉</div><div>¡Todos al corriente!</div></div>';
    return;
  }
  const totalAdeudo = d.reduce((s, x) => s + x.adeudo, 0);
  $id('deudores-content').innerHTML = `
    <div class="stat" style="--ac:var(--red);margin-bottom:18px;display:inline-block;min-width:220px">
      <div class="stat-lbl">Total adeudado 2026</div>
      <div class="stat-val">${fmtM(totalAdeudo)}</div>
    </div>
    <div class="tw">
      <table>
        <thead><tr><th>Despacho</th><th>Propietario</th><th>Cuota</th><th>Meses sin pagar</th><th>Adeudo</th></tr></thead>
        <tbody>
          ${d.map(x => `
            <tr>
              <td><span class="badge bb">${x.unidad}</span></td>
              <td><strong>${x.propietario}</strong></td>
              <td style="font-family:'DM Mono',monospace">${fmtM(x.cuota_mensual)}</td>
              <td>${x.meses_sin_pagar.map(m => `<span class="badge br" style="margin-right:3px">${MESES[m]}</span>`).join('')}</td>
              <td style="color:var(--red);font-weight:700;font-family:'DM Mono',monospace">${fmtM(x.adeudo)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

// ── GASTOS ORDINARIOS ─────────────────────
async function loadGastos() {
  const m = $id('fil-mes-g').value;
  const data = await api(m ? `/api/gastos?mes=${m}&anio=2026` : '/api/gastos?anio=2026');
  const plantilla = await api('/api/gastos/plantilla');

  $id('gasto-stats').innerHTML = `
    <div class="stat" style="--ac:var(--red)">
      <div class="stat-lbl">Total gastos</div>
      <div class="stat-val" style="font-size:22px">${fmtM(data.total)}</div>
      <div class="stat-sub">${data.gastos.length} registros</div>
    </div>
    <div class="stat" style="--ac:var(--gold)">
      <div class="stat-lbl">Plantilla mensual estimada</div>
      <div class="stat-val" style="font-size:22px">${fmtM(plantilla.reduce((s, g) => s + g.monto, 0))}</div>
    </div>`;

  $id('plantilla-list').innerHTML = plantilla.length
    ? plantilla.map(g => `
        <div class="log-entry">
          <div class="ldot g"></div>
          <div style="flex:1">
            <div style="font-size:13px;font-weight:600">${g.concepto}</div>
            <div style="font-size:11px;color:var(--text3)">${g.proveedor || g.categoria}</div>
          </div>
          <div style="font-family:'DM Mono',monospace;font-size:13px;color:var(--gold2)">${fmtM(g.monto)}</div>
        </div>`).join('')
    : '<div style="color:var(--text3);font-size:13px">Sin conceptos en plantilla</div>';

  $id('gasto-tbody').innerHTML = data.gastos.map(g => `
    <tr>
      <td>${g.concepto}</td>
      <td><span class="badge bo">${CATICONS[g.categoria] || '📦'} ${g.categoria}</span></td>
      <td style="font-size:12px;color:var(--text3)">${g.proveedor || '—'}</td>
      <td style="font-family:'DM Mono',monospace;font-weight:600;color:var(--red)">${fmtM(g.monto)}</td>
      ${sesion?.rol === 'admin' ? `<td><button class="btn btn-r btn-sm" onclick="delGasto(${g.id})">✕</button></td>` : '<td></td>'}
    </tr>`).join('');
}

async function generarGastosMes() {
  const m = $id('fil-mes-g').value || new Date().getMonth() + 1;
  const r = await api('/api/gastos/generar-mes', { method: 'POST', body: JSON.stringify({ mes: Number(m), anio: 2026 }) });
  if (r.ok) { loadGastos(); showToast(`✓ ${r.creados} gastos generados del mes`); }
}

async function registrarGasto() {
  const body = {
    concepto: $id('g-concepto').value, categoria: $id('g-cat').value,
    monto: $id('g-monto').value, mes: $id('g-mes').value, anio: '2026',
    fecha: $id('g-fecha').value, proveedor: $id('g-prov').value, notas: $id('g-notas').value,
  };
  const r = await api('/api/gastos', { method: 'POST', body: JSON.stringify(body) });
  if (r.ok) { closeModal('modal-gasto'); loadGastos(); showToast('✓ Gasto registrado'); }
}

async function delGasto(id) {
  if (!confirm('¿Eliminar este gasto?')) return;
  await api(`/api/gastos/${id}`, { method: 'DELETE' });
  loadGastos(); showToast('Gasto eliminado');
}

async function loadPlantillaAdmin() {
  const p = await api('/api/gastos/plantilla');
  $id('plantilla-admin-list').innerHTML = p.map(g => `
    <div style="display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid var(--border)">
      <div style="flex:1">
        <div style="font-size:13px;font-weight:600">${g.concepto}</div>
        <div style="font-size:11px;color:var(--text3)">${g.categoria} · ${g.proveedor || '—'}</div>
      </div>
      <div style="font-family:'DM Mono',monospace;font-size:13px;color:var(--gold2)">${fmtM(g.monto)}</div>
      <button class="btn btn-r btn-sm" onclick="delPlantilla(${g.id})">✕</button>
    </div>`).join('') || '<div style="color:var(--text3);font-size:13px;padding:10px 0">Sin conceptos</div>';
}

async function addPlantilla() {
  const r = await api('/api/gastos/plantilla', {
    method: 'POST',
    body: JSON.stringify({
      concepto: $id('pl-concepto').value, categoria: $id('pl-cat').value,
      monto: $id('pl-monto').value, proveedor: $id('pl-prov').value,
    }),
  });
  if (r.ok) { loadPlantillaAdmin(); loadGastos(); showToast('✓ Agregado a plantilla'); }
}

async function delPlantilla(id) {
  await api(`/api/gastos/plantilla/${id}`, { method: 'DELETE' });
  loadPlantillaAdmin(); loadGastos(); showToast('Eliminado de plantilla');
}

// ── PAGOS ─────────────────────────────────
async function registrarPago() {
  const fd = new FormData();
  fd.append('condominio_id', $id('pago-condo').value);
  fd.append('mes',           $id('pago-mes').value);
  fd.append('anio',          $id('pago-anio').value);
  fd.append('monto',         $id('pago-monto').value);
  fd.append('fecha_pago',    $id('pago-fecha').value);
  fd.append('metodo_pago',   $id('pago-metodo').value);
  fd.append('referencia',    $id('pago-ref').value);
  fd.append('numero_recibo', $id('pago-recibo').value);
  fd.append('notas',         $id('pago-notas').value);
  const comp = $id('pago-comp').files[0];
  if (comp) fd.append('comprobante', comp);
  const r = await apiF('/api/pagos', fd);
  if (r.ok) { closeModal('modal-pago'); loadCuentas(); showToast('✓ Pago registrado'); }
  else showToast('Error: ' + r.error, false);
}

// ── GASTOS EXTRAORDINARIOS ────────────────
async function loadGastosExt() {
  const gex = await api('/api/gastos-ext');
  if (!gex.length) {
    $id('gext-list').innerHTML = `
      <div style="text-align:center;padding:60px;color:var(--text3)">
        <div style="font-size:48px;margin-bottom:14px">💎</div>
        <div>No hay gastos extraordinarios registrados.</div>
      </div>`;
    return;
  }
  $id('gext-list').innerHTML = gex.map(g => {
    const pct = g.monto_total > 0 ? Math.round((g.recaudado / g.monto_total) * 100) : 0;
    const presupSlots = [1,2,3].map(n => {
      const p = g.presupuestos?.find(x => x.numero_presupuesto === n);
      if (p) return `
        <div class="presup-slot filled">
          <div style="font-size:11px;color:var(--text3);margin-bottom:4px">Presupuesto #${n}</div>
          <div style="font-weight:600;font-size:13px">${p.empresa}</div>
          <div style="font-size:12px;color:var(--text2)">Presentado por ${p.nombre_presentante} · Despacho ${p.despacho}</div>
          <div style="font-family:'DM Mono',monospace;font-size:14px;color:var(--gold2);margin-top:4px">${fmtM(p.monto)}</div>
          ${p.archivo_path ? `<a href="${p.archivo_path}" target="_blank" class="btn btn-o btn-sm" style="margin-top:8px;display:inline-flex">📄 Ver archivo</a>` : ''}
        </div>`;
      return `
        <div class="presup-slot">
          <div style="font-size:28px;margin-bottom:8px">📋</div>
          <div style="font-size:12px;color:var(--text3)">Presupuesto #${n}</div>
          <button class="btn btn-o btn-sm" style="margin-top:10px" onclick="abrirPresupuesto(${g.id})">+ Subir</button>
        </div>`;
    }).join('');
    return `
      <div class="gext-card">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:14px">
          <div>
            <div style="font-family:'Playfair Display',serif;font-size:17px;font-weight:700">${g.titulo}</div>
            ${g.descripcion ? `<div style="font-size:13px;color:var(--text2);margin-top:4px;line-height:1.5">${g.descripcion}</div>` : ''}
            <div style="display:flex;gap:10px;margin-top:8px;flex-wrap:wrap">
              <span class="badge bb">Inicio: ${MESES_FULL[g.mes_inicio]} ${g.anio_inicio}</span>
              <span class="badge bo">${g.num_cuotas} cuota${g.num_cuotas !== 1 ? 's' : ''}</span>
              <span class="badge ${g.estado === 'activo' ? 'bg' : 'br'}">${g.estado}</span>
            </div>
          </div>
          <div style="text-align:right;flex-shrink:0">
            <div style="font-family:'DM Mono',monospace;font-size:22px;font-weight:700;color:var(--purple)">${fmtM(g.monto_total)}</div>
            <div style="font-size:11px;color:var(--text3);margin-top:3px">Total a recaudar</div>
          </div>
        </div>
        <div style="margin-bottom:14px">
          <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text2);margin-bottom:5px">
            <span>Recaudado: ${fmtM(g.recaudado)}</span><span>${pct}%</span>
          </div>
          <div class="prog"><div class="prog-b" style="width:${pct}%;background:var(--purple)"></div></div>
        </div>
        <div style="margin-bottom:14px">
          <div class="ctitle">Cuota por despacho</div>
          <div style="display:flex;flex-wrap:wrap;gap:7px">
            ${(g.cuotas_por_condo || []).filter(co => co.cuota_mensual > 0).map(co => `
              <div style="background:var(--bg3);border-radius:8px;padding:7px 11px;font-size:12px">
                <div style="font-weight:700;color:var(--text)">${co.unidad}</div>
                <div style="color:var(--purple);font-family:'DM Mono',monospace">${fmtM(co.cuota_ext)}</div>
                <div class="indiviso-bar" style="width:${Math.min(co.indiviso * 5, 100)}%"></div>
              </div>`).join('')}
          </div>
        </div>
        <div>
          <div class="ctitle">Presupuestos (máx. 3)</div>
          <div class="g3">${presupSlots}</div>
        </div>
        ${sesion?.rol === 'admin' ? `
          <div style="margin-top:14px;display:flex;gap:9px">
            <button class="btn btn-o btn-sm" onclick="crearVotPresupuesto(${g.id},'${g.titulo.replace(/'/g,"\\'")}')">🗳️ Crear votación de presupuesto</button>
          </div>` : ''}
      </div>`;
  }).join('');
}

async function crearGastoExt() {
  const r = await api('/api/gastos-ext', {
    method: 'POST',
    body: JSON.stringify({
      titulo: $id('gext-titulo').value, descripcion: $id('gext-desc').value,
      monto_total: $id('gext-monto').value, num_cuotas: $id('gext-cuotas').value,
      mes_inicio: $id('gext-mes-ini').value, anio_inicio: $id('gext-anio-ini').value,
    }),
  });
  if (r.ok) { closeModal('modal-nuevo-gext'); loadGastosExt(); showToast('✓ Gasto extraordinario creado'); }
}

function abrirPresupuesto(gextId) {
  $id('presup-gext-id').value = gextId;
  initCanvasPresup();
  openModal('modal-presupuesto');
}

async function enviarPresupuesto() {
  if (firmaPresupCtx && firmaVaciaCheck(firmaPresupCanvas, firmaPresupCtx)) {
    return showToast('Falta la firma digital', false);
  }
  const fd = new FormData();
  fd.append('despacho',         $id('presup-despacho').value);
  fd.append('nombre_presentante',$id('presup-nombre').value);
  fd.append('empresa',          $id('presup-empresa').value);
  fd.append('monto',            $id('presup-monto').value);
  fd.append('descripcion',      $id('presup-desc').value);
  fd.append('firma',            firmaPresupCanvas.toDataURL('image/png'));
  const arch = $id('presup-archivo').files[0];
  if (arch) fd.append('archivo', arch);
  const gextId = $id('presup-gext-id').value;
  const r = await apiF(`/api/gastos-ext/${gextId}/presupuestos`, fd);
  if (r.ok) { closeModal('modal-presupuesto'); loadGastosExt(); showToast('✓ Presupuesto enviado'); }
  else showToast(r.error || 'Error al enviar', false);
}

async function crearVotPresupuesto(gextId, titulo) {
  $id('vt-titulo').value = `Selección de presupuesto: ${titulo}`;
  $id('vt-desc').value   = 'Votación para elegir el presupuesto que se ejecutará para este gasto extraordinario.';
  $id('vt-tipo').value   = 'presupuesto';
  $id('vt-gext-id').value = gextId;
  $id('vt-gext-wrap').style.display = '';
  // cargar opciones con los presupuestos disponibles
  const gex = await api('/api/gastos-ext');
  const g   = gex.find(x => x.id === gextId);
  if (g?.presupuestos?.length) {
    $id('vt-opciones').value = g.presupuestos.map(p => `Presupuesto #${p.numero_presupuesto} — ${p.empresa} (${fmtM(p.monto)})`).join('\n');
  }
  openModal('modal-nueva-vot');
}

// ── VOTACIONES ────────────────────────────
async function loadVotaciones() {
  const vots = await api('/api/votaciones');
  const act  = vots.filter(v => v.estado === 'activa' && !esVencida(v.fecha_cierre)).length;
  const bdg  = $id('bdg-vot');
  bdg.textContent = act; bdg.style.display = act > 0 ? 'inline' : 'none';

  if (!vots.length) {
    $id('vot-list').innerHTML = `
      <div style="text-align:center;padding:80px;color:var(--text3)">
        <div style="font-size:56px;margin-bottom:18px">🗳️</div>
        <div style="font-family:'Playfair Display',serif;font-size:20px;font-weight:700;margin-bottom:8px">Sin votaciones activas</div>
        <div style="font-size:13px">El administrador creará votaciones cuando sea necesario.</div>
      </div>`;
    return;
  }
  $id('vot-list').innerHTML = vots.map(v => {
    const cerr = v.estado === 'cerrada' || esVencida(v.fecha_cierre);
    const votaron = v.resultados.por_opcion.reduce((s, o) => s + o.total, 0);
    const pct = Math.round((votaron / DESPACHOS.length) * 100);
    const total = v.resultados.total;
    return `
      <div class="vot-card">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:13px;margin-bottom:13px">
          <div style="flex:1">
            <div style="display:flex;align-items:center;gap:9px;margin-bottom:7px;flex-wrap:wrap">
              <span class="badge ${cerr ? 'br' : 'bg'}">${cerr ? '🔒 Cerrada' : '🟢 Activa'}</span>
              ${v.tipo === 'presupuesto' ? `<span class="badge bpu">💎 Presupuesto</span>` : ''}
              ${v.fecha_cierre ? `<span style="font-size:11px;color:var(--text3);font-family:'DM Mono',monospace">Cierre: ${new Date(v.fecha_cierre).toLocaleString('es-MX')}</span>` : ''}
            </div>
            <div style="font-family:'Playfair Display',serif;font-size:17px;font-weight:700;margin-bottom:5px">${v.titulo}</div>
            ${v.descripcion ? `<div style="font-size:13px;color:var(--text2);line-height:1.5">${v.descripcion}</div>` : ''}
          </div>
          <div style="display:flex;flex-direction:column;gap:7px;flex-shrink:0">
            ${!cerr ? `<button class="btn btn-g btn-sm" onclick="abrirVotar(${v.id})">✏️ Votar</button>` : ''}
            <button class="btn btn-o btn-sm" onclick="verResultados(${v.id})">📊 Resultados</button>
            ${sesion?.rol === 'admin' ? `<button class="btn btn-r btn-sm" onclick="cerrarVot(${v.id})">🔒 Cerrar</button>` : ''}
          </div>
        </div>
        <div>
          <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text2);margin-bottom:6px">
            <span>Participación: <strong style="color:var(--text)">${votaron}/${DESPACHOS.length} despachos</strong></span>
            <span style="font-weight:700;color:${pct >= 50 ? 'var(--green)' : 'var(--gold)'}">${pct}%</span>
          </div>
          <div class="prog"><div class="prog-b" style="width:${pct}%;background:${pct >= 50 ? 'var(--green)' : 'var(--gold)'}"></div></div>
        </div>
        ${v.resultados.por_opcion.length ? `
          <div style="margin-top:14px;padding-top:13px;border-top:1px solid var(--border)">
            <div class="ctitle" style="margin-bottom:9px">Resultados preliminares</div>
            ${v.resultados.por_opcion.map((o, i) => {
              const p = total > 0 ? Math.round((o.total / total) * 100) : 0;
              return `
                <div style="margin-bottom:8px">
                  <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
                    <span>${o.opcion}</span>
                    <span style="font-weight:700;color:${COLORES[i % COLORES.length]}">${o.total} votos (${p}%)</span>
                  </div>
                  <div class="prog"><div class="prog-b" style="width:${p}%;background:${COLORES[i % COLORES.length]}"></div></div>
                </div>`;
            }).join('')}
          </div>` : ''}
      </div>`;
  }).join('');
}

async function crearVotacion() {
  const titulo   = $id('vt-titulo').value.trim();
  const optsRaw  = $id('vt-opciones').value.trim();
  if (!titulo || !optsRaw) { showToast('Completá el título y las opciones', false); return; }
  const opciones = optsRaw.split('\n').map(o => o.trim()).filter(Boolean);
  if (opciones.length < 2) { showToast('Se necesitan al menos 2 opciones', false); return; }
  const r = await api('/api/votaciones', {
    method: 'POST',
    body: JSON.stringify({
      titulo, descripcion: $id('vt-desc').value,
      tipo: $id('vt-tipo').value,
      gasto_ext_id: $id('vt-gext-id').value || null,
      opciones, fecha_cierre: $id('vt-cierre').value || null,
      despachos_habilitados: DESPACHOS,
    }),
  });
  if (r.ok) {
    closeModal('modal-nueva-vot');
    ['vt-titulo','vt-desc','vt-opciones','vt-cierre'].forEach(id => { $id(id).value = ''; });
    loadVotaciones(); showToast('✓ Votación creada');
  }
}

async function cerrarVot(id) {
  if (!confirm('¿Cerrar esta votación?')) return;
  await api(`/api/votaciones/${id}/estado`, { method: 'PUT', body: JSON.stringify({ estado: 'cerrada' }) });
  loadVotaciones(); showToast('Votación cerrada');
}

async function abrirVotar(id) {
  const v = await api(`/api/votaciones/${id}`);
  if (v.estado === 'cerrada' || esVencida(v.fecha_cierre)) {
    showToast('Esta votación ya está cerrada', false); loadVotaciones(); return;
  }
  votActiva = v;
  $id('votar-titulo').textContent = v.titulo;
  $id('votar-desc').textContent   = v.descripcion || '';
  $id('v-despacho').value = ''; $id('v-nombre').value = ''; $id('v-opcion').value = '';
  $id('v-error').style.display = 'none';
  const yaVotaron = new Set((v.votos || []).map(vt => vt.despacho));
  $id('despacho-grid').innerHTML = DESPACHOS.map(d => {
    const yv = yaVotaron.has(d);
    return `<div class="desp-opt ${yv ? 'ya-voto' : ''}" onclick="${yv ? '' : `selDesp('${d}')`}">
      <div>${d}</div>${yv ? '<div style="font-size:9px;color:var(--green)">✓ Votó</div>' : ''}
    </div>`;
  }).join('');
  $id('opciones-voto').innerHTML = v.opciones.map(o =>
    `<div class="opcion-voto" onclick="selOp(this,'${o.replace(/'/g,"\\'")}')"><div class="op-radio"></div><span>${o}</span></div>`
  ).join('');
  initCanvas(); openModal('modal-votar');
}

function selDesp(d) {
  document.querySelectorAll('.desp-opt:not(.ya-voto)').forEach(el => el.classList.remove('selected'));
  event.currentTarget.classList.add('selected');
  $id('v-despacho').value = d;
}
function selOp(el, op) {
  document.querySelectorAll('.opcion-voto').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  $id('v-opcion').value = op;
}

async function emitirVoto() {
  const desp   = $id('v-despacho').value;
  const nombre = $id('v-nombre').value.trim();
  const opcion = $id('v-opcion').value;
  const errEl  = $id('v-error');
  errEl.style.display = 'none';
  if (!desp)   { errEl.textContent = 'Seleccioná tu despacho';            errEl.style.display='block'; return; }
  if (!nombre) { errEl.textContent = 'Ingresá el nombre del representante'; errEl.style.display='block'; return; }
  if (!opcion) { errEl.textContent = 'Seleccioná una opción de voto';       errEl.style.display='block'; return; }
  if (firmaVaciaCheck(firmaCanvas, firmaCtx)) { errEl.textContent = 'Realizá tu firma digital'; errEl.style.display='block'; return; }
  const firma = firmaCanvas.toDataURL('image/png');
  const btn = $id('btn-emitir'); btn.disabled = true; btn.textContent = 'Enviando...';
  const r = await api(`/api/votaciones/${votActiva.id}/votar`, {
    method: 'POST', body: JSON.stringify({ despacho: desp, nombre_votante: nombre, firma, opcion }),
  });
  btn.disabled = false; btn.innerHTML = '✅ Confirmar voto';
  if (r.ok) {
    closeModal('modal-votar'); showToast('✓ Voto del Despacho ' + desp + ' registrado');
    loadVotaciones(); setTimeout(() => verResultados(votActiva.id), 600);
  } else {
    errEl.textContent = r.error || 'Error al registrar'; errEl.style.display = 'block';
  }
}

async function verResultados(id) {
  const v     = await api(`/api/votaciones/${id}`);
  const total = (v.votos || []).length;
  const votaron = new Set((v.votos || []).map(vt => vt.despacho));
  const noVot   = DESPACHOS.filter(d => !votaron.has(d));
  $id('res-titulo').textContent = '📊 ' + v.titulo;
  $id('res-content').innerHTML = `
    <div style="display:flex;gap:13px;margin-bottom:22px;flex-wrap:wrap">
      <div class="stat" style="flex:1;min-width:100px;--ac:var(--blue)"><div class="stat-lbl">Votos</div><div class="stat-val">${total}</div><div class="stat-sub">de ${DESPACHOS.length}</div></div>
      <div class="stat" style="flex:1;min-width:100px;--ac:${v.estado === 'cerrada' ? 'var(--red)' : 'var(--green)'}"><div class="stat-lbl">Estado</div><div class="stat-val" style="font-size:16px">${v.estado === 'cerrada' ? '🔒 Cerrada' : '🟢 Activa'}</div></div>
      <div class="stat" style="flex:1;min-width:100px;--ac:var(--gold)"><div class="stat-lbl">Participación</div><div class="stat-val">${Math.round((total / DESPACHOS.length) * 100)}%</div></div>
    </div>
    <div style="margin-bottom:24px">
      <div class="ctitle" style="margin-bottom:12px">Resultados por opción</div>
      ${v.opciones.map((op, i) => {
        const ov   = v.resultados.por_opcion.find(x => x.opcion === op);
        const cant = ov ? ov.total : 0;
        const p    = total > 0 ? Math.round((cant / total) * 100) : 0;
        const col  = COLORES[i % COLORES.length];
        return `
          <div style="margin-bottom:13px">
            <div style="display:flex;justify-content:space-between;margin-bottom:5px;font-size:13px">
              <span style="font-weight:600">${op}</span>
              <span style="font-weight:700;color:${col}">${cant} votos — ${p}%</span>
            </div>
            <div class="res-bar-track"><div class="res-bar-fill" style="width:${p}%;background:${col}">${p > 8 ? p + '%' : ''}</div></div>
          </div>`;
      }).join('')}
    </div>
    <div class="g2">
      <div>
        <div class="ctitle">✅ Votaron (${total})</div>
        <div style="display:flex;flex-wrap:wrap;gap:7px">
          ${(v.votos || []).map(vt => `
            <div style="background:var(--green-dim);border:1px solid rgba(76,175,135,.3);border-radius:8px;padding:7px 10px;font-size:12px">
              <div style="font-weight:700;color:var(--green)">${vt.despacho}</div>
              <div style="color:var(--text2);margin-top:2px">${vt.nombre_votante}</div>
              <div style="color:var(--text3);font-size:11px;margin-top:2px">${vt.opcion}</div>
            </div>`).join('')}
        </div>
      </div>
      <div>
        <div class="ctitle">⏳ Pendientes (${noVot.length})</div>
        <div style="display:flex;flex-wrap:wrap;gap:7px">
          ${noVot.map(d => `<div style="background:var(--red-dim);border:1px solid rgba(224,85,85,.2);border-radius:8px;padding:7px 10px;font-size:12px;font-weight:700;color:var(--red)">${d}</div>`).join('')}
        </div>
      </div>
    </div>
    ${v.fecha_cierre ? `<div style="margin-top:18px;padding:12px 15px;background:var(--bg3);border-radius:10px;font-size:13px;color:var(--text2)">🕐 Cierre: <strong style="color:var(--text)">${new Date(v.fecha_cierre).toLocaleString('es-MX', { dateStyle: 'full', timeStyle: 'short' })}</strong></div>` : ''}`;
  openModal('modal-resultados');
}

// ── SITUACIONES ───────────────────────────
async function loadSits() {
  const sits = await api('/api/situaciones');
  const urgCl = { alta: 'var(--red)', media: 'var(--gold)', baja: 'var(--blue)' };
  const urgLb = { alta: '🔴 Alta', media: '🟡 Media', baja: '🟢 Baja' };
  const estBg = { pendiente: 'bo', resuelto: 'bg', 'en-proceso': 'bb' };
  const pend  = sits.filter(s => s.estado !== 'resuelto').length;
  $id('bdg-sit').textContent = pend;
  $id('sit-sub').textContent = `${pend} pendientes · ${sits.length} totales`;

  $id('sits-grid').innerHTML = sits.map(s => `
    <div class="sit-card ${s.urgencia} ${s.estado === 'resuelto' ? 'resuelto' : ''}">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:10px">
        <div>
          <div style="font-size:11px;color:var(--text3);font-family:'DM Mono',monospace">SIT #${String(s.numero).padStart(2,'0')}</div>
          <div style="font-weight:600;font-size:14px;margin-top:2px">${s.titulo}</div>
        </div>
        <span class="badge" style="background:${urgCl[s.urgencia]}22;color:${urgCl[s.urgencia]};white-space:nowrap;flex-shrink:0">${urgLb[s.urgencia]}</span>
      </div>
      <div style="font-size:13px;color:var(--text2);line-height:1.5;margin-bottom:10px">${s.descripcion}</div>
      ${s.archivos?.length ? `
        <div class="photo-grid" style="margin-bottom:10px">
          ${s.archivos.slice(0, 4).map(a => `
            <div class="photo-item" onclick="verFoto('${a.archivo_path}','${a.descripcion || ''}')">
              <img src="${a.archivo_path}" onerror="this.style.display='none';this.parentNode.innerHTML+='📷'">
              <div class="photo-cap">${a.es_resolucion ? '✅ Resolución' : a.descripcion || ''}</div>
            </div>`).join('')}
        </div>` : ''}
      ${s.resolucion ? `
        <div style="margin-bottom:10px;padding:10px;background:var(--green-dim);border-radius:8px;border-left:3px solid var(--green);font-size:13px">
          <div style="font-size:11px;font-weight:700;color:var(--green);margin-bottom:4px">✅ Resolución (${s.fecha_resolucion || ''})</div>
          ${s.resolucion}
        </div>` : ''}
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <span class="badge ${estBg[s.estado] || 'bo'}">${s.estado}</span>
        ${sesion?.rol === 'admin' ? `<button class="detalle-btn" onclick="editSituacion(${s.id})">✏️ Gestionar</button>` : ''}
      </div>
    </div>`).join('');
}

async function crearSituacion() {
  const r = await api('/api/situaciones', {
    method: 'POST',
    body: JSON.stringify({
      titulo: $id('sit-titulo').value, descripcion: $id('sit-desc').value,
      urgencia: $id('sit-urgencia').value,
    }),
  });
  if (r.ok) { closeModal('modal-nueva-sit'); loadSits(); showToast('✓ Situación creada'); }
}

async function editSituacion(id) {
  const sits = await api('/api/situaciones');
  const s    = sits.find(x => x.id === id);
  if (!s) return;
  $id('sit-det-titulo').textContent = `SIT #${String(s.numero).padStart(2,'0')} — ${s.titulo}`;
  $id('sit-det-content').innerHTML = `
    <div class="form-g"><label class="form-l">Estado</label>
      <select class="fs" id="sed-estado">
        <option value="pendiente" ${s.estado==='pendiente'?'selected':''}>Pendiente</option>
        <option value="en-proceso" ${s.estado==='en-proceso'?'selected':''}>En proceso</option>
        <option value="resuelto" ${s.estado==='resuelto'?'selected':''}>Resuelto</option>
      </select>
    </div>
    <div class="form-g"><label class="form-l">Texto de resolución</label>
      <textarea class="fta" id="sed-res">${s.resolucion || ''}</textarea>
    </div>
    <div class="form-g"><label class="form-l">Subir evidencia / foto resolución</label>
      <input class="fi" id="sed-foto" type="file" accept="image/*">
    </div>
    <div style="display:flex;gap:9px;margin-top:4px">
      <button class="btn btn-g" onclick="guardarSituacion(${id})">Guardar</button>
      <button class="btn btn-o" onclick="closeModal('modal-sit-detalle')">Cancelar</button>
    </div>`;
  openModal('modal-sit-detalle');
}

async function guardarSituacion(id) {
  const estado = $id('sed-estado').value;
  const res    = $id('sed-res').value;
  await api(`/api/situaciones/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ estado, resolucion: res, titulo: '', descripcion: '', urgencia: 'media' }),
  });
  const foto = $id('sed-foto').files[0];
  if (foto) {
    const fd = new FormData();
    fd.append('archivo', foto); fd.append('es_resolucion', '1'); fd.append('autor', sesion.nombre);
    await apiF(`/api/situaciones/${id}/archivos`, fd);
  }
  closeModal('modal-sit-detalle'); loadSits(); showToast('✓ Situación actualizada');
}

// ── MANTENIMIENTO ─────────────────────────
async function loadMan() {
  const sol = await api('/api/solicitudes');
  const pc  = { alta: 'var(--red)', media: 'var(--gold)', baja: 'var(--green)' };
  const isManto = sesion?.rol === 'admin' || sesion?.rol === 'mantenimiento';

  $id('man-list').innerHTML = !sol.length
    ? '<div style="text-align:center;padding:60px;color:var(--text3)">Sin solicitudes</div>'
    : sol.map(s => `
        <div class="card" style="margin-bottom:11px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:9px;flex-wrap:wrap">
            <div class="sdot ${s.estado}"></div>
            <span style="font-size:12px;color:var(--text3)">${s.estado === 'pendiente' ? '🕐 Pendiente' : s.estado === 'en-proceso' ? '⚙️ En proceso' : '✅ Resuelto'}</span>
            <span class="badge" style="background:${pc[s.prioridad]}22;color:${pc[s.prioridad]}">${s.prioridad}</span>
            ${s.despacho ? `<span class="badge bb" style="margin-left:auto">${s.despacho}</span>` : ''}
            <span style="font-size:10px;font-family:'DM Mono',monospace;color:var(--text3)">${s.created_at?.slice(0,10)}</span>
          </div>
          <div style="font-size:14px;font-weight:600;margin-bottom:4px">${s.descripcion}</div>
          <div style="font-size:12px;color:var(--text3)">Por: ${s.autor}</div>
          ${s.foto_problema_path ? `
            <div style="margin-top:9px">
              <div class="photo-item" style="width:100px;height:80px" onclick="verFoto('${s.foto_problema_path}','Problema')">
                <img src="${s.foto_problema_path}" style="width:100%;height:100%;object-fit:cover">
                <div class="photo-cap">Problema</div>
              </div>
            </div>` : ''}
          ${s.respuesta ? `
            <div style="margin-top:9px;padding:10px;background:var(--green-dim);border-radius:8px;font-size:13px">
              💬 ${s.respuesta}
              ${s.foto_resolucion_path ? `
                <div class="photo-item" style="width:80px;height:60px;margin-top:7px" onclick="verFoto('${s.foto_resolucion_path}','Resolución')">
                  <img src="${s.foto_resolucion_path}" style="width:100%;height:100%;object-fit:cover">
                  <div class="photo-cap">Resolución</div>
                </div>` : ''}
            </div>` : ''}
          ${isManto && s.estado !== 'resuelto' ? `
            <div style="margin-top:9px;display:flex;gap:7px">
              ${s.estado === 'pendiente' ? `<button class="btn btn-b btn-sm" onclick="updSolEstado(${s.id},'en-proceso')">⚙️ En proceso</button>` : ''}
              <button class="btn btn-g btn-sm" onclick="abrirResolver(${s.id})">✅ Resolver</button>
            </div>` : ''}
        </div>`).join('');
}

async function crearSolicitud() {
  const fd = new FormData();
  fd.append('despacho',    $id('sol-despacho').value);
  fd.append('autor',       $id('sol-autor').value || 'Condómino');
  fd.append('descripcion', $id('sol-desc').value);
  fd.append('prioridad',   $id('sol-pri').value);
  const foto = $id('sol-foto').files[0];
  if (foto) fd.append('foto', foto);
  const r = await apiF('/api/solicitudes', fd);
  if (r.ok) { closeModal('modal-solicitud'); loadMan(); showToast('✓ Solicitud enviada'); }
}

async function updSolEstado(id, estado) {
  const fd = new FormData(); fd.append('estado', estado);
  await apiPutF(`/api/solicitudes/${id}`, fd);
  loadMan(); showToast('Actualizado');
}

function abrirResolver(id) { $id('resolver-id').value = id; openModal('modal-resolver'); }

async function resolverSolicitud() {
  const id = $id('resolver-id').value;
  const fd = new FormData();
  fd.append('estado',    $id('resolver-estado').value);
  fd.append('respuesta', $id('resolver-resp').value);
  const foto = $id('resolver-foto').files[0];
  if (foto) fd.append('foto_resolucion', foto);
  const r = await apiPutF(`/api/solicitudes/${id}`, fd);
  if (r.ok) { closeModal('modal-resolver'); loadMan(); showToast('✓ Solicitud resuelta'); }
}

// ── BITÁCORA SEMANAL ──────────────────────
async function loadBit() {
  const semanas = await api('/api/bitacora');
  $id('bitacora-list').innerHTML = !semanas.length
    ? '<div style="text-align:center;padding:60px;color:var(--text3)"><div style="font-size:48px;margin-bottom:14px">🧹</div><div>Sin registros de limpieza</div></div>'
    : semanas.map(s => {
        const total   = s.areas?.length || 0;
        const hechas  = s.areas?.filter(a => a.completada)?.length || 0;
        const pct     = total > 0 ? Math.round((hechas / total) * 100) : 0;
        return `
          <div class="bit-week">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px">
              <div>
                <div style="font-family:'Playfair Display',serif;font-size:15px;font-weight:700">Semana ${s.semana_inicio} al ${s.semana_fin}</div>
                <div style="font-size:12px;color:var(--text3);margin-top:2px">👷 ${s.personal}</div>
              </div>
              <div style="display:flex;gap:8px;align-items:center">
                <span class="badge ${s.estado === 'completada' ? 'bg' : s.estado === 'en_progreso' ? 'bb' : 'bo'}">${s.estado}</span>
                <span style="font-size:12px;color:var(--text2)">${hechas}/${total} áreas</span>
              </div>
            </div>
            <div class="prog" style="margin-bottom:12px"><div class="prog-b" style="width:${pct}%;background:var(--green)"></div></div>
            ${s.areas?.length ? `
              <div style="display:flex;flex-wrap:wrap;gap:7px;margin-bottom:10px">
                ${s.areas.map(a => `
                  <div style="display:flex;align-items:center;gap:6px;background:${a.completada ? 'var(--green-dim)' : 'var(--bg3)'};border:1px solid ${a.completada ? 'rgba(76,175,135,.3)' : 'var(--border)'};border-radius:8px;padding:5px 10px;font-size:12px">
                    <span>${a.completada ? '✅' : '⬜'}</span> ${a.area_nombre || a.area}
                    ${a.foto_path ? `<span style="cursor:pointer" onclick="verFoto('${a.foto_path}','${a.area_nombre || a.area}')">📷</span>` : ''}
                  </div>`).join('')}
              </div>` : ''}
            ${s.observaciones_generales ? `<div style="font-size:13px;color:var(--text2);border-top:1px solid var(--border);padding-top:8px">${s.observaciones_generales}</div>` : ''}
          </div>`;
      }).join('');
}

async function openSemana() {
  const d = await api('/api/bitacora/semana-actual');
  $id('sem-ini').value   = d.semana_inicio;
  $id('sem-fin').value   = d.semana_fin;
  $id('sem-id').value    = d.semana?.id || '';
  $id('sem-rango').textContent = `Semana ${d.semana_inicio} al ${d.semana_fin}`;
  $id('sem-obs').value   = d.semana?.observaciones_generales || '';

  // Áreas
  $id('sem-areas-list').innerHTML = d.areas.map(a => {
    const hecha = d.semana?.areas?.find(x => x.area === a.nombre)?.completada;
    return `
      <div class="area-item">
        <div class="area-check ${hecha ? 'done' : ''}" onclick="toggleArea(this,'${a.nombre}')">
          ${hecha ? '✓' : ''}
        </div>
        <div style="flex:1;font-size:13px;font-weight:${hecha ? '600' : '400'};color:${hecha ? 'var(--green)' : 'var(--text)'}">${a.nombre}</div>
        <input type="file" accept="image/*" id="area-foto-${a.nombre.replace(/\s/g,'_')}" style="font-size:11px;width:150px">
      </div>`;
  }).join('');

  // Insumos
  $id('sem-insumos-list').innerHTML = d.insumos.map(ins => `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
      <div style="flex:1;font-size:13px">${ins.nombre} <span style="color:var(--text3);font-size:11px">(${ins.unidad})</span></div>
      <input class="fi" style="width:90px;text-align:center" type="number" id="ins-${ins.id}" placeholder="0" min="0">
    </div>`).join('');

  openModal('modal-semana');
}

let areasSeleccionadas = new Set();
function toggleArea(el, nombre) {
  el.classList.toggle('done');
  if (el.classList.contains('done')) { el.textContent = '✓'; areasSeleccionadas.add(nombre); }
  else { el.textContent = ''; areasSeleccionadas.delete(nombre); }
}

async function guardarSemana() {
  // 1. Crear/actualizar bitácora de la semana
  const fd0 = new FormData();
  fd0.append('semana_inicio', $id('sem-ini').value);
  fd0.append('semana_fin',    $id('sem-fin').value);
  fd0.append('observaciones', $id('sem-obs').value);
  const r0 = await apiF('/api/bitacora', fd0);
  if (!r0.ok) return showToast('Error al crear bitácora', false);
  const semId = r0.id || $id('sem-id').value;

  // 2. Guardar áreas marcadas
  for (const area of areasSeleccionadas) {
    const fotoEl = document.getElementById(`area-foto-${area.replace(/\s/g,'_')}`);
    const fdA = new FormData();
    fdA.append('area', area);
    if (fotoEl?.files[0]) fdA.append('foto', fotoEl.files[0]);
    await apiF(`/api/bitacora/${semId}/area`, fdA);
  }

  // 3. Guardar inventario de insumos
  const insumos = [];
  document.querySelectorAll('[id^="ins-"]').forEach(el => {
    const insId = el.id.replace('ins-', '');
    if (el.value) insumos.push({ insumo_id: insId, cantidad: el.value });
  });
  if (insumos.length) {
    const fdI = new FormData();
    fdI.append('insumos', JSON.stringify(insumos));
    const fotoInv = $id('sem-insumo-foto').files[0];
    if (fotoInv) fdI.append('foto', fotoInv);
    await apiF(`/api/bitacora/${semId}/insumos`, fdI);
  }

  areasSeleccionadas.clear();
  closeModal('modal-semana'); loadBit(); showToast('✓ Bitácora guardada');
}

// Admin: gestión de áreas e insumos
function tabAdminAreas(tab, btn) {
  tabAreasActual = tab;
  document.querySelectorAll('.pill-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderAdminAreas();
}

async function renderAdminAreas() {
  if (tabAreasActual === 'areas') {
    const areas = await api('/api/areas-limpieza');
    $id('admin-areas-content').innerHTML = `
      ${areas.map(a => `
        <div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border)">
          <div style="flex:1;font-size:13px">${a.nombre}</div>
          <button class="btn btn-r btn-sm" onclick="delArea(${a.id})">✕</button>
        </div>`).join('')}
      <div style="display:flex;gap:9px;margin-top:14px">
        <input class="fi" id="new-area-nombre" placeholder="Nombre del área">
        <button class="btn btn-g" onclick="addArea()">+ Agregar</button>
      </div>`;
  } else {
    const insumos = await api('/api/insumos');
    $id('admin-areas-content').innerHTML = `
      ${insumos.map(i => `
        <div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border)">
          <div style="flex:1;font-size:13px">${i.nombre} <span style="color:var(--text3);font-size:11px">${i.unidad}</span></div>
          <button class="btn btn-r btn-sm" onclick="delInsumo(${i.id})">✕</button>
        </div>`).join('')}
      <div style="display:flex;gap:9px;margin-top:14px;flex-wrap:wrap">
        <input class="fi" id="new-ins-nombre" placeholder="Insumo" style="flex:1">
        <input class="fi" id="new-ins-unidad" placeholder="Unidad" style="width:100px">
        <button class="btn btn-g" onclick="addInsumo()">+ Agregar</button>
      </div>`;
  }
}

async function addArea()   { await api('/api/areas-limpieza', { method:'POST', body: JSON.stringify({ nombre: $id('new-area-nombre').value }) }); renderAdminAreas(); }
async function delArea(id) { await api(`/api/areas-limpieza/${id}`, { method:'DELETE' }); renderAdminAreas(); }
async function addInsumo() { await api('/api/insumos', { method:'POST', body: JSON.stringify({ nombre: $id('new-ins-nombre').value, unidad: $id('new-ins-unidad').value }) }); renderAdminAreas(); }
async function delInsumo(id){ await api(`/api/insumos/${id}`, { method:'DELETE' }); renderAdminAreas(); }

// ── ELEVADOR ──────────────────────────────
async function loadElevador() {
  const data = await api('/api/elevador');
  if (!data.length) {
    $id('elevador-list').innerHTML = `
      <div style="text-align:center;padding:60px;color:var(--text3)">
        <div style="font-size:48px;margin-bottom:14px">🛗</div>
        <div>Sin registros de mantenimiento del elevador.</div>
      </div>`;
    return;
  }
  const estClr = { bueno: 'ok', regular: 'revision', 'requiere-atencion': 'alerta' };
  const estIco = { bueno: '✅', regular: '⚠️', 'requiere-atencion': '🔴' };
  $id('elevador-list').innerHTML = data.map(r => `
    <div class="card" style="margin-bottom:13px">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:13px;margin-bottom:12px;flex-wrap:wrap">
        <div>
          <div style="font-family:'Playfair Display',serif;font-size:16px;font-weight:700">${MESES_FULL[r.mes]} ${r.anio}</div>
          <div style="font-size:12px;color:var(--text3);margin-top:3px">Técnico: ${r.tecnico} · ${r.empresa}</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <span class="elev-status ${estClr[r.estado_general] || 'ok'}">${estIco[r.estado_general] || '✅'} ${r.estado_general || 'Bueno'}</span>
          <span class="badge bo">${r.tipo_revision}</span>
          ${r.costo ? `<span style="font-family:'DM Mono',monospace;font-size:13px;color:var(--gold2)">${fmtM(r.costo)}</span>` : ''}
        </div>
      </div>
      ${r.trabajo_realizado ? `
        <div style="margin-bottom:10px">
          <div class="ctitle">Trabajo realizado</div>
          <div style="font-size:13px;color:var(--text2);line-height:1.5">${r.trabajo_realizado}</div>
        </div>` : ''}
      ${r.piezas_cambiadas ? `
        <div style="margin-bottom:10px">
          <div class="ctitle">Piezas cambiadas</div>
          <div style="font-size:13px;color:var(--text2)">${r.piezas_cambiadas}</div>
        </div>` : ''}
      ${r.proxima_revision ? `
        <div style="font-size:12px;color:var(--blue);margin-bottom:10px">📅 Próxima revisión: ${r.proxima_revision}</div>` : ''}
      ${r.fotos?.length ? `
        <div class="photo-grid">
          ${r.fotos.map(f => `
            <div class="photo-item" onclick="verFoto('${f.foto_path}','${f.descripcion || ''}')">
              <img src="${f.foto_path}" onerror="this.style.display='none';this.parentNode.innerHTML+='📷'">
              <div class="photo-cap">${f.descripcion || ''}</div>
            </div>`).join('')}
        </div>` : ''}
    </div>`).join('');
}

async function guardarElevador() {
  const fd = new FormData();
  ['mes','anio','tecnico','empresa','tipo','estado_general','costo','proxima','obs','trabajo','piezas'].forEach(k => {
    const ids = { mes:'elev-mes', anio:'elev-anio', tecnico:'elev-tecnico', empresa:'elev-empresa',
      tipo:'elev-tipo', estado_general:'elev-estado-gen', costo:'elev-costo', proxima:'elev-proxima',
      obs:'elev-obs', trabajo:'elev-trabajo', piezas:'elev-piezas' };
    fd.append(k === 'tipo' ? 'tipo_revision' : k, $id(ids[k]).value);
  });
  ['f1','f2','f3'].forEach(k => {
    const f = $id(`elev-${k}`).files[0]; if (f) fd.append(`foto${k.slice(1)}`, f);
    fd.append(`desc_foto${k.slice(1)}`, $id(`elev-d${k.slice(1)}`).value);
  });
  const r = await apiF('/api/elevador', fd);
  if (r.ok) { closeModal('modal-elevador'); loadElevador(); showToast('✓ Registro guardado'); }
}

// ── AVISOS ────────────────────────────────
async function loadAvisos() {
  const av = await api('/api/avisos');
  const ti = { info:'📢', urgente:'🚨', comunicado:'📄', mantenimiento:'🔧' };
  $id('avisos-list').innerHTML = av.map(a => `
    <div class="aviso-card ${a.urgente ? 'urgente' : ''}">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:7px;flex-wrap:wrap;gap:7px">
        <div style="font-weight:600">${ti[a.tipo] || '📢'} ${a.autor}</div>
        <div style="font-size:11px;color:var(--text3);font-family:'DM Mono',monospace">${a.created_at?.slice(0,10) || ''}</div>
      </div>
      <div style="font-weight:600;margin-bottom:5px">${a.titulo}</div>
      <div style="font-size:13px;color:var(--text2);line-height:1.6">${a.contenido}</div>
      ${sesion?.rol === 'admin' ? `<button class="btn btn-r btn-sm" style="margin-top:9px" onclick="delAviso(${a.id})">✕ Eliminar</button>` : ''}
    </div>`).join('');
  $id('bdg-av').textContent = av.length;
}

async function postAviso() {
  const r = await api('/api/avisos', {
    method: 'POST',
    body: JSON.stringify({
      titulo: $id('av-titulo').value, contenido: $id('av-texto').value,
      tipo: $id('av-tipo').value, urgente: $id('av-tipo').value === 'urgente',
      autor: sesion?.nombre || 'Condómino',
    }),
  });
  if (r.ok) { closeModal('modal-aviso'); loadAvisos(); showToast('✓ Aviso publicado'); }
}

async function delAviso(id) {
  if (!confirm('¿Eliminar aviso?')) return;
  await api(`/api/avisos/${id}`, { method: 'DELETE' });
  loadAvisos(); showToast('Aviso eliminado');
}

// ── MENSAJES ──────────────────────────────
async function loadChat() {
  const msgs = await api('/api/mensajes');
  const el   = $id('chat-msgs');
  el.innerHTML = msgs.map(m => {
    const isMio = m.de !== 'Sergio';
    return `
      <div style="display:flex;flex-direction:column;align-items:${isMio ? 'flex-end' : 'flex-start'}">
        <div style="max-width:80%;padding:8px 13px;border-radius:${isMio ? '12px 12px 4px 12px' : '12px 12px 12px 4px'};background:${isMio ? 'var(--gold-dim)' : 'var(--bg3)'};border:1px solid ${isMio ? 'rgba(201,168,76,.3)' : 'var(--border)'};font-size:13px">${m.texto}</div>
        <div style="font-size:10px;color:var(--text3);margin-top:3px">${m.de} · ${m.created_at?.slice(11,16) || ''}</div>
      </div>`;
  }).join('');
  el.scrollTop = el.scrollHeight;
}

async function sendMsg() {
  const t  = $id('chat-in').value.trim();
  const de = $id('chat-de').value.trim() || 'Condómino';
  if (!t) return;
  await api('/api/mensajes', { method: 'POST', body: JSON.stringify({ de, texto: t }) });
  $id('chat-in').value = '';
  loadChat();
  setTimeout(async () => {
    const rs = ['Recibido, lo atiendo a la brevedad 👍','Entendido, paso a revisar.','Gracias por el aviso.','Ok, lo atiendo hoy.'];
    await api('/api/mensajes', { method: 'POST', body: JSON.stringify({ de: 'Sergio', texto: rs[Math.floor(Math.random() * rs.length)] }) });
    loadChat();
  }, 1200);
}
function quickMsg(t) { $id('chat-in').value = t; sendMsg(); }

// ── ACTAS ─────────────────────────────────
async function loadActas() {
  const ac = await api('/api/actas');
  if (!ac.length) {
    $id('actas-list').innerHTML = '<div style="text-align:center;padding:60px;color:var(--text3)"><div style="font-size:48px;margin-bottom:14px">📖</div><div>Sin actas registradas</div></div>';
    return;
  }
  $id('actas-list').innerHTML = ac.map(a => `
    <div class="card" style="margin-bottom:14px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:9px">
        <div>
          <div style="font-size:11px;color:var(--text3);font-family:'DM Mono',monospace">ACTA FOLIO #${String(a.folio || 0).padStart(3,'0')}</div>
          <div style="font-family:'Playfair Display',serif;font-size:17px;font-weight:700;margin-top:2px">Asamblea del ${a.fecha}</div>
          <div style="font-size:12px;color:var(--text3);margin-top:2px">Asistentes: ${a.num_asistentes || '?'}/${a.total_condominos || 16}</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <span class="badge ${a.estado === 'firmada' ? 'bg' : 'bo'}">${a.estado === 'firmada' ? '✅ Firmada' : 'Borrador'}</span>
          ${sesion?.rol === 'admin' && a.estado !== 'firmada' ? `<button class="btn btn-g btn-sm" onclick="firmarActa(${a.id})">Firmar</button>` : ''}
        </div>
      </div>
      <div style="margin-bottom:13px">
        <div class="ctitle">Temas tratados</div>
        ${a.temas.split('\n').filter(t => t.trim()).map(t => `<div style="font-size:13px;padding:4px 0;border-bottom:1px solid var(--border);color:var(--text2)">• ${t}</div>`).join('')}
      </div>
      ${a.resoluciones ? `
        <div>
          <div class="ctitle">Resoluciones</div>
          <div style="font-size:13px;color:var(--text2);line-height:1.6">${a.resoluciones}</div>
        </div>` : ''}
    </div>`).join('');
}

async function crearActa() {
  const r = await api('/api/actas', {
    method: 'POST',
    body: JSON.stringify({
      fecha: $id('acta-fecha').value, temas: $id('acta-temas').value,
      asistentes: $id('acta-asist').value, num_asistentes: $id('acta-num').value,
      total_condominos: $id('acta-tot').value, resoluciones: $id('acta-res').value,
    }),
  });
  if (r.ok) { closeModal('modal-acta'); loadActas(); showToast(`✓ Acta #${r.folio} guardada`); }
}

async function firmarActa(id) {
  await api(`/api/actas/${id}/firmar`, { method: 'PUT', body: JSON.stringify({}) });
  loadActas(); showToast('✓ Acta firmada');
}

// ── RECIBOS Y FACTURAS ────────────────────
const FOLDERS = [
  { key:'Luz',          icon:'💡', label:'Recibos de Luz' },
  { key:'Mantenimiento',icon:'🔧', label:'Mantenimiento' },
  { key:'Elevador',     icon:'🛗', label:'Elevador' },
  { key:'Basura',       icon:'🗑️', label:'Basura' },
  { key:'Agua',         icon:'💧', label:'Agua' },
  { key:'Seguridad',    icon:'🔐', label:'Seguridad' },
  { key:'Varios',       icon:'📁', label:'Varios' },
];

let recibosData = {};

async function loadRecibos() {
  recibosData = await api('/api/recibos');
  $id('recibos-carpetas').style.display = '';
  $id('recibos-detalle').style.display  = 'none';
  $id('recibos-carpetas').innerHTML = `
    <div class="g4">
      ${FOLDERS.map(f => {
        const items = recibosData[f.key] || [];
        return `
          <div class="folder-card" onclick="abrirCarpeta('${f.key}','${f.label}')">
            <div class="folder-icon">${f.icon}</div>
            <div style="font-weight:600;font-size:13px;margin-bottom:4px">${f.label}</div>
            <div style="font-size:12px;color:var(--text3)">${items.length} archivo${items.length !== 1 ? 's' : ''}</div>
            ${items.length ? `<div style="font-size:11px;color:var(--gold2);margin-top:4px">Último: ${items[0].created_at?.slice(0,10)}</div>` : ''}
          </div>`;
      }).join('')}
    </div>`;
}

function abrirCarpeta(key, label) {
  const items = recibosData[key] || [];
  $id('recibos-carpetas').style.display = 'none';
  $id('recibos-detalle').style.display  = '';
  $id('recibos-folder-title').textContent = `${FOLDERS.find(f => f.key === key)?.icon || ''} ${label}`;
  $id('recibos-archivos').innerHTML = !items.length
    ? '<div style="text-align:center;padding:40px;color:var(--text3)">Sin archivos en esta carpeta</div>'
    : `
      <div class="g4">
        ${items.map(r => {
          const isPDF = r.archivo_path?.endsWith('.pdf');
          return `
            <div class="card" style="text-align:center;cursor:pointer" onclick="window.open('${r.archivo_path}','_blank')">
              <div style="font-size:36px;margin-bottom:9px">${isPDF ? '📄' : '🖼️'}</div>
              <div style="font-size:12px;font-weight:600;margin-bottom:4px">${r.subcategoria || r.proveedor || 'Recibo'}</div>
              ${r.mes ? `<div style="font-size:11px;color:var(--text3)">${MESES[r.mes]} ${r.anio || ''}</div>` : ''}
              ${r.monto ? `<div style="font-family:'DM Mono',monospace;font-size:13px;color:var(--gold2);margin-top:4px">${fmtM(r.monto)}</div>` : ''}
              <div style="font-size:10px;color:var(--text3);margin-top:4px">${r.created_at?.slice(0,10) || ''}</div>
              ${sesion?.rol === 'admin' ? `<button class="btn btn-r btn-sm" style="margin-top:8px" onclick="event.stopPropagation();delRecibo(${r.id})">✕</button>` : ''}
            </div>`;
        }).join('')}
      </div>`;
}

function volverRecibos() {
  $id('recibos-carpetas').style.display = '';
  $id('recibos-detalle').style.display  = 'none';
}

async function subirRecibo() {
  const arch = $id('rec-archivo').files[0];
  if (!arch) { showToast('Seleccioná un archivo', false); return; }
  const fd = new FormData();
  fd.append('archivo',     arch);
  fd.append('categoria',   $id('rec-cat').value);
  fd.append('subcategoria',$id('rec-subcat').value);
  fd.append('mes',         $id('rec-mes').value);
  fd.append('anio',        $id('rec-anio').value);
  fd.append('monto',       $id('rec-monto').value);
  fd.append('proveedor',   $id('rec-prov').value);
  const r = await apiF('/api/recibos', fd);
  if (r.ok) { closeModal('modal-recibo'); loadRecibos(); showToast('✓ Recibo subido'); }
}

async function delRecibo(id) {
  if (!confirm('¿Eliminar este recibo?')) return;
  await api(`/api/recibos/${id}`, { method: 'DELETE' });
  loadRecibos(); showToast('Recibo eliminado');
}

// ── CANVAS: Firma votación ─────────────────
function initCanvas() {
  firmaCanvas = $id('canvas-firma');
  firmaCanvas.width = firmaCanvas.offsetWidth || 480;
  firmaCtx = firmaCanvas.getContext('2d');
  firmaCtx.fillStyle = '#fff'; firmaCtx.fillRect(0, 0, firmaCanvas.width, firmaCanvas.height);
  firmaCtx.strokeStyle = '#1a1a2e'; firmaCtx.lineWidth = 2.5;
  firmaCtx.lineCap = 'round'; firmaCtx.lineJoin = 'round';
  dibujandoFirma = false;
  const gp = e => { const r = firmaCanvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const tp = e => { const r = firmaCanvas.getBoundingClientRect(), t = e.touches[0]; return { x: t.clientX - r.left, y: t.clientY - r.top }; };
  firmaCanvas.onmousedown  = e => { dibujandoFirma = true; const p = gp(e); firmaCtx.beginPath(); firmaCtx.moveTo(p.x, p.y); };
  firmaCanvas.onmousemove  = e => { if (!dibujandoFirma) return; const p = gp(e); firmaCtx.lineTo(p.x, p.y); firmaCtx.stroke(); };
  firmaCanvas.onmouseup = firmaCanvas.onmouseleave = () => dibujandoFirma = false;
  firmaCanvas.ontouchstart = e => { e.preventDefault(); dibujandoFirma = true; const p = tp(e); firmaCtx.beginPath(); firmaCtx.moveTo(p.x, p.y); };
  firmaCanvas.ontouchmove  = e => { e.preventDefault(); if (!dibujandoFirma) return; const p = tp(e); firmaCtx.lineTo(p.x, p.y); firmaCtx.stroke(); };
  firmaCanvas.ontouchend   = () => dibujandoFirma = false;
}
function limpiarFirma() {
  if (firmaCtx) { firmaCtx.fillStyle = '#fff'; firmaCtx.fillRect(0, 0, firmaCanvas.width, firmaCanvas.height); }
}

// ── CANVAS: Firma presupuesto ──────────────
function initCanvasPresup() {
  firmaPresupCanvas = $id('canvas-firma-presup');
  firmaPresupCanvas.width = firmaPresupCanvas.offsetWidth || 480;
  firmaPresupCtx = firmaPresupCanvas.getContext('2d');
  firmaPresupCtx.fillStyle = '#fff'; firmaPresupCtx.fillRect(0, 0, firmaPresupCanvas.width, firmaPresupCanvas.height);
  firmaPresupCtx.strokeStyle = '#1a1a2e'; firmaPresupCtx.lineWidth = 2.5;
  firmaPresupCtx.lineCap = 'round'; firmaPresupCtx.lineJoin = 'round';
  dibujandoPresup = false;
  const gp = e => { const r = firmaPresupCanvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const tp = e => { const r = firmaPresupCanvas.getBoundingClientRect(), t = e.touches[0]; return { x: t.clientX - r.left, y: t.clientY - r.top }; };
  firmaPresupCanvas.onmousedown  = e => { dibujandoPresup = true; const p = gp(e); firmaPresupCtx.beginPath(); firmaPresupCtx.moveTo(p.x, p.y); };
  firmaPresupCanvas.onmousemove  = e => { if (!dibujandoPresup) return; const p = gp(e); firmaPresupCtx.lineTo(p.x, p.y); firmaPresupCtx.stroke(); };
  firmaPresupCanvas.onmouseup = firmaPresupCanvas.onmouseleave = () => dibujandoPresup = false;
  firmaPresupCanvas.ontouchstart = e => { e.preventDefault(); dibujandoPresup = true; const p = tp(e); firmaPresupCtx.beginPath(); firmaPresupCtx.moveTo(p.x, p.y); };
  firmaPresupCanvas.ontouchmove  = e => { e.preventDefault(); if (!dibujandoPresup) return; const p = tp(e); firmaPresupCtx.lineTo(p.x, p.y); firmaPresupCtx.stroke(); };
  firmaPresupCanvas.ontouchend   = () => dibujandoPresup = false;
}
function limpiarFirmaPresup() {
  if (firmaPresupCtx) { firmaPresupCtx.fillStyle = '#fff'; firmaPresupCtx.fillRect(0, 0, firmaPresupCanvas.width, firmaPresupCanvas.height); }
}
function firmaVaciaCheck(canvas, ctx) {
  if (!ctx) return true;
  const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let i = 0; i < d.length; i += 4) if (d[i] < 250 || d[i+1] < 250 || d[i+2] < 250) return false;
  return true;
}

// ── LIGHTBOX ──────────────────────────────
function verFoto(src, caption) {
  $id('foto-grande').src    = src;
  $id('foto-caption').textContent = caption || '';
  openModal('modal-foto');
}

// ── VOTACIONES: toggle tipo ───────────────
document.getElementById('vt-tipo')?.addEventListener('change', function() {
  $id('vt-gext-wrap').style.display = this.value === 'presupuesto' ? '' : 'none';
});

// ── MODAL plantilla: cargar al abrir ──────
const origOpenModal = openModal;
// Sobreescribir para cargar datos al abrir ciertos modales
window.openModal = function(id) {
  $id(id).classList.add('open');
  if (id === 'modal-plantilla') loadPlantillaAdmin();
  if (id === 'modal-condos')    loadCondosAdmin();
  if (id === 'modal-admin-areas') { tabAreasActual = 'areas'; renderAdminAreas(); }
};

// ── GESTIÓN DE CONDÓMINOS (admin) ─────────
async function loadCondosAdmin() {
  const condos = await api('/api/condominios');
  $id('condos-admin-list').innerHTML = `
    <div class="tw">
      <table>
        <thead><tr><th>Despacho</th><th>Propietario</th><th>Cuota</th><th>Indiviso</th><th></th></tr></thead>
        <tbody>
          ${condos.map(c => `
            <tr>
              <td><span class="badge bb">${c.unidad}</span></td>
              <td>${c.propietario}</td>
              <td style="font-family:'DM Mono',monospace">${fmtM(c.cuota_mensual)}</td>
              <td style="font-family:'DM Mono',monospace;color:var(--blue)">${c.indiviso}%</td>
              <td><button class="detalle-btn" onclick="abrirEditCondo(${c.id},'${c.unidad}','${c.propietario.replace(/'/g,"\\'")}','${c.email||''}','${c.telefono||''}',${c.cuota_mensual})">✏️ Editar</button></td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function abrirEditCondo(id, unidad, prop, email, tel, cuota) {
  $id('ec-id').value     = id;
  $id('ec-unidad').value = unidad;
  $id('ec-prop').value   = prop;
  $id('ec-email').value  = email;
  $id('ec-tel').value    = tel;
  $id('ec-cuota').value  = cuota;
  openModal('modal-edit-condo');
}

async function guardarCondo() {
  const r = await api(`/api/condominios/${$id('ec-id').value}`, {
    method: 'PUT',
    body: JSON.stringify({
      unidad: $id('ec-unidad').value, propietario: $id('ec-prop').value,
      email: $id('ec-email').value, telefono: $id('ec-tel').value,
      cuota_mensual: $id('ec-cuota').value,
    }),
  });
  if (r.ok) { closeModal('modal-edit-condo'); loadCondosAdmin(); showToast('✓ Condómino actualizado'); }
}

// ── INIT ──────────────────────────────────
$id('tb-date').textContent = new Date().toLocaleDateString('es-MX', {
  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
});

(async () => {
  const r = await api('/api/auth/me');
  if (r.ok) {
    sesion = r;
    aplicarSesion();
  }
})();

loadDash();

/*
</script>
</body>
</html>`
*/

// Copiar todo el JS de bloque4.ts entre estas dos líneas
</script>
</body>
</html>`;

<script>
let isAdmin=false,condosCache=[],votActiva=null,firmaCanvas,firmaCtx,dibujando=false;
const DESPACHOS=['101','102','103','201','202','203','301-302','303','401','402','403','5to','6to','7mo','8vo','9no'];
const MESES=['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const MESES_FULL=['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const COLORES=['#5b8dee','#4caf87','#e8c96b','#e05555','#a855f7','#f97316','#06b6d4','#84cc16'];
const PT={dashboard:'Dashboard',cuentas:'Estado de Cuenta',deudores:'Deudores',gastos:'Gastos del Edificio',votaciones:'Votaciones',situaciones:'Situaciones',mantenimiento:'Mantenimiento',bitacora:'Bitácora',avisos:'Avisos',mensajes:'Mensajes',actas:'Libro de Actas'};

function go(p,b){
  document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(x=>x.classList.remove('active'));
  document.getElementById('page-'+p).classList.add('active');if(b)b.classList.add('active');
  document.getElementById('page-title').textContent=PT[p]||p;
  if(window.innerWidth<=900)document.getElementById('sb').classList.remove('open');
  ({dashboard:loadDash,cuentas:loadCuentas,deudores:loadDeudores,gastos:loadGastos,votaciones:loadVotaciones,situaciones:loadSits,mantenimiento:loadMan,bitacora:loadBit,avisos:loadAvisos,mensajes:loadChat,actas:loadActas})[p]?.();
}
async function api(u,o={}){const r=await fetch(u,{headers:{'Content-Type':'application/json'},...o});return r.json();}
async function apiF(u,fd){const r=await fetch(u,{method:'POST',body:fd});return r.json();}

function showAdminPanel(){if(isAdmin){doLogout();return;}openModal('modal-admin');}
async function doLogin(){
  const r=await api('/api/auth/login',{method:'POST',body:JSON.stringify({username:document.getElementById('au').value,password:document.getElementById('ap').value})});
  if(r.ok){
    isAdmin=true;closeModal('modal-admin');document.getElementById('admin-bar').style.display='flex';
    document.getElementById('admin-side-lbl').textContent='Cerrar sesión admin';
    ['btn-reg-pago','btn-nuevo-gasto','btn-bit','btn-acta','btn-nueva-vot'].forEach(id=>{const el=document.getElementById(id);if(el)el.style.display='block';});
    document.getElementById('login-err').style.display='none';showToast('✓ Sesión iniciada');loadVotaciones();
  }else document.getElementById('login-err').style.display='block';
}
async function doLogout(){
  await api('/api/auth/logout',{method:'POST'});isAdmin=false;
  document.getElementById('admin-bar').style.display='none';document.getElementById('admin-side-lbl').textContent='Acceso Admin';
  ['btn-reg-pago','btn-nuevo-gasto','btn-bit','btn-acta','btn-nueva-vot'].forEach(id=>{const el=document.getElementById(id);if(el)el.style.display='none';});
  showToast('Sesión cerrada');
}

async function loadDash(){
  const [r,av]=await Promise.all([api('/api/pagos/resumen?mes=3&anio=2026'),api('/api/avisos')]);
  document.getElementById('dash-stats').innerHTML=\`<div class="stat" style="--ac:var(--green)"><div class="stat-lbl">Pagaron este mes</div><div class="stat-val">\${r.pagaron}</div><div class="stat-sub">de \${r.total_condominios} unidades</div></div><div class="stat" style="--ac:var(--red)"><div class="stat-lbl">Pendientes</div><div class="stat-val">\${r.pendientes}</div></div><div class="stat" style="--ac:var(--gold)"><div class="stat-lbl">Recaudado Marzo</div><div class="stat-val" style="font-size:22px">$\${r.recaudado.toLocaleString()}</div><div class="stat-sub">Meta: $\${r.cuota_total.toLocaleString()}</div></div><div class="stat" style="--ac:var(--blue)"><div class="stat-lbl">Cobertura</div><div class="stat-val">\${r.porcentaje}%</div></div>\`;
  document.getElementById('dash-prog').innerHTML=\`<div style="margin-bottom:8px;font-size:13px;color:var(--text2)">$\${r.recaudado.toLocaleString()} de $\${r.cuota_total.toLocaleString()}</div><div class="prog"><div class="prog-b" style="width:\${r.porcentaje}%;background:var(--gold)"></div></div><div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text3);margin-top:7px"><span>\${r.porcentaje}% recaudado</span><span>Faltante: $\${(r.cuota_total-r.recaudado).toLocaleString()}</span></div><div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border)"><div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px"><span style="color:var(--text2)">Gastos fijos</span><span style="color:var(--red);font-family:'DM Mono',monospace">$41,100</span></div><div style="display:flex;justify-content:space-between;font-size:13px"><span style="color:var(--text2)">Superávit potencial</span><span style="color:var(--green);font-family:'DM Mono',monospace">$7,810</span></div></div>\`;
  const dc={info:'',urgente:'b',comunicado:'',mantenimiento:'g'};
  document.getElementById('dash-avisos').innerHTML=av.slice(0,3).map(a=>\`<div class="log-entry"><div class="ldot \${dc[a.tipo]||''}"></div><div><div style="font-size:11px;color:var(--text3);font-family:'DM Mono',monospace">\${a.created_at?.slice(0,10)||''}</div><div style="font-size:13.5px">\${a.titulo}</div><div style="font-size:12px;color:var(--text3)">\${a.autor}</div></div></div>\`).join('');
}

async function loadCuentas(){
  const m=document.getElementById('fil-mes').value,a=document.getElementById('fil-anio').value;
  const [condos,res]=await Promise.all([api(\`/api/condominios?mes=\${m}&anio=\${a}\`),api(\`/api/pagos/resumen?mes=\${m}&anio=\${a}\`)]);
  condosCache=condos;const tA=condos.reduce((s,c)=>s+c.adeudo_anio,0);
  document.getElementById('cuenta-stats').innerHTML=\`<div class="stat" style="--ac:var(--green)"><div class="stat-lbl">Al corriente</div><div class="stat-val">\${res.pagaron}</div></div><div class="stat" style="--ac:var(--red)"><div class="stat-lbl">Pendientes</div><div class="stat-val">\${res.pendientes}</div></div><div class="stat" style="--ac:var(--gold)"><div class="stat-lbl">Recaudado</div><div class="stat-val" style="font-size:20px">$\${res.recaudado.toLocaleString()}</div></div><div class="stat" style="--ac:var(--red)"><div class="stat-lbl">Adeudo total</div><div class="stat-val" style="font-size:20px">$\${tA.toLocaleString()}</div></div>\`;
  document.getElementById('pago-condo').innerHTML=condos.map(c=>\`<option value="\${c.id}">\${c.unidad} — \${c.propietario}</option>\`).join('');
  const mV=[1,2,3,4,5,6],nowM=parseInt(m);
  document.getElementById('cuenta-tbody').innerHTML=condos.map(c=>{
    const ps=new Set(c.meses_pagados);
    const dots=mV.map(mx=>{const now=new Date(),maxM=parseInt(a)<now.getFullYear()?12:now.getMonth()+1;if(mx>maxM)return\`<td><span class="mes-dot na">—</span></td>\`;return\`<td><span class="mes-dot \${ps.has(mx)?'pagado':'debe'}">\${MESES[mx]}</span></td>\`;}).join('');
    const ok=!c.meses_deudores.includes(nowM);
    return\`<tr><td><span class="badge bb" style="font-family:'DM Mono',monospace">\${c.unidad}</span></td><td><strong>\${c.propietario}</strong></td><td style="font-family:'DM Mono',monospace">$\${Number(c.cuota_mensual).toLocaleString()}</td>\${dots}<td style="font-family:'DM Mono',monospace;color:\${c.adeudo_anio>0?'var(--red)':'var(--green)'}">$\${c.adeudo_anio.toLocaleString()}</td><td><span class="badge \${ok?'bg':'br'}">\${ok?'Al corriente':'Con adeudo'}</span></td><td><button class="detalle-btn" onclick="showDetalle(\${c.id})">Ver historial</button></td></tr>\`;
  }).join('');
  if(isAdmin)document.getElementById('btn-reg-pago').style.display='block';
}

async function showDetalle(id){
  const d=await api(\`/api/condominios/\${id}\`);
  document.getElementById('det-title').textContent=\`\${d.unidad} — \${d.propietario}\`;
  document.getElementById('det-content').innerHTML=\`<div style="display:flex;gap:14px;margin-bottom:20px;flex-wrap:wrap"><div class="stat" style="flex:1;min-width:110px;--ac:var(--gold)"><div class="stat-lbl">Cuota</div><div class="stat-val" style="font-size:20px">$\${Number(d.cuota_mensual).toLocaleString()}</div></div><div class="stat" style="flex:1;min-width:110px;--ac:var(--blue)"><div class="stat-lbl">Pagos reg.</div><div class="stat-val">\${d.pagos.length}</div></div><div class="stat" style="flex:1;min-width:110px;--ac:var(--green)"><div class="stat-lbl">Total pagado</div><div class="stat-val" style="font-size:20px">$\${d.pagos.reduce((s,p)=>s+p.monto,0).toLocaleString()}</div></div></div>\${!d.pagos.length?'<div style="text-align:center;padding:40px;color:var(--text3)">Sin pagos registrados</div>':\`<div class="tw"><table><thead><tr><th>Mes</th><th>Año</th><th>Monto</th><th>Fecha</th><th>Método</th></tr></thead><tbody>\${d.pagos.map(p=>\`<tr><td>\${MESES_FULL[p.mes]}</td><td>\${p.anio}</td><td style="font-family:'DM Mono',monospace">$\${Number(p.monto).toLocaleString()}</td><td>\${p.fecha_pago||'—'}</td><td>\${p.metodo_pago||'—'}</td></tr>\`).join('')}</tbody></table></div>\`}\`;
  openModal('modal-detalle');
}

async function loadDeudores(){
  const d=await api('/api/pagos/deudores?anio=2026');
  if(!d.length){document.getElementById('deudores-content').innerHTML='<div style="text-align:center;padding:60px;color:var(--text3)"><div style="font-size:48px;margin-bottom:16px">🎉</div><div>¡Todos al corriente!</div></div>';return;}
  document.getElementById('deudores-content').innerHTML=\`<div class="stat" style="--ac:var(--red);margin-bottom:20px;display:inline-block;min-width:220px"><div class="stat-lbl">Total adeudado 2026</div><div class="stat-val">$\${d.reduce((s,x)=>s+x.adeudo,0).toLocaleString()}</div></div><div class="tw"><table><thead><tr><th>Unidad</th><th>Propietario</th><th>Cuota</th><th>Meses sin pagar</th><th>Adeudo</th><th></th></tr></thead><tbody>\${d.map(x=>\`<tr><td><span class="badge bb">\${x.unidad}</span></td><td><strong>\${x.propietario}</strong></td><td>$\${Number(x.cuota_mensual).toLocaleString()}</td><td>\${x.meses_sin_pagar.map(m=>\`<span class="badge br" style="margin-right:3px">\${MESES[m]}</span>\`).join('')}</td><td style="color:var(--red);font-weight:700">$\${x.adeudo.toLocaleString()}</td><td><button class="detalle-btn" onclick="showDetalle(\${x.id})">Historial</button></td></tr>\`).join('')}</tbody></table></div>\`;
}

async function loadGastos(){
  const m=document.getElementById('fil-mes-g').value;
  const data=await api(m?\`/api/gastos?mes=\${m}&anio=2026\`:'/api/gastos?anio=2026');
  const ci={seguridad:'🛡️',elevador:'🛗',servicios:'💡',reparacion:'🔧',admin:'📋',otro:'📦'};
  document.getElementById('gasto-stats').innerHTML=\`<div class="stat" style="--ac:var(--red)"><div class="stat-lbl">Total gastos</div><div class="stat-val" style="font-size:22px">$\${data.total.toLocaleString()}</div><div class="stat-sub">\${data.gastos.length} registros</div></div><div class="stat" style="--ac:var(--gold)"><div class="stat-lbl">Presupuesto mensual</div><div class="stat-val" style="font-size:22px">$41,100</div></div>\`;
  document.getElementById('gasto-tbody').innerHTML=data.gastos.map(g=>\`<tr><td>\${g.concepto}</td><td><span class="badge bo">\${ci[g.categoria]||'📦'} \${g.categoria}</span></td><td style="font-size:12px;color:var(--text3)">\${g.proveedor||'—'}</td><td style="font-family:'DM Mono',monospace;font-size:12px">\${g.fecha}</td><td style="font-family:'DM Mono',monospace;font-weight:600;color:var(--red)">$\${Number(g.monto).toLocaleString()}</td>\${isAdmin?\`<td><button class="btn btn-r btn-sm" onclick="delGasto(\${g.id})">✕</button></td>\`:'<td></td>'}</tr>\`).join('');
  if(isAdmin)document.getElementById('btn-nuevo-gasto').style.display='block';
}

// ── VOTACIONES ──
function esV(f){return f&&new Date()>new Date(f);}
async function loadVotaciones(){
  const vots=await api('/api/votaciones');
  const act=vots.filter(v=>v.estado==='activa'&&!esV(v.fecha_cierre)).length;
  const bdg=document.getElementById('bdg-vot');bdg.textContent=act;bdg.style.display=act>0?'inline':'none';
  if(isAdmin)document.getElementById('btn-nueva-vot').style.display='block';
  if(!vots.length){document.getElementById('vot-list').innerHTML='<div style="text-align:center;padding:80px;color:var(--text3)"><div style="font-size:60px;margin-bottom:20px">🗳️</div><div style="font-family:Playfair Display,serif;font-size:20px;font-weight:700;margin-bottom:8px">Sin votaciones activas</div><div style="font-size:14px">El administrador creará votaciones cuando sea necesario.</div></div>';return;}
  document.getElementById('vot-list').innerHTML=vots.map(v=>{
    const cerr=v.estado==='cerrada'||esV(v.fecha_cierre);
    const votaron=v.resultados.por_opcion.reduce((s,o)=>s+o.total,0);
    const pct=Math.round((votaron/DESPACHOS.length)*100);
    const total=v.resultados.total;
    return\`<div class="vot-card">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:14px">
        <div style="flex:1">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
            <span class="badge \${cerr?'br':'bg'}">\${cerr?'🔒 Cerrada':'🟢 Activa'}</span>
            \${v.fecha_cierre?\`<span style="font-size:11px;color:var(--text3);font-family:'DM Mono',monospace">Cierre: \${new Date(v.fecha_cierre).toLocaleString('es-MX')}</span>\`:''}
          </div>
          <div style="font-family:'Playfair Display',serif;font-size:18px;font-weight:700;margin-bottom:6px">\${v.titulo}</div>
          \${v.descripcion?\`<div style="font-size:13.5px;color:var(--text2);line-height:1.5">\${v.descripcion}</div>\`:''}
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;flex-shrink:0">
          \${!cerr?\`<button class="btn btn-g btn-sm" onclick="abrirVotar(\${v.id})">✏️ Votar</button>\`:''}
          <button class="btn btn-o btn-sm" onclick="verResultados(\${v.id})">📊 Resultados</button>
          \${isAdmin?\`<button class="btn btn-r btn-sm" onclick="cerrarVot(\${v.id})">🔒 Cerrar</button>\`:''}
        </div>
      </div>
      <div>
        <div style="display:flex;justify-content:space-between;font-size:13px;color:var(--text2);margin-bottom:7px"><span>Participación: <strong style="color:var(--text)">\${votaron}/\${DESPACHOS.length} despachos</strong></span><span style="font-weight:700;color:\${pct>=50?'var(--green)':'var(--gold)'}">\${pct}%</span></div>
        <div class="prog"><div class="prog-b" style="width:\${pct}%;background:\${pct>=50?'var(--green)':'var(--gold)'}"></div></div>
      </div>
      \${v.resultados.por_opcion.length?\`<div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border)"><div class="ctitle" style="margin-bottom:10px">Resultados preliminares</div>\${v.resultados.por_opcion.map((o,i)=>{const p=total>0?Math.round((o.total/total)*100):0;return\`<div style="margin-bottom:9px"><div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:5px"><span>\${o.opcion}</span><span style="font-weight:700;color:\${COLORES[i%COLORES.length]}">\${o.total} votos (\${p}%)</span></div><div class="prog"><div class="prog-b" style="width:\${p}%;background:\${COLORES[i%COLORES.length]}"></div></div></div>\`;}).join('')}</div>\`:''}
    </div>\`;
  }).join('');
}

async function crearVotacion(){
  const titulo=document.getElementById('vt-titulo').value.trim();
  const optsRaw=document.getElementById('vt-opciones').value.trim();
  if(!titulo||!optsRaw){showToast('Completá el título y las opciones');return;}
  const opciones=optsRaw.split('\\n').map(o=>o.trim()).filter(Boolean);
  if(opciones.length<2){showToast('Se necesitan al menos 2 opciones');return;}
  const r=await api('/api/votaciones',{method:'POST',body:JSON.stringify({titulo,descripcion:document.getElementById('vt-desc').value,opciones,fecha_cierre:document.getElementById('vt-cierre').value||null,despachos_habilitados:DESPACHOS})});
  if(r.ok){closeModal('modal-nueva-vot');document.getElementById('vt-titulo').value='';document.getElementById('vt-desc').value='';document.getElementById('vt-opciones').value='';document.getElementById('vt-cierre').value='';loadVotaciones();showToast('✓ Votación creada');}
}

async function cerrarVot(id){if(!confirm('¿Cerrar esta votación?'))return;await api(\`/api/votaciones/\${id}/estado\`,{method:'PUT',body:JSON.stringify({estado:'cerrada'})});loadVotaciones();showToast('Votación cerrada');}

async function abrirVotar(id){
  const v=await api(\`/api/votaciones/\${id}\`);
  if(v.estado==='cerrada'||esV(v.fecha_cierre)){showToast('Esta votación ya está cerrada');loadVotaciones();return;}
  votActiva=v;
  document.getElementById('votar-titulo').textContent=v.titulo;
  document.getElementById('votar-desc').textContent=v.descripcion||'';
  document.getElementById('v-despacho').value='';document.getElementById('v-nombre').value='';document.getElementById('v-opcion').value='';
  document.getElementById('v-error').style.display='none';
  const yaVotaron=new Set((v.votos||[]).map(vt=>vt.despacho));
  document.getElementById('despacho-grid').innerHTML=DESPACHOS.map(d=>{const yv=yaVotaron.has(d);return\`<div class="desp-opt \${yv?'ya-voto':''}" onclick="\${yv?'':'selDesp(\\''+d+'\\')'}"><div>\${d}</div>\${yv?'<div style="font-size:9px;color:var(--green)">✓ Votó</div>':''}</div>\`;}).join('');
  document.getElementById('opciones-voto').innerHTML=v.opciones.map(o=>\`<div class="opcion-voto" onclick="selOp(this,'\${o.replace(/'/g,"\\\\'")}')" ><div class="op-radio"></div><span>\${o}</span></div>\`).join('');
  initCanvas();openModal('modal-votar');
}

function selDesp(d){document.querySelectorAll('.desp-opt:not(.ya-voto)').forEach(el=>el.classList.remove('selected'));event.currentTarget.classList.add('selected');document.getElementById('v-despacho').value=d;}
function selOp(el,op){document.querySelectorAll('.opcion-voto').forEach(o=>o.classList.remove('selected'));el.classList.add('selected');document.getElementById('v-opcion').value=op;}

function initCanvas(){
  firmaCanvas=document.getElementById('canvas-firma');firmaCanvas.width=firmaCanvas.offsetWidth||480;
  firmaCtx=firmaCanvas.getContext('2d');firmaCtx.fillStyle='#fff';firmaCtx.fillRect(0,0,firmaCanvas.width,firmaCanvas.height);
  firmaCtx.strokeStyle='#1a1a2e';firmaCtx.lineWidth=2.5;firmaCtx.lineCap='round';firmaCtx.lineJoin='round';dibujando=false;
  const gp=e=>{const r=firmaCanvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};};
  const tp=e=>{const r=firmaCanvas.getBoundingClientRect(),t=e.touches[0];return{x:t.clientX-r.left,y:t.clientY-r.top};};
  firmaCanvas.onmousedown=e=>{dibujando=true;const p=gp(e);firmaCtx.beginPath();firmaCtx.moveTo(p.x,p.y);};
  firmaCanvas.onmousemove=e=>{if(!dibujando)return;const p=gp(e);firmaCtx.lineTo(p.x,p.y);firmaCtx.stroke();};
  firmaCanvas.onmouseup=firmaCanvas.onmouseleave=()=>dibujando=false;
  firmaCanvas.ontouchstart=e=>{e.preventDefault();dibujando=true;const p=tp(e);firmaCtx.beginPath();firmaCtx.moveTo(p.x,p.y);};
  firmaCanvas.ontouchmove=e=>{e.preventDefault();if(!dibujando)return;const p=tp(e);firmaCtx.lineTo(p.x,p.y);firmaCtx.stroke();};
  firmaCanvas.ontouchend=()=>dibujando=false;
}
function limpiarFirma(){if(firmaCtx){firmaCtx.fillStyle='#fff';firmaCtx.fillRect(0,0,firmaCanvas.width,firmaCanvas.height);}}
function firmaVacia(){const d=firmaCtx.getImageData(0,0,firmaCanvas.width,firmaCanvas.height).data;for(let i=0;i<d.length;i+=4)if(d[i]<250||d[i+1]<250||d[i+2]<250)return false;return true;}

async function emitirVoto(){
  const desp=document.getElementById('v-despacho').value,nombre=document.getElementById('v-nombre').value.trim(),opcion=document.getElementById('v-opcion').value;
  const errEl=document.getElementById('v-error');errEl.style.display='none';
  if(!desp){errEl.textContent='Seleccioná tu despacho';errEl.style.display='block';return;}
  if(!nombre){errEl.textContent='Ingresá el nombre del representante';errEl.style.display='block';return;}
  if(!opcion){errEl.textContent='Seleccioná una opción de voto';errEl.style.display='block';return;}
  if(firmaVacia()){errEl.textContent='Por favor realizá tu firma digital';errEl.style.display='block';return;}
  const firma=firmaCanvas.toDataURL('image/png');
  const btn=document.getElementById('btn-emitir');btn.disabled=true;btn.textContent='Enviando...';
  const r=await api(\`/api/votaciones/\${votActiva.id}/votar\`,{method:'POST',body:JSON.stringify({despacho:desp,nombre_votante:nombre,firma,opcion})});
  btn.disabled=false;btn.innerHTML='✅ Confirmar voto';
  if(r.ok){closeModal('modal-votar');showToast('✓ Voto del Despacho '+desp+' registrado');loadVotaciones();setTimeout(()=>verResultados(votActiva.id),600);}
  else{errEl.textContent=r.error||'Error al registrar el voto';errEl.style.display='block';}
}

async function verResultados(id){
  const v=await api(\`/api/votaciones/\${id}\`);
  const total=(v.votos||[]).length;const votaron=new Set((v.votos||[]).map(vt=>vt.despacho));const noVot=DESPACHOS.filter(d=>!votaron.has(d));
  document.getElementById('res-titulo').textContent='📊 '+v.titulo;
  document.getElementById('res-content').innerHTML=\`<div style="display:flex;gap:14px;margin-bottom:24px;flex-wrap:wrap"><div class="stat" style="flex:1;min-width:110px;--ac:var(--blue)"><div class="stat-lbl">Votos emitidos</div><div class="stat-val">\${total}</div><div class="stat-sub">de \${DESPACHOS.length} despachos</div></div><div class="stat" style="flex:1;min-width:110px;--ac:\${v.estado==='cerrada'?'var(--red)':'var(--green)'}"><div class="stat-lbl">Estado</div><div class="stat-val" style="font-size:18px">\${v.estado==='cerrada'?'🔒 Cerrada':'🟢 Activa'}</div></div><div class="stat" style="flex:1;min-width:110px;--ac:var(--gold)"><div class="stat-lbl">Participación</div><div class="stat-val">\${Math.round((total/DESPACHOS.length)*100)}%</div></div></div>
  <div style="margin-bottom:28px"><div class="ctitle" style="margin-bottom:14px">Resultados por opción</div>\${v.opciones.map((op,i)=>{const ov=v.resultados.por_opcion.find(x=>x.opcion===op);const cant=ov?ov.total:0;const p=total>0?Math.round((cant/total)*100):0;const col=COLORES[i%COLORES.length];return\`<div style="margin-bottom:14px"><div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:14px"><span style="font-weight:600">\${op}</span><span style="font-weight:700;color:\${col}">\${cant} votos — \${p}%</span></div><div class="res-bar-track"><div class="res-bar-fill" style="width:\${p}%;background:\${col}">\${p>8?p+'%':''}</div></div></div>\`;}).join('')}</div>
  <div class="g2"><div><div class="ctitle">✅ Votaron (\${total})</div><div style="display:flex;flex-wrap:wrap;gap:8px">\${(v.votos||[]).map(vt=>\`<div style="background:var(--green-dim);border:1px solid rgba(76,175,135,.3);border-radius:8px;padding:8px 10px;font-size:12px"><div style="font-weight:700;color:var(--green)">\${vt.despacho}</div><div style="color:var(--text2);margin-top:2px">\${vt.nombre_votante}</div><div style="color:var(--text3);font-size:11px;margin-top:2px">\${vt.opcion}</div></div>\`).join('')}</div></div>
  <div><div class="ctitle">⏳ Pendientes (\${noVot.length})</div><div style="display:flex;flex-wrap:wrap;gap:8px">\${noVot.map(d=>\`<div style="background:var(--red-dim);border:1px solid rgba(224,85,85,.2);border-radius:8px;padding:8px 10px;font-size:12px;font-weight:700;color:var(--red)">\${d}</div>\`).join('')}</div></div></div>
  \${v.fecha_cierre?\`<div style="margin-top:20px;padding:12px 16px;background:var(--bg3);border-radius:10px;font-size:13px;color:var(--text2)">🕐 Cierre: <strong style="color:var(--text)">\${new Date(v.fecha_cierre).toLocaleString('es-MX',{dateStyle:'full',timeStyle:'short'})}</strong></div>\`:''}
  \`;
  openModal('modal-resultados');
}

async function loadSits(){
  const sits=await api('/api/situaciones');
  const uc={alta:'var(--red)',media:'var(--gold)',baja:'var(--green)'};const ul={alta:'🔴 Urgente',media:'🟡 En análisis',baja:'🟢 Baja'};const es={pendiente:'Pendiente',resuelto:'✅ Resuelto','en-proceso':'⚙️ En proceso'};
  document.getElementById('sits-grid').innerHTML=sits.map(s=>\`<div style="background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:20px"><div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:10px"><div><div style="font-size:11px;color:var(--text3);font-family:'DM Mono',monospace">SIT #\${String(s.numero).padStart(2,'0')}</div><div style="font-weight:600;font-size:14px;margin-top:2px">\${s.titulo}</div></div><span class="badge" style="background:\${uc[s.urgencia]}22;color:\${uc[s.urgencia]};white-space:nowrap;flex-shrink:0">\${ul[s.urgencia]}</span></div><div style="font-size:13px;color:var(--text2);line-height:1.5;margin-bottom:12px">\${s.descripcion}</div><span class="badge \${s.estado==='resuelto'?'bg':s.estado==='en-proceso'?'bb':'bo'}">\${es[s.estado]||s.estado}</span></div>\`).join('');
}

async function loadMan(){
  const sol=await api('/api/solicitudes');const pc={alta:'var(--red)',media:'var(--gold)',baja:'var(--green)'};
  document.getElementById('man-list').innerHTML=!sol.length?'<div style="text-align:center;padding:60px;color:var(--text3)">Sin solicitudes</div>':sol.map(s=>\`<div class="card" style="margin-bottom:12px"><div style="display:flex;align-items:center;gap:8px;margin-bottom:10px"><div class="sdot \${s.estado}"></div><span style="font-size:12px;color:var(--text3)">\${s.estado==='pendiente'?'🕐 Pendiente':s.estado==='en-proceso'?'⚙️ En proceso':'✅ Resuelto'}</span><span style="margin-left:auto;font-size:10px;font-family:'DM Mono',monospace;color:var(--text3)">\${s.created_at?.slice(0,10)}</span><span style="font-size:11px;color:\${pc[s.prioridad]};font-weight:700">\${s.prioridad}</span></div><div style="font-size:14px;margin-bottom:5px">\${s.descripcion}</div><div style="font-size:12px;color:var(--text3)">Por: \${s.autor}</div>\${s.respuesta?\`<div style="margin-top:10px;padding:10px;background:var(--green-dim);border-radius:8px;font-size:13px">💬 \${s.respuesta}</div>\`:''}\${isAdmin&&s.estado!=='resuelto'?\`<div style="margin-top:10px;display:flex;gap:8px"><button class="btn btn-b btn-sm" onclick="updSol(\${s.id},'en-proceso','')">⚙️ En proceso</button><button class="btn btn-g btn-sm" onclick="resolverSol(\${s.id})">✅ Resolver</button></div>\`:''}</div>\`).join('');
}
async function updSol(id,e,r){await api(\`/api/solicitudes/\${id}\`,{method:'PUT',body:JSON.stringify({estado:e,respuesta:r})});loadMan();showToast('Actualizado');}
function resolverSol(id){const r=prompt('Describe la resolución:');if(r!==null)updSol(id,'resuelto',r);}

async function loadBit(){
  const logs=await api('/api/bitacora');const tc={limpieza:'g',revision:'b',incidente:''};
  document.getElementById('bit-log').innerHTML=!logs.length?'<div style="text-align:center;padding:40px;color:var(--text3)">Sin entradas</div>':logs.map(l=>\`<div class="log-entry"><div class="ldot \${tc[l.tipo]||''}"></div><div style="flex:1"><div style="font-size:11px;color:var(--text3);font-family:'DM Mono',monospace">\${l.created_at?.slice(0,16)||''}</div><div style="font-weight:600;font-size:14px;margin-top:2px">\${l.area}</div><div style="font-size:13px;color:var(--text2);margin-top:2px">\${l.observaciones||''}</div><div style="font-size:12px;color:var(--text3);margin-top:3px">👷 \${l.personal}</div></div></div>\`).join('');
  if(isAdmin)document.getElementById('btn-bit').style.display='block';
}

async function loadAvisos(){
  const av=await api('/api/avisos');const ti={info:'📢',urgente:'🚨',comunicado:'📄',mantenimiento:'🔧'};
  document.getElementById('avisos-list').innerHTML=av.map(a=>\`<div class="aviso-card \${a.urgente?'urgente':''}"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px"><div style="font-weight:600">\${ti[a.tipo]||'📢'} \${a.autor}</div><div style="font-size:12px;color:var(--text3);font-family:'DM Mono',monospace">\${a.created_at?.slice(0,10)||''}</div></div><div style="font-weight:600;margin-bottom:5px">\${a.titulo}</div><div style="font-size:13.5px;color:var(--text2);line-height:1.6">\${a.contenido}</div></div>\`).join('');
  document.getElementById('bdg-av').textContent=av.length;
}

async function loadChat(){
  const msgs=await api('/api/mensajes');const el=document.getElementById('chat-msgs');
  el.innerHTML=msgs.map(m=>{const iM=m.de!=='Sergio';return\`<div style="display:flex;flex-direction:column;align-items:\${iM?'flex-end':'flex-start'}"><div style="max-width:80%;padding:9px 13px;border-radius:\${iM?'12px 12px 4px 12px':'12px 12px 12px 4px'};background:\${iM?'var(--gold-dim)':'var(--bg3)'};border:1px solid \${iM?'rgba(201,168,76,.3)':'var(--border)'};font-size:13.5px">\${m.texto}</div><div style="font-size:11px;color:var(--text3);margin-top:3px">\${m.de} · \${m.created_at?.slice(11,16)||''}</div></div>\`;}).join('');
  el.scrollTop=el.scrollHeight;
}
async function sendMsg(){const t=document.getElementById('chat-in').value.trim(),de=document.getElementById('chat-de').value.trim()||'Condómino';if(!t)return;await api('/api/mensajes',{method:'POST',body:JSON.stringify({de,texto:t})});document.getElementById('chat-in').value='';loadChat();setTimeout(async()=>{const rs=['Recibido, lo atiendo a la brevedad 👍','Entendido, paso a revisar.','Gracias por el aviso.','Ok, lo atiendo hoy.'];await api('/api/mensajes',{method:'POST',body:JSON.stringify({de:'Sergio',texto:rs[Math.floor(Math.random()*rs.length)]})});loadChat();},1200);}
function quickMsg(t){document.getElementById('chat-in').value=t;sendMsg();}

async function loadActas(){
  const ac=await api('/api/actas');if(isAdmin)document.getElementById('btn-acta').style.display='block';
  if(!ac.length){document.getElementById('actas-list').innerHTML='<div style="text-align:center;padding:60px;color:var(--text3)"><div style="font-size:48px;margin-bottom:16px">📖</div><div>El Libro de Actas aún no tiene entradas.</div></div>';return;}
  document.getElementById('actas-list').innerHTML=ac.map(a=>\`<div class="card" style="margin-bottom:16px"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px"><div><div style="font-family:'Playfair Display',serif;font-size:18px;font-weight:700">Asamblea — \${a.fecha}</div><div style="font-size:13px;color:var(--text3);margin-top:2px">Asistentes: \${a.num_asistentes||'?'}/\${a.total_condominos||16}</div></div><div style="display:flex;gap:8px;align-items:center"><span class="badge \${a.estado==='firmada'?'bg':'bo'}">\${a.estado==='firmada'?'✅ Firmada':'Borrador'}</span>\${isAdmin&&a.estado!=='firmada'?\`<button class="btn btn-g btn-sm" onclick="firmarActa(\${a.id})">Firmar</button>\`:''}</div></div><div style="margin-bottom:14px"><div class="ctitle">Temas</div>\${a.temas.split('\\n').filter(t=>t.trim()).map(t=>\`<div style="font-size:13.5px;padding:5px 0;border-bottom:1px solid var(--border);color:var(--text2)">• \${t}</div>\`).join('')}</div>\${a.resoluciones?\`<div><div class="ctitle">Resoluciones</div><div style="font-size:13.5px;color:var(--text2);line-height:1.6">\${a.resoluciones}</div></div>\`:''}</div>\`).join('');
}
async function firmarActa(id){await api(\`/api/actas/\${id}/firmar\`,{method:'PUT',body:JSON.stringify({})});loadActas();showToast('✓ Acta firmada');}

async function registrarPago(){
  const body={condominio_id:document.getElementById('pago-condo').value,mes:document.getElementById('pago-mes').value,anio:document.getElementById('pago-anio').value,monto:document.getElementById('pago-monto').value,fecha_pago:document.getElementById('pago-fecha').value,metodo_pago:document.getElementById('pago-metodo').value,referencia:document.getElementById('pago-ref').value,notas:document.getElementById('pago-notas').value};
  const r=await api('/api/pagos',{method:'POST',body:JSON.stringify(body)});
  if(r.ok){closeModal('modal-pago');loadCuentas();showToast('✓ Pago registrado');}else showToast('Error: '+r.error);
}
async function registrarGasto(){
  const body={concepto:document.getElementById('g-concepto').value,categoria:document.getElementById('g-cat').value,monto:document.getElementById('g-monto').value,mes:document.getElementById('g-mes').value,anio:'2026',fecha:document.getElementById('g-fecha').value,proveedor:document.getElementById('g-prov').value,notas:document.getElementById('g-notas').value};
  const r=await api('/api/gastos',{method:'POST',body:JSON.stringify(body)});
  if(r.ok){closeModal('modal-gasto');loadGastos();showToast('✓ Gasto registrado');}
}
async function delGasto(id){if(!confirm('¿Eliminar?'))return;await api(\`/api/gastos/\${id}\`,{method:'DELETE'});loadGastos();showToast('Eliminado');}
async function postAviso(){const r=await api('/api/avisos',{method:'POST',body:JSON.stringify({titulo:document.getElementById('av-titulo').value,contenido:document.getElementById('av-texto').value,tipo:document.getElementById('av-tipo').value,urgente:document.getElementById('av-tipo').value==='urgente',autor:document.getElementById('av-autor').value||'Condómino'})});if(r.ok){closeModal('modal-aviso');loadAvisos();showToast('✓ Aviso publicado');}}
async function crearSolicitud(){const r=await api('/api/solicitudes',{method:'POST',body:JSON.stringify({autor:document.getElementById('sol-autor').value||'Condómino',descripcion:document.getElementById('sol-desc').value,prioridad:document.getElementById('sol-pri').value})});if(r.ok){closeModal('modal-solicitud');loadMan();showToast('✓ Solicitud enviada');}}
async function addBitacora(){const r=await api('/api/bitacora',{method:'POST',body:JSON.stringify({personal:document.getElementById('bit-personal').value,area:document.getElementById('bit-area').value,observaciones:document.getElementById('bit-obs').value,tipo:document.getElementById('bit-tipo').value})});if(r.ok){closeModal('modal-bitacora');loadBit();showToast('✓ Entrada guardada');}}
async function crearActa(){const r=await api('/api/actas',{method:'POST',body:JSON.stringify({fecha:document.getElementById('acta-fecha').value,temas:document.getElementById('acta-temas').value,asistentes:document.getElementById('acta-asist').value,num_asistentes:document.getElementById('acta-num').value,total_condominos:document.getElementById('acta-tot').value,resoluciones:document.getElementById('acta-res').value})});if(r.ok){closeModal('modal-acta');loadActas();showToast('✓ Acta guardada');}}

function openModal(id){document.getElementById(id).classList.add('open');}
function closeModal(id){document.getElementById(id).classList.remove('open');}
function closeOv(e,id){if(e.target===document.getElementById(id))closeModal(id);}
function showToast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),3200);}
document.getElementById('tb-date').textContent=new Date().toLocaleDateString('es-MX',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
(async()=>{const r=await api('/api/auth/me');if(r.ok){isAdmin=true;document.getElementById('admin-bar').style.display='flex';document.getElementById('admin-side-lbl').textContent='Cerrar sesión admin';['btn-reg-pago','btn-nuevo-gasto','btn-bit','btn-acta','btn-nueva-vot'].forEach(id=>{const el=document.getElementById(id);if(el)el.style.display='block';});}})();
loadDash();
</script>
</body>
</html>`;

// Servir el frontend
app.get("/", (c) => c.html(HTML));
app.get("/*", (c) => {
  if (!c.req.path.startsWith("/api/")) return c.html(HTML);
  return c.json({ error: "Not found" }, 404);
});

// Arrancar servidor
Bun.serve({
  port: Number(process.env.PORT ?? 3001),
  fetch: app.fetch,
});

console.log(`🏢 Torre TUXPAN 45A corriendo en puerto ${process.env.PORT ?? 3001}`);