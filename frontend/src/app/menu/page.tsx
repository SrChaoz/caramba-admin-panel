'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import AppShell from '@/components/AppShell';
import { Plus, X, Eye, EyeOff, Pencil } from 'lucide-react';

type Producto = {
  id: string; nombre: string; descripcion: string;
  precio_base: number; tipo: string;
  emoji: string; min_toppings: number; free_toppings_limit: number;
  activo: boolean; categoria_plato: string;
  visible_web: boolean; visible_mesero: boolean;
};
type CategoriaPlato = { id: number; nombre: string; orden: number };
type TipoPlato = { id: number; nombre: string; descripcion: string; orden: number };
type ModalState = 'crear_producto' | 'editar_producto' | 'crear_categoria' | null;

export default function MenuPage() {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);

  const [productos, setProductos] = useState<Producto[]>([]);
  const [categorias, setCategorias] = useState<CategoriaPlato[]>([]);
  const [tipos, setTipos] = useState<TipoPlato[]>([]);

  // Tab activo de categoría ('todos' o el nombre de la categoría)
  const [tabActivo, setTabActivo] = useState('todos');

  // Modal
  const [modal, setModal] = useState<ModalState>(null);
  const [editId, setEditId] = useState('');

  // Form: producto
  const [fNombre, setFNombre] = useState('');
  const [fEmoji, setFEmoji] = useState('🌯');
  const [fDesc, setFDesc] = useState('');
  const [fPrecio, setFPrecio] = useState('0');
  const [fTipo, setFTipo] = useState('configurable');
  const [fCategoria, setFCategoria] = useState('General');
  const [fMinT, setFMinT] = useState('0');
  const [fMaxFree, setFMaxFree] = useState('8');

  // Form: nueva categoría
  const [fCatNombre, setFCatNombre] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.replace('/login');
      else { setSession(session); setChecking(false); }
    });
  }, [router]);

  useEffect(() => { if (!checking) fetchAll(); }, [checking]);

  const fetchAll = async () => {
    setLoading(true);
    const [prodRes, catRes, tipoRes] = await Promise.all([
      supabase.from('menu_productos').select('*').order('orden'),
      supabase.from('categorias_plato').select('*').order('orden'),
      supabase.from('tipos_plato').select('*').order('orden'),
    ]);
    if (prodRes.data) setProductos(prodRes.data);
    if (catRes.data) setCategorias(catRes.data);
    if (tipoRes.data) setTipos(tipoRes.data);
    setLoading(false);
  };

  // ── Filtro y Orden ──────────────────────────────────────
  let productosFiltrados = tabActivo === 'todos'
    ? [...productos]
    : productos.filter(p => (p.categoria_plato || 'General') === tabActivo);

  productosFiltrados.sort((a, b) => {
    if (a.activo === b.activo) return 0;
    return a.activo ? -1 : 1;
  });

  // ── Producto ────────────────────────────────────────────
  const saveProducto = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      nombre: fNombre, emoji: fEmoji, descripcion: fDesc,
      precio_base: Number(fPrecio), tipo: fTipo,
      categoria_plato: fCategoria,
      min_toppings: Number(fMinT), free_toppings_limit: Number(fMaxFree),
    };
    if (modal === 'crear_producto') {
      const newId = fNombre.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      await supabase.from('menu_productos').insert({ id: newId, ...payload, orden: productos.length + 1, activo: true });
    } else {
      await supabase.from('menu_productos').update(payload).eq('id', editId);
    }
    setModal(null); fetchAll();
  };

  const delProducto = async (id: string) => {
    if (!confirm('¿Eliminar este plato?')) return;
    const { error } = await supabase.from('menu_productos').delete().eq('id', id);
    if (error) {
      alert('No se puede eliminar este plato porque ya forma parte del historial de pedidos. Por favor, marca el plato como "Oculto" (icono del ojo) para que no aparezca en el menú sin afectar los reportes financieros.');
    }
    fetchAll();
  };

  const toggleWeb = async (p: Producto) => {
    await supabase.from('menu_productos').update({ visible_web: !p.visible_web }).eq('id', p.id);
    fetchAll();
  };

  const toggleMesero = async (p: Producto) => {
    await supabase.from('menu_productos').update({ visible_mesero: !p.visible_mesero }).eq('id', p.id);
    fetchAll();
  };

  const openCrear = () => {
    setEditId(''); setFNombre(''); setFEmoji('🌯'); setFDesc('');
    setFPrecio('0'); setFTipo(tipos[0]?.nombre || 'configurable');
    setFCategoria(tabActivo !== 'todos' ? tabActivo : (categorias[0]?.nombre || 'General'));
    setFMinT('0'); setFMaxFree('8');
    setModal('crear_producto');
  };

  const openEditar = (p: Producto) => {
    setEditId(p.id); setFNombre(p.nombre); setFEmoji(p.emoji); setFDesc(p.descripcion || '');
    setFPrecio(String(p.precio_base)); setFTipo(p.tipo);
    setFCategoria(p.categoria_plato || 'General');
    setFMinT(String(p.min_toppings)); setFMaxFree(String(p.free_toppings_limit));
    setModal('editar_producto');
  };

  // ── Categoría ────────────────────────────────────────────
  const saveCategoria = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fCatNombre.trim()) return;
    await supabase.from('categorias_plato').insert({ nombre: fCatNombre.trim(), orden: categorias.length });
    setFCatNombre('');
    setModal(null);
    fetchAll();
  };

  if (checking) return null;

  return (
    <AppShell user={session?.user}>
      {/* Topbar */}
      <div className="topbar">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="topbar-page-name uppercase">Menú Web</span>
          <span className="topbar-subtitle">Gestión de platos y categorías.</span>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-primary" onClick={openCrear}>
            <Plus size={14} /> Nuevo Plato
          </button>
        </div>
      </div>

      <div className="page" style={{ maxWidth: 1000 }}>
        {/* ── Barra de tabs de categoría ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
          {/* Tab "Ver Todos" */}
          <button
            className={`btn ${tabActivo === 'todos' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTabActivo('todos')}
          >
            Ver Todos
            <span style={{
              marginLeft: 6, fontSize: '0.65rem', fontWeight: 900,
              background: tabActivo === 'todos' ? 'rgba(255,255,255,0.2)' : 'var(--surface-hi)',
              padding: '1px 7px', borderRadius: 20
            }}>
              {productos.length}
            </span>
          </button>

          {/* Tabs por categoría */}
          {categorias.map(cat => {
            const count = productos.filter(p => (p.categoria_plato || 'General') === cat.nombre).length;
            const isActive = tabActivo === cat.nombre;
            return (
              <button
                key={cat.id}
                className={`btn ${isActive ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setTabActivo(cat.nombre)}
              >
                {cat.nombre}
                <span style={{
                  marginLeft: 6, fontSize: '0.65rem', fontWeight: 900,
                  background: isActive ? 'rgba(255,255,255,0.2)' : 'var(--surface-hi)',
                  padding: '1px 7px', borderRadius: 20
                }}>
                  {count}
                </span>
              </button>
            );
          })}

          {/* Botón + para nueva categoría */}
          <button
            className="btn btn-secondary"
            title="Nueva categoría"
            style={{ width: 36, height: 36, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
            onClick={() => { setFCatNombre(''); setModal('crear_categoria'); }}
          >
            <Plus size={15} />
          </button>
        </div>

        {/* ── Grid de tarjetas ── */}
        {loading && <div style={{ color: 'var(--text-dim)', padding: 20 }}>Cargando...</div>}

        {!loading && productosFiltrados.length === 0 && (
          <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)' }}>
            Sin platos en esta categoría.{' '}
            <button className="btn btn-primary" style={{ marginLeft: 8 }} onClick={openCrear}>
              <Plus size={13} /> Nuevo Plato
            </button>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: 16 }}>
          {productosFiltrados.map(p => (
            <div
              key={p.id}
              className="card"
              style={{
                padding: 20, display: 'flex', flexDirection: 'column', gap: 12,
                cursor: 'pointer', transition: 'border-color 0.2s',
                opacity: (p.visible_web || p.visible_mesero) ? 1 : 0.45,
              }}
              onClick={() => router.push(`/menu/${p.id}`)}
            >
              {/* Info del plato */}
              <div style={{ display: 'flex', alignItems: 'start', gap: 14 }}>
                <span style={{ fontSize: '2.4rem', flexShrink: 0 }}>{p.emoji}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <h3 style={{ margin: 0, fontSize: '1rem' }}>{p.nombre}</h3>
                    {!p.activo && (
                      <span style={{ fontSize: '0.6rem', background: 'var(--danger)', color: '#fff', padding: '1px 7px', borderRadius: 20, fontWeight: 900 }}>
                        Oculto
                      </span>
                    )}
                  </div>
                 <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{p.tipo}</span>
                    {p.tipo === 'bebida' && <span style={{ fontSize: '0.55rem', fontWeight: 900, background: 'rgba(59,130,246,0.15)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.25)', padding: '1px 6px', borderRadius: 99 }}>🧃 BEBIDA</span>}
                    {/* Badges de visibilidad */}
                    <span title="Web Order" style={{ fontSize: '0.55rem', fontWeight: 900, padding: '1px 6px', borderRadius: 99, background: p.visible_web ? 'rgba(22,163,74,0.15)' : 'rgba(255,255,255,0.06)', color: p.visible_web ? '#4ade80' : 'var(--text-muted)', border: `1px solid ${p.visible_web ? 'rgba(22,163,74,0.3)' : 'rgba(255,255,255,0.08)'}` }}>
                      🌐 Web
                    </span>
                    <span title="Mesero / POS" style={{ fontSize: '0.55rem', fontWeight: 900, padding: '1px 6px', borderRadius: 99, background: p.visible_mesero ? 'rgba(234,179,8,0.15)' : 'rgba(255,255,255,0.06)', color: p.visible_mesero ? '#fbbf24' : 'var(--text-muted)', border: `1px solid ${p.visible_mesero ? 'rgba(234,179,8,0.3)' : 'rgba(255,255,255,0.08)'}` }}>
                      🪑 Mesero
                    </span>
                  </div>
                  <div style={{ fontWeight: 800, color: 'var(--accent)', fontSize: '1.1rem', marginTop: 4 }}>
                    ${Number(p.precio_base).toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Acciones */}
              <div
                style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}
                onClick={e => e.stopPropagation()}
              >
                <button
                  className="btn btn-secondary"
                  title={p.visible_web ? 'Ocultar en Web Order' : 'Mostrar en Web Order'}
                  style={{ color: p.visible_web ? '#4ade80' : 'var(--text-dim)', padding: '6px 10px', fontSize: '0.65rem', fontWeight: 800, gap: 4 }}
                  onClick={() => toggleWeb(p)}
                >
                  🌐 {p.visible_web ? <Eye size={13} /> : <EyeOff size={13} />}
                </button>
                <button
                  className="btn btn-secondary"
                  title={p.visible_mesero ? 'Ocultar en Mesero/POS' : 'Mostrar en Mesero/POS'}
                  style={{ color: p.visible_mesero ? '#fbbf24' : 'var(--text-dim)', padding: '6px 10px', fontSize: '0.65rem', fontWeight: 800, gap: 4 }}
                  onClick={() => toggleMesero(p)}
                >
                  🪑 {p.visible_mesero ? <Eye size={13} /> : <EyeOff size={13} />}
                </button>
                <button className="btn btn-secondary" style={{ padding: '6px 10px' }} onClick={() => openEditar(p)}>
                  <Pencil size={14} />
                </button>
                <button className="btn btn-secondary" style={{ color: 'var(--danger)', padding: '6px 10px' }} onClick={() => delProducto(p.id)}>
                  <X size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── MODAL Crear/Editar Plato ── */}
      {(modal === 'crear_producto' || modal === 'editar_producto') && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal-box" style={{ maxWidth: 480 }}>
            <div className="modal-title uppercase">
              {modal === 'crear_producto' ? 'Nuevo Plato' : 'Editar Plato'}
              <button onClick={() => setModal(null)}><X size={18} /></button>
            </div>
            <form onSubmit={saveProducto} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 10 }}>
                <div className="field" style={{ width: 80 }}><label>Emoji</label><input value={fEmoji} onChange={e => setFEmoji(e.target.value)} /></div>
                <div className="field" style={{ flex: 1 }}><label>Nombre</label><input value={fNombre} onChange={e => setFNombre(e.target.value)} required /></div>
              </div>
              <div className="field"><label>Descripción</label><textarea value={fDesc} onChange={e => setFDesc(e.target.value)} /></div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="field">
                  <label>Tipo de Plato</label>
                  <select value={fTipo} onChange={e => setFTipo(e.target.value)}>
                    {tipos.map(t => <option key={t.id} value={t.nombre}>{t.nombre}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Categoría de Menú</label>
                  <select value={fCategoria} onChange={e => setFCategoria(e.target.value)}>
                    {categorias.map(c => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
                  </select>
                </div>
              </div>

              {/* Banner informativo para bebidas */}
              {fTipo === 'bebida' && (
                <div style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: 10, padding: '10px 14px', fontSize: '0.78rem', color: '#93c5fd', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>🧃</span>
                  <span><strong>Bebida:</strong> Solo necesita nombre, precio y descripción. No requiere toppings ni ingredientes. En el POS del mesero aparecerá con un modal simplificado (solo cantidad + nota).</span>
                </div>
              )}

              {/* Precio: siempre visible */}
              <div className="field"><label>Precio $</label><input type="number" step="0.01" value={fPrecio} onChange={e => setFPrecio(e.target.value)} /></div>

              {/* Campos de ingredientes: solo para configurable y simple */}
              {fTipo !== 'bebida' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div className="field"><label>Mín. Ingredientes</label><input type="number" value={fMinT} onChange={e => setFMinT(e.target.value)} /></div>
                  <div className="field"><label>Máx. Libres</label><input type="number" value={fMaxFree} onChange={e => setFMaxFree(e.target.value)} /></div>
                </div>
              )}

              <button type="submit" className="btn btn-primary" style={{ marginTop: 8 }}>Guardar</button>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL Nueva Categoría ── */}
      {modal === 'crear_categoria' && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal-box" style={{ maxWidth: 400 }}>
            <div className="modal-title uppercase">
              Nueva Categoría de Menú
              <button onClick={() => setModal(null)}><X size={18} /></button>
            </div>
            <form onSubmit={saveCategoria} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="field">
                <label>Nombre de la categoría</label>
                <input
                  value={fCatNombre}
                  onChange={e => setFCatNombre(e.target.value)}
                  placeholder="ej: Postres, Entradas, Bebidas…"
                  autoFocus
                  required
                />
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', margin: 0 }}>
                Podrás asignar platos a esta categoría desde la configuración de cada plato.
              </p>
              <button type="submit" className="btn btn-primary">Crear Categoría</button>
            </form>
          </div>
        </div>
      )}

      <style jsx>{`
        .field { display: flex; flex-direction: column; gap: 4px; }
        .field label { font-size: 0.75rem; font-weight: 800; color: var(--text-dim); text-transform: uppercase; }
        .field input, .field select, .field textarea {
          background: var(--surface); border: 1px solid var(--surface-hi);
          padding: 10px; border-radius: 8px; color: var(--text); outline: none;
        }
        .field input:focus, .field select:focus { border-color: var(--accent); }
        .card:hover { border-color: var(--accent) !important; }
      `}</style>
    </AppShell>
  );
}
