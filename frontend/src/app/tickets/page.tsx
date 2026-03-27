'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import AppShell from '@/components/AppShell';
import { Search, Clock, X, Check, ChevronRight, MapPin, Phone, Calendar, Package, DollarSign, Trash2 } from 'lucide-react';

type Extra  = { nombre: string; precio: number };
type Pedido = {
  id: string;
  codigo_ticket: string;
  cliente_nombre: string;
  cliente_telefono: string;
  cliente_direccion: string;
  cantidad_burritos: number;
  total: number;
  estado: string;
  dia_entrega: string;
  bloque_horario: string;
  ingredientes: string[];
  extras: Extra[];
  metodo_pago: string;
  fecha_pedido: string;
};

type DialogType = 'confirm' | 'ready' | 'deliver' | 'delete' | null;

/** Split ingredient array into per-burrito arrays.
 * 
 * - Modo 'different': el array contiene separadores '--- Burrito N'.
 *   Dividimos por esos marcadores.
 * - Modo 'same': el array tiene los ingredientes de UN solo burrito.
 *   Los repetimos para cada slot (todos son iguales).
 */
function splitIngredients(ingredientes: string[], cantidad: number): string[][] {
  if (!ingredientes?.length) return Array.from({ length: Math.max(cantidad, 1) }, () => []);
  if (cantidad <= 1) return [ingredientes];

  // Detectar modo 'different': el array contiene marcadores '--- Burrito N'
  const hasSeparators = ingredientes.some(i => i.startsWith('---'));

  if (hasSeparators) {
    // Dividir por marcadores
    const groups: string[][] = [];
    let current: string[] = [];
    for (const item of ingredientes) {
      if (item.startsWith('---')) {
        groups.push(current);
        current = [];
      } else {
        current.push(item);
      }
    }
    groups.push(current);
    return groups;
  }

  // Modo 'same': repetir la misma lista para cada burrito
  return Array.from({ length: cantidad }, () => [...ingredientes]);
}

