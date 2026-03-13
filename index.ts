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
  activo INTEGER DEFAULT 1,
  es_variable INTEGER DEFAULT 0
)`);

// Gastos misceláneos: entradas libres por mes
db.run(`CREATE TABLE IF NOT EXISTS gastos_misc (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  concepto TEXT NOT NULL,
  monto REAL NOT NULL,
  mes INTEGER NOT NULL,
  anio INTEGER NOT NULL,
  fecha TEXT,
  notas TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
)`);

// Saldo de caja chica (acumulado manual)
db.run(`CREATE TABLE IF NOT EXISTS caja_chica (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mes INTEGER NOT NULL,
  anio INTEGER NOT NULL,
  saldo_inicial REAL DEFAULT 0,
  deposito_extra REAL DEFAULT 0,
  notas TEXT,
  UNIQUE(mes, anio)
)`);

// Agregar columna es_variable si no existe (migración)
try { db.run("ALTER TABLE gastos_plantilla ADD COLUMN es_variable INTEGER DEFAULT 0"); } catch(_) {}

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
    const ins = db.prepare("INSERT INTO gastos_plantilla (concepto,categoria,monto,proveedor,es_variable) VALUES (?,?,?,?,?)");
    ins.run(["Seguridad e intendencia","seguridad",31100,"Sergio Guerrero",0]);
    ins.run(["Mantenimiento elevador","elevador",2000,"OTIS / Empresa",0]);
    ins.run(["Servicio de luz","servicios",4000,"CFE",1]);
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
  const condos = db.query("SELECT * FROM condominios WHERE activo=1 ORDER BY CASE WHEN CAST(unidad AS INTEGER) = 0 THEN 1 ELSE 0 END, CAST(unidad AS INTEGER), unidad").all() as any[];
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

  // Gastos del mes (registrados)
  const gastosRes = db.query("SELECT COALESCE(SUM(monto),0) as t FROM gastos WHERE mes=? AND anio=?").get(mes, anio) as any;
  const total_gastos = gastosRes?.t ?? 0;

  // Gastos misceláneos del mes
  const miscRes = db.query("SELECT COALESCE(SUM(monto),0) as t FROM gastos_misc WHERE mes=? AND anio=?").get(mes, anio) as any;
  const total_misc = miscRes?.t ?? 0;

  // Plantilla fija (para calcular cobertura)
  const plantilla = db.query("SELECT * FROM gastos_plantilla WHERE activo=1").all() as any[];
  const gastos_fijos = plantilla.reduce((s: number, g: any) => s + g.monto, 0);

  // Ahorro / faltante del mes
  const total_egresos = total_gastos + total_misc;
  const ahorro_mes = recaudado - total_egresos;
  const cobertura_fijos = gastos_fijos > 0 ? Math.round((recaudado / gastos_fijos) * 100) : 100;

  // Caja chica (saldo acumulado manual + ahorro del mes)
  const caja = db.query("SELECT * FROM caja_chica WHERE mes=? AND anio=?").get(mes, anio) as any;
  const saldo_inicial  = caja?.saldo_inicial  ?? 0;
  const deposito_extra = caja?.deposito_extra ?? 0;
  const saldo_caja = saldo_inicial + deposito_extra + ahorro_mes;

  // Gastos extraordinarios activos
  const gex = db.query("SELECT * FROM gastos_extraordinarios WHERE estado='activo'").all() as any[];
  const total_ext = gex.reduce((s: number, g: any) => s + g.monto_total, 0);
  const recaudado_ext = gex.reduce((g_acc: number, g: any) => {
    const r = db.query("SELECT SUM(monto) as t FROM pagos WHERE gasto_ext_id=? AND mes=? AND anio=?").get(g.id, mes, anio) as any;
    return g_acc + (r?.t ?? 0);
  }, 0);

  return c.json({ pagaron, pendientes, recaudado, cuota_total, porcentaje,
    total_condominios: condos.length, total_gastos, total_misc, gastos_fijos,
    ahorro_mes, cobertura_fijos, saldo_caja, saldo_inicial, deposito_extra,
    total_ext, recaudado_ext });
});

app.get("/api/pagos/deudores", (c) => {
  const anio = Number(c.req.query("anio") ?? new Date().getFullYear());
  const condos = db.query("SELECT * FROM condominios WHERE activo=1").all() as any[];
  const now = new Date();
  const maxM = anio < now.getFullYear() ? 12 : now.getMonth() + 1;
  // Solo contar adeudos desde marzo 2026
  const mesInicio = (anio === 2026) ? 3 : (anio < 2026 ? 13 : 1); // <2026 = sin deudores
  const result: any[] = [];
  condos.forEach((co: any) => {
    if (mesInicio > 12) return; // año anterior a 2026, ignorar
    const pagos = db.query(
      "SELECT mes FROM pagos WHERE condominio_id=? AND anio=? AND tipo_pago='ordinario'"
    ).all(co.id, anio) as any[];
    const meses_sin_pagar: number[] = [];
    for (let m = mesInicio; m <= maxM; m++)
      if (!pagos.find((p: any) => p.mes === m)) meses_sin_pagar.push(m);
    if (meses_sin_pagar.length > 0)
      result.push({ ...co, meses_sin_pagar, adeudo: meses_sin_pagar.length * co.cuota_mensual });
  });
  const sortUnit = (u: string) => {
    const n = parseInt(u);
    return n > 0 ? n : 9000 + u.charCodeAt(0);
  };
  return c.json(result.sort((a, b) => sortUnit(a.unidad) - sortUnit(b.unidad)));
});

// Estado de cuenta anual (mar 2026 → mar 2027)
app.get("/api/pagos/estado-cuenta", (c) => {
  const condos = db.query("SELECT * FROM condominios WHERE activo=1 ORDER BY CASE WHEN CAST(unidad AS INTEGER) = 0 THEN 1 ELSE 0 END, CAST(unidad AS INTEGER), unidad").all() as any[];
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

app.put("/api/gastos/plantilla/:id", requireAdmin, async (c) => {
  const b = await c.req.json();
  db.run("UPDATE gastos_plantilla SET concepto=?,categoria=?,monto=?,proveedor=?,es_variable=? WHERE id=?",
    [b.concepto, b.categoria, Number(b.monto), b.proveedor || null, b.es_variable ? 1 : 0, Number(c.req.param("id"))]);
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
//  GASTOS MISCELÁNEOS
// ════════════════════════════════════════════
app.get("/api/gastos-misc", (c) => {
  const mes  = Number(c.req.query("mes")  ?? new Date().getMonth() + 1);
  const anio = Number(c.req.query("anio") ?? new Date().getFullYear());
  return c.json(db.query("SELECT * FROM gastos_misc WHERE mes=? AND anio=? ORDER BY created_at DESC").all(mes, anio));
});

app.post("/api/gastos-misc", requireAdmin, async (c) => {
  const b = await c.req.json();
  const mes  = Number(b.mes  ?? new Date().getMonth() + 1);
  const anio = Number(b.anio ?? new Date().getFullYear());
  db.run("INSERT INTO gastos_misc (concepto,monto,mes,anio,fecha,notas) VALUES (?,?,?,?,?,?)",
    [b.concepto, Number(b.monto), mes, anio,
     b.fecha || `${anio}-${String(mes).padStart(2,"0")}-01`, b.notas || null]);
  return c.json({ ok: true });
});

app.delete("/api/gastos-misc/:id", requireAdmin, (c) => {
  db.run("DELETE FROM gastos_misc WHERE id=?", [Number(c.req.param("id"))]);
  return c.json({ ok: true });
});

// ════════════════════════════════════════════
//  CAJA CHICA
// ════════════════════════════════════════════
app.get("/api/caja-chica", (c) => {
  const mes  = Number(c.req.query("mes")  ?? new Date().getMonth() + 1);
  const anio = Number(c.req.query("anio") ?? new Date().getFullYear());
  // Recaudado del mes
  const condos = db.query("SELECT * FROM condominios WHERE activo=1").all() as any[];
  const recaudado = (db.query(
    "SELECT COALESCE(SUM(monto),0) as t FROM pagos WHERE mes=? AND anio=? AND tipo_pago='ordinario'"
  ).get(mes, anio) as any).t;
  // Gastos plantilla fijos del mes (monto base)
  const plantilla = db.query("SELECT * FROM gastos_plantilla WHERE activo=1").all() as any[];
  const gastos_fijos = plantilla.reduce((s: number, g: any) => s + g.monto, 0);
  // Gastos reales registrados ese mes
  const gastos_reales = (db.query(
    "SELECT COALESCE(SUM(monto),0) as t FROM gastos WHERE mes=? AND anio=?"
  ).get(mes, anio) as any).t;
  // Gastos misceláneos del mes
  const gastos_misc = (db.query(
    "SELECT COALESCE(SUM(monto),0) as t FROM gastos_misc WHERE mes=? AND anio=?"
  ).get(mes, anio) as any).t;
  // Registro manual de caja chica
  const registro = db.query("SELECT * FROM caja_chica WHERE mes=? AND anio=?").get(mes, anio) as any;
  const saldo_inicial = registro?.saldo_inicial ?? 0;
  const deposito_extra = registro?.deposito_extra ?? 0;
  // Cuota total del mes
  const cuota_total = condos.reduce((s: number, co: any) => s + co.cuota_mensual, 0);
  const ahorro_mes = recaudado - gastos_reales - gastos_misc;
  const faltante_cobertura = gastos_fijos - recaudado;
  const saldo_caja = saldo_inicial + deposito_extra + ahorro_mes;
  return c.json({
    recaudado, gastos_fijos, gastos_reales, gastos_misc,
    cuota_total, ahorro_mes, faltante_cobertura,
    saldo_inicial, deposito_extra, saldo_caja,
    registro: registro || null,
    desglose_misc: db.query("SELECT * FROM gastos_misc WHERE mes=? AND anio=? ORDER BY fecha").all(mes, anio),
  });
});

app.put("/api/caja-chica", requireAdmin, async (c) => {
  const b = await c.req.json();
  const mes  = Number(b.mes  ?? new Date().getMonth() + 1);
  const anio = Number(b.anio ?? new Date().getFullYear());
  db.run(`INSERT INTO caja_chica (mes,anio,saldo_inicial,deposito_extra,notas)
    VALUES (?,?,?,?,?)
    ON CONFLICT(mes,anio) DO UPDATE SET
      saldo_inicial=excluded.saldo_inicial,
      deposito_extra=excluded.deposito_extra,
      notas=excluded.notas`,
    [mes, anio, Number(b.saldo_inicial ?? 0), Number(b.deposito_extra ?? 0), b.notas || null]);
  return c.json({ ok: true });
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

// Editar bitácora semanal
app.put("/api/bitacora/:id", requireManto, async (c) => {
  const id = Number(c.req.param("id"));
  const b = await c.req.parseBody();
  db.run("UPDATE bitacora_semanal SET semana_inicio=?,semana_fin=?,observaciones_generales=?,personal=? WHERE id=?",
    [b.semana_inicio, b.semana_fin, b.observaciones || "", b.personal || "Sergio Guerrero", id]);
  return c.json({ ok: true });
});

// Eliminar bitácora semanal
app.delete("/api/bitacora/:id", requireManto, (c) => {
  const id = Number(c.req.param("id"));
  db.run("DELETE FROM bitacora_areas WHERE bitacora_id=?", [id]);
  db.run("DELETE FROM insumos_inventario WHERE bitacora_id=?", [id]);
  db.run("DELETE FROM bitacora_semanal WHERE id=?", [id]);
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

// ── PWA: subir logo y generar íconos ────────────────────────────────────────
app.post("/api/pwa/icon", requireAdmin, async (c) => {
  const b = await c.req.parseBody();
  const iconDir = `${UPLOAD_DIR}/icons`;
  require("fs").mkdirSync(iconDir, { recursive: true });
  const file = b.logo as File;
  if (!file) return c.json({ error: "No se recibió archivo" }, 400);
  const buf = Buffer.from(await file.arrayBuffer());
  // Guardar original
  require("fs").writeFileSync(`${iconDir}/logo-original.png`, buf);
  // Guardar como 192 y 512 (el usuario sube ya el tamaño correcto,
  // o en el futuro se puede usar sharp para redimensionar)
  require("fs").writeFileSync(`${iconDir}/icon-192.png`, buf);
  require("fs").writeFileSync(`${iconDir}/icon-512.png`, buf);
  return c.json({ ok: true, path: "/icon-192.png" });
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
<link rel='manifest' href='/manifest.json'>
<meta name='theme-color' content='#a07828'>
<meta name='mobile-web-app-capable' content='yes'>
<meta name='apple-mobile-web-app-capable' content='yes'>
<meta name='apple-mobile-web-app-status-bar-style' content='default'>
<meta name='apple-mobile-web-app-title' content='TUXPAN 45A'>
<link rel='apple-touch-icon' href='/icon-192.png'>
<script>if('serviceWorker'in navigator){window.addEventListener('load',()=>{navigator.serviceWorker.register('/sw.js').catch(()=>{});});}</script>
<link rel='icon' type='image/png' sizes='192x192' href='/icon-192.png'>
<link rel='icon' type='image/png' sizes='512x512' href='/icon-512.png'>
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
.logo{padding:22px 24px 16px;border-bottom:1px solid var(--border)}#topbar-logo{display:none!important}@media(max-width:700px){#topbar-logo{display:block!important}}
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
    <div style='display:flex;align-items:center;gap:11px'>
      <img src='/icon-192.png' style='width:40px;height:40px;border-radius:10px;flex-shrink:0' alt='Logo'>
      <div>
        <div class='logo-name'>Torre<br>TUXPAN 45A</div>
        <div class='logo-sub'>Portal Condóminos · 2026</div>
      </div>
    </div>
  </div>
  <nav class='nav'>
    <div class='nav-sec' id='nav-sec-finanzas'>
      <div class='nav-sec-label'>Finanzas</div>
      <button class='nav-item active' onclick='go("dashboard",this)'>🏛️ Resumen General</button>
      <button class='nav-item' onclick='go("cuentas",this)'>💰 Estado de Cuenta</button>
      <button class='nav-item' onclick='go("deudores",this)'>⚠️ Deudores</button>
      <button class='nav-item' onclick='go("gastos",this)'>📊 Gastos Ordinarios</button>
      <button class='nav-item' id='nav-gext' onclick='go("gastos-ext",this)'>💎 Gastos Extraordinarios</button>
    </div>
    <div class='nav-sec' id='nav-sec-gestion'>
      <div class='nav-sec-label'>Gestión</div>
      <button class='nav-item' id='nav-votaciones' onclick='go("votaciones",this)'>🗳️ Votaciones <span class='nav-badge-g' id='bdg-vot' style='display:none'>0</span></button>
      <button class='nav-item' id='nav-situaciones' onclick='go("situaciones",this)'>🔧 Situaciones <span class='nav-badge' id='bdg-sit'>11</span></button>
      <button class='nav-item' id='nav-mantenimiento' onclick='go("mantenimiento",this)'>🛠️ Mantenimiento</button>
      <button class='nav-item' onclick='go("bitacora",this)'>🧹 Bitácora Limpieza</button>
      <button class='nav-item' onclick='go("elevador",this)'>🛗 Elevador</button>
    </div>
    <div class='nav-sec' id='nav-sec-comunidad'>
      <div class='nav-sec-label'>Comunidad</div>
      <button class='nav-item' onclick='go("avisos",this)'>📢 Avisos <span class='nav-badge' id='bdg-av'>0</span></button>
      <button class='nav-item' onclick='go("actas",this)'>📖 Libro de Actas</button>
      <button class='nav-item' onclick='go("recibos",this)'>🗂️ Recibos y Facturas</button>
    </div>
  </nav>
  <div class='sidebar-foot'>
    <button class='admin-btn-side' id='btn-condos-side' onclick='openModal("modal-condos")' style='display:none'>🏢 Gestionar Condóminos</button>
    <button class='admin-btn-side' id='btn-pwa-icon-side' onclick='openModal("modal-pwa-icon")' style='display:none'>📱 Subir ícono de app</button>
    <button class='admin-btn-side' id='btn-admin-side' onclick='showLoginModal("admin")'>🔐 <span id='admin-side-lbl'>Acceso Admin</span></button>
    <button class='manto-btn-side' id='btn-manto-side' onclick='showLoginModal("manto")'>🔧 <span id='manto-side-lbl'>Acceso Mantenimiento</span></button>
  </div>
</aside>

<main class='main'>
  <header class='topbar'>
    <div style='display:flex;align-items:center;gap:10px'>
      <img src='/icon-192.png' style='width:30px;height:30px;border-radius:7px;display:none' id='topbar-logo' alt='Logo'>
      <div><div class='tb-title' id='page-title'>Resumen General</div><div class='tb-date' id='tb-date'></div></div>
    </div>
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
          <select class='fs' style='width:80px' id='fil-mes-g' onchange='loadGastos();loadGastosMisc()'>
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
      <!-- MISCELÁNEOS -->
      <div class='card' style='margin-top:16px'>
        <div class='ctitle'>Gastos Misceláneos del mes</div>
        <div id='misc-list'><div style='color:var(--text3);font-size:13px;padding:10px 0'>Cargando...</div></div>
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
        
        <button class='btn btn-g' onclick='abrirModalSolicitud()'>+ Nueva solicitud</button>
      </div>
      <div id='man-list'></div>
    </div>

    <!-- BITÁCORA SEMANAL -->
    <div class='page' id='page-bitacora'>
      <div class='sec-hdr'>
        <div><div class='sec-sub'>Semanal · Sergio Guerrero</div></div>
        <div style='display:flex;gap:9px' id='btn-bit-actions'>
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
  <input type='hidden' id='pl-edit-id' value=''>
  <div style='font-size:12px;color:var(--text2);margin-bottom:12px'>Agregar / editar concepto recurrente:</div>
  <div class='g2'>
    <div class='form-g'><label class='form-l'>Concepto</label><input class='fi' id='pl-concepto'></div>
    <div class='form-g'><label class='form-l'>Categoría</label><select class='fs' id='pl-cat'>
      <option value='seguridad'>Seguridad</option><option value='elevador'>Elevador</option>
      <option value='servicios'>Servicios</option><option value='mantenimiento'>Mantenimiento</option>
    </select></div>
    <div class='form-g'><label class='form-l'>Monto base ($)</label><input class='fi' id='pl-monto' type='number'></div>
    <div class='form-g'><label class='form-l'>Proveedor</label><input class='fi' id='pl-prov'></div>
  </div>
  <div class='form-g' style='display:flex;align-items:center;gap:9px'>
    <input type='checkbox' id='pl-variable' style='width:16px;height:16px'>
    <label for='pl-variable' style='font-size:13px;color:var(--text2)'>Monto variable (el monto base es referencia mínima)</label>
  </div>
  <div style='display:flex;gap:9px'>
    <button class='btn btn-g' onclick='addPlantilla()'>Guardar</button>
    <button class='btn btn-o' onclick='closeModal("modal-plantilla");$id("pl-edit-id").value=""'>Cancelar</button>
  </div>
</div></div>

<!-- Gasto misceláneo -->
<div class='modal-ov' id='modal-misc' onclick='closeOv(event,"modal-misc")'><div class='modal'>
  <div class='modal-title'>🧾 Gasto Misceláneo</div>
  <div class='form-g'><label class='form-l'>Concepto</label><input class='fi' id='misc-concepto' placeholder='Ej: Pintura pasillo, fumigación...'></div>
  <div class='g2'>
    <div class='form-g'><label class='form-l'>Monto ($)</label><input class='fi' id='misc-monto' type='number'></div>
    <div class='form-g'><label class='form-l'>Fecha</label><input class='fi' id='misc-fecha' type='date'></div>
  </div>
  <div class='form-g'><label class='form-l'>Notas (opcional)</label><input class='fi' id='misc-notas'></div>
  <div style='display:flex;gap:9px'>
    <button class='btn btn-g' onclick='registrarMisc()'>Registrar</button>
    <button class='btn btn-o' onclick='closeModal("modal-misc")'>Cancelar</button>
  </div>
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

<!-- Editar situación (admin) -->
<div class='modal-ov' id='modal-edit-sit' onclick='closeOv(event,"modal-edit-sit")'><div class='modal'>
  <div class='modal-title'>✏️ Editar Situación — <span id='esit-num' style='font-size:15px;font-weight:400;color:var(--text2)'></span></div>
  <input type='hidden' id='esit-id'>
  <div class='form-g'><label class='form-l'>Título</label>
    <input class='fi' id='esit-titulo' placeholder='Título de la situación'></div>
  <div class='form-g'><label class='form-l'>Descripción</label>
    <textarea class='fta' id='esit-desc' placeholder='Describe el problema...'></textarea></div>
  <div style='display:grid;grid-template-columns:1fr 1fr;gap:12px'>
    <div class='form-g'><label class='form-l'>Urgencia</label>
      <select class='fs' id='esit-urgencia'>
        <option value='alta'>🔴 Alta</option>
        <option value='media'>🟡 Media</option>
        <option value='baja'>🟢 Baja</option>
      </select></div>
    <div class='form-g'><label class='form-l'>Estado</label>
      <select class='fs' id='esit-estado'>
        <option value='pendiente'>⏳ Pendiente</option>
        <option value='en-proceso'>⚙️ En proceso</option>
        <option value='resuelto'>✅ Resuelto</option>
      </select></div>
  </div>
  <div class='form-g'><label class='form-l'>Notas de resolución</label>
    <textarea class='fta' id='esit-resolucion' placeholder='Cómo se resolvió, quién atendió...'></textarea></div>
  <div class='form-g'><label class='form-l'>Fecha de resolución</label>
    <input class='fi' type='date' id='esit-fecha-res'></div>
  <div class='form-g'><label class='form-l'>Foto de evidencia (opcional)</label>
    <input class='fi' type='file' id='esit-foto' accept='image/*'>
    <div style='font-size:11px;color:var(--text3);margin-top:4px'>Se agrega al historial de la situación</div></div>
  <div style='display:flex;gap:9px;margin-top:4px'>
    <button class='btn btn-g' onclick='guardarEditSit()'>💾 Guardar cambios</button>
    <button class='btn btn-o' onclick='closeModal("modal-edit-sit")'>Cancelar</button>
  </div>
</div></div>

<!-- Editar bitácora semanal -->
<div class='modal-ov' id='modal-edit-bit' onclick='closeOv(event,"modal-edit-bit")'><div class='modal'>
  <div class='modal-title'>✏️ Editar Bitácora</div>
  <input type='hidden' id='edit-bit-id'>
  <div style='display:grid;grid-template-columns:1fr 1fr;gap:12px'>
    <div class='form-g'><label class='form-l'>Semana inicio</label>
      <input class='fi' type='date' id='edit-bit-ini'></div>
    <div class='form-g'><label class='form-l'>Semana fin</label>
      <input class='fi' type='date' id='edit-bit-fin'></div>
  </div>
  <div class='form-g'><label class='form-l'>Observaciones generales</label>
    <textarea class='fta' id='edit-bit-obs' placeholder='Notas de la semana...'></textarea></div>
  <div style='display:flex;gap:9px'>
    <button class='btn btn-g' onclick='guardarEditBit()'>💾 Guardar</button>
    <button class='btn btn-o' onclick='closeModal("modal-edit-bit")'>Cancelar</button>
  </div>
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

// ── PWA: manifest + íconos ───────────────────────────────────────────────────
const MANIFEST = JSON.stringify({
  name: "Torre TUXPAN 45A",
  short_name: "TUXPAN 45A",
  description: "Portal de administración condominial",
  start_url: "/",
  display: "standalone",
  background_color: "#f5f3ee",
  theme_color: "#a07828",
  orientation: "portrait-primary",
  icons: [
    { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
    { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" }
  ]
});

app.get("/sw.js", (c) => new Response("'use strict';const CACHE='tuxpan-v1';self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(['/'])).then(()=>self.skipWaiting()));});self.addEventListener('activate',e=>{e.waitUntil(clients.claim());});self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;const u=new URL(e.request.url);if(u.pathname.startsWith('/api/'))return;e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)));})", { headers: { "Content-Type": "application/javascript", "Service-Worker-Allowed": "/" } }));

app.get("/manifest.json", (c) =>
  new Response(MANIFEST, { headers: { "Content-Type": "application/manifest+json" } })
);

// Íconos PWA incrustados
const ICON_192 = Buffer.from("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", "base64");
const ICON_512 = Buffer.from("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", "base64");
app.get("/icon-192.png", (c) => new Response(ICON_192, { headers: { "Content-Type": "image/png", "Cache-Control": "public,max-age=86400" } }));
app.get("/icon-512.png", (c) => new Response(ICON_512, { headers: { "Content-Type": "image/png", "Cache-Control": "public,max-age=86400" } }));

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
