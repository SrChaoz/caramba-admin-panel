'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import AppShell from '@/components/AppShell';
import { X, CheckCircle2, DollarSign, Trash2 } from 'lucide-react';
import { generateTicketCanvas } from '@/lib/TicketGenerator';
import { printerInstance } from '@/lib/printer';

type PedidoItem = { id: string; producto_nombre: string; cantidad: number; subtotal: number; nota: string|null; };
type Pedido     = { id: string; codigo_ticket: string; total: number; estado: string; fecha_pedido: string; pedido_items: PedidoItem[]; };
type Mesa       = { id: number; nombre: string; estado: 'libre'|'ocupada'|'por_cobrar'; orden: number };

const S = {
  overlay: (): React.CSSProperties => ({ position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', zIndex:200, display:'flex', alignItems:'flex-end' }),
  sheet:   (): React.CSSProperties => ({ width:'100%', maxHeight:'92dvh', background:'var(--surface)', borderRadius:'20px 20px 0 0', overflowY:'auto', padding:'0 0 env(safe-area-inset-bottom)' }),
  pill:    (): React.CSSProperties => ({ width:40, height:4, borderRadius:99, background:'rgba(255,255,255,0.15)', margin:'12px auto 20px' }),
};

export default function AdminMesasPage() {
  const router = useRouter();
  const [checking,  setChecking]  = useState(true);
  const [session,   setSession]   = useState<any>(null);
  const [mesas,     setMesas]     = useState<Mesa[]>([]);
  const [pedidos,   setPedidos]   = useState<Record<number, Pedido[]>>({});
  const [selected,  setSelected]  = useState<Mesa|null>(null);
  const [loading,   setLoading]   = useState(true);
  const [acting,    setActing]    = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.replace('/login');
      else { setSession(session); setChecking(false); }
    });
  }, [router]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const { data: mesasData } = await supabase
      .from('mesas').select('*').eq('activa', true).order('orden');
    setMesas((mesasData||[]) as Mesa[]);

    // Cargar pedidos activos por mesa
    const map: Record<number, Pedido[]> = {};
    await Promise.all((mesasData||[]).map(async (m: Mesa) => {
      const { data } = await supabase
        .from('pedidos')
        .select('id,codigo_ticket,total,estado,fecha_pedido,pedido_items(id,producto_nombre,cantidad,subtotal,nota)')
        .eq('canal','mesa').eq('mesa_id', m.id)
        .not('estado','in','(cobrado,cancelado)')
        .order('fecha_pedido', { ascending: true });
      map[m.id] = (data||[]) as Pedido[];
    }));
    setPedidos(map);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (checking) return;
    loadAll();
    const ch = supabase.channel('admin_mesas')
      .on('postgres_changes', { event:'*', schema:'public', table:'pedidos' }, loadAll)
      .on('postgres_changes', { event:'*', schema:'public', table:'mesas' }, loadAll)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [checking, loadAll]);

  const marcarListo = async (pedidoId: string) => {
    await supabase.from('pedidos').update({ estado:'para_entregar' }).eq('id', pedidoId);
    if (selected) {
      const { data } = await supabase
        .from('pedidos')
        .select('id,codigo_ticket,total,estado,fecha_pedido,pedido_items(id,producto_nombre,cantidad,subtotal,nota)')
        .eq('canal','mesa').eq('mesa_id', selected.id)
        .not('estado','in','(cobrado,cancelado)')
        .order('fecha_pedido', { ascending:true });
      setPedidos(prev => ({ ...prev, [selected.id]: (data||[]) as Pedido[] }));
    }
  };

  const eliminarItem = async (itemId: string, pedidoId: string) => {
    if (!confirm('¿Eliminar este ítem del pedido?')) return;
    await supabase.from('pedido_items').delete().eq('id', itemId);
    // Recalcular total del pedido
    const { data: items } = await supabase.from('pedido_items').select('subtotal').eq('pedido_id', pedidoId);
    const newTotal = (items||[]).reduce((a:number,i:any)=>a+Number(i.subtotal),0);
    await supabase.from('pedidos').update({ total: newTotal }).eq('id', pedidoId);
    if (selected) {
      const { data } = await supabase
        .from('pedidos')
        .select('id,codigo_ticket,total,estado,fecha_pedido,pedido_items(id,producto_nombre,cantidad,subtotal,nota)')
        .eq('canal','mesa').eq('mesa_id', selected.id)
        .not('estado','in','(cobrado,cancelado)')
        .order('fecha_pedido', { ascending:true });
      setPedidos(prev => ({ ...prev, [selected.id]: (data||[]) as Pedido[] }));
    }
  };

  const cobrarMesa = async () => {
    if (!selected) return;
    if (!confirm(`¿Marcar ${selected.nombre} como cobrada y liberarla?`)) return;
    setActing(true);
    const mesaPedidos = pedidos[selected.id] || [];
    
    // Obtener caja abierta para asociar la venta
    const { data: sData } = await supabase.from('sesiones_caja').select('id').eq('estado', 'ABIERTA').maybeSingle();

    // Marcar todos los pedidos como cobrado y asociarlos a la caja
    await Promise.all(mesaPedidos.map(p => supabase.from('pedidos').update({ estado:'cobrado', sesion_caja_id: sData ? sData.id : null }).eq('id', p.id)));
    // Liberar mesa
    await supabase.from('mesas').update({ estado:'libre', carrito: [] }).eq('id', selected.id);
    // Generar ticket resumen si hay impresora
    if (printerInstance.isConnected() && session) {
      try {
        const total = mesaPedidos.reduce((a,p)=>a+Number(p.total),0);
        const payload = {
          id: crypto.randomUUID(), codigo_ticket: `CUENTA-${selected.nombre}`,
          canal: 'mesa', mesa_id: selected.id, mesero_id: session.user.id,
          cliente_nombre: selected.nombre, cliente_telefono:'', cliente_direccion:'',
          dia_entrega: new Date().toLocaleDateString('es-EC',{weekday:'long'}),
          bloque_horario: new Date().toLocaleTimeString('es-EC',{hour:'2-digit',minute:'2-digit'}),
          cantidad_burritos: mesaPedidos.reduce((a,p)=>a+p.pedido_items.length,0),
          total, ingredientes: [], extras: [], estado:'cobrado', metodo_pago:'Efectivo',
        };
        const cv = await generateTicketCanvas(payload as any);
        await printerInstance.printCanvas(cv);
      } catch {}
    }
    setActing(false);
    setSelected(null);
    await loadAll();
  };

  const cancelarMesa = async () => {
    if (!selected) return;
    if (!confirm(`¿Estás seguro de CANCELAR toda la mesa ${selected.nombre}? Esto anulará todos los pedidos de la mesa y la dejará libre.`)) return;
    setActing(true);
    const mesaPedidos = pedidos[selected.id] || [];
    // Marcar todos los pedidos como cancelado
    await Promise.all(mesaPedidos.map(p => supabase.from('pedidos').update({ estado:'cancelado' }).eq('id', p.id)));
    // Liberar mesa
    await supabase.from('mesas').update({ estado:'libre', carrito: [] }).eq('id', selected.id);
    
    setActing(false);
    setSelected(null);
    await loadAll();
  };

  const crearMesa = async () => {
    const nombre = prompt('Ingresa el nombre de la nueva mesa (Ej: Mesa 10):');
    if (!nombre) return;
    setActing(true);
    const { data: countData } = await supabase.from('mesas').select('id', { count: 'exact' });
    const orden = (countData?.length || 0) + 1;
    await supabase.from('mesas').insert({
      nombre,
      estado: 'libre',
      activa: true,
      orden,
      carrito: []
    });
    setActing(false);
    await loadAll();
  };

  const selectedPedidos = selected ? (pedidos[selected.id]||[]) : [];
  const selectedTotal   = selectedPedidos.reduce((a,p)=>a+Number(p.total),0);

  if (checking) return null;

  return (
    <AppShell user={session?.user}>
      <div className="topbar">
        <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
          <span className="topbar-page-name uppercase">Panel de Mesas</span>
          <span className="topbar-subtitle">Gestión en tiempo real de mesas.</span>
        </div>
        <button onClick={crearMesa} disabled={acting} style={{ background:'var(--accent)', border:'none', color:'#fff', padding:'8px 16px', borderRadius:99, fontWeight:800, fontSize:'0.85rem', cursor:acting?'not-allowed':'pointer' }}>
          + Nueva Mesa
        </button>
      </div>

      <div className="page" style={{ maxWidth:900 }}>
        {loading && <div style={{ color:'var(--text-dim)', padding:20 }}>Cargando…</div>}

        {!loading && mesas.length === 0 && (
          <div className="card" style={{ padding:40, textAlign:'center', color:'var(--text-dim)' }}>
            <div style={{ fontSize:'2.5rem', marginBottom:12 }}>🍽️</div>
            <div style={{ fontWeight:800 }}>No hay mesas ocupadas en este momento.</div>
            <div style={{ fontSize:'0.8rem', marginTop:6 }}>Cuando un mesero tome un pedido, aparecerá aquí.</div>
          </div>
        )}

        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px,1fr))', gap:16 }}>
          {mesas.map(mesa => {
            const mesaPeds  = pedidos[mesa.id] || [];
            const total     = mesaPeds.reduce((a,p)=>a+Number(p.total),0);
            const isOcupada = mesa.estado === 'ocupada';
            const isLibre   = mesa.estado === 'libre';
            const borderColor = isLibre ? 'rgba(255,255,255,0.1)' : (isOcupada ? 'rgba(234,179,8,0.35)' : 'rgba(34,197,94,0.35)');
            const bgColor     = isLibre ? 'var(--surface-max)' : (isOcupada ? 'rgba(234,179,8,0.06)' : 'rgba(34,197,94,0.06)');
            const textColor   = isLibre ? 'var(--text-dim)' : (isOcupada ? '#fbbf24' : '#4ade80');

            return (
              <button key={mesa.id} onClick={() => !isLibre && setSelected(mesa)} style={{ padding:20, borderRadius:16, border:`2px solid ${borderColor}`, background:bgColor, cursor:isLibre?'default':'pointer', textAlign:'left', display:'flex', flexDirection:'column', gap:8, opacity:isLibre?0.6:1 }}>
                <div style={{ fontFamily:'Bebas Neue', fontSize:'1.5rem', color:textColor, letterSpacing:'0.06em' }}>{mesa.nombre}</div>
                <div style={{ fontSize:'0.65rem', fontWeight:900, color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'0.1em' }}>
                  {isLibre ? '⚪ Disponible' : (isOcupada ? '⏳ En atención' : '💰 Por cobrar')}
                </div>
                {!isLibre && (
                  <>
                    <div style={{ fontSize:'0.8rem', color:'var(--text-dim)' }}>{mesaPeds.length} ronda{mesaPeds.length!==1?'s':''}</div>
                    <div style={{ fontFamily:'Bebas Neue', fontSize:'1.6rem', color:'var(--text)' }}>${total.toFixed(2)}</div>
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── SHEET detalle de mesa ── */}
      {selected && (
        <div style={S.overlay()} onClick={e => e.target===e.currentTarget && setSelected(null)}>
          <div style={S.sheet()}>
            <div style={S.pill()}/>
            <div style={{ padding:'0 20px 28px' }}>

              {/* Header */}
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
                <div>
                  <div style={{ fontFamily:'Bebas Neue', fontSize:'1.5rem', letterSpacing:'0.06em' }}>{selected.nombre}</div>
                  <div style={{ fontSize:'0.7rem', color:'var(--text-dim)', marginTop:2 }}>{selectedPedidos.length} ronda(s) · Total: <strong style={{ color:'var(--success)' }}>${selectedTotal.toFixed(2)}</strong></div>
                </div>
                <button onClick={() => setSelected(null)} style={{ background:'var(--surface-max)', border:'none', color:'var(--text-dim)', borderRadius:99, padding:8, cursor:'pointer' }}>
                  <X size={18}/>
                </button>
              </div>

              {/* Rondas con gestión */}
              <div style={{ maxHeight:'50dvh', overflowY:'auto', display:'flex', flexDirection:'column', gap:12, marginBottom:20 }}>
                {selectedPedidos.map((p, idx) => (
                  <div key={p.id} style={{ borderRadius:12, border:`1px solid ${p.estado==='para_entregar'?'rgba(34,197,94,0.3)':'rgba(255,255,255,0.08)'}`, overflow:'hidden' }}>
                    {/* Cabecera de ronda */}
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 14px', background: p.estado==='para_entregar'?'rgba(34,197,94,0.08)':'var(--surface-max)' }}>
                      <div style={{ fontWeight:900, fontSize:'0.78rem', color:'var(--text-dim)' }}>RONDA {idx+1} · {p.codigo_ticket}</div>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <span style={{ fontFamily:'Bebas Neue', fontSize:'1rem', color:'var(--accent)' }}>${Number(p.total).toFixed(2)}</span>
                        {p.estado==='pendiente' && (
                          <button onClick={() => marcarListo(p.id)} style={{ display:'flex', alignItems:'center', gap:4, padding:'4px 10px', borderRadius:99, background:'rgba(34,197,94,0.15)', border:'1px solid rgba(34,197,94,0.3)', color:'#4ade80', fontWeight:900, fontSize:'0.65rem', cursor:'pointer' }}>
                            <CheckCircle2 size={12}/> Listo
                          </button>
                        )}
                        {p.estado==='para_entregar' && <span style={{ fontSize:'0.65rem', fontWeight:900, color:'#4ade80' }}>✅ Listo</span>}
                      </div>
                    </div>
                    {/* Items */}
                    <div style={{ padding:'8px 14px', display:'flex', flexDirection:'column', gap:6 }}>
                      {(p.pedido_items||[]).map(item => (
                        <div key={item.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:'0.82rem' }}>
                          <div style={{ flex:1 }}>
                            <span style={{ color:'var(--text)' }}>× {item.cantidad} <strong>{item.producto_nombre}</strong></span>
                            {item.nota && <div style={{ fontSize:'0.7rem', color:'var(--text-dim)' }}>Nota: {item.nota}</div>}
                          </div>
                          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                            <span style={{ color:'var(--text-dim)' }}>${Number(item.subtotal).toFixed(2)}</span>
                            <button onClick={() => eliminarItem(item.id, p.id)} style={{ background:'rgba(204,0,0,0.1)', border:'none', borderRadius:99, width:26, height:26, color:'var(--danger)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }} title="Eliminar ítem">
                              <Trash2 size={12}/>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Total y cobrar */}
              <div style={{ borderTop:'2px solid rgba(255,255,255,0.08)', paddingTop:16, display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
                <span style={{ fontWeight:900, fontSize:'0.9rem', letterSpacing:'0.06em' }}>TOTAL A COBRAR</span>
                <span style={{ fontFamily:'Bebas Neue', fontSize:'2.2rem', color:'var(--success)' }}>${selectedTotal.toFixed(2)}</span>
              </div>
              <button onClick={cobrarMesa} disabled={acting} style={{ width:'100%', padding:18, borderRadius:14, background:'rgba(34,197,94,0.15)', border:'2px solid rgba(34,197,94,0.35)', color:'#4ade80', fontWeight:900, fontSize:'1.05rem', cursor:acting?'not-allowed':'pointer', letterSpacing:'0.04em', display:'flex', alignItems:'center', justifyContent:'center', gap:10 }}>
                <DollarSign size={20}/>{acting ? 'Procesando…' : `COBRAR MESA · $${selectedTotal.toFixed(2)}`}
              </button>

              <button onClick={cancelarMesa} disabled={acting} style={{ width:'100%', padding:14, marginTop:10, borderRadius:14, background:'transparent', border:'1px solid rgba(204,0,0,0.3)', color:'var(--danger)', fontWeight:800, fontSize:'0.9rem', cursor:acting?'not-allowed':'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                <Trash2 size={16}/> Cancelar Mesa (Error)
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