export default function TicketsPage() {
  const router = useRouter();
  const [session, setSession]       = useState<any>(null);
  const [checking, setChecking]     = useState(true);
  const [pedidos, setPedidos]       = useState<Pedido[]>([]);
  const [search, setSearch]         = useState('');
  const [dayFilter, setDayFilter]   = useState<string | null>(null);
  const [detailTicket, setDetail]   = useState<Pedido | null>(null);
  const [dialog, setDialog]         = useState<{ type: Exclude<DialogType, null>; ticket: Pedido } | null>(null);
  const [working, setWorking]       = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.replace('/login');
      else { setSession(session); setChecking(false); }
    });
  }, [router]);

  const fetchPedidos = useCallback(async () => {
    const { data } = await supabase
      .from('pedidos').select('*')
      .in('estado', ['no_confirmado', 'pendiente', 'para_entregar'])
      .order('fecha_pedido', { ascending: true });
    if (data) setPedidos(data);
  }, []);

  useEffect(() => {
    if (!session) return;
    fetchPedidos();
    const sub = supabase.channel('pedidos_live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, () => fetchPedidos())
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [session, fetchPedidos]);

  const act = async (type: Exclude<DialogType, null>, ticket: Pedido) => {
    setWorking(true);
    // Optimistic: remove or update locally right away
    if (type === 'delete') {
      setPedidos(prev => prev.filter(p => p.id !== ticket.id));
    } else {
      const nextEstado = type === 'confirm' ? 'pendiente' : type === 'ready' ? 'para_entregar' : 'entregado';
      setPedidos(prev => prev.map(p => p.id === ticket.id ? { ...p, estado: nextEstado } : p));
    }
    setDialog(null);
    // Persist to DB
    if (type === 'confirm') await supabase.from('pedidos').update({ estado: 'pendiente' }).eq('id', ticket.id);
    else if (type === 'ready')   await supabase.from('pedidos').update({ estado: 'para_entregar' }).eq('id', ticket.id);
    else if (type === 'deliver') await supabase.from('pedidos').update({ estado: 'entregado' }).eq('id', ticket.id);
    else if (type === 'delete')  await supabase.from('pedidos').delete().eq('id', ticket.id);
    // Refetch to stay in sync
    await fetchPedidos();
    setWorking(false);
  };

  const openDialog = (type: Exclude<DialogType, null>, ticket: Pedido, e: React.MouseEvent) => {
    e.stopPropagation();
    setDetail(null);
    setDialog({ type, ticket });
  };

  if (checking) return null;

  const filtered = pedidos.filter(p => {
    const matchSearch =
      p.codigo_ticket?.toLowerCase().includes(search.toLowerCase()) ||
      p.cliente_nombre?.toLowerCase().includes(search.toLowerCase());
    const matchDay = !dayFilter || p.dia_entrega?.toUpperCase().includes(dayFilter.toUpperCase());
    return matchSearch && matchDay;
  });
  const byEstado = (e: string) => filtered.filter(p => p.estado === e);

  const DAY_FILTERS = ['VIERNES', 'SÁBADO', 'DOMINGO'];

  return (
    <AppShell user={session?.user}>
      {/* Topbar */}
      <div className="topbar">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="topbar-page-name">TICKETS</span>
            {pedidos.length > 0 && <span className="topbar-badge">{pedidos.length}</span>}
          </div>
          <span className="topbar-subtitle">Live Kitchen Monitor</span>
        </div>
        <div className="topbar-actions">
          {/* Day filter chips */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {(['TODOS', ...DAY_FILTERS]).map(day => {
              const active = day === 'TODOS' ? !dayFilter : dayFilter === day;
              return (
                <button
                  key={day}
                  onClick={() => setDayFilter(day === 'TODOS' ? null : day)}
                  style={{
                    padding: '5px 12px',
                    borderRadius: 4,
                    fontSize: '0.65rem',
                    fontWeight: 800,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    border: active ? 'none' : '1px solid rgba(255,255,255,0.1)',
                    background: active ? 'var(--accent)' : 'transparent',
                    color: active ? '#fff' : 'var(--text-dim)',
                  }}
                >
                  {day}
                </button>
              );
            })}
          </div>
          <div className="topbar-search">
            <Search size={14} color="var(--text-dim)" />
            <input placeholder="Buscar por ID o cliente..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Kanban */}
      <div className="page">
        <div className="kanban">
          <KanbanCol title="Por Confirmar" color="yellow" tickets={byEstado('no_confirmado')} onOpen={setDetail}
            actions={t => (
              <div style={{ display: 'flex', gap: 6, width: '100%' }}>
                <ActionBtn label="Rechazar"  icon={<X size={12} />}    danger onClick={e => openDialog('delete', t, e)} />
                <ActionBtn label="Confirmar" icon={<Check size={12} />} primary onClick={e => openDialog('confirm', t, e)} style={{ flex: 2 }} />
              </div>
            )}
          />
          <KanbanCol title="En Cocina" color="red" tickets={byEstado('pendiente')} onOpen={setDetail} variant="hot"
            actions={t => (
              <div style={{ display: 'flex', gap: 6, width: '100%' }}>
                <ActionBtn label="Cancelar"  icon={<Trash2 size={12} />}  danger onClick={e => openDialog('delete', t, e)} />
                <ActionBtn label="Listo"     icon={<Check size={12} />}   muted  onClick={e => openDialog('ready', t, e)} style={{ flex: 2 }} />
              </div>
            )}
          />
          <KanbanCol title="Para Entregar" color="green" tickets={byEstado('para_entregar')} onOpen={setDetail} variant="ready"
            actions={t => (
              <div style={{ display: 'flex', gap: 6, width: '100%' }}>
                <ActionBtn label="Cancelar"  icon={<Trash2 size={12} />}  danger  onClick={e => openDialog('delete', t, e)} />
                <ActionBtn label="Entregar"  icon={<Check size={12} />}   success onClick={e => openDialog('deliver', t, e)} style={{ flex: 2 }} />
              </div>
            )}
          />
        </div>
      </div>

      {/* ── Detail Modal ── */}
      {detailTicket && (
        <div className="modal-overlay" onClick={() => setDetail(null)}>
          <div className="modal-box" style={{ maxWidth: 520, maxHeight: '88vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <div style={{ fontFamily: 'Bebas Neue', fontSize: '1.6rem', color: 'var(--accent)', letterSpacing: '0.06em', lineHeight: 1 }}>
                  {detailTicket.codigo_ticket}
                </div>
                <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: 2 }}>
                  Detalle del Pedido
                </div>
              </div>
              <button onClick={() => setDetail(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', paddingTop: 4 }}>
                <X size={20} />
              </button>
            </div>

            {/* Info */}
            {[
              { icon: '🗓️', text: `Para entregar el: ${detailTicket.dia_entrega} (${detailTicket.bloque_horario})` },
              { icon: '👤', text: `Nombre: ${detailTicket.cliente_nombre}` },
              { icon: '📞', text: `Teléfono: ${detailTicket.cliente_telefono || '—'}` },
              { icon: '📍', text: `Dirección: ${detailTicket.cliente_direccion || '—'}` },
              { icon: '📦', text: `Cantidad: ${detailTicket.cantidad_burritos} burrito${detailTicket.cantidad_burritos > 1 ? 's' : ''}` },
            ].map(({ icon, text }, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 8, fontSize: '0.82rem', color: 'var(--text)', alignItems: 'flex-start' }}>
                <span style={{ flexShrink: 0 }}>{icon}</span>
                <span style={{ color: 'var(--text-muted)' }}>{text}</span>
              </div>
            ))}

            <div style={{ display: 'flex', gap: 10, marginBottom: 20, fontSize: '0.82rem' }}>
              <span>💵</span>
              <span style={{ color: 'var(--text-muted)' }}>Total a pagar: </span>
              <span style={{ fontFamily: 'Bebas Neue', fontSize: '1.1rem', color: 'var(--success)' }}>${Number(detailTicket.total).toFixed(2)}</span>
            </div>

            <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '4px 0 20px' }} />

            {/* Burritos */}
            {splitIngredients(detailTicket.ingredientes, detailTicket.cantidad_burritos).map((ings, idx) => (
              <div key={idx} style={{ marginBottom: 14 }}>
                <div style={{ fontFamily: 'Bebas Neue', fontSize: '0.9rem', color: 'var(--accent)', letterSpacing: '0.08em', marginBottom: 5 }}>
                  🌯 {detailTicket.cantidad_burritos === 1 ? 'Ingredientes:' : `Burrito ${idx + 1}:`}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.7, paddingLeft: 24 }}>
                  {ings.length > 0 ? ings.join(', ') + '.' : '—'}
                </div>
                {/* Extras only once (on single burrito or last) */}
                {idx === detailTicket.cantidad_burritos - 1 && detailTicket.extras?.length > 0 && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--warning)', paddingLeft: 24, marginTop: 4 }}>
                    ✨ Extras: {detailTicket.extras.map(e => `${e.nombre} (+$${Number(e.precio).toFixed(2)})`).join(', ')}
                  </div>
                )}
              </div>
            ))}



          </div>
        </div>
      )}

      {/* ── Confirm Dialog ── */}
      {dialog && <ConfirmDialog {...dialog} working={working} onCancel={() => setDialog(null)} onConfirm={() => act(dialog.type, dialog.ticket)} />}
    </AppShell>
  );
}

