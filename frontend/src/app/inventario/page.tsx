'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import AppShell from '@/components/AppShell';
import { Search, Plus, Pencil, X, Save } from 'lucide-react';

const UNIDADES = ['Unidades', 'Lbs', 'Kg', 'Gramos', 'Litros', 'ml', 'Tazas', 'Sachets', 'Atados', 'Frasco'];

type Insumo = { id: string; nombre: string; cantidad: number; unidad: string; ultimo_ajuste: string; };
type ModalMode = 'crear' | 'editar' | null;

export default function InventarioPage() {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [checking, setChecking] = useState(true);
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [search, setSearch] = useState('');
  const [adjustingId, setAdjustingId] = useState<string | null>(null);

  const [modal, setModal] = useState<ModalMode>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [fNombre, setFNombre] = useState('');
  const [fQty, setFQty] = useState('');
  const [fUnidad, setFUnidad] = useState('Unidades');
  const [fCustom, setFCustom] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.replace('/login');
      else { setSession(session); setChecking(false); }
    });
  }, [router]);

  const load = async () => {
    const { data } = await supabase.from('inventario_insumos').select('*').order('nombre');
    if (data) setInsumos(data);
  };

  useEffect(() => { if (session) load(); }, [session]);

  const openCrear = () => {
    setFNombre(''); setFQty('0'); setFUnidad('Unidades'); setFCustom(''); setEditId(null); setModal('crear');
  };

  const openEditar = (ins: Insumo) => {
    const isCustom = !UNIDADES.includes(ins.unidad);
    setFNombre(ins.nombre); setFQty(String(ins.cantidad));
    setFUnidad(isCustom ? '__custom__' : ins.unidad);
    setFCustom(isCustom ? ins.unidad : '');
    setEditId(ins.id); setModal('editar');
  };

  const unidadFinal = () => fUnidad === '__custom__' ? (fCustom.trim() || 'Unidades') : fUnidad;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const payload = { nombre: fNombre.trim(), cantidad: parseFloat(fQty) || 0, unidad: unidadFinal(), ultimo_ajuste: new Date().toISOString() };
    if (modal === 'crear') await supabase.from('inventario_insumos').insert(payload);
    else if (modal === 'editar' && editId) await supabase.from('inventario_insumos').update(payload).eq('id', editId);
    setSaving(false); setModal(null); load();
  };

  const adjust = async (ins: Insumo, delta: number) => {
    const q = Math.max(0, Number(ins.cantidad) + delta);
    setAdjustingId(ins.id);
    setInsumos(prev => prev.map(i => i.id === ins.id ? { ...i, cantidad: q } : i));
    await supabase.from('inventario_insumos').update({ cantidad: q, ultimo_ajuste: new Date().toISOString() }).eq('id', ins.id);
    setTimeout(() => setAdjustingId(null), 400);
  };

  const del = async (id: string) => {
    if (!confirm('¿Eliminar este insumo?')) return;
    await supabase.from('inventario_insumos').delete().eq('id', id);
    setInsumos(prev => prev.filter(i => i.id !== id));
  };

  if (checking) return null;

  const filtered = insumos.filter(i => i.nombre.toLowerCase().includes(search.toLowerCase()));

  return (
    <AppShell user={session?.user}>
      {/* Top Bar */}
      <div className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="topbar-page-name">INVENTARIO</span>
          <span className="topbar-badge">{insumos.length} Items</span>
        </div>
        <div className="topbar-actions">
          <div className="topbar-search">
            <Search size={14} color="var(--text-dim)" />
            <input placeholder="Buscar insumo..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <button className="btn btn-primary" onClick={openCrear}>
            <Plus size={14} /> Nuevo Insumo
          </button>
        </div>
      </div>

      <div className="page">
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--text-dim)', letterSpacing: '0.1em', textTransform: 'uppercase', fontSize: '0.75rem' }}>
            Sin insumos registrados
          </div>
        ) : (
          <div className="inventory-grid">
            {filtered.map(ins => {
              const isZero = Number(ins.cantidad) === 0;
              const isAdjusting = adjustingId === ins.id;
              return (
                <div
                  key={ins.id}
                  className={`insumo-card ${isZero ? 'zero' : ''}`}
                  style={{ transition: 'all 0.2s', ...(isAdjusting ? { borderColor: 'var(--accent)', boxShadow: '0 0 16px var(--accent-glow)' } : {}) }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 2 }}>
                    <div className="insumo-category">—</div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={() => openEditar(ins)} style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: 4 }}>
                        <Pencil size={12} />
                      </button>
                      <button onClick={() => del(ins.id)} style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: 4 }}>
                        <X size={12} />
                      </button>
                    </div>
                  </div>

                  <div className="insumo-name">{ins.nombre.toUpperCase()}</div>

                  <div className="insumo-quantity">
                    <span className={`insumo-qty-num ${isZero ? 'zero' : ''}`}>
                      {Number(ins.cantidad) % 1 === 0 ? ins.cantidad : Number(ins.cantidad).toFixed(1)}
                    </span>
                    <span className="insumo-unit">{ins.unidad}</span>
                    {isZero && (
                      <span className="chip chip-danger" style={{ marginLeft: 8 }}>Sin Stock</span>
                    )}
                  </div>

                  <div className="insumo-controls">
                    <button
                      className="insumo-btn insumo-btn-minus"
                      onClick={() => adjust(ins, -1)}
                      disabled={Number(ins.cantidad) <= 0}
                    >−</button>
                    <button
                      className="insumo-btn insumo-btn-plus"
                      onClick={() => adjust(ins, 1)}
                    >+</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setModal(null); }}>
          <div className="modal-box">
            <div className="modal-title">
              {modal === 'crear' ? 'NUEVO INSUMO' : 'EDITAR INSUMO'}
              <button onClick={() => setModal(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div className="field">
                <label>Nombre del Insumo</label>
                <input type="text" required placeholder="Ej. Tortillas de Harina" value={fNombre} onChange={e => setFNombre(e.target.value)} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                <div className="field">
                  <label>Cantidad Actual</label>
                  <input type="number" step="0.01" min="0" required value={fQty} onChange={e => setFQty(e.target.value)} style={{ textAlign: 'center' }} />
                </div>
                <div className="field">
                  <label>Unidad</label>
                  <select value={fUnidad} onChange={e => setFUnidad(e.target.value)}>
                    {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                    <option value="__custom__">Otra...</option>
                  </select>
                </div>
              </div>

              {fUnidad === '__custom__' && (
                <div className="field">
                  <label>Unidad Personalizada</label>
                  <input type="text" required placeholder="Ej. Bolsas de 500g" value={fCustom} onChange={e => setFCustom(e.target.value)} />
                </div>
              )}

              <div style={{ display: 'flex', gap: 12, paddingTop: 8 }}>
                <button type="button" onClick={() => setModal(null)} className="btn btn-secondary" style={{ flex: 1 }}>Cancelar</button>
                <button type="submit" disabled={saving} className="btn btn-primary" style={{ flex: 1 }}>
                  <Save size={14} /> {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
