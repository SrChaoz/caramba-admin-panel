'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Plus, Minus, Trash2, Check, X, ShoppingCart } from 'lucide-react';
import { printerInstance } from '@/lib/printer';
import { generateTicketCanvas } from '@/lib/TicketGenerator';

type Producto = { id: string; nombre: string; descripcion: string | null; precio_base: number; tipo: 'configurable' | 'simple' | 'bebida'; emoji: string; categoria_plato: string; activo: boolean; visible_mesero: boolean; };
type Categoria = { id: number; nombre: string; orden: number };
type MenuCat = { id: string; producto_id: string; nombre: string; es_requerido: boolean; orden: number };
type Topping = { id: string; categoria_id: string; nombre: string; emoji: string; precio_extra: number; };
type CartItem = { instanceId: string; productoId: string; nombre: string; emoji: string; tipo: 'configurable' | 'simple' | 'bebida'; toppings: string[]; nota: string; precio: number; cantidad: number; subtotal: number; };
type Mesa = { id: number; nombre: string };

function uid() { return Math.random().toString(36).slice(2, 10); }

const S = {
  btn: (active: boolean): React.CSSProperties => ({
    padding: '10px 18px', borderRadius: 99, fontWeight: 800, fontSize: '0.8rem',
    border: active ? 'none' : '1px solid rgba(255,255,255,0.1)',
    background: active ? 'var(--accent)' : 'transparent',
    color: active ? '#fff' : 'var(--text-dim)', cursor: 'pointer',
    whiteSpace: 'nowrap', flexShrink: 0, letterSpacing: '0.04em',
  }),
  card: (): React.CSSProperties => ({
    padding: '18px 14px', borderRadius: 16, border: '1px solid rgba(255,255,255,0.07)',
    background: 'var(--surface)', cursor: 'pointer', display: 'flex',
    flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center',
    WebkitTapHighlightColor: 'transparent', transition: 'transform 0.1s',
    minHeight: 140,
  }),
  overlay: (): React.CSSProperties => ({
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
    zIndex: 200, display: 'flex', alignItems: 'flex-end',
  }),
  sheet: (): React.CSSProperties => ({
    width: '100%', maxHeight: '92dvh', background: 'var(--surface)',
    borderRadius: '20px 20px 0 0', overflowY: 'auto', padding: '0 0 env(safe-area-inset-bottom)',
  }),
  pill: (): React.CSSProperties => ({
    width: 40, height: 4, borderRadius: 99, background: 'rgba(255,255,255,0.15)',
    margin: '12px auto 20px',
  }),
  qtyBtn: (): React.CSSProperties => ({
    width: 44, height: 44, borderRadius: 99, border: 'none',
    background: 'var(--surface-max)', color: 'var(--text)', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  }),
};

