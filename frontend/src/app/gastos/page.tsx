'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import AppShell from '@/components/AppShell';
import { ShoppingCart, Zap, Package, Plus, Download } from 'lucide-react';

type Gasto = { id: string; descripcion: string; monto: number; fecha: string; pagado_de_caja: boolean; };

const ICON_MAP: Record<string, React.ReactNode> = {
  default: <ShoppingCart size={16} />,
  luz: <Zap size={16} />,
  gas: <Package size={16} />,
};

export default function GastosPage() {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [checking, setChecking] = useState(true);
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [desc, setDesc] = useState('');
  const [monto, setMonto] = useState('');
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [deCaja, setDeCaja] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.replace('/login');
      else { setSession(session); setChecking(false); }
    });
  }, [router]);

  const load = async () => {
    const { data } = await supabase.from('gastos_inversion').select('*').order('fecha', { ascending: false });
    if (data) setGastos(data);
  };

  useEffect(() => { if (session) load(); }, [session]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!desc.trim() || !monto) return;
    setSaving(true);
    await supabase.from('gastos_inversion').insert({
      descripcion: desc.trim(), monto: parseFloat(monto), fecha, pagado_de_caja: deCaja,
    });
    setDesc(''); setMonto('');
    setSaving(false);
    load();
  };

  if (checking) return null;

  // Group by date
  const grouped: Record<string, Gasto[]> = {};
  gastos.forEach(g => {
    const key = g.fecha;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(g);
  });

  const formatDate = (d: string) => {
    const date = new Date(d + 'T12:00:00');
    return date.toLocaleDateString('es', { weekday: 'short', day: '2-digit', month: 'short' }).toUpperCase();
  };

  return (
    <AppShell user={session?.user}>
      <div className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="topbar-page-name" style={{ color: 'var(--accent)' }}>GASTOS</span>
          <span style={{ color: 'var(--text-muted)', fontFamily: 'Bebas Neue', fontSize: '1.5rem' }}>/ INVERSIÓN</span>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-secondary" style={{ gap: 6 }}>
            <Download size={13} /> Exportar CSV
          </button>
        </div>
      </div>

      <div className="page" style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        {/* Form */}
        <div className="card" style={{ borderLeft: '3px solid var(--accent)', borderRadius: '0 10px 10px 0', padding: '24px 28px' }}>
          <div style={{ fontFamily: 'Bebas Neue', fontSize: '1rem', letterSpacing: '0.08em', marginBottom: 20, color: 'var(--text-muted)' }}>REGISTRAR NUEVO EGRESO</div>
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 140px auto', gap: 24, alignItems: 'end' }}>
              <div className="field">
                <label>Fecha</label>
                <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
              </div>
              <div className="field">
                <label>Descripción del Gasto</label>
                <input
                  type="text"
                  placeholder="Ej: Reposición de insumos frescos"
                  value={desc}
                  onChange={e => setDesc(e.target.value)}
                  required
                />
              </div>
              <div className="field">
                <label>Monto ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={monto}
                  onChange={e => setMonto(e.target.value)}
                  required
                />
              </div>
              <button type="submit" disabled={saving} className="btn btn-primary" style={{ height: 40, borderRadius: 6 }}>
                <Plus size={16} />
              </button>
            </div>
            <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                id="deCaja"
                checked={deCaja}
                onChange={e => setDeCaja(e.target.checked)}
                style={{ accentColor: 'var(--accent)', width: 14, height: 14 }}
              />
              <label htmlFor="deCaja" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.06em', cursor: 'pointer' }}>
                DINERO DEL NEGOCIO
              </label>
            </div>
          </form>
        </div>

        {/* History */}
        <div>
          <div style={{ fontFamily: 'Bebas Neue', fontSize: '1.2rem', letterSpacing: '0.08em', marginBottom: 20 }}>HISTORIAL DE MOVIMIENTOS</div>
          {Object.entries(grouped).map(([date, items]) => (
            <div key={date}>
              <div className="expense-date-header">{formatDate(date)}</div>
              {items.map(g => (
                <div key={g.id} className="expense-row">
                  <div className="expense-icon">
                    <ShoppingCart size={16} />
                  </div>
                  <div className="expense-info">
                    <div className="expense-name">{g.descripcion}</div>
                    <div className="expense-category">{g.pagado_de_caja ? 'Fondos del Negocio' : 'Gasto Personal'}</div>
                  </div>
                  <span className={`chip ${g.pagado_de_caja ? 'chip-negocio' : 'chip-bolsillo'}`}>
                    {g.pagado_de_caja ? 'Negocio' : 'De Bolsillo'}
                  </span>
                  <span className="expense-amount">-${Number(g.monto).toFixed(2)}</span>
                </div>
              ))}
            </div>
          ))}
          {gastos.length === 0 && (
            <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem', textAlign: 'center', padding: 40, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Sin gastos registrados
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
