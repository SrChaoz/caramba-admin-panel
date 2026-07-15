'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Plus, Minus, X, ChevronUp, ChevronDown, ShoppingBag, Trash2 } from 'lucide-react';
import { printerInstance } from '@/lib/printer';
import { generateTicketCanvas } from '@/lib/TicketGenerator';

type Producto   = { id: string; nombre: string; descripcion: string | null; precio_base: number; tipo: 'configurable'|'simple'|'bebida'; emoji: string; categoria_plato: string; activo: boolean; visible_mesero: boolean; };
type Categoria  = { id: number; nombre: string; orden: number };
type MenuCat    = { id: string; producto_id: string; nombre: string; es_requerido: boolean; orden: number };
type Topping    = { id: string; categoria_id: string; nombre: string; emoji: string; precio_extra: number; };
type CartItem   = { instanceId: string; productoId: string; nombre: string; emoji: string; tipo: string; toppings: string[]; nota: string; precio: number; subtotal: number; };
type PedidoItem = { id: string; producto_nombre: string; cantidad: number; subtotal: number; nota: string|null; };
type Pedido     = { id: string; codigo_ticket: string; total: number; estado: string; pedido_items: PedidoItem[]; };
type Mesa       = { id: number; nombre: string; estado: string; carrito?: CartItem[] };