export default function MesaMenuPage() {
  const router = useRouter();
  const params = useParams();
  const mesaId = Number(params.mesaId);

  const [session, setSession] = useState<any>(null);
  const [checking, setChecking] = useState(true);
  const [mesa, setMesa] = useState<Mesa | null>(null);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [menuCats, setMenuCats] = useState<MenuCat[]>([]);
  const [toppings, setToppings] = useState<Topping[]>([]);
  const [loading, setLoading] = useState(true);
  const [tabActivo, setTabActivo] = useState('todos');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);

  // Modal unificado para TODOS los productos
  const [modal, setModal] = useState<Producto | null>(null);
  const [modalQty, setModalQty] = useState(1);
  const [modalToppings, setModalToppings] = useState<string[]>([]);
  const [modalNota, setModalNota] = useState('');

  const [showConfirm, setShowConfirm] = useState(false);
  const [metodoPago, setMetodoPago] = useState<'Efectivo' | 'Transferencia'>('Efectivo');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.replace('/login');
      else { setSession(session); setChecking(false); }
    });
  }, [router]);

  useEffect(() => {
    if (checking || !mesaId) return;
    (async () => {
      setLoading(true);
      const [mR, pR, cR, mcR, tR] = await Promise.all([
        supabase.from('mesas').select('id,nombre').eq('id', mesaId).single(),
        supabase.from('menu_productos').select('*').eq('activo', true).eq('visible_mesero', true).order('orden'),
        supabase.from('categorias_plato').select('*').order('orden'),
        supabase.from('menu_categorias').select('*').order('orden'),
        supabase.from('menu_toppings').select('*').eq('disponible', true).order('orden'),
      ]);
      setMesa(mR.data);
      setProductos(pR.data || []);
      setCategorias(cR.data || []);
      setMenuCats(mcR.data || []);
      setToppings((tR.data || []).map((t: any) => ({ id: t.id, categoria_id: t.categoria_id, nombre: t.nombre, emoji: t.emoji || '', precio_extra: Number(t.precio_extra ?? 0) })));
      setLoading(false);
    })();
  }, [checking, mesaId]);

  const openModal = (p: Producto) => { setModal(p); setModalQty(1); setModalToppings([]); setModalNota(''); };
  const closeModal = () => setModal(null);

  const toggleTop = (id: string) => setModalToppings(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]);

  const calcSub = (p: Producto, tIds: string[], qty: number) => {
    const catIds = menuCats.filter(c => c.producto_id === p.id).map(c => c.id);
    const extra = toppings.filter(t => catIds.includes(t.categoria_id) && tIds.includes(t.id)).reduce((a, t) => a + t.precio_extra, 0);
    return (p.precio_base + extra) * qty;
  };

  const addToCart = () => {
    if (!modal) return;
    const sub = calcSub(modal, modalToppings, modalQty);
    // Agregar una CartItem por cada unidad para que el ticket las muestre bien
    for (let i = 0; i < modalQty; i++) {
      setCart(c => [...c, { instanceId: uid(), productoId: modal.id, nombre: modal.nombre, emoji: modal.emoji, tipo: modal.tipo, toppings: modalToppings, nota: modalNota, precio: modal.precio_base, cantidad: 1, subtotal: sub / modalQty }]);
    }
    closeModal();
  };

  const removeItem = (id: string) => setCart(c => c.filter(i => i.instanceId !== id));

  const total = cart.reduce((a, i) => a + i.subtotal, 0);

  const handleConfirm = async () => {
    if (!cart.length || !mesa || !session) return;
    setSaving(true);
    const { data: caja } = await supabase.from('sesiones_caja').select('id').eq('estado', 'ABIERTA').maybeSingle();
    const pedidoId = crypto.randomUUID();
    const codigo = `M${mesa.id}-${Date.now().toString(36).toUpperCase().slice(-4)}`;
    const allIngs: string[] = [];
    const allExtras: { nombre: string; precio: number }[] = [];
    cart.forEach((item, idx) => {
      if (idx > 0) allIngs.push('---');
      if (item.tipo === 'simple') { allIngs.push(item.nombre); if (item.nota) allIngs.push(`Nota: ${item.nota}`); }
      else {
        const topNames = item.toppings.map(tid => toppings.find(t => t.id === tid)?.nombre || tid);
        allIngs.push(...topNames);
        if (item.nota) allIngs.push(`Nota: ${item.nota}`);
        item.toppings.forEach(tid => { const t = toppings.find(tp => tp.id === tid); if (t && t.precio_extra > 0) allExtras.push({ nombre: `[B${idx + 1}] Extra: ${t.nombre}`, precio: t.precio_extra }); });
      }
    });
    const payload = { id: pedidoId, codigo_ticket: codigo, canal: 'mesa', mesa_id: mesa.id, mesero_id: session.user.id, cliente_nombre: mesa.nombre, cliente_telefono: '', cliente_direccion: '', dia_entrega: new Date().toLocaleDateString('es-EC', { weekday: 'long' }), bloque_horario: new Date().toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' }), cantidad_burritos: cart.length, total: Number(total.toFixed(2)), ingredientes: allIngs, extras: allExtras, estado: 'pendiente', metodo_pago: metodoPago, sesion_caja_id: caja?.id || null };
    await supabase.from('pedidos').insert(payload);
    await supabase.from('pedido_items').insert(cart.map(item => ({ pedido_id: pedidoId, producto_id: item.productoId, producto_nombre: item.nombre, cantidad: 1, ingredientes: item.toppings, nota: item.nota || null, subtotal: item.subtotal })));
    if (printerInstance.isConnected()) { try { const cv = await generateTicketCanvas(payload as any); await printerInstance.printCanvas(cv); } catch { } }
    setCart([]); setShowConfirm(false); setSaving(false);
    router.push('/mesero');
  };

  if (checking || loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60dvh', color: 'var(--text-dim)' }}>Cargando…</div>;

  const filtrados = tabActivo === 'todos' ? productos : productos.filter(p => (p.categoria_plato || 'General') === tabActivo);
  const groupedByCat = (pId: string) => menuCats.filter(c => c.producto_id === pId).map(cat => ({ cat, tops: toppings.filter(t => t.categoria_id === cat.id) }));
  const modalSub = modal ? calcSub(modal, modalToppings, modalQty) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: 'var(--bg)' }}>

      {/* Header mesa */}
      <div style={{ padding: '14px 20px 10px', background: 'var(--surface)', borderBottom: '1px solid rgba(255,255,255,0.06)', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ fontFamily: 'Bebas Neue', fontSize: '1.6rem', color: 'var(--accent)', letterSpacing: '0.06em', lineHeight: 1 }}>{mesa?.nombre}</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10, overflowX: 'auto', paddingBottom: 2 }}>
          <button style={S.btn(tabActivo === 'todos')} onClick={() => setTabActivo('todos')}>Todos</button>
          {categorias.map(cat => <button key={cat.id} style={S.btn(tabActivo === cat.nombre)} onClick={() => setTabActivo(cat.nombre)}>{cat.nombre}</button>)}
        </div>
      </div>

      {/* Grid productos */}
      <div style={{ flex: 1, padding: '16px 12px', paddingBottom: cart.length > 0 ? 100 : 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
          {filtrados.map(p => (
            <button key={p.id} onClick={() => openModal(p)} style={{
              ...S.card(),
              borderColor: p.tipo === 'bebida' ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.07)',
            }}>
              <span style={{ fontSize: '2.6rem' }}>{p.emoji}</span>
              <div style={{ fontWeight: 800, fontSize: '0.88rem', color: 'var(--text)', lineHeight: 1.25 }}>{p.nombre}</div>
              <div style={{ fontFamily: 'Bebas Neue', fontSize: '1.15rem', color: p.tipo === 'bebida' ? '#60a5fa' : 'var(--accent)' }}>${p.precio_base.toFixed(2)}</div>
              {p.tipo === 'configurable' && <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', fontWeight: 700, letterSpacing: '0.08em' }}>PERSONALIZABLE</div>}
              {p.tipo === 'bebida' && <div style={{ fontSize: '0.6rem', color: '#60a5fa', fontWeight: 900, letterSpacing: '0.08em', background: 'rgba(59,130,246,0.1)', padding: '2px 8px', borderRadius: 99 }}>🧃 BEBIDA</div>}
            </button>
          ))}
        </div>
      </div>

      {/* Botón flotante carrito */}
      {cart.length > 0 && (
        <button onClick={() => setShowCart(true)} style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 99, padding: '16px 32px', fontWeight: 900, fontSize: '1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, boxShadow: '0 6px 30px rgba(204,0,0,0.45)', zIndex: 50, whiteSpace: 'nowrap', letterSpacing: '0.04em' }}>
          <ShoppingCart size={20} /> VER PEDIDO ({cart.reduce((a, i) => a + i.cantidad, 0)}) — ${total.toFixed(2)}
        </button>
      )}

      {/* ── MODAL PRODUCTO (bottom-sheet) ── */}
      {modal && (
        <div style={S.overlay()} onClick={e => e.target === e.currentTarget && closeModal()}>
          <div style={S.sheet()}>
            <div style={S.pill()} />
            <div style={{ padding: '0 20px 24px' }}>

              {/* Producto header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: '3rem' }}>{modal.emoji}</span>
                  <div>
                    <div style={{ fontWeight: 900, fontSize: '1.1rem', color: 'var(--text)' }}>{modal.nombre}</div>
                    {modal.descripcion && <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: 2, maxWidth: 220, lineHeight: 1.4 }}>{modal.descripcion}</div>}
                    <div style={{ fontFamily: 'Bebas Neue', fontSize: '1.2rem', color: 'var(--accent)', marginTop: 4 }}>${modal.precio_base.toFixed(2)}</div>
                  </div>
                </div>
                <button onClick={closeModal} style={{ background: 'var(--surface-max)', border: 'none', color: 'var(--text-muted)', borderRadius: 99, padding: 8, cursor: 'pointer', marginTop: 4 }}><X size={18} /></button>
              </div>

              {/* Selector de cantidad */}
              <div style={{ background: 'var(--surface-max)', borderRadius: 14, padding: '14px 20px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontWeight: 800, fontSize: '0.8rem', color: 'var(--text)', letterSpacing: '0.06em' }}>CANTIDAD</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <button style={S.qtyBtn()} onClick={() => setModalQty(q => Math.max(1, q - 1))}><Minus size={18} /></button>
                  <span style={{ fontFamily: 'Bebas Neue', fontSize: '1.8rem', color: 'var(--text)', minWidth: 32, textAlign: 'center', lineHeight: 1 }}>{modalQty}</span>
                  <button style={{ ...S.qtyBtn(), background: 'var(--accent)' }} onClick={() => setModalQty(q => q + 1)}><Plus size={18} /></button>
                </div>
              </div>

              {/* Toppings solo si configurable */}
              {modal.tipo === 'configurable' && groupedByCat(modal.id).map(({ cat, tops }) => (
                <div key={cat.id} style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: '0.65rem', fontWeight: 900, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10 }}>
                    {cat.nombre}{cat.es_requerido && <span style={{ color: 'var(--accent)', marginLeft: 4 }}>*</span>}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                    {tops.map(t => {
                      const sel = modalToppings.includes(t.id);
                      return (
                        <button key={t.id} onClick={() => toggleTop(t.id)} style={{ padding: '12px 10px', borderRadius: 12, fontWeight: 700, fontSize: '0.82rem', border: sel ? '2px solid var(--accent)' : '2px solid rgba(255,255,255,0.08)', background: sel ? 'rgba(204,0,0,0.12)' : 'var(--surface-max)', color: sel ? '#fff' : 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, textAlign: 'left' }}>
                          {sel ? <Check size={14} color="var(--accent)" /> : <div style={{ width: 14 }} />}
                          <span>{t.emoji} {t.nombre}</span>
                          {t.precio_extra > 0 && <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--success)', fontWeight: 900 }}>+${t.precio_extra.toFixed(2)}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* Nota */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: '0.65rem', fontWeight: 900, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8 }}>NOTA / INDICACIÓN (opcional)</div>
                <textarea value={modalNota} onChange={e => setModalNota(e.target.value)} placeholder="ej: sin picante, bien cocido, aparte la salsa…" rows={2} style={{ width: '100%', background: 'var(--surface-max)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '12px 14px', color: 'var(--text)', outline: 'none', resize: 'none', fontSize: '0.9rem', boxSizing: 'border-box', lineHeight: 1.5 }} />
              </div>

              {/* Botón agregar */}
              <button onClick={addToCart} style={{ width: '100%', padding: '18px', borderRadius: 14, background: 'var(--accent)', border: 'none', color: '#fff', fontWeight: 900, fontSize: '1.05rem', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', letterSpacing: '0.04em' }}>
                <span>AGREGAR {modalQty > 1 ? `(×${modalQty})` : ''}</span>
                <span style={{ fontFamily: 'Bebas Neue', fontSize: '1.3rem' }}>${modalSub.toFixed(2)}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CARRITO (bottom-sheet) ── */}
      {showCart && (
        <div style={S.overlay()} onClick={e => e.target === e.currentTarget && setShowCart(false)}>
          <div style={S.sheet()}>
            <div style={S.pill()} />
            <div style={{ padding: '0 20px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <div style={{ fontFamily: 'Bebas Neue', fontSize: '1.4rem', letterSpacing: '0.06em' }}>Pedido — {mesa?.nombre}</div>
              <button onClick={() => setShowCart(false)} style={{ background: 'var(--surface-max)', border: 'none', color: 'var(--text-muted)', borderRadius: 99, padding: 8, cursor: 'pointer' }}><X size={18} /></button>
            </div>

            <div style={{ padding: '0 20px', maxHeight: '55dvh', overflowY: 'auto' }}>
              {cart.map(item => (
                <div key={item.instanceId} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <span style={{ fontSize: '2rem', flexShrink: 0 }}>{item.emoji}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>{item.nombre}</div>
                    {item.tipo === 'configurable' && item.toppings.length > 0 && <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.toppings.map(tid => toppings.find(t => t.id === tid)?.nombre || tid).join(', ')}</div>}
                    {item.nota && <div style={{ fontSize: '0.72rem', color: 'var(--warning)', marginTop: 2 }}>📝 {item.nota}</div>}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                    <div style={{ fontFamily: 'Bebas Neue', fontSize: '1.1rem', color: 'var(--accent)' }}>${item.subtotal.toFixed(2)}</div>
                    <button onClick={() => removeItem(item.instanceId)} style={{ background: 'rgba(204,0,0,0.1)', border: '1px solid rgba(204,0,0,0.2)', color: 'var(--accent)', borderRadius: 8, padding: '4px 8px', cursor: 'pointer' }}><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ padding: '16px 20px', borderTop: '2px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 900, fontSize: '0.9rem', letterSpacing: '0.06em' }}>TOTAL</span>
              <span style={{ fontFamily: 'Bebas Neue', fontSize: '1.8rem', color: 'var(--success)' }}>${total.toFixed(2)}</span>
            </div>
            <div style={{ padding: '0 20px 24px' }}>
              <button onClick={() => { setShowCart(false); setShowConfirm(true); }} style={{ width: '100%', padding: 18, borderRadius: 14, background: 'var(--accent)', border: 'none', color: '#fff', fontWeight: 900, fontSize: '1.05rem', cursor: 'pointer', letterSpacing: '0.04em' }}>
                CONFIRMAR PEDIDO →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CONFIRMAR (bottom-sheet) ── */}
      {showConfirm && (
        <div style={S.overlay()} onClick={e => e.target === e.currentTarget && setShowConfirm(false)}>
          <div style={S.sheet()}>
            <div style={S.pill()} />
            <div style={{ padding: '0 20px 24px' }}>
              <div style={{ fontFamily: 'Bebas Neue', fontSize: '1.4rem', marginBottom: 20, letterSpacing: '0.06em' }}>Confirmar Pedido</div>

              <div style={{ fontSize: '0.65rem', fontWeight: 900, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10 }}>Método de Pago</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                {(['Efectivo', 'Transferencia'] as const).map(m => (
                  <button key={m} onClick={() => setMetodoPago(m)} style={{ padding: 18, borderRadius: 14, fontWeight: 900, fontSize: '0.95rem', border: metodoPago === m ? '2px solid var(--accent)' : '2px solid rgba(255,255,255,0.08)', background: metodoPago === m ? 'rgba(204,0,0,0.12)' : 'var(--surface-max)', color: metodoPago === m ? '#fff' : 'var(--text-dim)', cursor: 'pointer' }}>
                    {m === 'Efectivo' ? '💵' : '🏦'}<br />{m}
                  </button>
                ))}
              </div>

              <div style={{ background: 'var(--surface-max)', borderRadius: 14, padding: 20, marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: '0.82rem', color: 'var(--text-dim)' }}>
                  <span>{cart.reduce((a, i) => a + i.cantidad, 0)} ítem(s) · {mesa?.nombre}</span>
                  <span>{metodoPago}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 900, fontSize: '0.9rem' }}>TOTAL A COBRAR</span>
                  <span style={{ fontFamily: 'Bebas Neue', fontSize: '2rem', color: 'var(--success)' }}>${total.toFixed(2)}</span>
                </div>
              </div>

              <button onClick={handleConfirm} disabled={saving} style={{ width: '100%', padding: 20, borderRadius: 14, background: saving ? 'rgba(204,0,0,0.5)' : 'var(--accent)', border: 'none', color: '#fff', fontWeight: 900, fontSize: '1.1rem', cursor: saving ? 'not-allowed' : 'pointer', letterSpacing: '0.04em' }}>
                {saving ? 'Enviando…' : '🍽️ ENVIAR A COCINA'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
