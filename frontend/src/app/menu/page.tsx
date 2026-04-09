'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import AppShell from '@/components/AppShell';
import { Search, Plus, Pencil, X, Save, Settings, Layers, Hash } from 'lucide-react';

type Categoria = { id: string; nombre: string; es_requerido: boolean; orden: number; producto_id: string; };
type Topping = { id: string; nombre: string; emoji: string; categoria_id: string; exclusive_group: string | null; precio_extra: number; precio_surcharge: number; precio_proteina_combo: number; disponible: boolean; orden: number; oculto: boolean; };
type Config = { min_toppings: number; free_toppings_limit: number; precio_base: number; whatsapp_phone: string; };

type ModalState = 'crear_topping' | 'editar_topping' | 'crear_cat' | 'editar_cat' | null;

export default function MenuPage() {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [checking, setChecking] = useState(true);
  const [activeTab, setActiveTab] = useState<'toppings' | 'categorias' | 'configuracion'>('toppings');

  // Datos
  const [config, setConfig] = useState<Config>({ min_toppings: 5, free_toppings_limit: 8, precio_base: 3.50, whatsapp_phone: '' });
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [toppings, setToppings] = useState<Topping[]>([]);
  
  // UI states
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<ModalState>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);
  const [loading, setLoading] = useState(false);

  // Form states Topping
  const [editId, setEditId] = useState<string>('');
  const [fNombre, setFNombre] = useState('');
  const [fEmoji, setFEmoji] = useState('');
  const [fCatId, setFCatId] = useState('');
  const [fPrecio, setFPrecio] = useState('0');
  const [fSurcharge, setFSurcharge] = useState('0');
  const [fComboPrice, setFComboPrice] = useState('0');
  const [fGroup, setFGroup] = useState('');
  const [fOculto, setFOculto] = useState(false);

  // Form states Categoria
  const [fCatReq, setFCatReq] = useState(false);
  const [fOrden, setFOrden] = useState('0');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.replace('/login');
      else { setSession(session); setChecking(false); }
    });
  }, [router]);

  const fetchAll = async () => {
    setLoading(true);
    const [confRes, prodRes, catRes, topRes] = await Promise.all([
      supabase.from('restaurante_config').select('*'),
      supabase.from('menu_productos').select('*').eq('id', 'burrito-armalo').single(),
      supabase.from('menu_categorias').select('*').order('orden'),
      supabase.from('menu_toppings').select('*').order('orden')
    ]);

    if (prodRes.data) {
      setConfig({
        min_toppings: prodRes.data.min_toppings,
        free_toppings_limit: prodRes.data.free_toppings_limit,
        precio_base: Number(prodRes.data.precio_base),
        whatsapp_phone: confRes.data?.find(c => c.clave === 'whatsapp_phone')?.valor?.replace(/"/g, '') || ''
      });
    }
    if (catRes.data) setCategorias(catRes.data);
    if (topRes.data) setToppings(topRes.data);
    setLoading(false);
  };

  useEffect(() => {
    if (session) fetchAll();
  }, [session]);

  const toggleTopping = async (t: Topping) => {
    setWorking(t.id);
    setToppings(prev => prev.map(item => item.id === t.id ? { ...item, disponible: !t.disponible } : item));
    await supabase.from('menu_toppings').update({ disponible: !t.disponible }).eq('id', t.id);
    setWorking(null);
  };

  const delTopping = async (id: string) => {
    if(!confirm('¿Seguro que deseas eliminar este ingrediente permanentemente?')) return;
    setToppings(prev => prev.filter(t => t.id !== id));
    await supabase.from('menu_toppings').delete().eq('id', id);
  };

  const delCategoria = async (id: string) => {
    if(!confirm('¿Eliminar esta categoría? Se eliminarán todos sus ingredientes asociados.')) return;
    setCategorias(prev => prev.filter(c => c.id !== id));
    await supabase.from('menu_categorias').delete().eq('id', id);
    fetchAll();
  };

  // Abrir modals
  const openCrearTopping = () => {
    setEditId(''); setFNombre(''); setFEmoji(''); setFPrecio('0'); setFSurcharge('0'); setFComboPrice('0'); setFGroup(''); setFOculto(false);
    setFCatId(categorias[0]?.id || '');
    setModal('crear_topping');
  };
  const openEditarTopping = (t: Topping) => {
    setEditId(t.id); setFNombre(t.nombre); setFEmoji(t.emoji || ''); 
    setFPrecio(String(t.precio_extra)); setFSurcharge(String(t.precio_surcharge)); setFComboPrice(String(t.precio_proteina_combo)); setFGroup(t.exclusive_group || ''); setFCatId(t.categoria_id); setFOculto(t.oculto || false);
    setModal('editar_topping');
  };
  
  const openCrearCat = () => {
    setEditId(''); setFNombre(''); setFCatReq(false); setFOrden(String(categorias.length + 1));
    setModal('crear_cat');
  };
  const openEditarCat = (c: Categoria) => {
    setEditId(c.id); setFNombre(c.nombre); setFCatReq(c.es_requerido); setFOrden(String(c.orden));
    setModal('editar_cat');
  };

  // Guardar Modals
  const saveTopping = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      nombre: fNombre, emoji: fEmoji, categoria_id: fCatId,
      precio_extra: Number(fPrecio), 
      precio_surcharge: Number(fSurcharge),
      precio_proteina_combo: Number(fComboPrice),
      exclusive_group: fGroup.trim() || null,
      oculto: fOculto
    };

    if (modal === 'crear_topping') {
      const newId = fNombre.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      await supabase.from('menu_toppings').insert({ ...payload, id: newId, orden: toppings.length + 1 });
    } else {
      await supabase.from('menu_toppings').update(payload).eq('id', editId);
    }
    setModal(null);
    fetchAll();
  };

  const saveCategoria = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      nombre: fNombre, es_requerido: fCatReq, orden: Number(fOrden), producto_id: 'burrito-armalo'
    };
    if (modal === 'crear_cat') {
      const newId = fNombre.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      await supabase.from('menu_categorias').insert({ ...payload, id: newId });
    } else {
      await supabase.from('menu_categorias').update(payload).eq('id', editId);
    }
    setModal(null);
    fetchAll();
  };

  const saveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    await supabase.from('menu_productos').update({ 
      precio_base: config.precio_base, min_toppings: config.min_toppings, free_toppings_limit: config.free_toppings_limit 
    }).eq('id', 'burrito-armalo');
    
    await supabase.from('restaurante_config')
      .upsert({ clave: 'whatsapp_phone', valor: JSON.stringify(config.whatsapp_phone) });
      
    setSavingConfig(false);
    alert('Configuración guardada!');
  };

  if (checking) return null;

  const filteredToppings = toppings.filter(t => t.nombre.toLowerCase().includes(search.toLowerCase()));

  return (
    <AppShell user={session?.user}>
      {/* Top Bar */}
      <div className="topbar">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="topbar-page-name">GESTIÓN DE MENÚ</span>
          </div>
          <span className="topbar-subtitle">Controla los precios, la disponibilidad y los pasos del producto.</span>
        </div>
        <div className="topbar-actions">
          {activeTab === 'toppings' && (
            <>
              <div className="topbar-search">
                <Search size={14} color="var(--text-dim)" />
                <input placeholder="Buscar ingrediente..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <button className="btn btn-primary" onClick={openCrearTopping}>
                <Plus size={14} /> Nuevo Ingrediente
              </button>
            </>
          )}
          {activeTab === 'categorias' && (
            <button className="btn btn-primary" onClick={openCrearCat}>
              <Plus size={14} /> Nueva Categoría
            </button>
          )}
        </div>
      </div>

      <div className="page" style={{ maxWidth: 1000 }}>
        {/* Tabs Nav */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
          <button className={`btn ${activeTab === 'toppings' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('toppings')}>
            <Hash size={14} /> Ingredientes
          </button>
          <button className={`btn ${activeTab === 'categorias' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('categorias')}>
            <Layers size={14} /> Categorías
          </button>
          <button className={`btn ${activeTab === 'configuracion' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('configuracion')}>
            <Settings size={14} /> Configuración General
          </button>
        </div>

        {/* Tab: TOOPINGS */}
        {activeTab === 'toppings' && (
          loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 0', gap: 16, color: 'var(--text-dim)' }}>
              <div style={{ width: 36, height: 36, border: '3px solid var(--surface-max)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
              <span style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Cargando ingredientes...</span>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {filteredToppings.map(t => (
              <div 
                key={t.id} 
                className="card" 
                style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, opacity: t.disponible ? 1 : 0.6, border: t.disponible ? '1px solid var(--surface-hi)' : '1px solid var(--danger-dim)' }}
              >
                <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: '1.8rem', position: 'relative' }}>
                      {t.emoji}
                      {t.oculto && <span style={{ position: 'absolute', bottom: -5, right: -5, fontSize: '0.8rem', background: 'var(--surface)', padding: 2, borderRadius: '50%' }}>👁️‍🗨️</span>}
                    </span>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '1rem', color: t.disponible ? 'var(--text)' : 'var(--text-muted)' }}>
                        {t.nombre} {t.oculto && <span className="chip" style={{ fontSize: '0.6rem', padding: '2px 4px' }}>OCULTO</span>}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                        {categorias.find(c => c.id === t.categoria_id)?.nombre || t.categoria_id}
                        {t.precio_extra > 0 && <span style={{ color: 'var(--accent)', fontWeight: 'bold', marginLeft: 6 }}>+${t.precio_extra.toFixed(2)}</span>}
                      </div>
                    </div>
                  </div>
                  {/* Toggle Switch */}
                  <button 
                    onClick={() => toggleTopping(t)}
                    disabled={working === t.id}
                    title={t.disponible ? "Apagar ingrediente (Agotado)" : "Encender ingrediente (Disponible)"}
                    style={{
                      background: t.disponible ? '#16a34a' : 'var(--danger)',
                      border: 'none', color: '#fff',
                      width: 40, height: 24, borderRadius: 12, cursor: 'pointer', position: 'relative', transition: 'all 0.2s ease',
                      opacity: working === t.id ? 0.5 : 1, marginTop: 4
                    }}
                  >
                    <div style={{ position: 'absolute', top: 2, left: t.disponible ? 18 : 2, width: 20, height: 20, background: '#fff', borderRadius: '50%', transition: 'all 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
                  </button>
                </div>
                
                <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 8, borderTop: '1px solid var(--surface-hi)' }}>
                  <button className="btn btn-secondary" style={{ flex: 1, padding: '4px 8px', fontSize: '0.75rem' }} onClick={() => openEditarTopping(t)}>
                    <Pencil size={12}/> Editar
                  </button>
                  <button className="btn btn-secondary" style={{ color: 'var(--danger)', padding: '4px 8px', fontSize: '0.75rem' }} onClick={() => delTopping(t.id)}>
                    Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>
          )
        )}

        {/* Tab: CATEGORIAS */}
        {activeTab === 'categorias' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {categorias.map(c => (
              <div key={c.id} className="card" style={{ padding: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text)' }}>
                    {c.orden}. {c.nombre}
                    {c.es_requerido && <span className="chip chip-accent" style={{ marginLeft: 8, fontSize: '0.6rem' }}>REQUERIDO</span>}
                  </h3>
                  <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-dim)' }}>ID Interno: {c.id}</p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-secondary" onClick={() => openEditarCat(c)}><Pencil size={14}/> Editar</button>
                  <button className="btn btn-secondary" style={{ color: 'var(--danger)' }} onClick={() => delCategoria(c.id)}><X size={14}/></button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tab: CONFIGURACIÓN */}
        {activeTab === 'configuracion' && (
          <div className="card" style={{ padding: 24 }}>
            <h2 style={{ marginBottom: 20, borderBottom: '1px solid var(--surface-max)', paddingBottom: 10 }}>Reglas del Producto (Arma tu Burrito)</h2>
            <form onSubmit={saveConfig} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20 }}>
                <div className="field">
                  <label>Mínimo ingredientes permitidos</label>
                  <input type="number" min="1" required value={config.min_toppings} onChange={e => setConfig({ ...config, min_toppings: Number(e.target.value) })} />
                </div>
                <div className="field">
                  <label>Límite gratuitos (antes de cobrar extra)</label>
                  <input type="number" min="1" required value={config.free_toppings_limit} onChange={e => setConfig({ ...config, free_toppings_limit: Number(e.target.value) })} />
                </div>
                <div className="field">
                  <label>Precio Base del Producto ($)</label>
                  <input type="number" step="0.25" min="0" required value={config.precio_base} onChange={e => setConfig({ ...config, precio_base: Number(e.target.value) })} />
                </div>
                <div className="field">
                  <label>Teléfono WhatsApp (Pedidos)</label>
                  <input type="text" required value={config.whatsapp_phone} onChange={e => setConfig({ ...config, whatsapp_phone: e.target.value })} />
                </div>
              </div>
              <button type="submit" disabled={savingConfig} className="btn btn-primary" style={{ alignSelf: 'flex-start', padding: '10px 24px' }}>
                <Save size={16} /> {savingConfig ? 'Guardando...' : 'Guardar Configuración'}
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Modals compartidos */}
      {modal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setModal(null); }}>
          <div className="modal-box">
            <div className="modal-title">
              {modal === 'crear_topping' || modal === 'editar_topping' ? 'GESTIONAR INGREDIENTE' : 'GESTIONAR CATEGORÍA'}
              <button onClick={() => setModal(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={18} /></button>
            </div>

            {/* FORMULARIO TOPPINGS */}
            {(modal === 'crear_topping' || modal === 'editar_topping') && (
              <form onSubmit={saveTopping} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', gap: 16 }}>
                  <div className="field" style={{ flex: 1 }}>
                    <label>Emoji</label>
                    <input type="text" placeholder="Emoji" required value={fEmoji} onChange={e => setFEmoji(e.target.value)} />
                  </div>
                  <div className="field" style={{ flex: 3 }}>
                    <label>Nombre a mostrar</label>
                    <input type="text" placeholder="Ej: Pico de gallo" required value={fNombre} onChange={e => setFNombre(e.target.value)} />
                  </div>
                </div>

                <div className="field">
                  <label>Categoría a la que pertenece</label>
                  <select required value={fCatId} onChange={e => setFCatId(e.target.value)}>
                    <option value="" disabled>Selecciona categoría...</option>
                    {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </div>

                <div style={{ display: 'flex', gap: 16 }}>
                  <div className="field" style={{ flex: 1 }}>
                    <label>Precio Extra ($) <span style={{ color: 'var(--text-dim)', fontSize: '0.7rem' }}>(para &gt;8 ingredientes o 2da proteína)</span></label>
                    <input type="number" step="0.05" min="0" required value={fPrecio} onChange={e => setFPrecio(e.target.value)} />
                  </div>
                  <div className="field" style={{ flex: 1 }}>
                    <label>Grupo de Exclusividad ID</label>
                    <input type="text" placeholder="Ej: arroz o meat (opcional)" value={fGroup} onChange={e => setFGroup(e.target.value)} />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 16 }}>
                  <div className="field" style={{ flex: 1 }}>
                    <label>Recargo Base ($) <span style={{ color: 'var(--text-dim)', fontSize: '0.7rem' }}>(cuando es proteína inicial, ej. Carne +$0.50)</span></label>
                    <input type="number" step="0.05" min="0" value={fSurcharge} onChange={e => setFSurcharge(e.target.value)} />
                  </div>
                </div>

                <div className="field" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0' }}>
                  <input type="checkbox" id="oculto" checked={fOculto} onChange={e => setFOculto(e.target.checked)} style={{ width: 18, height: 18 }} />
                  <label htmlFor="oculto" style={{ cursor: 'pointer', margin: 0, fontWeight: 'bold', color: 'var(--warning, #f59e0b)' }}>
                    Ocultar del menú web (Temporalmente inactivo)
                  </label>
                </div>

                <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Nota: Para el "Grupo de Exclusividad", si dos ingredientes tienen el mismo ID de exclusión (ej. "arroz"), no podrán ser seleccionados ambos a la vez de forma gratuita en el portal según las reglas base.</p>

                <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                  <button type="button" onClick={() => setModal(null)} className="btn btn-secondary" style={{ flex: 1 }}>Cancelar</button>
                  <button type="submit" className="btn btn-primary" style={{ flex: 1 }}><Save size={14} /> Guardar</button>
                </div>
              </form>
            )}

            {/* FORMULARIO CATEGORIAS */}
            {(modal === 'crear_cat' || modal === 'editar_cat') && (
              <form onSubmit={saveCategoria} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="field">
                  <label>Nombre de la Categoría</label>
                  <input type="text" placeholder="Ej. Proteína Extra" required value={fNombre} onChange={e => setFNombre(e.target.value)} />
                </div>
                
                <div style={{ display: 'flex', gap: 16 }}>
                  <div className="field" style={{ flex: 1 }}>
                    <label>Orden visual (N°)</label>
                    <input type="number" min="1" required value={fOrden} onChange={e => setFOrden(e.target.value)} />
                  </div>
                  <div className="field" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, alignSelf:'flex-end', paddingBottom: 10 }}>
                    <input type="checkbox" id="req" checked={fCatReq} onChange={e => setFCatReq(e.target.checked)} style={{ width: 18, height: 18 }} />
                    <label htmlFor="req" style={{ cursor: 'pointer', margin: 0 }}>¿Debe elegirse al menos uno?</label>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                  <button type="button" onClick={() => setModal(null)} className="btn btn-secondary" style={{ flex: 1 }}>Cancelar</button>
                  <button type="submit" className="btn btn-primary" style={{ flex: 1 }}><Save size={14} /> Guardar</button>
                </div>
              </form>
            )}

          </div>
        </div>
      )}
    </AppShell>
  );
}
