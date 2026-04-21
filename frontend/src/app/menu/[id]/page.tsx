'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import AppShell from '@/components/AppShell';
import { Plus, Pencil, X, ArrowLeft, Layers, Hash, Settings } from 'lucide-react';

type Producto = {
  id: string; nombre: string; descripcion: string;
  precio_base: number; tipo: 'configurable' | 'simple';
  emoji: string; min_toppings: number; free_toppings_limit: number;
};
type Categoria = {
  id: string; nombre: string; es_requerido: boolean;
  orden: number; producto_id: string; max_seleccion: number | null;
};
type Topping = {
  id: string; nombre: string; emoji: string; categoria_id: string;
  exclusive_group: string | null; precio_extra: number;
  precio_surcharge: number; precio_proteina_combo: number;
  disponible: boolean; orden: number; oculto: boolean;
};
type CategoriaPlato = { id: number; nombre: string; orden: number };
type TipoPlato = { id: number; nombre: string; descripcion: string; orden: number };

type ModalState = 'crear_cat' | 'editar_cat' | 'crear_topping' | 'editar_topping' | null;

export default function ProductoDetailPage() {
  const router = useRouter();
  const params = useParams();
  const productoId = params.id as string;

  const [session, setSession] = useState<any>(null);
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);

  const [producto, setProducto] = useState<Producto | null>(null);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [toppings, setToppings] = useState<Topping[]>([]);
  const [categoriasPlato, setCategoriasPlato] = useState<CategoriaPlato[]>([]);
  const [tiposPlato, setTiposPlato] = useState<TipoPlato[]>([]);

  const [activeTab, setActiveTab] = useState<'ingredientes' | 'categorias' | 'configuracion'>('ingredientes');
  const [modal, setModal] = useState<ModalState>(null);
  const [editId, setEditId] = useState('');

  // Form: Topping
  const [fNombre, setFNombre] = useState('');
  const [fEmoji, setFEmoji] = useState('✨');
  const [fPrecio, setFPrecio] = useState('0');
  const [fSurcharge, setFSurcharge] = useState('0');
  const [fComboPrice, setFComboPrice] = useState('0');
  const [fCatId, setFCatId] = useState('');
  const [fGroup, setFGroup] = useState('');
  const [fOculto, setFOculto] = useState(false);

  // Form: Producto (tab Configuración)
  const [pNombre, setPNombre] = useState('');
  const [pEmoji, setPEmoji] = useState('🌯');
  const [pDesc, setPDesc] = useState('');
  const [pPrecio, setPPrecio] = useState('0');
  const [pTipo, setPTipo] = useState<'configurable' | 'simple'>('configurable');
  const [pMinT, setPMinT] = useState('0');
  const [pMaxFree, setPMaxFree] = useState('8');
  const [pCategoria, setPCategoria] = useState('General');
  const [pImagenUrl, setPImagenUrl] = useState<string | null>(null);
  const [uploadingImg, setUploadingImg] = useState(false);
  const [savingProd, setSavingProd] = useState(false);

  // Form: Categoria
  const [fCatNombre, setFCatNombre] = useState('');
  const [fCatReq, setFCatReq] = useState(false);
  const [fCatOrden, setFCatOrden] = useState('0');
  const [fCatMaxSel, setFCatMaxSel] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.replace('/login');
      else { setSession(session); setChecking(false); }
    });
  }, [router]);

  useEffect(() => { if (!checking && productoId) fetchAll(); }, [checking, productoId]);

  const fetchAll = async () => {
    setLoading(true);
    const [prodRes, catRes, topRes, catPlatoRes, tipoRes] = await Promise.all([
      supabase.from('menu_productos').select('*').eq('id', productoId).single(),
      supabase.from('menu_categorias').select('*').eq('producto_id', productoId).order('orden'),
      supabase.from('menu_toppings').select('*').order('orden'),
      supabase.from('categorias_plato').select('*').order('orden'),
      supabase.from('tipos_plato').select('*').order('orden'),
    ]);
    if (catPlatoRes.data) setCategoriasPlato(catPlatoRes.data);
    if (tipoRes.data) setTiposPlato(tipoRes.data);
    if (prodRes.data) {
      setProducto(prodRes.data);
      // Inicializar form de configuración con los datos actuales
      setPNombre(prodRes.data.nombre);
      setPEmoji(prodRes.data.emoji);
      setPDesc(prodRes.data.descripcion || '');
      setPPrecio(String(prodRes.data.precio_base));
      setPTipo(prodRes.data.tipo);
      setPMinT(String(prodRes.data.min_toppings));
      setPMaxFree(String(prodRes.data.free_toppings_limit));
      setPCategoria(prodRes.data.categoria_plato || 'General');
      setPImagenUrl(prodRes.data.imagen_url || null);
    }
    if (catRes.data) setCategorias(catRes.data);
    if (topRes.data) {
      // Filtrar solo los toppings que pertenecen a categorías de este producto
      const catIds = (catRes.data || []).map((c: Categoria) => c.id);
      setToppings(topRes.data.filter((t: Topping) => catIds.includes(t.categoria_id)));
    }
    setLoading(false);
  };

  // ── Categorías ────────────────────────────────────────────

  const openCrearCat = () => {
    setEditId(''); setFCatNombre(''); setFCatReq(false);
    setFCatOrden(String(categorias.length + 1)); setFCatMaxSel('');
    setModal('crear_cat');
  };

  const openEditarCat = (c: Categoria) => {
    setEditId(c.id); setFCatNombre(c.nombre); setFCatReq(c.es_requerido);
    setFCatOrden(String(c.orden)); setFCatMaxSel(c.max_seleccion ? String(c.max_seleccion) : '');
    setModal('editar_cat');
  };

  const saveCat = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      nombre: fCatNombre, es_requerido: fCatReq,
      orden: Number(fCatOrden), producto_id: productoId,
      max_seleccion: fCatMaxSel ? Number(fCatMaxSel) : null
    };
    if (modal === 'crear_cat') {
      const newId = fCatNombre.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      await supabase.from('menu_categorias').insert({ id: newId, ...payload });
    } else {
      await supabase.from('menu_categorias').update(payload).eq('id', editId);
    }
    setModal(null); fetchAll();
  };

  const delCat = async (id: string) => {
    if (!confirm('¿Eliminar esta categoría y sus ingredientes?')) return;
    await supabase.from('menu_categorias').delete().eq('id', id);
    fetchAll();
  };

  // ── Toppings ──────────────────────────────────────────────

  const openCrearTopping = (catId?: string) => {
    setEditId(''); setFNombre(''); setFEmoji('✨'); setFPrecio('0');
    setFSurcharge('0'); setFComboPrice('0');
    setFCatId(catId || categorias[0]?.id || '');
    setFGroup(''); setFOculto(false);
    setModal('crear_topping');
  };

  const openEditarTopping = (t: Topping) => {
    setEditId(t.id); setFNombre(t.nombre); setFEmoji(t.emoji);
    setFPrecio(String(t.precio_extra)); setFSurcharge(String(t.precio_surcharge));
    setFComboPrice(String(t.precio_proteina_combo || 0));
    setFCatId(t.categoria_id); setFGroup(t.exclusive_group || '');
    setFOculto(t.oculto);
    setModal('editar_topping');
  };

  const saveTopping = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      nombre: fNombre, emoji: fEmoji, categoria_id: fCatId,
      precio_extra: Number(fPrecio), precio_surcharge: Number(fSurcharge),
      precio_proteina_combo: Number(fComboPrice),
      exclusive_group: fGroup.trim() || null, oculto: fOculto
    };
    if (modal === 'crear_topping') {
      const newId = fNombre.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      await supabase.from('menu_toppings').insert({ id: newId, ...payload, disponible: true });
    } else {
      await supabase.from('menu_toppings').update(payload).eq('id', editId);
    }
    setModal(null); fetchAll();
  };

  const toggleTopping = async (t: Topping) => {
    await supabase.from('menu_toppings').update({ disponible: !t.disponible }).eq('id', t.id);
    fetchAll();
  };

  // ── Guardar configuración del plato ──────────────────────
  const saveProd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProd(true);
    await supabase.from('menu_productos').update({
      nombre: pNombre, emoji: pEmoji, descripcion: pDesc,
      precio_base: Number(pPrecio), tipo: pTipo,
      min_toppings: Number(pMinT), free_toppings_limit: Number(pMaxFree),
      categoria_plato: pCategoria.trim() || 'General',
      imagen_url: pImagenUrl,
    }).eq('id', productoId);
    setSavingProd(false);
    fetchAll();
  };

  const uploadFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImg(true);
    const ext = file.name.split('.').pop();
    const path = `${productoId}.${ext}`;
    const { error } = await supabase.storage.from('menu-fotos').upload(path, file, { upsert: true });
    if (!error) {
      const { data } = supabase.storage.from('menu-fotos').getPublicUrl(path);
      setPImagenUrl(data.publicUrl);
    }
    setUploadingImg(false);
  };

  const removeFoto = async () => {
    setPImagenUrl(null);
  };

  if (checking || !producto) return null;

  return (
    <AppShell user={session?.user}>
      {/* Topbar */}
      <div className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-secondary" onClick={() => router.push('/menu')} style={{ padding: '6px 10px' }}>
            <ArrowLeft size={16} />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '1.8rem' }}>{producto.emoji}</span>
            <div>
              <div className="topbar-page-name">{producto.nombre}</div>
              <div className="topbar-subtitle">${Number(producto.precio_base).toFixed(2)} · {producto.tipo}</div>
            </div>
          </div>
        </div>
        <div className="topbar-actions">
          {activeTab === 'categorias' && (
            <button className="btn btn-primary" onClick={openCrearCat}><Plus size={14} /> Nueva Categoría</button>
          )}
          {activeTab === 'ingredientes' && (
            <button className="btn btn-primary" onClick={() => openCrearTopping()}><Plus size={14} /> Nuevo Ingrediente</button>
          )}
        </div>
      </div>

      <div className="page" style={{ maxWidth: 900 }}>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
          <button
            className={`btn ${activeTab === 'ingredientes' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('ingredientes')}
          >
            <Hash size={14} /> Ingredientes
          </button>
          {producto.tipo === 'configurable' && (
            <button
              className={`btn ${activeTab === 'categorias' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setActiveTab('categorias')}
            >
              <Layers size={14} /> Categorías
            </button>
          )}
          <button
            className={`btn ${activeTab === 'configuracion' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('configuracion')}
          >
            <Settings size={14} /> Configuración
          </button>
        </div>

        {loading && <div style={{ color: 'var(--text-dim)', padding: 20 }}>Cargando...</div>}

        {/* ── TAB INGREDIENTES — agrupados por categoría ── */}
        {activeTab === 'ingredientes' && !loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {categorias.length === 0 && (
              <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)' }}>
                No hay categorías. Crea categorías primero desde el tab "Categorías".
              </div>
            )}
            {categorias.map(cat => {
              const catToppings = toppings.filter(t => t.categoria_id === cat.id);
              return (
                <div key={cat.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  {/* Header categoría */}
                  <div style={{
                    padding: '12px 20px',
                    background: 'var(--surface-hi)',
                    borderBottom: '1px solid var(--border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontWeight: 900, fontSize: '0.95rem' }}>
                        {cat.orden}. {cat.nombre}
                      </span>
                      {cat.es_requerido && (
                        <span className="chip chip-accent" style={{ fontSize: '0.6rem' }}>REQUERIDO</span>
                      )}
                      {cat.max_seleccion && (
                        <span className="chip" style={{ fontSize: '0.6rem' }}>Max: {cat.max_seleccion}</span>
                      )}
                    </div>
                    <button
                      className="btn btn-primary"
                      style={{ fontSize: '0.7rem', padding: '5px 12px' }}
                      onClick={() => openCrearTopping(cat.id)}
                    >
                      <Plus size={12} /> Ingrediente
                    </button>
                  </div>

                  {/* Toppings de esta categoría */}
                  {catToppings.length === 0 ? (
                    <div style={{ padding: '16px 20px', color: 'var(--text-dim)', fontSize: '0.8rem' }}>
                      Sin ingredientes en esta categoría.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      {catToppings.map((t, idx) => (
                        <div
                          key={t.id}
                          style={{
                            padding: '12px 20px',
                            display: 'flex', alignItems: 'center', gap: 12,
                            borderBottom: idx < catToppings.length - 1 ? '1px solid var(--border)' : 'none',
                            opacity: t.disponible ? 1 : 0.5,
                          }}
                        >
                          <span style={{ fontSize: '1.6rem', minWidth: 36, textAlign: 'center' }}>{t.emoji}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700 }}>{t.nombre}</div>
                            <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                              {Number(t.precio_extra) > 0 && (
                                <span className="chip" style={{ fontSize: '0.6rem' }}>Extra ${Number(t.precio_extra).toFixed(2)}</span>
                              )}
                              {Number(t.precio_surcharge) > 0 && (
                                <span className="chip chip-accent" style={{ fontSize: '0.6rem' }}>Recargo ${Number(t.precio_surcharge).toFixed(2)}</span>
                              )}
                              {t.exclusive_group && (
                                <span className="chip" style={{ fontSize: '0.6rem' }}>Grupo: {t.exclusive_group}</span>
                              )}
                              {t.oculto && (
                                <span className="chip" style={{ fontSize: '0.6rem', color: 'var(--danger)' }}>Oculto en web</span>
                              )}
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {/* Toggle disponible */}
                            <button
                              title={t.disponible ? 'Marcar agotado' : 'Marcar disponible'}
                              onClick={() => toggleTopping(t)}
                              style={{
                                background: t.disponible ? '#16a34a' : 'var(--danger)',
                                width: 40, height: 22, borderRadius: 11,
                                border: 'none', position: 'relative', cursor: 'pointer', flexShrink: 0
                              }}
                            >
                              <div style={{
                                position: 'absolute', top: 3,
                                left: t.disponible ? 20 : 3,
                                width: 16, height: 16,
                                background: '#fff', borderRadius: '50%', transition: 'all 0.2s'
                              }} />
                            </button>
                            <button
                              className="btn btn-secondary"
                              style={{ padding: '5px 8px' }}
                              onClick={() => openEditarTopping(t)}
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              className="btn btn-secondary"
                              style={{ color: 'var(--danger)', padding: '5px 8px' }}
                              onClick={async () => {
                                if (confirm('¿Eliminar este ingrediente?')) {
                                  await supabase.from('menu_toppings').delete().eq('id', t.id);
                                  fetchAll();
                                }
                              }}
                            >
                              <X size={13} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── TAB CATEGORÍAS ── */}
        {activeTab === 'categorias' && !loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {categorias.length === 0 && (
              <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)' }}>
                Este producto no tiene categorías todavía.
              </div>
            )}
            {categorias.map(c => (
              <div key={c.id} className="card" style={{ padding: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <h3 style={{ margin: 0 }}>{c.orden}. {c.nombre}</h3>
                    {c.es_requerido && <span className="chip chip-accent" style={{ fontSize: '0.7rem' }}>REQUERIDO</span>}
                    {c.max_seleccion && <span className="chip" style={{ fontSize: '0.7rem' }}>Max: {c.max_seleccion}</span>}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: 4 }}>
                    {toppings.filter(t => t.categoria_id === c.id).length} ingredientes
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-secondary" onClick={() => openEditarCat(c)}><Pencil size={14} /></button>
                  <button className="btn btn-secondary" style={{ color: 'var(--danger)' }} onClick={() => delCat(c.id)}><X size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── TAB CONFIGURACIÓN ── */}
        {activeTab === 'configuracion' && producto && (
          <div className="card" style={{ padding: 28, maxWidth: 520 }}>
            <form onSubmit={saveProd} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* ── Foto del plato ── */}
              <div className="field">
                <label>Foto del Plato</label>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginTop: 4 }}>
                  {/* Preview */}
                  <div style={{
                    width: 90, height: 90, borderRadius: 12, overflow: 'hidden', flexShrink: 0,
                    background: 'var(--surface-hi)', border: '1px solid var(--border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    {pImagenUrl
                      ? <img src={pImagenUrl} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span style={{ fontSize: '2.5rem' }}>{pEmoji}</span>
                    }
                  </div>
                  {/* Acciones */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <label className="btn btn-secondary" style={{ cursor: 'pointer', padding: '8px 14px', fontSize: '0.8rem' }}>
                      {uploadingImg ? 'Subiendo…' : pImagenUrl ? '📷 Cambiar foto' : '📷 Subir foto'}
                      <input type="file" accept="image/*" style={{ display: 'none' }} onChange={uploadFoto} disabled={uploadingImg} />
                    </label>
                    {pImagenUrl && (
                      <button type="button" className="btn btn-secondary" style={{ color: 'var(--danger)', fontSize: '0.8rem', padding: '6px 14px' }} onClick={removeFoto}>
                        Quitar foto
                      </button>
                    )}
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                      Si no hay foto se usa el emoji.
                    </span>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <div className="field" style={{ width: 80 }}>
                  <label>Emoji</label>
                  <input value={pEmoji} onChange={e => setPEmoji(e.target.value)} />
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label>Nombre</label>
                  <input value={pNombre} onChange={e => setPNombre(e.target.value)} required />
                </div>
              </div>
              <div className="field">
                <label>Descripción</label>
                <textarea value={pDesc} onChange={e => setPDesc(e.target.value)} rows={3} style={{ resize: 'vertical' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field">
                  <label>Tipo de Plato</label>
                  <select value={pTipo} onChange={e => setPTipo(e.target.value as any)}>
                    {tiposPlato.map(t => (
                      <option key={t.id} value={t.nombre}>{t.nombre}{t.descripcion ? ` — ${t.descripcion}` : ''}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Categoría de Menú</label>
                  <select value={pCategoria} onChange={e => setPCategoria(e.target.value)}>
                    {categoriasPlato.map(c => (
                      <option key={c.id} value={c.nombre}>{c.nombre}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div className="field"><label>Precio $</label><input type="number" step="0.01" value={pPrecio} onChange={e => setPPrecio(e.target.value)} /></div>
                <div className="field"><label>Mín. Ingred.</label><input type="number" value={pMinT} onChange={e => setPMinT(e.target.value)} /></div>
                <div className="field"><label>Max Libres</label><input type="number" value={pMaxFree} onChange={e => setPMaxFree(e.target.value)} /></div>
              </div>
              <button type="submit" className="btn btn-primary" style={{ marginTop: 4 }} disabled={savingProd}>
                {savingProd ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </form>
          </div>
        )}
      </div>

      {/* ── MODALS ── */}
      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal-box" style={{ maxWidth: 460 }}>
            <div className="modal-title uppercase">
              {modal === 'crear_cat' ? 'Nueva Categoría' :
               modal === 'editar_cat' ? 'Editar Categoría' :
               modal === 'crear_topping' ? 'Nuevo Ingrediente' : 'Editar Ingrediente'}
              <button onClick={() => setModal(null)}><X size={18} /></button>
            </div>

            {/* Form Categoría */}
            {(modal === 'crear_cat' || modal === 'editar_cat') && (
              <form onSubmit={saveCat} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="field"><label>Nombre</label><input value={fCatNombre} onChange={e => setFCatNombre(e.target.value)} required /></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div className="field"><label>Orden</label><input type="number" value={fCatOrden} onChange={e => setFCatOrden(e.target.value)} /></div>
                  <div className="field"><label>Max Selec. (opcional)</label><input type="number" placeholder="Sin límite" value={fCatMaxSel} onChange={e => setFCatMaxSel(e.target.value)} /></div>
                </div>
                <div className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" id="req" checked={fCatReq} onChange={e => setFCatReq(e.target.checked)} />
                  <label htmlFor="req" style={{ textTransform: 'none' }}>¿Es obligatorio seleccionar?</label>
                </div>
                <button type="submit" className="btn btn-primary" style={{ marginTop: 8 }}>Guardar Categoría</button>
              </form>
            )}

            {/* Form Topping */}
            {(modal === 'crear_topping' || modal === 'editar_topping') && (
              <form onSubmit={saveTopping} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', gap: 10 }}>
                  <div className="field" style={{ width: 80 }}><label>Emoji</label><input value={fEmoji} onChange={e => setFEmoji(e.target.value)} /></div>
                  <div className="field" style={{ flex: 1 }}><label>Nombre</label><input value={fNombre} onChange={e => setFNombre(e.target.value)} required /></div>
                </div>
                <div className="field">
                  <label>Categoría</label>
                  <select value={fCatId} onChange={e => setFCatId(e.target.value)} required>
                    {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div className="field"><label>Precio Extra $</label><input type="number" step="0.01" value={fPrecio} onChange={e => setFPrecio(e.target.value)} /></div>
                  <div className="field"><label>Recargo $</label><input type="number" step="0.01" value={fSurcharge} onChange={e => setFSurcharge(e.target.value)} /></div>
                </div>
                <div className="field"><label>Grupo de exclusividad (ej: meat, arroz)</label><input value={fGroup} onChange={e => setFGroup(e.target.value)} placeholder="Dejar vacío si no aplica" /></div>
                <div className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" id="oculto" checked={fOculto} onChange={e => setFOculto(e.target.checked)} />
                  <label htmlFor="oculto" style={{ textTransform: 'none' }}>Ocultar en el web order</label>
                </div>
                <button type="submit" className="btn btn-primary" style={{ marginTop: 8 }}>Guardar Ingrediente</button>
              </form>
            )}
          </div>
        </div>
      )}

      <style jsx>{`
        .field { display: flex; flex-direction: column; gap: 4px; }
        .field label { font-size: 0.75rem; font-weight: 800; color: var(--text-dim); text-transform: uppercase; }
        .field input, .field select, .field textarea { background: var(--surface); border: 1px solid var(--surface-hi); padding: 10px; border-radius: 8px; color: var(--text); outline: none; }
        .field input:focus, .field select:focus { border-color: var(--accent); }
        .chip { background: var(--surface-hi); color: var(--text-dim); padding: 2px 8px; border-radius: 40px; font-weight: 900; }
        .chip-accent { background: var(--accent-dim); color: var(--accent); }
      `}</style>
    </AppShell>
  );
}
