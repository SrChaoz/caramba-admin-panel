'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import AppShell from '@/components/AppShell';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { ChevronLeft, ChevronRight } from 'lucide-react';

type Pedido    = { id: string; total: number; estado: string; dia_entrega: string; cliente_nombre: string; codigo_ticket: string; cantidad_burritos: number; fecha_pedido: string; };
type Gasto     = { id: string; monto: number; pagado_de_caja: boolean; fecha: string; };
type NominaRow = { id: string; monto_pagado: number; fecha_pago: string; empleado_nombre: string; };

const PAGE_SIZE = 8;

function getMondayOf(d: Date) {
  const date = new Date(d);
  const day = date.getDay();
  date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day));
  return date.toISOString().slice(0, 10);
}
function getSundayOf(d: Date) {
  const mon = new Date(getMondayOf(d) + 'T12:00:00');
  mon.setDate(mon.getDate() + 6);
  return mon.toISOString().slice(0, 10);
}

export default function FinanzasPage() {
  const router = useRouter();
  const [session, setSession]   = useState<any>(null);
  const [checking, setChecking] = useState(true);

  const today = new Date();
  const [fechaDesde, setFechaDesde] = useState(getMondayOf(today));
  const [fechaHasta, setFechaHasta] = useState(getSundayOf(today));
  const [ticketPage, setTicketPage] = useState(0);

  const [allPedidos, setAllPedidos] = useState<Pedido[]>([]);
  const [allGastos,  setAllGastos]  = useState<Gasto[]>([]);
  const [allNomina,  setAllNomina]  = useState<NominaRow[]>([]);
  const [pedidos, setPedidos]       = useState<Pedido[]>([]);
  const [gastos,  setGastos]        = useState<Gasto[]>([]);
  const [nomina,  setNomina]        = useState<NominaRow[]>([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.replace('/login');
      else { setSession(session); setChecking(false); }
    });
  }, [router]);

  const loadAll = useCallback(async () => {
    const [{ data: p }, { data: g }, { data: n }] = await Promise.all([
      supabase.from('pedidos').select('*').eq('estado', 'entregado').order('fecha_pedido', { ascending: false }),
      supabase.from('gastos_inversion').select('*').order('fecha', { ascending: false }),
      supabase.from('nomina').select('*').order('fecha_pago', { ascending: false }),
    ]);
    if (p) setAllPedidos(p);
    if (g) setAllGastos(g);
    if (n) setAllNomina(n);
  }, []);

  useEffect(() => { if (session) loadAll(); }, [session, loadAll]);

  useEffect(() => {
    const desde = new Date(fechaDesde + 'T00:00:00');
    const hasta  = new Date(fechaHasta  + 'T23:59:59');
    setPedidos(allPedidos.filter(p => { const d = new Date(p.fecha_pedido); return d >= desde && d <= hasta; }));
    setGastos(allGastos.filter(g   => { const d = new Date(g.fecha + 'T12:00:00'); return d >= desde && d <= hasta; }));
    setNomina(allNomina.filter(n   => { const d = new Date(n.fecha_pago + 'T12:00:00'); return d >= desde && d <= hasta; }));
    setTicketPage(0);
  }, [fechaDesde, fechaHasta, allPedidos, allGastos, allNomina]);

  if (checking) return null;

  // Period metrics
  const totalVentas   = pedidos.reduce((s, p) => s + Number(p.total), 0);
  const totalGastos   = gastos.reduce((s, g) => s + Number(g.monto), 0);
  const totalNomina   = nomina.reduce((s, n) => s + Number(n.monto_pagado), 0);
  const gananciaBruta = totalVentas - totalGastos;

  // Historical metrics (all time)
  const histVentas        = allPedidos.reduce((s, p) => s + Number(p.total), 0);
  const histGastos        = allGastos.reduce((s, g) => s + Number(g.monto), 0);
  const acumuladoHistorico = histVentas - histGastos;
  const capitalEnCaja     = acumuladoHistorico; // mismo valor

  const noDataInPeriod = pedidos.length === 0 && gastos.length === 0 && nomina.length === 0;

  // Chart data
  const dias = ['VIERNES', 'SÁBADO', 'DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES'];
  const chartData = dias
    .map(dia => ({ dia: dia.slice(0, 3), ventas: pedidos.filter(p => (p.dia_entrega || '').toUpperCase() === dia).reduce((s, p) => s + Number(p.total), 0) }))
    .filter(d => d.ventas > 0);
  const maxVenta = Math.max(...chartData.map(d => d.ventas), 1);

  // Pagination
  const totalPages  = Math.ceil(pedidos.length / PAGE_SIZE);
  const pageTickets = pedidos.slice(ticketPage * PAGE_SIZE, (ticketPage + 1) * PAGE_SIZE);

  const shiftWeek = (n: number) => {
    const base = new Date(fechaDesde + 'T12:00:00');
    base.setDate(base.getDate() + n * 7);
    setFechaDesde(getMondayOf(base));
    setFechaHasta(getSundayOf(base));
  };

  const fmtDate = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: '2-digit' });

  const CustomTooltip = ({ active, payload }: any) =>
    active && payload?.length
      ? <div style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 6, padding: '8px 12px' }}>
          <div style={{ fontFamily: 'Bebas Neue', fontSize: '1.1rem', color: '#fff' }}>${Number(payload[0].value).toFixed(2)}</div>
        </div>
      : null;

  return (
    <AppShell user={session?.user}>
      {/* ── Topbar: solo title + period picker ── */}
      <div className="topbar" style={{ gap: 16 }}>
        <span className="topbar-page-name" style={{ color: 'var(--accent)' }}>FINANZAS</span>

        {/* Period picker — visible y bien proporcionado */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, background: 'var(--surface-hi)', borderRadius: 8 }}>
          <button
            onClick={() => shiftWeek(-1)}
            style={{ background: 'var(--surface-max)', border: 'none', color: 'var(--text)', cursor: 'pointer', padding: '10px 14px', borderRadius: '8px 0 0 8px', display: 'flex', alignItems: 'center' }}
          >
            <ChevronLeft size={16} />
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 12px' }}>
            <span style={{ fontSize: '0.6rem', color: 'var(--text-dim)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', flexShrink: 0 }}>Período</span>
            <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)}
              style={{ background: 'transparent', border: 'none', color: 'var(--text)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', outline: 'none', width: 112 }} />
            <span style={{ color: 'var(--text-dim)', fontWeight: 700 }}>→</span>
            <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)}
              style={{ background: 'transparent', border: 'none', color: 'var(--text)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', outline: 'none', width: 112 }} />
          </div>

          <button
            onClick={() => shiftWeek(1)}
            style={{ background: 'var(--surface-max)', border: 'none', color: 'var(--text)', cursor: 'pointer', padding: '10px 14px', display: 'flex', alignItems: 'center' }}
          >
            <ChevronRight size={16} />
          </button>
          <button
            onClick={() => { setFechaDesde(getMondayOf(new Date())); setFechaHasta(getSundayOf(new Date())); }}
            style={{ background: 'var(--accent)', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.08em', padding: '10px 14px', borderRadius: '0 8px 8px 0', textTransform: 'uppercase', whiteSpace: 'nowrap' }}
          >
            Esta semana
          </button>
        </div>
      </div>

      <div className="page" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* ── 6 metric cards: 4 del período + 2 globales ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {/* Period */}
          <MetricCard label="Total Ventas"        value={`$${totalVentas.toFixed(2)}`}    sub={`${pedidos.length} pedidos entregados`} />
          <MetricCard label="Inversión / Gastos"  value={`-$${totalGastos.toFixed(2)}`}   sub={`${gastos.length} registros`} negative />
          <MetricCard label="Ganancia Bruta"       value={`$${gananciaBruta.toFixed(2)}`}  highlight positive={gananciaBruta >= 0} />
          <MetricCard label="Retiros / Nómina"    value={`-$${totalNomina.toFixed(2)}`}   sub={`${nomina.length} pagos`} negative />
          {/* Historical — always visible */}
          <MetricCard label="Acumulado Histórico" value={`$${acumuladoHistorico.toFixed(2)}`} sub="Toda la historia del negocio" globalBadge />
          <MetricCard label="Capital en Caja"     value={`$${capitalEnCaja.toFixed(2)}`}   sub="Disponible para reinvertir" globalBadge positive={capitalEnCaja >= 0} />
        </div>

        {/* ── Empty state ── */}
        {noDataInPeriod && (
          <div className="card" style={{ padding: 40, textAlign: 'center' }}>
            <div style={{ fontFamily: 'Bebas Neue', fontSize: '1.4rem', color: 'var(--text-dim)', letterSpacing: '0.1em', marginBottom: 8 }}>
              SIN MOVIMIENTOS EN ESTE PERÍODO
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: 20 }}>
              {fmtDate(fechaDesde)} → {fmtDate(fechaHasta)}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, maxWidth: 400, margin: '0 auto' }}>
              <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '14px 18px', textAlign: 'left' }}>
                <div style={{ fontSize: '0.55rem', color: 'var(--text-dim)', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Total pedidos (hist.)</div>
                <div style={{ fontFamily: 'Bebas Neue', fontSize: '1.8rem', marginTop: 2 }}>{allPedidos.length}</div>
              </div>
              <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '14px 18px', textAlign: 'left' }}>
                <div style={{ fontSize: '0.55rem', color: 'var(--text-dim)', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Ventas (hist.)</div>
                <div style={{ fontFamily: 'Bebas Neue', fontSize: '1.8rem', marginTop: 2, color: 'var(--success)' }}>${histVentas.toFixed(2)}</div>
              </div>
            </div>
            <button
              onClick={() => { setFechaDesde(getMondayOf(new Date())); setFechaHasta(getSundayOf(new Date())); }}
              className="btn btn-primary"
              style={{ marginTop: 20 }}
            >
              Ver semana actual
            </button>
          </div>
        )}

        {/* ── Chart ── */}
        {chartData.length > 0 && (
          <div className="card" style={{ padding: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
              <div>
                <div style={{ fontFamily: 'Bebas Neue', fontSize: '1.2rem', letterSpacing: '0.06em' }}>VENTAS POR DÍA</div>
                <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 2 }}>
                  {fmtDate(fechaDesde)} → {fmtDate(fechaHasta)}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.6rem', color: 'var(--accent)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Promedio Diario</div>
                <div style={{ fontFamily: 'Bebas Neue', fontSize: '1.5rem' }}>${(totalVentas / Math.max(chartData.length, 1)).toFixed(2)}</div>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartData} barSize={40}>
                <XAxis dataKey="dia" axisLine={false} tickLine={false} tick={{ fill: '#444', fontSize: 11, fontWeight: 700 }} />
                <YAxis hide />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.02)' }} />
                <Bar dataKey="ventas" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.ventas === maxVenta ? '#CC0000' : '#2a2a2a'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* ── Ticket history with pagination ── */}
        {pedidos.length > 0 && (
          <div className="card" style={{ padding: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ fontFamily: 'Bebas Neue', fontSize: '1.2rem', letterSpacing: '0.06em' }}>
                HISTORIAL DE TICKETS
                <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontFamily: 'Inter', fontWeight: 600, marginLeft: 8 }}>
                  ({pedidos.length} resultados)
                </span>
              </div>
              {/* Pagination controls */}
              {totalPages > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    onClick={() => setTicketPage(p => Math.max(0, p - 1))}
                    disabled={ticketPage === 0}
                    className="btn btn-secondary btn-icon"
                    style={{ opacity: ticketPage === 0 ? 0.3 : 1 }}
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, minWidth: 60, textAlign: 'center' }}>
                    {ticketPage + 1} / {totalPages}
                  </span>
                  <button
                    onClick={() => setTicketPage(p => Math.min(totalPages - 1, p + 1))}
                    disabled={ticketPage >= totalPages - 1}
                    className="btn btn-secondary btn-icon"
                    style={{ opacity: ticketPage >= totalPages - 1 ? 0.3 : 1 }}
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              )}
            </div>

            <table className="finance-table">
              <thead>
                <tr>
                  <th>ID Ticket</th>
                  <th>Cliente</th>
                  <th>Pedido</th>
                  <th>Día</th>
                  <th style={{ textAlign: 'right' }}>Monto</th>
                </tr>
              </thead>
              <tbody>
                {pageTickets.map(p => (
                  <tr key={p.id}>
                    <td style={{ fontFamily: 'Bebas Neue', fontSize: '1rem', color: 'var(--accent)' }}>{p.codigo_ticket}</td>
                    <td style={{ fontWeight: 500 }}>{p.cliente_nombre}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{p.cantidad_burritos}x Burrito</td>
                    <td><span className="chip chip-day">{(p.dia_entrega || '—').slice(0, 3)}</span></td>
                    <td style={{ textAlign: 'right', fontFamily: 'Bebas Neue', fontSize: '1.1rem' }}>${Number(p.total).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Page footer */}
            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                {Array.from({ length: totalPages }, (_, i) => (
                  <button
                    key={i}
                    onClick={() => setTicketPage(i)}
                    style={{
                      width: 28, height: 28, borderRadius: 4,
                      background: i === ticketPage ? 'var(--accent)' : 'var(--surface-max)',
                      border: 'none', color: '#fff', cursor: 'pointer',
                      fontSize: '0.7rem', fontWeight: 700,
                    }}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function MetricCard({ label, value, sub, negative, highlight, positive, globalBadge }: {
  label: string; value: string; sub?: string; negative?: boolean; highlight?: boolean; positive?: boolean; globalBadge?: boolean;
}) {
  return (
    <div className={`metric-card ${highlight ? 'highlight' : ''}`} style={globalBadge ? { borderTop: '2px solid var(--accent-dark)', opacity: 0.9 } : {}}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div className="metric-label">{label}</div>
        {globalBadge && (
          <span style={{ fontSize: '0.5rem', background: 'rgba(204,0,0,0.15)', color: 'var(--accent)', padding: '2px 6px', borderRadius: 3, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', border: '1px solid rgba(204,0,0,0.2)' }}>
            GLOBAL
          </span>
        )}
      </div>
      <div className={`metric-value ${negative ? 'negative' : ''} ${globalBadge && positive !== undefined ? (positive ? 'positive' : 'negative') : ''} ${highlight && positive !== undefined ? (positive ? 'positive' : 'negative') : ''}`}>
        {value}
      </div>
      {sub && <div className="metric-sub">{sub}</div>}
    </div>
  );
}
