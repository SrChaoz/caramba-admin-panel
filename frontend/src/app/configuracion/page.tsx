'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import AppShell from '@/components/AppShell';
import { Plus, Trash2 } from 'lucide-react';

type CategoriaPlato = { id: number; nombre: string; orden: number };
type TipoPlato = { id: number; nombre: string; descripcion: string; orden: number };
type Mesa = { id: number; nombre: string; activa: boolean; orden: number };

export default function ConfiguracionPage() {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);

  const [categorias, setCategorias] = useState<CategoriaPlato[]>([]);
  const [tipos, setTipos] = useState<TipoPlato[]>([]);
  const [whatsapp, setWhatsapp] = useState('');
  const [savingWa, setSavingWa] = useState(false);

  const [deliveryDays, setDeliveryDays] = useState<string[]>(['Viernes', 'Sábado']);
  const [newDay, setNewDay] = useState('');

  const [nuevaCat, setNuevaCat] = useState('');
  const [nuevoTipo, setNuevoTipo] = useState('');
  const [nuevoTipoDesc, setNuevoTipoDesc] = useState('');
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [nuevaMesa, setNuevaMesa] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.replace('/login');
      else { setSession(session); setChecking(false); }
    });
  }, [router]);

  useEffect(() => { if (!checking) fetchAll(); }, [checking]);

  const sortDays = (days: string[]) => {
    const dayOrder: Record<string, number> = {
      'lunes': 1, 'martes': 2, 'miércoles': 3, 'miercoles': 3,
      'jueves': 4, 'viernes': 5, 'sábado': 6, 'sabado': 6, 'domingo': 7
    };
    return [...days].sort((a, b) => (dayOrder[a.toLowerCase()] || 99) - (dayOrder[b.toLowerCase()] || 99));
  };

  const fetchAll = async () => {
    setLoading(true);
    const [confRes, catRes, tipoRes, mesasRes] = await Promise.all([
      supabase.from('restaurante_config').select('*'),
      supabase.from('categorias_plato').select('*').order('orden'),
      supabase.from('tipos_plato').select('*').order('orden'),
      supabase.from('mesas').select('*').order('orden'),
    ]);
    if (catRes.data) setCategorias(catRes.data);
    if (tipoRes.data) setTipos(tipoRes.data);
    if (mesasRes.data) setMesas(mesasRes.data);
    if (confRes.data) {
      setWhatsapp(confRes.data?.find((c: any) => c.clave === 'whatsapp_phone')?.valor?.replace(/"/g, '') || '');
      const rawDays = confRes.data?.find((c: any) => c.clave === 'dias_entrega')?.valor;
      if (rawDays) {
        try {
          const parsedDays = typeof rawDays === 'string' ? JSON.parse(rawDays) : rawDays;
          if (Array.isArray(parsedDays)) setDeliveryDays(sortDays(parsedDays));
        } catch (e) {}
      }
    }
    setLoading(false);
  };

  const saveWhatsapp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingWa(true);
    await supabase.from('restaurante_config').upsert({ clave: 'whatsapp_phone', valor: `"${whatsapp}"` });
    setSavingWa(false);
  };

  const addDeliveryDay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDay.trim()) return;
    const newDays = sortDays([...deliveryDays, newDay.trim()]);
    setDeliveryDays(newDays);
    setNewDay('');
    await supabase.from('restaurante_config').upsert({ clave: 'dias_entrega', valor: JSON.stringify(newDays) });
  };

  const removeDeliveryDay = async (dayToRemove: string) => {
    const newDays = deliveryDays.filter(d => d !== dayToRemove);
    setDeliveryDays(newDays);
    await supabase.from('restaurante_config').upsert({ clave: 'dias_entrega', valor: JSON.stringify(newDays) });
  };

  const addCategoria = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevaCat.trim()) return;
    await supabase.from('categorias_plato').insert({ nombre: nuevaCat.trim(), orden: categorias.length });
    setNuevaCat(''); fetchAll();
  };

  const delCategoria = async (id: number) => {
    if (!confirm('¿Eliminar esta categoría?')) return;
    await supabase.from('categorias_plato').delete().eq('id', id);
    fetchAll();
  };

  const addTipo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevoTipo.trim()) return;
    await supabase.from('tipos_plato').insert({ nombre: nuevoTipo.trim(), descripcion: nuevoTipoDesc.trim(), orden: tipos.length });
    setNuevoTipo(''); setNuevoTipoDesc(''); fetchAll();
  };

  const delTipo = async (id: number) => {
    if (!confirm('¿Eliminar este tipo?')) return;
    await supabase.from('tipos_plato').delete().eq('id', id);
    fetchAll();
  };

  const addMesa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevaMesa.trim()) return;
    await supabase.from('mesas').insert({ nombre: nuevaMesa.trim(), activa: true, orden: mesas.length + 1 });
    setNuevaMesa(''); fetchAll();
  };

  const toggleMesa = async (m: Mesa) => {
    await supabase.from('mesas').update({ activa: !m.activa }).eq('id', m.id);
    fetchAll();
  };

  const delMesa = async (id: number) => {
    if (!confirm('¿Eliminar esta mesa? Solo es posible si no tiene pedidos activos.')) return;
    const { error } = await supabase.from('mesas').delete().eq('id', id);
    if (error) alert('No se puede eliminar: la mesa tiene pedidos asociados. Desactívala en su lugar.');
    fetchAll();
  };

  if (checking) return null;

  return (
    <AppShell user={session?.user}>
      <div className="topbar">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="topbar-page-name uppercase">Configuración</span>
          <span className="topbar-subtitle">Ajustes generales del sistema.</span>
        </div>
      </div>

      <div className="page" style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 24 }}>
        {loading && <div style={{ color: 'var(--text-dim)' }}>Cargando...</div>}

        {/* ── WhatsApp ── */}
        <div className="card" style={{ padding: 24 }}>
          <h3 style={{ marginTop: 0, marginBottom: 4 }}>📱 WhatsApp de Pedidos</h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: 16 }}>
            Número al que se redirigen los pedidos del web order.
          </p>
          <form onSubmit={saveWhatsapp} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="field">
              <label>Teléfono (+593…)</label>
              <input type="text" value={whatsapp} onChange={e => setWhatsapp(e.target.value)} placeholder="+5930000000000" />
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: 'fit-content' }} disabled={savingWa}>
              {savingWa ? 'Guardando…' : 'Guardar'}
            </button>
          </form>
        </div>

        {/* ── Días de Entrega ── */}
        <div className="card" style={{ padding: 24 }}>
          <h3 style={{ marginTop: 0, marginBottom: 4 }}>🗓️ Días de Entrega</h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: 16 }}>
            Días disponibles para que el cliente elija en el web order.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
            {deliveryDays.map(day => (
              <div key={day} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', background: 'var(--surface-hi)', borderRadius: 8 }}>
                <span style={{ fontWeight: 700 }}>{day}</span>
                <button className="btn btn-secondary" style={{ color: 'var(--danger)', padding: '4px 8px' }} onClick={() => removeDeliveryDay(day)}>
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
          <form onSubmit={addDeliveryDay} style={{ display: 'flex', gap: 8 }}>
            <input
              style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--surface-hi)', padding: '8px 12px', borderRadius: 8, color: 'var(--text)', outline: 'none' }}
              placeholder="Añadir día (ej: Jueves)"
              value={newDay}
              onChange={e => setNewDay(e.target.value)}
            />
            <button type="submit" className="btn btn-primary"><Plus size={14} /> Agregar</button>
          </form>
        </div>

        {/* ── Categorías de Menú ── */}
        <div className="card" style={{ padding: 24 }}>
          <h3 style={{ marginTop: 0, marginBottom: 4 }}>🏷️ Categorías de Menú</h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: 16 }}>
            Agrupa los platos: Comida Mexicana, Entradas, Bebidas…
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
            {categorias.map(c => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', background: 'var(--surface-hi)', borderRadius: 8 }}>
                <span style={{ fontWeight: 700 }}>{c.nombre}</span>
                <button className="btn btn-secondary" style={{ color: 'var(--danger)', padding: '4px 8px' }} onClick={() => delCategoria(c.id)}>
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
          <form onSubmit={addCategoria} style={{ display: 'flex', gap: 8 }}>
            <input
              style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--surface-hi)', padding: '8px 12px', borderRadius: 8, color: 'var(--text)', outline: 'none' }}
              placeholder="Nueva categoría (ej: Postres)"
              value={nuevaCat}
              onChange={e => setNuevaCat(e.target.value)}
            />
            <button type="submit" className="btn btn-primary"><Plus size={14} /> Agregar</button>
          </form>
        </div>

        {/* ── Tipos de Plato ── */}
        <div className="card" style={{ padding: 24 }}>
          <h3 style={{ marginTop: 0, marginBottom: 4 }}>⚙️ Tipos de Plato</h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: 16 }}>
            Define cómo funciona cada plato: configurable, simple, combo…
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
            {tipos.map(t => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', background: 'var(--surface-hi)', borderRadius: 8 }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{t.nombre}</div>
                  {t.descripcion && <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{t.descripcion}</div>}
                </div>
                <button className="btn btn-secondary" style={{ color: 'var(--danger)', padding: '4px 8px' }} onClick={() => delTipo(t.id)}>
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
          <form onSubmit={addTipo} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              style={{ width: 140, background: 'var(--surface)', border: '1px solid var(--surface-hi)', padding: '8px 12px', borderRadius: 8, color: 'var(--text)', outline: 'none' }}
              placeholder="Nombre (ej: combo)"
              value={nuevoTipo}
              onChange={e => setNuevoTipo(e.target.value)}
            />
            <input
              style={{ flex: 1, minWidth: 160, background: 'var(--surface)', border: '1px solid var(--surface-hi)', padding: '8px 12px', borderRadius: 8, color: 'var(--text)', outline: 'none' }}
              placeholder="Descripción (opcional)"
              value={nuevoTipoDesc}
              onChange={e => setNuevoTipoDesc(e.target.value)}
            />
            <button type="submit" className="btn btn-primary"><Plus size={14} /> Agregar</button>
          </form>
        </div>
        {/* ── Mesas del Restaurante ── */}
        <div className="card" style={{ padding: 24 }}>
          <h3 style={{ marginTop: 0, marginBottom: 4 }}>🪑 Mesas del Restaurante</h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: 16 }}>
            Crea y gestiona las mesas disponibles para los meseros.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
            {mesas.map(m => (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', background: 'var(--surface-hi)', borderRadius: 8 }}>
                <span style={{ fontWeight: 700, color: m.activa ? 'var(--text)' : 'var(--text-dim)' }}>
                  🪑 {m.nombre}
                  {!m.activa && <span style={{ marginLeft: 8, fontSize: '0.65rem', background: 'rgba(255,255,255,0.08)', padding: '2px 8px', borderRadius: 99 }}>Desactivada</span>}
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.7rem', color: m.activa ? 'var(--warning)' : 'var(--success)' }} onClick={() => toggleMesa(m)}>
                    {m.activa ? 'Desactivar' : 'Activar'}
                  </button>
                  <button className="btn btn-secondary" style={{ color: 'var(--danger)', padding: '4px 8px' }} onClick={() => delMesa(m.id)}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
            {mesas.length === 0 && <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>No hay mesas configuradas todavía.</div>}
          </div>
          <form onSubmit={addMesa} style={{ display: 'flex', gap: 8 }}>
            <input
              style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--surface-hi)', padding: '8px 12px', borderRadius: 8, color: 'var(--text)', outline: 'none' }}
              placeholder="Nueva mesa (ej: Mesa 7, Barra, Terraza…)"
              value={nuevaMesa}
              onChange={e => setNuevaMesa(e.target.value)}
            />
            <button type="submit" className="btn btn-primary"><Plus size={14} /> Agregar</button>
          </form>
        </div>
      </div>

      <style jsx>{`
        .field { display: flex; flex-direction: column; gap: 4px; }
        .field label { font-size: 0.75rem; font-weight: 800; color: var(--text-dim); text-transform: uppercase; }
        .field input { background: var(--surface); border: 1px solid var(--surface-hi); padding: 10px; border-radius: 8px; color: var(--text); outline: none; }
        .field input:focus { border-color: var(--accent); }
      `}</style>
    </AppShell>
  );
}
