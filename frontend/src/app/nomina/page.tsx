'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import AppShell from '@/components/AppShell';
import { User, Plus, Download, AlertCircle, Pencil, X } from 'lucide-react';

type NominaRow = {
  id: string;
  empleado_nombre: string;
  monto_pagado: number;
  fecha_pago: string;
  metodo_pago: string;
};

export default function NominaPage() {
  const router = useRouter();
  const [sessionUser, setSessionUser] = useState<any>(null);
  const [checking, setChecking] = useState(true);
  const [nomina, setNomina] = useState<NominaRow[]>([]);
  
  const [activeSession, setActiveSession] = useState<any>(null);
  const [nominaCategoriaId, setNominaCategoriaId] = useState<string | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nombre, setNombre] = useState('');
  const [monto, setMonto] = useState('');
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [metodoPago, setMetodoPago] = useState('Transferencia');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.replace('/login');
      else { setSessionUser(session.user); }
    });
  }, [router]);

  const loadDependencies = async () => {
    // 1. Fetch nómina category ID
    const { data: catData } = await supabase.from('categorias_finanzas').select('id').eq('tipo', 'NOMINA').maybeSingle();
    if (catData) setNominaCategoriaId(catData.id);

    // 2. Fetch active session
    const { data: sData } = await supabase.from('sesiones_caja').select('*').eq('estado', 'ABIERTA').maybeSingle();
    setActiveSession(sData || null);

    if (sData) {
      load(sData.id);
    }
    setChecking(false);
  };

  const load = async (sessionId: string) => {
    const { data } = await supabase
      .from('transacciones')
      .select('id, descripcion, monto, fecha, metodo_pago, categorias_finanzas!inner(tipo)')
      .eq('categorias_finanzas.tipo', 'NOMINA')
      .eq('tipo', 'SALIDA')
      .eq('sesion_caja_id', sessionId)
      .order('fecha', { ascending: false });

    if (data) {
      const mapped = data.map((t: any) => ({
        id: t.id,
        empleado_nombre: t.descripcion, // Repurpusing description for Employee Name
        monto_pagado: t.monto,
        fecha_pago: t.fecha,
        metodo_pago: t.metodo_pago
      }));
      setNomina(mapped);
    }
  };

  useEffect(() => {
    if (sessionUser) {
      loadDependencies();
    }
  }, [sessionUser]);

  const openNewModal = () => {
    setEditingId(null);
    setNombre(''); 
    setMonto(''); 
    setFecha(new Date().toISOString().slice(0, 10)); 
    setMetodoPago('Transferencia');
    setIsModalOpen(true);
  };

  const openEditModal = (n: NominaRow) => {
    setEditingId(n.id);
    setNombre(n.empleado_nombre); 
    setMonto(n.monto_pagado.toString()); 
    setFecha(n.fecha_pago.slice(0,10)); 
    setMetodoPago(n.metodo_pago);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim() || !monto || !nominaCategoriaId || !activeSession) return;
    setSaving(true);
    
    if (editingId) {
      await supabase.from('transacciones').update({
        descripcion: nombre.trim(),
        monto: parseFloat(monto),
        fecha: fecha,
        metodo_pago: metodoPago
      }).eq('id', editingId);
    } else {
      await supabase.from('transacciones').insert({
        descripcion: nombre.trim(),
        monto: parseFloat(monto),
        fecha: fecha,
        tipo: 'SALIDA',
        metodo_pago: metodoPago,
        categoria_id: nominaCategoriaId,
        sesion_caja_id: activeSession.id
      });
    }
    
    setIsModalOpen(false);
    setSaving(false);
    load(activeSession.id);
  };

  if (checking) return null;

  if (!activeSession) {
    return (
      <AppShell user={sessionUser}>
        <div className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="topbar-page-name" style={{ color: 'var(--accent)' }}>NÓMINA</span>
            <span style={{ color: 'var(--text-muted)', fontFamily: 'Bebas Neue', fontSize: '1.5rem' }}>/ PAGOS</span>
          </div>
        </div>
        <div style={{ height: '70vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
          <AlertCircle size={64} style={{ color: 'rgba(255,255,255,0.1)', marginBottom: 24, strokeWidth: 1.5 }} />
          <h2 style={{ fontFamily: 'Bebas Neue', fontSize: '2rem', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>NO HAY TURNO DE CAJA ABIERTO</h2>
          <p style={{ color: 'var(--text-dim)', maxWidth: 400, marginTop: 8, marginBottom: 32 }}>
            No puedes sacar fondos de nómina sin una caja activa. Por favor abre un turno para empezar a operar.
          </p>
          <button onClick={() => router.push('/caja')} className="btn" style={{ background: 'var(--accent)', color: '#fff', padding: '0 32px', height: 48, fontWeight: 800 }}>
            IR A ABRIR TURNO DE CAJA
          </button>
        </div>
      </AppShell>
    );
  }

  // Group by date
  const grouped: Record<string, NominaRow[]> = {};
  nomina.forEach(n => {
    const key = n.fecha_pago.slice(0, 10);
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(n);
  });

  const totalNomina = nomina.reduce((s, n) => s + Number(n.monto_pagado), 0);
  const totalPagos = nomina.length;

  const formatDate = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('es', { weekday: 'short', day: '2-digit', month: 'short' }).toUpperCase();

  return (
    <AppShell user={sessionUser}>
      <div className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="topbar-page-name" style={{ color: 'var(--accent)' }}>NÓMINA</span>
          <span style={{ color: 'var(--text-muted)', fontFamily: 'Bebas Neue', fontSize: '1.5rem' }}>/ PAGOS</span>
        </div>
        <div className="topbar-actions">
          <button onClick={openNewModal} className="btn" style={{ background: 'var(--accent)', color: '#fff', height: 38, padding: '0 20px', fontWeight: 800 }}>
            <Plus size={16} style={{ marginRight: 6 }} /> NUEVO PAGO
          </button>
          <button className="btn btn-secondary" style={{ gap: 6, height: 38 }}>
            <Download size={13} /> CSV
          </button>
        </div>
      </div>

      <div className="page" style={{ display: 'flex', flexDirection: 'column', gap: 28, position: 'relative' }}>
        
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
              <div className="metric-sub">En turno actual</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Personas Pagadas</div>
              <div className="metric-value" style={{ fontSize: '2rem' }}>{new Set(nomina.map(n => n.empleado_nombre)).size}</div>
            </div>
          </div>
        )}

        {/* History */}
        <div>
          <div style={{ fontFamily: 'Bebas Neue', fontSize: '1.2rem', letterSpacing: '0.08em', marginBottom: 20 }}>HISTORIAL DEL TURNO ACTUAL</div>
          {Object.entries(grouped).map(([date, rows]) => (
            <div key={date}>
              <div className="expense-date-header">{formatDate(date)}</div>
              {rows.map(n => (
                <div key={n.id} className="expense-row" style={{ display: 'grid', gridTemplateColumns: '40px 1fr 100px 100px 40px', alignItems: 'center', gap: 16 }}>
                  <div className="expense-icon" style={{ background: 'var(--accent)', width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <User size={15} color="#fff" />
                  </div>
                  <div className="expense-info">
                    <div className="expense-name">{n.empleado_nombre}</div>
                    <div className="expense-category">Pago de Nómina</div>
                  </div>
                  <span className={`chip ${n.metodo_pago === 'Efectivo' ? 'chip-negocio' : 'chip-bolsillo'}`} style={{ textAlign: 'center' }}>
                    {n.metodo_pago}
                  </span>
                  <span className="expense-amount" style={{ textAlign: 'right' }}>-${Number(n.monto_pagado).toFixed(2)}</span>
                  <button onClick={() => openEditModal(n)} className="btn btn-secondary" style={{ padding: 0, width: 32, height: 32, borderRadius: 6, opacity: 0.6 }}>
                    <Pencil size={13} />
                  </button>
                </div>
              ))}
            </div>
          ))}
          {nomina.length === 0 && (
            <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem', textAlign: 'center', padding: 40, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Sin pagos registrados en este turno
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.8)', zIndex: 999, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div className="card" style={{ width: '100%', maxWidth: 500, padding: 32, position: 'relative' }}>
            <button onClick={() => setIsModalOpen(false)} style={{ position: 'absolute', top: 20, right: 20, background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}>
              <X size={20} />
            </button>
            <div style={{ fontFamily: 'Bebas Neue', fontSize: '1.4rem', letterSpacing: '0.08em', marginBottom: 24, color: 'var(--text)' }}>
              {editingId ? 'EDITAR PAGO DE NÓMINA' : 'REGISTRAR NUEVO PAGO'}
            </div>
            
            <form onSubmit={handleSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="field">
                  <label>Fecha</label>
                  <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} required />
                </div>
                <div className="field">
                  <label>Método de Pago</label>
                  <select value={metodoPago} onChange={e => setMetodoPago(e.target.value)}>
                    <option value="Transferencia">Transferencia</option>
                    <option value="Efectivo">Efectivo</option>
                  </select>
                </div>
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <label>Nombre del Empleado o Contratista</label>
                  <input
                    type="text"
                    placeholder="Ej: Marco Aurelio Rodríguez"
                    value={nombre}
                    onChange={e => setNombre(e.target.value)}
                    required
                  />
                </div>
                <div className="field" style={{ gridColumn: '1 / -1' }}>
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
                <div style={{ gridColumn: '1 / -1', marginTop: 16, display: 'flex', gap: 12 }}>
                  <button type="button" onClick={() => setIsModalOpen(false)} className="btn btn-secondary" style={{ flex: 1, height: 48, fontWeight: 800 }}>
                    CANCELAR
                  </button>
                  <button type="submit" disabled={saving || !nominaCategoriaId} className="btn" style={{ background: 'var(--accent)', color: '#fff', flex: 1, height: 48, fontWeight: 800 }}>
                    {saving ? 'GUARDANDO...' : (editingId ? 'GUARDAR CAMBIOS' : 'REGISTRAR PAGO')}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
