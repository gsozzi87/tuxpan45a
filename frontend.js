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
  dashboard:'Resumen General', cuentas:'Estado de Cuenta', deudores:'Deudores',
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
    gastos: () => { loadGastos(); loadGastosMisc(); }, 'gastos-ext': loadGastosExt,
    votaciones: loadVotaciones, situaciones: loadSits,
    mantenimiento: loadMan, bitacora: loadBit, elevador: loadElevador,
    avisos: loadAvisos, actas: loadActas,
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
    const saludo = r.rol === 'mantenimiento'
      ? `✓ Bienvenido, Ing. Sergio Guerrero 👷`
      : `✓ Bienvenido, ${r.nombre}`;
    showToast(saludo);
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
                    'gasto-th-del','btn-condos-side'];
  adminEls.forEach(id => { const el = $id(id); if (el) el.style.display = isAdmin ? '' : 'none'; });

  const mantoEls = ['btn-bit-actions','btn-nuevo-elev'];
  mantoEls.forEach(id => { const el = $id(id); if (el) el.style.display = isManto ? '' : 'none'; });

  const adminAreaBtn = $id('btn-admin-areas');
  if (adminAreaBtn) adminAreaBtn.style.display = isAdmin ? '' : 'none';

  // Mantenimiento solo puede ver Bitácora de Limpieza y Elevador
  const isMantoOnly = sesion?.rol === 'mantenimiento';
  const hideFromManto = [
    'nav-sec-finanzas', 'nav-sec-comunidad',
    'nav-votaciones', 'nav-situaciones', 'nav-mantenimiento',
    'btn-condos-side', 'btn-admin-side'
  ];
  hideFromManto.forEach(id => {
    const el = $id(id);
    if (el) el.style.display = isMantoOnly ? 'none' : '';
  });
  // Si es mantenimiento, redirigir a bitácora
  if (isMantoOnly) {
    const bitBtn = document.querySelector('.nav-item[onclick*="bitacora"]');
    if (bitBtn) go('bitacora', bitBtn);
  }

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

  const ahorroColor = r.ahorro_mes >= 0 ? 'var(--green)' : 'var(--red)';
  const ahorroLabel = r.ahorro_mes >= 0 ? 'Ahorro del mes' : 'Déficit del mes';
  const cajaColor   = r.saldo_caja  >= 0 ? 'var(--blue)'  : 'var(--red)';

  $id('dash-stats').innerHTML = `
    <div class="stat" style="--ac:var(--green)">
      <div class="stat-lbl">Pagaron este mes</div>
      <div class="stat-val">${r.pagaron}</div>
      <div class="stat-sub">de ${r.total_condominios} unidades · ${r.pendientes} pendientes</div>
    </div>
    <div class="stat" style="--ac:var(--gold)">
      <div class="stat-lbl">Recaudado ${MESES[mes]}</div>
      <div class="stat-val" style="font-size:21px">${fmtM(r.recaudado)}</div>
      <div class="stat-sub">Meta: ${fmtM(r.cuota_total)} · ${r.porcentaje}%</div>
    </div>
    <div class="stat" style="--ac:${ahorroColor}">
      <div class="stat-lbl">${ahorroLabel}</div>
      <div class="stat-val" style="font-size:21px;color:${ahorroColor}">${fmtM(Math.abs(r.ahorro_mes))}</div>
      <div class="stat-sub">Gastos: ${fmtM(r.total_gastos + (r.total_misc||0))}</div>
    </div>
    <div class="stat" style="--ac:${cajaColor}">
      <div class="stat-lbl">Caja chica</div>
      <div class="stat-val" style="font-size:21px;color:${cajaColor}">${fmtM(r.saldo_caja)}</div>
      <div class="stat-sub">Saldo acumulado + ahorro</div>
    </div>`;

  $id('dash-ext-stats').innerHTML = '';

  // Barra de recaudación vs gastos fijos
  const pctFijos = r.gastos_fijos > 0 ? Math.min(100, Math.round((r.recaudado / r.gastos_fijos) * 100)) : 100;
  const faltaFijos = r.gastos_fijos - r.recaudado;
  $id('dash-prog').innerHTML = `
    <div style="margin-bottom:7px;font-size:13px;color:var(--text2)">${fmtM(r.recaudado)} recaudado vs ${fmtM(r.gastos_fijos)} en gastos fijos</div>
    <div class="prog"><div class="prog-b" style="width:${pctFijos}%;background:var(--gold)"></div></div>
    <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text3);margin-top:6px">
      <span>${pctFijos}% cobertura de gastos fijos</span>
      <span style="color:${faltaFijos > 0 ? 'var(--red)' : 'var(--green)'}">${faltaFijos > 0 ? 'Falta: ' + fmtM(faltaFijos) : 'Cubierto ✓'}</span>
    </div>
    <div style="margin-top:14px;padding-top:13px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:7px">
      <div style="display:flex;justify-content:space-between;font-size:13px">
        <span style="color:var(--text2)">Gastos fijos registrados</span>
        <span style="color:var(--red);font-family:'DM Mono',monospace">${fmtM(r.total_gastos || 0)}</span>
      </div>
      ${(r.total_misc||0) > 0 ? `
      <div style="display:flex;justify-content:space-between;font-size:13px">
        <span style="color:var(--text2)">Misceláneos</span>
        <span style="color:var(--red);font-family:'DM Mono',monospace">${fmtM(r.total_misc)}</span>
      </div>` : ''}
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
    const editBtn = sesion?.rol === 'admin'
      ? `<button class="detalle-btn" style="font-size:11px;padding:3px 8px" onclick="abrirEditCondo(${co.id},'${(co.unidad||'').replace(/'/g,"\\'")}','${(co.propietario||'').replace(/'/g,"\\'")}','${co.email||''}','${co.telefono||''}',${co.cuota_mensual})">✏️</button>`
      : '';
    return `
      <tr>
        <td><span class="badge bb" style="font-family:'DM Mono',monospace">${co.unidad}</span></td>
        <td><strong>${co.propietario}</strong> ${editBtn}</td>
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
    <div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border);flex-wrap:wrap">
      <div style="flex:1;min-width:140px">
        <div style="font-size:13px;font-weight:600">${g.concepto}</div>
        <div style="font-size:11px;color:var(--text3)">${g.categoria} · ${g.proveedor || '—'}${g.es_variable ? ' · <span style="color:var(--blue)">variable</span>' : ''}</div>
      </div>
      <div style="font-family:'DM Mono',monospace;font-size:13px;color:var(--gold2)">${fmtM(g.monto)}</div>
      <button class="btn btn-o btn-sm" onclick="editPlantilla(${g.id},'${(g.concepto||'').replace(/'/g,"\\'")}','${g.categoria}',${g.monto},'${g.proveedor||''}',${g.es_variable||0})">✏️</button>
      <button class="btn btn-r btn-sm" onclick="delPlantilla(${g.id})">✕</button>
    </div>`).join('') || '<div style="color:var(--text3);font-size:13px;padding:10px 0">Sin conceptos</div>';
}