// ── KanbanCol ────────────────────────────────────────────────────────
function KanbanCol({ title, color, tickets, actions, onOpen, variant = 'default' }: {
  title: string; color: 'yellow'|'red'|'green'; tickets: Pedido[];
  actions: (t: Pedido) => React.ReactNode; onOpen: (t: Pedido) => void;
  variant?: 'default'|'hot'|'ready';
}) {
  const countColors = { yellow: 'var(--warning)', red: 'var(--accent)', green: 'var(--success)' };
  return (
    <div>
      <div className="kanban-col-header">
        <span className="kanban-col-title">{title}</span>
        <span className="kanban-col-count" style={{ color: countColors[color] }}>{tickets.length}</span>
      </div>
      <div className={`kanban-col-line ${color}`} />
      {tickets.length === 0
        ? <div style={{ color: 'var(--text-dim)', fontSize: '0.72rem', textAlign: 'center', padding: '40px 0', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600 }}>Sin Tickets</div>
        : tickets.map(p => {
            const burritos = splitIngredients(p.ingredientes, p.cantidad_burritos);
            return (
              <div key={p.id} className={`ticket-card ${variant}`} style={{ cursor: 'pointer' }} onClick={() => onOpen(p)}>
                <div className="ticket-header">
                  <span className="ticket-code">{p.codigo_ticket || '#----'}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="ticket-total">${Number(p.total).toFixed(2)}</span>
                    <ChevronRight size={13} color="var(--text-dim)" />
                  </div>
                </div>
                <div className="ticket-name">{p.cliente_nombre}</div>

                {burritos.map((ings, idx) => (
                  <div key={idx} style={{ marginBottom: 6 }}>
                    <div className="ticket-item-pill">
                      <span>{p.cantidad_burritos === 1 ? `${p.cantidad_burritos}x` : `${idx + 1}/${p.cantidad_burritos}`}</span>
                      🌯 BURRITO
                    </div>
                    <div className="ticket-ingredients" style={{ marginTop: 3 }}>
                      {ings.slice(0, 5).join(' · ')}{ings.length > 5 ? ` +${ings.length - 5}` : ''}
                    </div>
                  </div>
                ))}

                {p.extras?.length > 0 && (
                  <div style={{ fontSize: '0.65rem', color: 'var(--warning)', marginBottom: 6 }}>
                    ✨ {p.extras.map(e => e.nombre).join(', ')}
                  </div>
                )}

                <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 10, marginTop: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.63rem', color: 'var(--text-dim)', marginBottom: 8 }}>
                    <Clock size={11} /> {p.bloque_horario} · {p.dia_entrega}
                  </div>
                  {actions(p)}
                </div>
              </div>
            );
          })
      }
    </div>
  );
}

