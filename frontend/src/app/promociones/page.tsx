'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import AppShell from '@/components/AppShell';
import { Tag, Plus, Pencil, X, Save, Trash2, Power } from 'lucide-react';

type Promocion = {
  id: string;
  nombre: string;
  descripcion: string | null;
  condicion_valor: number;
  recompensa: string;
  activo: boolean;
};

export default function PromocionesPage() {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [checking, setChecking] = useState(true);
  const [promos, setPromos] = useState<Promocion[]>([]);
  const [loading, setLoading] = useState(false);

  // Form states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editId, setEditId] = useState('');
  const [fNombre, setFNombre] = useState('');
  const [fDesc, setFDesc] = useState('');
  const [fValor, setFValor] = useState('3');
  const [fRecompensa, setFRecompensa] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.replace('/login');
      else { setSession(session); setChecking(false); fetchPromos(); }
    });
  }, [router]);

  const fetchPromos = async () => {
    setLoading(true);
    const { data } = await supabase.from('promociones').select('*').order('condicion_valor', { ascending: false });
    if (data) setPromos(data);
    setLoading(false);
  };

  const openCrear = () => {
    setEditId(''); setFNombre(''); setFDesc(''); setFValor('3'); setFRecompensa('');
    setIsModalOpen(true);
  };

  const openEditar = (p: Promocion) => {
    setEditId(p.id); setFNombre(p.nombre); setFDesc(p.descripcion || '');
    setFValor(String(p.condicion_valor)); setFRecompensa(p.recompensa);
    setIsModalOpen(true);
  };

  const closeModal = () => setIsModalOpen(false);

  const savePromo = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      nombre: fNombre,
      descripcion: fDesc || null,
      condicion_valor: Number(fValor),
      recompensa: fRecompensa
    };

    if (editId) {
      await supabase.from('promociones').update(payload).eq('id', editId);
    } else {
      await supabase.from('promociones').insert([{ ...payload, activo: true }]);
    }
    closeModal();
    fetchPromos();
  };

  const toggleStatus = async (p: Promocion) => {
    await supabase.from('promociones').update({ activo: !p.activo }).eq('id', p.id);
    fetchPromos();
  };

  const deletePromo = async (id: string) => {
    if (confirm('¿Seguro de eliminar esta promoción permanentemente?')) {
      await supabase.from('promociones').delete().eq('id', id);
      fetchPromos();
    }
  };

  if (checking) return null;

  return (
    <AppShell user={session?.user}>
      <div className="topbar">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="topbar-page-name">GESTIÓN DE PROMOCIONES</span>
          </div>
          <span className="topbar-subtitle">Configura recompensas para tus clientes basadas en la cantidad de burritos.</span>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-primary" onClick={openCrear}>
            <Plus size={14} /> Nueva Promo
          </button>
        </div>
      </div>

      <div className="page" style={{ maxWidth: 800 }}>
        {loading ? (
           <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0', color: 'var(--text-dim)' }}>Cargando...</div>
        ) : (
          <div style={{ display: 'grid', gap: 16 }}>
            {promos.length === 0 && (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)', background: 'var(--surface-max)', borderRadius: 12 }}>
                No hay promociones configuradas aún.
              </div>
            )}
            {promos.map(p => (
              <div key={p.id} className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12, opacity: p.activo ? 1 : 0.6, borderLeft: p.activo ? '4px solid var(--accent)' : '4px solid var(--text-dim)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Tag size={16} color="var(--accent)"/> {p.nombre}
                    </div>
                    {p.descripcion && <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>{p.descripcion}</div>}
                  </div>
                  
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => toggleStatus(p)} className={`btn btn-sm ${p.activo ? 'btn-ghost' : 'btn-secondary'}`} title={p.activo ? 'Desactivar' : 'Activar'}>
                      <Power size={14} color={p.activo ? 'var(--danger)' : '#22c55e'} />
                    </button>
                    <button onClick={() => openEditar(p)} className="btn btn-sm btn-ghost" title="Editar">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => deletePromo(p.id)} className="btn btn-sm btn-ghost" title="Eliminar">
                      <Trash2 size={14} color="var(--danger)" />
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                  <div style={{ background: 'var(--surface-max)', padding: '6px 12px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 'bold' }}>
                    Condición: <span style={{ color: 'var(--accent)' }}>Mín. {p.condicion_valor} burritos</span>
                  </div>
                  <div style={{ background: 'var(--surface-max)', padding: '6px 12px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 'bold' }}>
                    Recompensa: <span style={{ color: '#22c55e' }}>{p.recompensa}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <div className="modal-title" style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: 'var(--text)', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>{editId ? 'Editar Promoción' : 'Nueva Promoción'}</div>
              <button onClick={closeModal} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={18}/></button>
            </div>
            
            <form onSubmit={savePromo} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="field">
                <label>Nombre de la Promoción</label>
                <input type="text" required value={fNombre} onChange={e => setFNombre(e.target.value)} placeholder="Ej: Soda de Litro Gratis!" />
              </div>
              
              <div className="field">
                <label>Descripción (Opcional)</label>
                <textarea rows={2} value={fDesc} onChange={e => setFDesc(e.target.value)} placeholder="Ej: Válida para pedidos grandes..." />
              </div>

              <div style={{ display: 'flex', gap: 16 }}>
                <div className="field" style={{ flex: 1 }}>
                  <label>Burritos Mínimos</label>
                  <input type="number" required min="1" value={fValor} onChange={e => setFValor(e.target.value)} />
                </div>
                <div className="field" style={{ flex: 2 }}>
                  <label>Recompensa a Enviar</label>
                  <input type="text" required value={fRecompensa} onChange={e => setFRecompensa(e.target.value)} placeholder="Ej: 1x Cola 1L" />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={closeModal}>Cancelar</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1, display: 'flex', justifyContent: 'center', gap: 6 }}><Save size={15}/> Guardar Promoción</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