function editPlantilla(id, concepto, categoria, monto, proveedor, es_variable) {
  $id('pl-edit-id').value   = id;
  $id('pl-concepto').value  = concepto;
  $id('pl-cat').value       = categoria;
  $id('pl-monto').value     = monto;
  $id('pl-prov').value      = proveedor;
  if ($id('pl-variable')) $id('pl-variable').checked = !!es_variable;
  openModal('modal-plantilla');
}

async function loadGastosMisc() {
  const m = $id('fil-mes-g')?.value || (new Date().getMonth() + 1);
  const misc = await api(`/api/gastos-misc?mes=${m}&anio=2026`);
  const total = misc.reduce((s, x) => s + x.monto, 0);
  const el = $id('misc-list');
  if (!el) return;
  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <div style="font-size:13px;color:var(--text2)">${misc.length} gastos · <strong style="color:var(--red)">${fmtM(total)}</strong> total</div>
      ${sesion?.rol === 'admin' ? `<button class="btn btn-g btn-sm" onclick="openModal('modal-misc')">+ Agregar</button>` : ''}
    </div>
    ${misc.length ? misc.map(g => `
      <div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border)">
        <div style="flex:1">
          <div style="font-size:13px;font-weight:600">${g.concepto}</div>
          <div style="font-size:11px;color:var(--text3)">${g.fecha || ''} ${g.notas ? '· ' + g.notas : ''}</div>
        </div>
        <div style="font-family:'DM Mono',monospace;font-size:13px;color:var(--red)">${fmtM(g.monto)}</div>
        ${sesion?.rol === 'admin' ? `<button class="btn btn-r btn-sm" onclick="delMisc(${g.id})">✕</button>` : ''}
      </div>`).join('') : '<div style="color:var(--text3);font-size:13px;padding:20px 0;text-align:center">Sin gastos misceláneos este mes</div>'}`;
}

async function registrarMisc() {
  const m = $id('fil-mes-g')?.value || (new Date().getMonth() + 1);
  const r = await api('/api/gastos-misc', {
    method: 'POST',
    body: JSON.stringify({
      concepto: $id('misc-concepto').value,
      monto:    $id('misc-monto').value,
      mes:      m, anio: 2026,
      fecha:    $id('misc-fecha').value,
      notas:    $id('misc-notas').value,
    }),
  });
  if (r.ok) { closeModal('modal-misc'); loadGastosMisc(); loadGastos(); showToast('✓ Gasto misceláneo registrado'); }
}

async function delMisc(id) {
  if (!confirm('¿Eliminar este gasto misceláneo?')) return;
  await api(`/api/gastos-misc/${id}`, { method: 'DELETE' });
  loadGastosMisc(); loadGastos(); showToast('Eliminado');
}

async function addPlantilla() {
  const editId = $id('pl-edit-id')?.value;
  const body = {
    concepto: $id('pl-concepto').value, categoria: $id('pl-cat').value,
    monto: $id('pl-monto').value, proveedor: $id('pl-prov').value,
    es_variable: $id('pl-variable')?.checked ? 1 : 0,
  };
  const r = await api(
    editId ? `/api/gastos/plantilla/${editId}` : '/api/gastos/plantilla',
    { method: editId ? 'PUT' : 'POST', body: JSON.stringify(body) }
  );
  if ($id('pl-edit-id')) $id('pl-edit-id').value = '';
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
// ── SITUACIONES ───────────────────────────
let _sitsCache = [];

async function loadSits() {
  const sits = await api('/api/situaciones');
  _sitsCache = sits;
  const urgCl = { alta: 'var(--red)', media: 'var(--gold)', baja: 'var(--blue)' };
  const urgLb = { alta: '🔴 Alta',   media: '🟡 Media',    baja: '🟢 Baja' };
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
          ${s.archivos.slice(0,4).map(a => `
            <div class="photo-item" onclick="verFoto('${a.archivo_path}','${a.descripcion||''}')">
              <img src="${a.archivo_path}" onerror="this.style.display='none';this.parentNode.innerHTML+='📷'">
              <div class="photo-cap">${a.es_resolucion ? '✅ Resolución' : a.descripcion||''}</div>
            </div>`).join('')}
        </div>` : ''}
      ${s.resolucion ? `
        <div style="margin-bottom:10px;padding:10px;background:var(--green-dim);border-radius:8px;border-left:3px solid var(--green);font-size:13px">
          <div style="font-size:11px;font-weight:700;color:var(--green);margin-bottom:4px">✅ Resolución (${s.fecha_resolucion||''})</div>
          ${s.resolucion}
        </div>` : ''}
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <span class="badge ${estBg[s.estado]||'bo'}">${s.estado}</span>
        ${sesion?.rol === 'admin' ? `
          <button class="detalle-btn" onclick="abrirEditSit(${s.id})">✏️ Editar</button>
          <button class="detalle-btn" style="color:var(--red);border-color:var(--red)" onclick="delSituacion(${s.id})">🗑️ Borrar</button>
        ` : ''}
      </div>
    </div>`).join('');
}

async function delSituacion(id) {
  if (!confirm('¿Eliminar esta situación? Esta acción no se puede deshacer.')) return;
  const r = await api(`/api/situaciones/${id}`, { method: 'DELETE' });
  if (r.ok) { loadSits(); showToast('Situación eliminada'); }
}

async function crearSituacion() {
  const r = await api('/api/situaciones', {
    method: 'POST',
    body: JSON.stringify({
      titulo:    $id('sit-titulo').value,
      descripcion: $id('sit-desc').value,
      urgencia:  $id('sit-urgencia').value,
    }),
  });
  if (r.ok) { closeModal('modal-nueva-sit'); loadSits(); showToast('✓ Situación creada'); }
}

function abrirEditSit(id) {
  const s = _sitsCache.find(x => x.id == id);
  if (!s) { showToast('Error: recargue la página'); return; }

  $id('esit-id').value          = id;
  $id('esit-num').textContent   = `SIT #${String(s.numero).padStart(2,'0')}`;
  $id('esit-titulo').value      = s.titulo || '';
  $id('esit-desc').value        = s.descripcion || '';
  $id('esit-urgencia').value    = s.urgencia || 'media';
  $id('esit-estado').value      = s.estado || 'pendiente';
  $id('esit-resolucion').value  = s.resolucion || '';
  $id('esit-fecha-res').value   = s.fecha_resolucion || '';
  $id('esit-foto').value        = '';

  openModal('modal-edit-sit');
}