function uid() { return Math.random().toString(36).slice(2, 10); }
const S = {
  overlay: (): React.CSSProperties => ({ position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', zIndex:200, display:'flex', alignItems:'flex-end' }),
  sheet:   (): React.CSSProperties => ({ width:'100%', maxHeight:'92dvh', background:'var(--surface)', borderRadius:'20px 20px 0 0', overflowY:'auto', padding:'0 0 env(safe-area-inset-bottom)' }),
  pill:    (): React.CSSProperties => ({ width:40, height:4, borderRadius:99, background:'rgba(255,255,255,0.15)', margin:'12px auto 20px' }),
  qtyBtn:  (): React.CSSProperties => ({ width:48, height:48, borderRadius:99, border:'none', background:'var(--surface-max)', color:'var(--text)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.2rem' }),
};

export default function MesaMenuPage() {
  const router   = useRouter();
  const params   = useParams();
  const mesaId   = Number(params.mesaId);

  const [session,    setSession]    = useState<any>(null);
  const [checking,   setChecking]   = useState(true);
  const [mesa,       setMesa]       = useState<Mesa|null>(null);
  const [productos,  setProductos]  = useState<Producto[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [menuCats,   setMenuCats]   = useState<MenuCat[]>([]);
  const [toppings,   setToppings]   = useState<Topping[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [tab,        setTab]        = useState('todos');
  const [cart,       setCart]       = useState<CartItem[]>([]);
  const [pedidos,    setPedidos]    = useState<Pedido[]>([]);
  const [cartOpen,   setCartOpen]   = useState(false); // <--- Controla si el carrito está expandido
  const [modal,      setModal]      = useState<Producto|null>(null);
  const [modalQty,   setModalQty]   = useState(1);
  const [modalTops,  setModalTops]  = useState<string[]>([]);
  const [modalNota,  setModalNota]  = useState('');
  const [saving,     setSaving]     = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.replace('/login');
      else { setSession(session); setChecking(false); }
    });
  }, [router]);

  // Se eliminó la lógica de localStorage para usar la BD

  const loadPedidos = useCallback(async () => {
    const { data } = await supabase
      .from('pedidos')
      .select('id,codigo_ticket,total,estado,pedido_items(id,producto_nombre,cantidad,subtotal,nota)')
      .eq('canal','mesa').eq('mesa_id', mesaId)
      .not('estado','in','(cobrado,cancelado)')
      .order('fecha_pedido', { ascending: true });
    setPedidos((data || []) as Pedido[]);
    if ((data||[]).length > 0) {
      await supabase.from('mesas').update({ estado:'ocupada' }).eq('id', mesaId);
    }
  }, [mesaId]);

  useEffect(() => {
    if (checking || !mesaId) return;
    (async () => {
      setLoading(true);
      const [mR, pR, cR, mcR, tR] = await Promise.all([
        supabase.from('mesas').select('id,nombre,estado,carrito').eq('id', mesaId).single(),
        supabase.from('menu_productos').select('*').eq('activo',true).eq('visible_mesero',true).order('orden'),
        supabase.from('categorias_plato').select('*').order('orden'),
        supabase.from('menu_categorias').select('*').order('orden'),
        supabase.from('menu_toppings').select('*').eq('disponible',true).order('orden'),
      ]);
      setMesa(mR.data);
      if (mR.data?.carrito) setCart(mR.data.carrito);
      setProductos(pR.data || []);
      setCategorias(cR.data || []);
      setMenuCats(mcR.data || []);
      setToppings((tR.data||[]).map((t:any) => ({ id:t.id, categoria_id:t.categoria_id, nombre:t.nombre, emoji:t.emoji||'', precio_extra:Number(t.precio_extra??0) })));
      setLoading(false);
    })();
    loadPedidos();

    const ch = supabase.channel(`mesero_mesa_${mesaId}`)
      .on('postgres_changes', { event:'*', schema:'public', table:'pedidos', filter:`mesa_id=eq.${mesaId}` }, loadPedidos)
      .on('postgres_changes', { event:'*', schema:'public', table:'pedido_items' }, loadPedidos)
      .on('postgres_changes', { event:'*', schema:'public', table:'mesas', filter:`id=eq.${mesaId}` }, loadPedidos)
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [checking, mesaId, loadPedidos]);

  const calcSub = (p: Producto, tIds: string[], qty: number) => {
    const catIds = menuCats.filter(c => c.producto_id === p.id).map(c => c.id);
    const extra  = toppings.filter(t => catIds.includes(t.categoria_id) && tIds.includes(t.id)).reduce((a,t) => a + t.precio_extra, 0);
    return (p.precio_base + extra) * qty;
  };

  const openModal = (p: Producto) => { setModal(p); setModalQty(1); setModalTops([]); setModalNota(''); };
  const closeModal = () => setModal(null);
  const toggleTop = (id: string) => setModalTops(prev => prev.includes(id) ? prev.filter(t=>t!==id) : [...prev, id]);

  const addToCart = async () => {
    if (!modal) return;
    const sub = calcSub(modal, modalTops, modalQty);
    const newItems = [];
    for (let i = 0; i < modalQty; i++) {
      newItems.push({ instanceId:uid(), productoId:modal.id, nombre:modal.nombre, emoji:modal.emoji, tipo:modal.tipo, toppings:modalTops, nota:modalNota, precio:modal.precio_base, subtotal: sub/modalQty });
    }
    const newCart = [...cart, ...newItems];
    setCart(newCart);
    await supabase.from('mesas').update({ estado:'ocupada', carrito: newCart }).eq('id', mesaId);
    closeModal();
    setCartOpen(true); // Auto-expandir cuando agregas algo nuevo
  };

  const cartSubtotal = cart.reduce((a,i) => a+i.subtotal, 0);
  const pedidosSubtotal = pedidos.reduce((a,p) => a+Number(p.total), 0);
  const totalMesa = pedidosSubtotal + cartSubtotal;
  const itemsEnCocina = pedidos.reduce((acc, p) => acc + (p.pedido_items?.length || 0), 0);

  const handleConfirm = async () => {
    if (!cart.length || !mesa || !session) return;
    setSaving(true);
    const { data: caja } = await supabase.from('sesiones_caja').select('id').eq('estado','ABIERTA').maybeSingle();
    const pedidoId = crypto.randomUUID();
    const codigo   = `M${mesa.id}-${Date.now().toString(36).toUpperCase().slice(-4)}`;
    const allIngs: string[] = [];
    const allExtras: { nombre: string; precio: number }[] = [];
    cart.forEach((item, idx) => {
      if (idx>0) allIngs.push('---');
      const topNames = item.toppings.map(tid => toppings.find(t=>t.id===tid)?.nombre||tid);
      allIngs.push(item.nombre);
      allIngs.push(...topNames);
      if (item.nota) allIngs.push(`Nota: ${item.nota}`);
      item.toppings.forEach(tid => { const t=toppings.find(tp=>tp.id===tid); if(t&&t.precio_extra>0) allExtras.push({ nombre:`Extra: ${t.nombre}`, precio:t.precio_extra }); });
    });
    const payload = { id:pedidoId, codigo_ticket:codigo, canal:'mesa', mesa_id:mesa.id, mesero_id:session.user.id, cliente_nombre:mesa.nombre, cliente_telefono:'', cliente_direccion:'', dia_entrega:new Date().toLocaleDateString('es-EC',{weekday:'long'}), bloque_horario:new Date().toLocaleTimeString('es-EC',{hour:'2-digit',minute:'2-digit'}), cantidad_burritos:cart.length, total:Number(cartSubtotal.toFixed(2)), ingredientes:allIngs, extras:allExtras, estado:'pendiente', metodo_pago:'Efectivo', sesion_caja_id:caja?.id||null };
    await supabase.from('pedidos').insert(payload);
    await supabase.from('pedido_items').insert(cart.map(item => ({ pedido_id:pedidoId, producto_id:item.productoId, producto_nombre:item.nombre, cantidad:1, ingredientes:item.toppings, nota:item.nota||null, subtotal:item.subtotal })));
    await supabase.from('mesas').update({ estado:'ocupada', carrito: [] }).eq('id', mesa.id);
    if (printerInstance.isConnected()) { try { const cv = await generateTicketCanvas(payload as any); await printerInstance.printCanvas(cv); } catch {} }
    setCart([]);
    setSaving(false);
    setCartOpen(false); // Colapsar después de enviar
    await loadPedidos();
  };

  if (checking||loading) return <div style={{ display:'flex', justifyContent:'center', alignItems:'center', minHeight:'60dvh', color:'var(--text-dim)' }}>Cargando…</div>;

  const filtrados   = tab==='todos' ? productos : productos.filter(p=>(p.categoria_plato||'General')===tab);
  const modalGroups = modal ? menuCats.filter(c=>c.producto_id===modal.id).map(cat=>({ cat, tops:toppings.filter(t=>t.categoria_id===cat.id) })) : [];
  const modalSub    = modal ? calcSub(modal, modalTops, modalQty) : 0;

  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:'100dvh', background:'var(--bg)' }}>

      {/* ── HEADER ── */}
      <div style={{ padding:'14px 16px 10px', background:'var(--surface)', borderBottom:'1px solid rgba(255,255,255,0.06)', position:'sticky', top:0, zIndex:10 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontFamily:'Bebas Neue', fontSize:'1.6rem', color:'var(--accent)', letterSpacing:'0.06em', lineHeight:1 }}>{mesa?.nombre}</div>
          <button onClick={() => router.push('/mesero')} style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 12px', borderRadius:99, background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', color:'var(--text-dim)', fontWeight:800, fontSize:'0.72rem', cursor:'pointer' }}>
            ← Mesas
          </button>
        </div>

        {/* Tabs de categorías (siempre visibles) */}
        <div style={{ display:'flex', gap:8, overflowX:'auto', marginTop:14, paddingBottom:4 }}>
          {[{nombre:'todos'}, ...categorias].map(c => (
            <button key={c.nombre} onClick={() => setTab(c.nombre)} style={{ padding:'8px 16px', borderRadius:99, fontWeight:800, fontSize:'0.78rem', border: tab===c.nombre ? 'none' : '1px solid rgba(255,255,255,0.1)', background: tab===c.nombre ? 'var(--accent)' : 'transparent', color: tab===c.nombre ? '#fff' : 'var(--text-dim)', cursor:'pointer', whiteSpace:'nowrap', flexShrink:0 }}>
              {c.nombre==='todos' ? 'Todos' : c.nombre}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex:1, overflowY:'auto', paddingBottom: (pedidos.length > 0 || cart.length > 0) ? '120px' : '40px' }}>
        {/* ── GRID DE PRODUCTOS ── */}
        <div style={{ padding:'12px', display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(130px,1fr))', gap:10 }}>
          {filtrados.map(p => (
            <button key={p.id} onClick={() => openModal(p)} style={{ padding:'16px 10px', borderRadius:14, border:`1px solid ${p.tipo==='bebida'?'rgba(59,130,246,0.2)':'rgba(255,255,255,0.07)'}`, background:'var(--surface)', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:6, textAlign:'center', WebkitTapHighlightColor:'transparent' }}>
              <span style={{ fontSize:'2.2rem' }}>{p.emoji}</span>
              <div style={{ fontWeight:800, fontSize:'0.82rem', color:'var(--text)', lineHeight:1.25 }}>{p.nombre}</div>
              <div style={{ fontFamily:'Bebas Neue', fontSize:'1.1rem', color:p.tipo==='bebida'?'#60a5fa':'var(--accent)' }}>${p.precio_base.toFixed(2)}</div>
              {p.tipo==='configurable' && <div style={{ fontSize:'0.58rem', color:'var(--text-dim)', fontWeight:700 }}>PERSONALIZABLE</div>}
              {p.tipo==='bebida' && <div style={{ fontSize:'0.58rem', color:'#60a5fa', fontWeight:900, background:'rgba(59,130,246,0.1)', padding:'1px 6px', borderRadius:99 }}>🧃 BEBIDA</div>}
            </button>
          ))}
        </div>
      </div>

      {/* ── CARRITO UNIFICADO (En cocina + Nuevo) COLLAPSIBLE ── */}
      {(pedidos.length > 0 || cart.length > 0) && (
        <div style={{ position:'fixed', bottom:0, left:0, right:0, zIndex:50, background:'var(--surface)', borderTop:'1px solid rgba(255,255,255,0.1)', boxShadow:'0 -10px 40px rgba(0,0,0,0.5)', paddingBottom:'env(safe-area-inset-bottom)', display:'flex', flexDirection:'column' }}>
          
          {/* BARRA HEADER TOGGLE */}
          <button 
            onClick={() => setCartOpen(!cartOpen)}
            style={{ padding:'16px 20px', display:'flex', justifyContent:'space-between', alignItems:'center', border:'none', background:'transparent', color:'var(--text)', cursor:'pointer' }}
          >
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ position:'relative' }}>
                <ShoppingBag size={24} color="var(--text-dim)" />
                {(itemsEnCocina + cart.length) > 0 && (
                  <div style={{ position:'absolute', top:-6, right:-6, background:'var(--accent)', color:'#fff', fontSize:'0.65rem', fontWeight:900, width:18, height:18, borderRadius:99, display:'flex', alignItems:'center', justifyContent:'center' }}>
                    {itemsEnCocina + cart.length}
                  </div>
                )}
              </div>
              <div style={{ textAlign:'left' }}>
                <div style={{ fontFamily:'Bebas Neue', fontSize:'1.4rem', letterSpacing:'0.04em', lineHeight:1 }}>Cuenta Mesa</div>
                <div style={{ fontSize:'0.75rem', color:'var(--text-dim)' }}>
                  {cart.length > 0 ? `${cart.length} sin enviar` : 'Todo enviado'}
                </div>
              </div>
            </div>

            <div style={{ display:'flex', alignItems:'center', gap:16 }}>
              <span style={{ color:'var(--success)', fontFamily:'Bebas Neue', fontSize:'1.6rem' }}>${totalMesa.toFixed(2)}</span>
              {cartOpen ? <ChevronDown size={20} color="var(--text-dim)"/> : <ChevronUp size={20} color="var(--text-dim)"/>}
            </div>
          </button>

          {/* CONTENIDO EXPANDIBLE */}
          {cartOpen && (
            <div style={{ maxHeight:'60dvh', overflowY:'auto', padding:'0 16px 12px', display:'flex', flexDirection:'column', gap:16, borderTop:'1px solid rgba(255,255,255,0.05)' }}>
              
              <div style={{ paddingTop: 12 }}>
                {/* PEDIDOS YA ENVIADOS (Solo lectura) */}
                {pedidos.map((p, idx) => (
                  <div key={p.id} style={{ marginBottom: 12 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                      <span style={{ fontSize:'0.75rem', fontWeight:900, color:'var(--text-dim)' }}>RONDA {idx+1} · EN COCINA</span>
                      <span style={{ fontSize:'0.65rem', fontWeight:900, padding:'3px 8px', borderRadius:99, background: p.estado==='pendiente' ? 'rgba(234,179,8,0.2)' : 'rgba(34,197,94,0.2)', color: p.estado==='pendiente' ? '#fbbf24' : '#4ade80' }}>
                        {p.estado==='pendiente' ? '⏳ Pendiente' : '✅ Listo'}
                      </span>
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                      {(p.pedido_items||[]).map(item => (
                        <div key={item.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', fontSize:'0.82rem', opacity:0.8 }}>
                          <div style={{ flex:1 }}>
                            <span style={{ color:'var(--text)' }}>× {item.cantidad} <strong>{item.producto_nombre}</strong></span>
                            {item.nota && <div style={{ fontSize:'0.7rem', color:'var(--text-dim)', marginTop:2 }}>Nota: {item.nota}</div>}
                          </div>
                          <span style={{ color:'var(--text-dim)' }}>${Number(item.subtotal).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                {/* CARRITO NUEVO (Editable) */}
                {cart.length > 0 && (
                  <div>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8, paddingTop: pedidos.length>0 ? 16 : 0, borderTop: pedidos.length>0 ? '1px dashed rgba(204,0,0,0.3)' : 'none' }}>
                      <span style={{ fontSize:'0.75rem', fontWeight:900, color:'var(--accent)' }}>NUEVO PEDIDO (Sin enviar)</span>
                      <button onClick={async () => { 
                        if(confirm('¿Descartar este pedido no enviado?')) { 
                          setCart([]); 
                          await supabase.from('mesas').update({ carrito: [] }).eq('id', mesaId);
                        } 
                      }} style={{ background:'transparent', border:'none', color:'var(--text-dim)', fontSize:'0.75rem', cursor:'pointer', display:'flex', alignItems:'center', gap:4 }}>
                        <Trash2 size={14}/> Descartar
                      </button>
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                      {cart.map(item => (
                        <div key={item.instanceId} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:'0.85rem' }}>
                          <div style={{ flex:1 }}>
                            <span style={{ color:'var(--text)' }}><strong>{item.emoji} {item.nombre}</strong></span>
                            {item.nota && <div style={{ fontSize:'0.75rem', color:'var(--text-dim)' }}>Nota: {item.nota}</div>}
                          </div>
                          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                            <span style={{ color:'var(--accent)', fontWeight:800 }}>${item.subtotal.toFixed(2)}</span>
                            <button onClick={async () => {
                              const newCart = cart.filter(i=>i.instanceId!==item.instanceId);
                              setCart(newCart);
                              await supabase.from('mesas').update({ carrito: newCart }).eq('id', mesaId);
                            }} style={{ background:'rgba(204,0,0,0.15)', border:'none', borderRadius:99, width:28, height:28, color:'var(--accent)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                              <X size={14}/>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* BOTÓN ENVIAR (Siempre visible si hay ítems nuevos, incluso colapsado) */}
          {cart.length > 0 && (
            <div style={{ padding:'12px 16px', background:'var(--surface)', borderTop:'1px solid rgba(255,255,255,0.05)' }}>
              <button onClick={handleConfirm} disabled={saving} style={{ width:'100%', padding:16, borderRadius:12, background:saving?'rgba(204,0,0,0.5)':'var(--accent)', border:'none', color:'#fff', fontWeight:900, fontSize:'1rem', cursor:saving?'not-allowed':'pointer', letterSpacing:'0.04em' }}>
                {saving ? 'Enviando…' : `🍳 ENVIAR A COCINA · $${cartSubtotal.toFixed(2)}`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── SHEET: Modal producto ── */}
      {modal && (
        <div style={S.overlay()} onClick={e => e.target===e.currentTarget && closeModal()}>
          <div style={S.sheet()}>
            <div style={S.pill()}/>
            <div style={{ padding:'0 20px 28px' }}>
              {/* Header */}
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
                <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                  <span style={{ fontSize:'3rem' }}>{modal.emoji}</span>
                  <div>
                    <div style={{ fontWeight:900, fontSize:'1.1rem' }}>{modal.nombre}</div>
                    {modal.descripcion && <div style={{ fontSize:'0.78rem', color:'var(--text-dim)', marginTop:2, maxWidth:220, lineHeight:1.4 }}>{modal.descripcion}</div>}
                    <div style={{ fontFamily:'Bebas Neue', fontSize:'1.2rem', color:'var(--accent)', marginTop:4 }}>${modal.precio_base.toFixed(2)}</div>
                  </div>
                </div>
                <button onClick={closeModal} style={{ background:'var(--surface-max)', border:'none', color:'var(--text-dim)', borderRadius:99, padding:8, cursor:'pointer' }}><X size={18}/></button>
              </div>
              {/* Cantidad */}
              <div style={{ background:'var(--surface-max)', borderRadius:14, padding:'14px 20px', marginBottom:20, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ fontWeight:800, fontSize:'0.8rem', letterSpacing:'0.06em' }}>CANTIDAD</span>
                <div style={{ display:'flex', alignItems:'center', gap:16 }}>
                  <button style={S.qtyBtn()} onClick={() => setModalQty(q=>Math.max(1,q-1))}><Minus size={18}/></button>
                  <span style={{ fontFamily:'Bebas Neue', fontSize:'1.8rem', minWidth:32, textAlign:'center' }}>{modalQty}</span>
                  <button style={{ ...S.qtyBtn(), background:'var(--accent)' }} onClick={() => setModalQty(q=>q+1)}><Plus size={18}/></button>
                </div>
              </div>
              {/* Toppings */}
              {modal.tipo==='configurable' && modalGroups.map(({ cat, tops }) => (
                <div key={cat.id} style={{ marginBottom:20 }}>
                  <div style={{ fontSize:'0.65rem', fontWeight:900, color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:10 }}>{cat.nombre}</div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                    {tops.map(t => {
                      const sel = modalTops.includes(t.id);
                      return (
                        <button key={t.id} onClick={() => toggleTop(t.id)} style={{ padding:'10px 12px', borderRadius:10, border:`1.5px solid ${sel?'var(--accent)':'rgba(255,255,255,0.08)'}`, background:sel?'rgba(204,0,0,0.12)':'var(--surface-max)', cursor:'pointer', display:'flex', alignItems:'center', gap:8, textAlign:'left' }}>
                          <span style={{ fontSize:'1.1rem' }}>{t.emoji}</span>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:'0.78rem', fontWeight:700, color:sel?'var(--text)':'var(--text-dim)' }}>{t.nombre}</div>
                            {t.precio_extra>0 && <div style={{ fontSize:'0.65rem', color:'var(--accent)' }}>+${t.precio_extra.toFixed(2)}</div>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              {/* Nota */}
              <div style={{ marginBottom:20 }}>
                <div style={{ fontSize:'0.65rem', fontWeight:900, color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:8 }}>Nota especial</div>
                <textarea value={modalNota} onChange={e=>setModalNota(e.target.value)} placeholder="ej: sin picante, extra salsa…" style={{ width:'100%', background:'var(--surface-max)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:10, padding:'12px 14px', color:'var(--text)', fontSize:'0.85rem', resize:'none', outline:'none', minHeight:70, boxSizing:'border-box' }}/>
              </div>
              {/* Botón agregar */}
              <button onClick={addToCart} style={{ width:'100%', padding:18, borderRadius:14, background:'var(--accent)', border:'none', color:'#fff', fontWeight:900, fontSize:'1rem', cursor:'pointer', letterSpacing:'0.04em' }}>
                AGREGAR ×{modalQty} · ${modalSub.toFixed(2)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