// ── ActionBtn ──────────────────────────────────────────────────
function ActionBtn({ label, icon, danger, primary, success, muted, onClick, style = {} }: {
  label: string; icon: React.ReactNode;
  danger?: boolean; primary?: boolean; success?: boolean; muted?: boolean;
  onClick: (e: React.MouseEvent) => void; style?: React.CSSProperties;
}) {
  const bg = danger ? 'transparent' : primary ? 'var(--accent)' : success ? 'var(--success)' : 'var(--surface-max)';
  const col = danger ? 'var(--danger)' : primary ? '#fff' : success ? '#111' : 'var(--text)';
  const border = danger ? '1px solid rgba(239,68,68,0.25)' : 'none';
  return (
    <button onClick={onClick} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '7px 10px', borderRadius: 4, background: bg, color: col, border, fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer', transition: 'all 0.15s', ...style }}>
      {icon} {label}
    </button>
  );
}

// ── ConfirmDialog ─────────────────────────────────────────────
const DIALOGS: Record<Exclude<DialogType, null>, { title: string; msg: string; btnLabel: string; btnBg: string; btnColor?: string }> = {
  confirm: { title: '¿Confirmar pedido?',   msg: 'Pasará a EN COCINA.',                          btnLabel: 'Sí, confirmar', btnBg: 'var(--accent)' },
  ready:   { title: '¿Marcar como listo?',  msg: 'Pasará a PARA ENTREGAR.',                       btnLabel: 'Sí, está listo', btnBg: 'var(--success)', btnColor: '#111' },
  deliver: { title: '¿Marcar como entregado?', msg: 'Se quitará del tablero y se registrará como venta.', btnLabel: 'Sí, entregar', btnBg: 'var(--success)', btnColor: '#111' },
  delete:  { title: '¿Eliminar este pedido?',  msg: 'Se eliminará permanentemente. Esta acción no se puede deshacer.', btnLabel: 'Sí, eliminar', btnBg: 'var(--danger)' },
};

function ConfirmDialog({ type, ticket, working, onCancel, onConfirm }: {
  type: Exclude<DialogType, null>; ticket: Pedido; working: boolean;
  onCancel: () => void; onConfirm: () => void;
}) {
  const cfg = DIALOGS[type];
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-box" style={{ maxWidth: 360 }} onClick={e => e.stopPropagation()}>
        <div style={{ fontFamily: 'Bebas Neue', fontSize: '1.1rem', letterSpacing: '0.06em', marginBottom: 6 }}>{cfg.title}</div>
        <div style={{ fontSize: '0.75rem', color: 'var(--accent)', fontWeight: 700, marginBottom: 6 }}>
          {ticket.codigo_ticket} — {ticket.cliente_nombre}
        </div>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 24, lineHeight: 1.5 }}>{cfg.msg}</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onCancel} disabled={working}>Cancelar</button>
          <button className="btn" style={{ flex: 1, background: cfg.btnBg, color: cfg.btnColor ?? '#fff' }} onClick={onConfirm} disabled={working}>
            {working ? 'Procesando...' : cfg.btnLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
