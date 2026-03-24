'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import AppShell from '@/components/AppShell';
import { User, Plus, Download } from 'lucide-react';

type NominaRow = { id: string; empleado_nombre: string; monto_pagado: number; fecha_pago: string; };

export default function NominaPage() {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [checking, setChecking] = useState(true);
  const [nomina, setNomina] = useState<NominaRow[]>([]);
  const [nombre, setNombre] = useState('');
  const [monto, setMonto] = useState('');
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.replace('/login');
      else { setSession(session); setChecking(false); }
    });
  }, [router]);

  const load = async () => {
    const { data } = await supabase.from('nomina').select('*').order('fecha_pago', { ascending: false });
    if (data) setNomina(data);
  };

  useEffect(() => { if (session) load(); }, [session]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim() || !monto) return;
    setSaving(true);
    await supabase.from('nomina').insert({
      empleado_nombre: nombre.trim(), monto_pagado: parseFloat(monto), fecha_pago: fecha,
    });
    setNombre(''); setMonto('');
    setSaving(false);
    load();
  };

  if (checking) return null;

  // Group by date
  const grouped: Record<string, NominaRow[]> = {};
  nomina.forEach(n => {
    const key = n.fecha_pago;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(n);
  });

  const totalNomina = nomina.reduce((s, n) => s + Number(n.monto_pagado), 0);
  const totalPagos = nomina.length;

  const formatDate = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('es', { weekday: 'short', day: '2-digit', month: 'short' }).toUpperCase();

  return (
    <AppShell user={session?.user}>
      <div className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="topbar-page-name" style={{ color: 'var(--accent)' }}>NÓMINA</span>
          <span style={{ color: 'var(--text-muted)', fontFamily: 'Bebas Neue', fontSize: '1.5rem' }}>/ PAGOS</span>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-secondary" style={{ gap: 6 }}>
            <Download size={13} /> Exportar CSV
          </button>
        </div>
      </div>

      <div className="page" style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        {/* Form */}
        <div className="card" style={{ padding: '24px 28px' }}>
          <div style={{ fontFamily: 'Bebas Neue', fontSize: '1rem', letterSpacing: '0.08em', marginBottom: 20, color: 'var(--text-muted)' }}>REGISTRO DE PAGO</div>
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 140px auto', gap: 24, alignItems: 'end' }}>
              <div className="field">
                <label>Fecha de Operación</label>
                <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
              </div>
              <div className="field">
                <label>Nombre Completo del Receptor</label>
                <input
                  type="text"
                  placeholder="Ej: Marco Aurelio Rodríguez"
                  value={nombre}
                  onChange={e => setNombre(e.target.value)}
                  required
                />
              </div>
              <div className="field">
                <label>Monto a Liquidar ($)</label>
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
                Registrar
              </button>
            </div>
          </form>
        </div>

        {/* History */}
        <div>
          <div style={{ fontFamily: 'Bebas Neue', fontSize: '1.2rem', letterSpacing: '0.08em', marginBottom: 20 }}>HISTORIAL DE NÓMINA</div>
          {Object.entries(grouped).map(([date, rows]) => (
            <div key={date}>
              <div className="expense-date-header">{formatDate(date)}</div>
              {rows.map(n => (
                <div key={n.id} className="expense-row">
                  <div className="expense-icon" style={{ background: 'var(--accent)', width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <User size={15} color="#fff" />
                  </div>
                  <div className="expense-info">
                    <div className="expense-name">{n.empleado_nombre}</div>
                    <div className="expense-category">Pago de Nómina</div>
                  </div>
                  <span className="expense-amount">-${Number(n.monto_pagado).toFixed(2)}</span>
                </div>
              ))}
            </div>
          ))}
          {nomina.length === 0 && (
            <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem', textAlign: 'center', padding: 40, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Sin pagos registrados
            </div>
          )}
        </div>

        {/* Summary Cards */}
        {nomina.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <div className="metric-card">
              <div className="metric-label">Total Nómina</div>
              <div className="metric-value" style={{ fontSize: '2rem' }}>${totalNomina.toFixed(2)}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Pagos Realizados</div>
              <div className="metric-value" style={{ fontSize: '2rem' }}>{totalPagos}</div>
              <div className="metric-sub">100% Efectuados</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Personas Pagadas</div>
              <div className="metric-value" style={{ fontSize: '2rem' }}>{new Set(nomina.map(n => n.empleado_nombre)).size}</div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