async function guardarEditSit() {
  const id         = $id('esit-id').value;
  const titulo     = $id('esit-titulo').value.trim();
  const desc       = $id('esit-desc').value.trim();
  const urgencia   = $id('esit-urgencia').value;
  const estado     = $id('esit-estado').value;
  const resolucion = $id('esit-resolucion').value.trim();
  const fecha_resolucion = estado === 'resuelto'
    ? ($id('esit-fecha-res').value || new Date().toISOString().slice(0,10))
    : '';

  if (!titulo) { showToast('El título no puede estar vacío'); return; }

  const r = await api(`/api/situaciones/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ titulo, descripcion: desc, urgencia, estado, resolucion, fecha_resolucion }),
  });

  if (!r.ok && r.error) { showToast('Error al guardar: ' + r.error); return; }

  const foto = $id('esit-foto').files[0];
  if (foto) {
    const fd = new FormData();
    fd.append('archivo', foto);
    fd.append('es_resolucion', estado === 'resuelto' ? '1' : '0');
    fd.append('autor', sesion?.nombre || 'admin');
    await apiF(`/api/situaciones/${id}/archivos`, fd);
  }

  closeModal('modal-edit-sit');
  loadSits();
  showToast('✓ Situación actualizada');
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

function abrirModalSolicitud() {
  // Rellenar select de despachos siempre fresco al abrir
  const sel = $id('sol-despacho');
  if (sel) {
    sel.innerHTML = DESPACHOS.map(d => `<option value="${d}">${d}</option>`).join('');
  }
  $id('sol-autor').value = '';
  $id('sol-desc').value  = '';
  $id('sol-foto').value  = '';
  openModal('modal-solicitud');
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
// ── BITÁCORA DE LIMPIEZA ──────────────────
let _bitCache = [];

async function loadBit() {
  const semanas = await api('/api/bitacora');
  _bitCache = semanas;
  const isManto = sesion?.rol === 'admin' || sesion?.rol === 'mantenimiento';

  $id('bitacora-list').innerHTML = !semanas.length
    ? '<div style="text-align:center;padding:60px;color:var(--text3)"><div style="font-size:48px;margin-bottom:14px">🧹</div><div>Sin registros de limpieza</div></div>'
    : semanas.map(s => {
        const total  = s.areas?.length || 0;
        const hechas = s.areas?.filter(a => a.completada)?.length || 0;
        const pct    = total > 0 ? Math.round((hechas / total) * 100) : 0;
        return `
          <div class="bit-week">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px">
              <div>
                <div style="font-family:'Playfair Display',serif;font-size:15px;font-weight:700">Semana ${s.semana_inicio} al ${s.semana_fin}</div>
                <div style="font-size:12px;color:var(--text3);margin-top:2px">👷 ${s.personal}</div>
              </div>
              <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                <span class="badge ${s.estado === 'completada' ? 'bg' : s.estado === 'en_progreso' ? 'bb' : 'bo'}">${s.estado}</span>
                <span style="font-size:12px;color:var(--text2)">${hechas}/${total} áreas</span>
                ${isManto ? `
                  <button class="detalle-btn" onclick="abrirEditBit(${s.id})">✏️ Editar</button>
                  <button class="detalle-btn" style="color:var(--red);border-color:var(--red)" onclick="borrarBit(${s.id})">🗑️ Borrar</button>
                ` : ''}
              </div>
            </div>
            <div class="prog" style="margin-bottom:12px"><div class="prog-b" style="width:${pct}%;background:var(--green)"></div></div>
            ${s.areas?.length ? `
              <div style="display:flex;flex-wrap:wrap;gap:7px;margin-bottom:10px">
                ${s.areas.map(a => `
                  <div style="display:flex;align-items:center;gap:6px;background:${a.completada ? 'var(--green-dim)' : 'var(--bg3)'};border:1px solid ${a.completada ? 'rgba(76,175,135,.3)' : 'var(--border)'};border-radius:8px;padding:5px 10px;font-size:12px">
                    <span>${a.completada ? '✅' : '⬜'}</span>
                    <span>${a.area_nombre || a.area}</span>
                    ${a.foto_path ? `
                      <span style="cursor:pointer;background:var(--gold-dim);border-radius:5px;padding:2px 6px;font-size:11px;color:var(--gold2)" onclick="verFoto('${a.foto_path}','${a.area_nombre || a.area}')">📷 Ver foto</span>
                    ` : ''}
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

  $id('sem-areas-list').innerHTML = d.areas.map(a => {
    const hecha = d.semana?.areas?.find(x => x.area === a.nombre)?.completada;
    return `
      <div class="area-item">
        <div class="area-check ${hecha ? 'done' : ''}" onclick="toggleArea(this,'${a.nombre}')">
          ${hecha ? '✓' : ''}
        </div>
        <div style="flex:1;font-size:13px;font-weight:${hecha?'600':'400'};color:${hecha?'var(--green)':'var(--text)'}">
          ${a.nombre}
        </div>
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:5px 10px;font-size:11px;white-space:nowrap">
          📷 Adjuntar foto
          <input type="file" accept="image/*" id="area-foto-${a.nombre.replace(/\s/g,'_')}" style="display:none">
        </label>
        <span id="area-foto-lbl-${a.nombre.replace(/\s/g,'_')}" style="font-size:11px;color:var(--green);display:none">✓ foto lista</span>
      </div>`;
  }).join('');

  // Listener para mostrar confirmación cuando se elige foto
  d.areas.forEach(a => {
    const key = a.nombre.replace(/\s/g,'_');
    const inp = document.getElementById(`area-foto-${key}`);
    if (inp) inp.addEventListener('change', () => {
      const lbl = document.getElementById(`area-foto-lbl-${key}`);
      if (lbl) lbl.style.display = inp.files[0] ? 'inline' : 'none';
    });
  });

  $id('sem-insumos-list').innerHTML = d.insumos.map(ins => `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
      <div style="flex:1;font-size:13px">${ins.nombre} <span style="color:var(--text3);font-size:11px">(${ins.unidad})</span></div>
      <input class="fi" style="width:90px;text-align:center" type="number" id="ins-${ins.id}" placeholder="0" min="0">
    </div>`).join('');

  areasSeleccionadas.clear();
  if (d.semana?.areas) d.semana.areas.filter(a=>a.completada).forEach(a => areasSeleccionadas.add(a.area));

  openModal('modal-semana');
}

let areasSeleccionadas = new Set();
function toggleArea(el, nombre) {
  el.classList.toggle('done');
  if (el.classList.contains('done')) { el.textContent = '✓'; areasSeleccionadas.add(nombre); }
  else { el.textContent = ''; areasSeleccionadas.delete(nombre); }
}

async function guardarSemana() {
  const btnGuardar = document.querySelector('#modal-semana .btn-g');
  if (btnGuardar) { btnGuardar.disabled = true; btnGuardar.textContent = '⏳ Guardando...'; }

  try {
    const fd0 = new FormData();
    fd0.append('semana_inicio', $id('sem-ini').value);
    fd0.append('semana_fin',    $id('sem-fin').value);
    fd0.append('observaciones', $id('sem-obs').value);
    const r0 = await apiF('/api/bitacora', fd0);
    if (!r0.id && !r0.ok) throw new Error('Error al crear bitácora');
    const semId = r0.id || $id('sem-id').value;

    for (const area of areasSeleccionadas) {
      const fotoEl = document.getElementById(`area-foto-${area.replace(/\s/g,'_')}`);
      const fdA = new FormData();
      fdA.append('area', area);
      if (fotoEl?.files[0]) fdA.append('foto', fotoEl.files[0]);
      await apiF(`/api/bitacora/${semId}/area`, fdA);
    }

    const insumos = [];
    document.querySelectorAll('[id^="ins-"]').forEach(el => {
      if (el.value) insumos.push({ insumo_id: el.id.replace('ins-',''), cantidad: el.value });
    });
    if (insumos.length) {
      const fdI = new FormData();
      fdI.append('insumos', JSON.stringify(insumos));
      const fotoInv = $id('sem-insumo-foto').files[0];
      if (fotoInv) fdI.append('foto', fotoInv);
      await apiF(`/api/bitacora/${semId}/insumos`, fdI);
    }

    areasSeleccionadas.clear();
    closeModal('modal-semana');
    loadBit();
    showToast('✓ Bitácora guardada');
  } catch(e) {
    showToast('Error al guardar: ' + e.message);
  } finally {
    if (btnGuardar) { btnGuardar.disabled = false; btnGuardar.textContent = '💾 Guardar'; }
  }
}

function abrirEditBit(id) {
  const s = _bitCache.find(x => x.id == id);
  if (!s) { showToast('Recargue la página'); return; }
  $id('edit-bit-id').value    = id;
  $id('edit-bit-ini').value   = s.semana_inicio;
  $id('edit-bit-fin').value   = s.semana_fin;
  $id('edit-bit-obs').value   = s.observaciones_generales || '';
  openModal('modal-edit-bit');
}

async function guardarEditBit() {
  const id  = $id('edit-bit-id').value;
  const fd  = new FormData();
  fd.append('semana_inicio', $id('edit-bit-ini').value);
  fd.append('semana_fin',    $id('edit-bit-fin').value);
  fd.append('observaciones', $id('edit-bit-obs').value);
  const r = await fetch(`/api/bitacora/${id}`, { method: 'PUT', body: fd });
  if (r.ok) { closeModal('modal-edit-bit'); loadBit(); showToast('✓ Bitácora actualizada'); }
  else showToast('Error al actualizar');
}

async function borrarBit(id) {
  if (!confirm('¿Eliminar esta bitácora semanal? Se borrarán también las áreas e insumos registrados.')) return;
  const r = await api(`/api/bitacora/${id}`, { method: 'DELETE' });
  if (r.ok) { loadBit(); showToast('Bitácora eliminada'); }
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
  $id('avisos-list').innerHTML = av.map(a => {
    const tit = (a.titulo||'').replace(/'/g,"\\'");
    const cnt = (a.contenido||'').replace(/'/g,"\\'").replace(/\n/g,'\\n');
    return `
    <div class="aviso-card ${a.urgente ? 'urgente' : ''}">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:7px;flex-wrap:wrap;gap:7px">
        <div style="font-weight:600">${ti[a.tipo] || '📢'} ${a.autor}</div>
        <div style="display:flex;align-items:center;gap:8px">
          <div style="font-size:11px;color:var(--text3);font-family:'DM Mono',monospace">${a.created_at?.slice(0,10) || ''}</div>
          ${sesion?.rol === 'admin' ? `
            <button class="btn btn-o btn-sm" onclick="editAviso(${a.id},'${tit}','${cnt}','${a.tipo}')">✏️ Editar</button>
            <button class="btn btn-r btn-sm" onclick="delAviso(${a.id})">✕</button>` : ''}
        </div>
      </div>
      <div style="font-weight:600;margin-bottom:5px">${a.titulo}</div>
      <div style="font-size:13px;color:var(--text2);line-height:1.6">${a.contenido}</div>
    </div>`;
  }).join('');
  $id('bdg-av').textContent = av.length;
}

function editAviso(id, titulo, contenido, tipo) {
  $id('av-titulo').value  = titulo;
  $id('av-texto').value   = contenido.replace(/\\n/g, '\n');
  $id('av-tipo').value    = tipo;
  $id('av-edit-id').value = id;
  openModal('modal-aviso');
}

async function postAviso() {
  const editId = $id('av-edit-id')?.value;
  const body = {
    titulo:    $id('av-titulo').value,
    contenido: $id('av-texto').value,
    tipo:      $id('av-tipo').value,
    urgente:   $id('av-tipo').value === 'urgente',
    autor:     sesion?.nombre || 'Administración',
  };
  const url    = editId ? `/api/avisos/${editId}` : '/api/avisos';
  const method = editId ? 'PUT' : 'POST';
  const r = await api(url, { method, body: JSON.stringify(body) });
  if (r.ok) {
    if ($id('av-edit-id')) $id('av-edit-id').value = '';
    closeModal('modal-aviso');
    loadAvisos();
    showToast(editId ? '✓ Aviso actualizado' : '✓ Aviso publicado');
  }
}

async function delAviso(id) {
  if (!confirm('¿Eliminar aviso?')) return;
  await api(`/api/avisos/${id}`, { method: 'DELETE' });
  loadAvisos(); showToast('Aviso eliminado');
}

// ── MENSAJES ──────────────────────────────

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
  if (r.ok) { closeModal('modal-edit-condo'); loadCondosAdmin(); loadCuentas(); loadDeudores(); showToast('✓ Condómino actualizado'); }
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

