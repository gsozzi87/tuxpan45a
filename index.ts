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
  const condos = db.query("SELECT * FROM condominios WHERE activo=1 ORDER BY CAST(unidad AS INTEGER), unidad").all() as any[];
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
  return c.json(result.sort((a, b) => {
    const na = parseInt(a.unidad) || 999, nb = parseInt(b.unidad) || 999;
    return na !== nb ? na - nb : a.unidad.localeCompare(b.unidad);
  }));
});

// Estado de cuenta anual (mar 2026 → mar 2027)
app.get("/api/pagos/estado-cuenta", (c) => {
  const condos = db.query("SELECT * FROM condominios WHERE activo=1 ORDER BY CAST(unidad AS INTEGER), unidad").all() as any[];
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

app.put("/api/avisos/:id", requireAdmin, async (c) => {
  const b = await c.req.json();
  db.run("UPDATE avisos SET titulo=?,contenido=?,tipo=?,urgente=? WHERE id=?",
    [b.titulo, b.contenido, b.tipo || "info", b.urgente ? 1 : 0, Number(c.req.param("id"))]);
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
  const sits = db.query(`
    SELECT * FROM situaciones
    ORDER BY
      CASE estado WHEN 'resuelto' THEN 1 ELSE 0 END,
      CASE urgencia WHEN 'alta' THEN 0 WHEN 'media' THEN 1 WHEN 'baja' THEN 2 ELSE 3 END,
      numero
  `).all() as any[];
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

app.delete("/api/situaciones/:id", requireAdmin, (c) => {
  const id = Number(c.req.param("id"));
  db.run("DELETE FROM situacion_archivos WHERE situacion_id=?", [id]);
  db.run("DELETE FROM situaciones WHERE id=?", [id]);
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
//  INICIO DEL SERVIDOR
// ════════════════════════════════════════════
// (El frontend HTML va a continuación — pegarlo como const HTML = `...`)


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
  --bg:#f5f3ee;--bg2:#fdfcf9;--bg3:#ece9e2;--card:#ffffff;
  --border:rgba(0,0,0,0.09);--border2:rgba(0,0,0,0.16);
  --gold:#a07828;--gold2:#7a5a18;--gold-dim:rgba(160,120,40,0.12);
  --green:#1e8a5e;--green-dim:rgba(30,138,94,0.12);
  --red:#c0392b;--red-dim:rgba(192,57,43,0.12);
  --blue:#2563b0;--blue-dim:rgba(37,99,176,0.12);
  --purple:#7c3aed;--purple-dim:rgba(124,58,237,0.12);
  --text:#1a1710;--text2:#5a5340;--text3:#9a9180;
  --r:16px;--rs:10px
}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'DM Sans',sans-serif;background:var(--bg);color:var(--text);min-height:100vh;overflow-x:hidden}
.sidebar{position:fixed;left:0;top:0;bottom:0;width:262px;background:var(--bg2);border-right:1px solid var(--border);display:flex;flex-direction:column;z-index:100;transition:transform .18s ease;will-change:transform}
.logo{padding:22px 24px 16px;border-bottom:1px solid var(--border)}
.logo-name{font-family:'Playfair Display',serif;font-size:17px;font-weight:700;color:var(--gold2);line-height:1.2}
.logo-sub{font-size:9px;color:var(--text3);letter-spacing:2px;text-transform:uppercase;margin-top:3px}
.nav{flex:1;padding:12px 10px;overflow-y:auto}
.nav-sec{margin-bottom:18px}
.nav-sec-label{font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--text3);padding:0 10px;margin-bottom:5px}
.nav-item{display:flex;align-items:center;gap:9px;padding:9px 12px;border-radius:var(--rs);cursor:pointer;color:var(--text2);font-size:13px;font-weight:500;border:none;background:none;width:100%;text-align:left;transition:all .2s}
.nav-item:hover{background:rgba(0,0,0,0.05);color:var(--text)}
.nav-item.active{background:var(--gold-dim);color:var(--gold2)}
.nav-badge{margin-left:auto;background:var(--red);color:#fff;font-size:10px;font-weight:700;padding:2px 7px;border-radius:20px}
.nav-badge-g{margin-left:auto;background:var(--green);color:#fff;font-size:10px;font-weight:700;padding:2px 7px;border-radius:20px}
.sidebar-foot{padding:12px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:7px}
.admin-btn-side{display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--gold-dim);border:1px solid rgba(201,168,76,.3);border-radius:var(--rs);cursor:pointer;color:var(--gold2);font-size:12.5px;font-weight:600;width:100%;transition:all .2s}
.admin-btn-side:hover{background:rgba(201,168,76,.25)}
.manto-btn-side{display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--blue-dim);border:1px solid rgba(91,141,238,.3);border-radius:var(--rs);cursor:pointer;color:var(--blue);font-size:12.5px;font-weight:600;width:100%;transition:all .2s}
.manto-btn-side:hover{background:rgba(91,141,238,.25)}
.main{margin-left:262px;min-height:100vh;display:flex;flex-direction:column}
.topbar{padding:16px 28px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;background:rgba(253,252,249,.97);position:sticky;top:0;z-index:50}
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
.stat:hover{transform:translateY(-2px);box-shadow:0 8px 28px rgba(0,0,0,.10)}
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
tr:hover td{background:rgba(0,0,0,.02)}
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
.btn-g{background:var(--gold);color:#fff}.btn-g:hover{background:var(--gold2);transform:translateY(-1px)}
.btn-o{background:transparent;border:1px solid var(--border2);color:var(--text2)}.btn-o:hover{border-color:var(--gold);color:var(--gold2)}
.btn-r{background:var(--red-dim);border:1px solid var(--red);color:var(--red)}
.btn-b{background:var(--blue-dim);border:1px solid var(--blue);color:var(--blue)}
.btn-gr{background:var(--green-dim);border:1px solid var(--green);color:var(--green)}
.btn-sm{padding:6px 13px;font-size:12px}.btn-full{width:100%;justify-content:center}
.modal-ov{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px;opacity:0;pointer-events:none;transition:opacity .2s}
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
.photo-cap{position:absolute;bottom:0;left:0;right:0;background:linear-gradient(transparent,rgba(0,0,0,.70));padding:18px 7px 7px;font-size:10px;color:rgba(255,255,255,.95)}
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
@keyframes fadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
.page.active>*{animation:fadeUp .18s ease both}
::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:var(--border2);border-radius:99px}
html{color-scheme:light}
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
      <button class='nav-item active' onclick='go("dashboard",this)'>🏛️ Resumen General</button>
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
    <div><div class='tb-title' id='page-title'>Resumen General</div><div class='tb-date' id='tb-date'></div></div>
    <div id='session-bar' style='display:none;align-items:center;gap:10px'>
      <span class='badge bo' id='session-badge'>🔐 Admin</span>
      <button class='btn btn-o btn-sm' onclick='doLogout()'>Cerrar sesión</button>
    </div>
  </header>
  <div class='content'>

    <!-- DASHBOARD -->
    <div class='page active' id='page-dashboard'>
      <div class='g4' style='margin-bottom:18px' id='dash-stats'></div>
      <div class='g2'>
        <div class='card'><div class='ctitle'>Recaudación del mes</div><div id='dash-prog'></div></div>
        <div class='card'><div class='ctitle'>Últimos avisos</div><div id='dash-avisos'></div></div>
      </div>
    </div>

    <!-- ESTADO DE CUENTA ANUAL -->
    <div class='page' id='page-cuentas'>
      <div class='sec-hdr'>
        <div></div>
        <div id='btn-reg-pago' style='display:none'><button class='btn btn-g' onclick='openModal("modal-pago")'>+ Registrar pago</button></div>
      </div>
      <div id='cuenta-tabla'></div>
    </div>

    <!-- DEUDORES -->
    <div class='page' id='page-deudores'>
      <div id='deudores-content'></div>
    </div>

    <!-- GASTOS ORDINARIOS -->
    <div class='page' id='page-gastos'>
      <div class='sec-hdr'>
        <div></div>
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
        <div></div>
        <div id='btn-nuevo-gext' style='display:none'><button class='btn btn-g' onclick='openModal("modal-nuevo-gext")'>+ Nuevo gasto</button></div>
      </div>
      <div id='gext-list'></div>
    </div>

    <!-- VOTACIONES -->
    <div class='page' id='page-votaciones'>
      <div class='sec-hdr'>
        <div></div>
        <div id='btn-nueva-vot' style='display:none'><button class='btn btn-g' onclick='openModal("modal-nueva-vot")'>🗳️ Nueva votación</button></div>
      </div>
      <div id='vot-list'></div>
    </div>

    <!-- SITUACIONES -->
    <div class='page' id='page-situaciones'>
      <div class='sec-hdr'>
        <div><div class='sec-sub' id='sit-sub' style='font-size:13px;color:var(--text3)'></div></div>
        <div id='btn-nueva-sit' style='display:none'><button class='btn btn-g btn-sm' onclick='openModal("modal-nueva-sit")'>+ Nueva</button></div>
      </div>
      <div class='g2' id='sits-grid'></div>
    </div>

    <!-- MANTENIMIENTO -->
    <div class='page' id='page-mantenimiento'>
      <div class='sec-hdr'>
        
        <button class='btn btn-g' onclick='openModal("modal-solicitud")'>+ Nueva solicitud</button>
      </div>
      <div id='man-list'></div>
    </div>

    <!-- BITÁCORA SEMANAL -->
    <div class='page' id='page-bitacora'>
      <div class='sec-hdr'>
        <div><div class='sec-sub'>Semanal · Sergio Guerrero</div></div>
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
        <div><div class='sec-sub'>Revisión mensual obligatoria</div></div>
        <div id='btn-nuevo-elev' style='display:none'><button class='btn btn-g' onclick='openModal("modal-elevador")'>+ Registrar revisión</button></div>
      </div>
      <div id='elevador-list'></div>
    </div>

    <!-- AVISOS -->
    <div class='page' id='page-avisos'>
      <div class='sec-hdr'>
        
        <div id='btn-nuevo-aviso' style='display:none'><button class='btn btn-g' onclick='openModal("modal-aviso")'>✍️ Publicar aviso</button></div>
      </div>
      <div id='avisos-list'></div>
    </div>

    <!-- MENSAJES -->


    <!-- ACTAS -->
    <div class='page' id='page-actas'>
      <div class='sec-hdr'>
        <div><div class='sec-sub'>Foliado y numerado</div></div>
        <div id='btn-acta' style='display:none'><button class='btn btn-g' onclick='openModal("modal-acta")'>📝 Nueva acta</button></div>
      </div>
      <div id='actas-list'></div>
    </div>

    <!-- RECIBOS Y FACTURAS -->
    <div class='page' id='page-recibos'>
      <div class='sec-hdr'>
        <div><div class='sec-sub'>Documentos del edificio</div></div>
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
  <input type='hidden' id='av-edit-id' value=''>
  <div class='form-g'><label class='form-l'>Título</label><input class='fi' id='av-titulo'></div>
  <div class='form-g'><label class='form-l'>Tipo</label><select class='fs' id='av-tipo'>
    <option value='info'>📢 General</option><option value='urgente'>🚨 Urgente</option>
    <option value='comunicado'>📄 Comunicado</option><option value='mantenimiento'>🔧 Mantenimiento</option>
  </select></div>
  <div class='form-g'><label class='form-l'>Mensaje</label><textarea class='fta' id='av-texto'></textarea></div>
  <div style='display:flex;gap:9px'><button class='btn btn-g' onclick='postAviso()'>Publicar</button><button class='btn btn-o' onclick='closeModal("modal-aviso");$id("av-edit-id").value=""'>Cancelar</button></div>
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
  <div id='foto-caption' style='text-align:center;color:rgba(255,255,255,.9);font-size:13px;margin-top:10px'></div>
</div></div>

<div class='toast' id='toast'></div>
<script src='/frontend.js'></script>
</body>
</html>`;

// ── Servir frontend JS ──
const FRONTEND_JS = await Bun.file(new URL('./frontend.js', import.meta.url)).text();
app.get("/frontend.js", (c) => {
  return new Response(FRONTEND_JS, {
    headers: { "Content-Type": "application/javascript" }
  });
});

app.get("/", (c) => c.html(HTML));
app.get("/*", (c) => {
  if (!c.req.path.startsWith("/api/") && !c.req.path.startsWith("/uploads/")) return c.html(HTML);
  return c.json({ error: "Not found" }, 404);
});

Bun.serve({
  port: Number(process.env.PORT ?? 3001),
  fetch: app.fetch,
});

console.log(`🏢 Torre TUXPAN 45A corriendo en puerto ${process.env.PORT ?? 3001}`);
