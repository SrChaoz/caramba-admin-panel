'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import AppShell from '@/components/AppShell';
import { ShoppingCart, Zap, Package, Plus, Download, Tag, AlertCircle, Pencil, X } from 'lucide-react';

type Gasto = {
  id: string;
  descripcion: string;
  monto: number;
  fecha: string;
  metodo_pago: string;
  categoria_id: string;
  categorias_finanzas: { nombre: string; tipo: string };
};

type Categoria = { id: string; nombre: string; tipo: string; };

export default function GastosPage() {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [checking, setChecking] = useState(true);
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  
  const [activeSession, setActiveSession] = useState<any>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [desc, setDesc] = useState('');
  const [monto, setMonto] = useState('');
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [metodoPago, setMetodoPago] = useState('Efectivo');
  const [categoriaId, setCategoriaId] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.replace('/login');
      else { setSession(session); }
    });
  }, [router]);

  const loadDependencies = async () => {
    const { data: catData } = await supabase.from('categorias_finanzas').select('*').in('tipo', ['COGS', 'OPEX']);
    if (catData) setCategorias(catData);

    const { data: sData } = await supabase.from('sesiones_caja').select('*').eq('estado', 'ABIERTA').maybeSingle();
    setActiveSession(sData || null);
    
    if (sData) {
      loadGastos(sData.id);
    }
    setChecking(false);
  };

  const loadGastos = async (sessionId: string) => {
    const { data } = await supabase
      .from('transacciones')
      .select('id, descripcion, monto, fecha, metodo_pago, categoria_id, categorias_finanzas(nombre, tipo)')
      .eq('tipo', 'SALIDA')
      .eq('sesion_caja_id', sessionId)
      .order('fecha', { ascending: false });
    
    if (data) {
      const filtered = data.filter((t: any) => t.categorias_finanzas?.tipo === 'COGS' || t.categorias_finanzas?.tipo === 'OPEX');
      setGastos(filtered as unknown as Gasto[]);
    }
  };

  useEffect(() => {
    if (session) {
      loadDependencies();
    }
  }, [session]);

  const openNewModal = () => {
    setEditingId(null);
    setDesc(''); setMonto(''); setCategoriaId(''); 
    setFecha(new Date().toISOString().slice(0, 10)); 
    setMetodoPago('Efectivo');
    setIsModalOpen(true);
  };

  const openEditModal = (g: Gasto) => {
    setEditingId(g.id);
    setDesc(g.descripcion); 
    setMonto(g.monto.toString()); 
    setCategoriaId(g.categoria_id || ''); 
    setFecha(g.fecha.slice(0,10)); 
    setMetodoPago(g.metodo_pago);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!desc.trim() || !monto || !categoriaId || !activeSession) return;
    setSaving(true);
    
    if (editingId) {
      await supabase.from('transacciones').update({
        descripcion: desc.trim(),
        monto: parseFloat(monto),
        fecha,
        metodo_pago: metodoPago,
        categoria_id: categoriaId
      }).eq('id', editingId);
    } else {
      await supabase.from('transacciones').insert({
        descripcion: desc.trim(),
        monto: parseFloat(monto),
        fecha,
        tipo: 'SALIDA',
        metodo_pago: metodoPago,
        categoria_id: categoriaId,
        sesion_caja_id: activeSession.id
      });
    }
    
    setIsModalOpen(false);
    setSaving(false);
    loadGastos(activeSession.id);
  };

  if (checking) return null;

  if (!activeSession) {
    return (
      <AppShell user={session?.user}>
        <div className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="topbar-page-name" style={{ color: 'var(--accent)' }}>GASTOS</span>
            <span style={{ color: 'var(--text-muted)', fontFamily: 'Bebas Neue', fontSize: '1.5rem' }}>/ INVERSIÓN</span>
          </div>
        </div>
        <div style={{ height: '70vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
          <AlertCircle size={64} style={{ color: 'rgba(255,255,255,0.1)', marginBottom: 24, strokeWidth: 1.5 }} />
          <h2 style={{ fontFamily: 'Bebas Neue', fontSize: '2rem', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>NO HAY TURNO DE CAJA ABIERTO</h2>
          <p style={{ color: 'var(--text-dim)', maxWidth: 400, marginTop: 8, marginBottom: 32 }}>
            No puedes registrar gastos sin una caja activa. Por favor abre un turno para empezar a operar.
          </p>
          <button onClick={() => router.push('/caja')} className="btn" style={{ background: 'var(--accent)', color: '#fff', padding: '0 32px', height: 48, fontWeight: 800 }}>
            IR A ABRIR TURNO DE CAJA
          </button>
        </div>
      </AppShell>
    );
  }

  // Group by date
  const grouped: Record<string, Gasto[]> = {};
  gastos.forEach(g => {
    const key = g.fecha.slice(0, 10);
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
          <button onClick={openNewModal} className="btn" style={{ background: 'var(--accent)', color: '#fff', height: 38, padding: '0 20px', fontWeight: 800 }}>
            <Plus size={16} style={{ marginRight: 6 }} /> NUEVO EGRESO
          </button>
          <button className="btn btn-secondary" style={{ gap: 6, height: 38 }}>
            <Download size={13} /> CSV
          </button>
        </div>
      </div>

      <div className="page" style={{ display: 'flex', flexDirection: 'column', gap: 28, position: 'relative' }}>
        
        {/* History */}
        <div>
          <div style={{ fontFamily: 'Bebas Neue', fontSize: '1.2rem', letterSpacing: '0.08em', marginBottom: 20 }}>HISTORIAL DEL TURNO ACTUAL</div>
          {Object.entries(grouped).map(([date, items]) => (
            <div key={date}>
              <div className="expense-date-header">{formatDate(date)}</div>
              {items.map(g => (
                <div key={g.id} className="expense-row" style={{ display: 'grid', gridTemplateColumns: '40px 1fr 140px 100px 40px', alignItems: 'center', gap: 16 }}>
                  <div className="expense-icon">
                    <Tag size={16} />
                  </div>
                  <div className="expense-info">
                    <div className="expense-name">{g.descripcion}</div>
                    <div className="expense-category">{g.categorias_finanzas?.nombre} — {g.categorias_finanzas?.tipo}</div>
                  </div>
                  <span className={`chip ${g.metodo_pago === 'Efectivo' ? 'chip-negocio' : 'chip-bolsillo'}`}>
                    {g.metodo_pago}
                  </span>
                  <span className="expense-amount" style={{ textAlign: 'right' }}>-${Number(g.monto).toFixed(2)}</span>
                  <button onClick={() => openEditModal(g)} className="btn btn-secondary" style={{ padding: 0, width: 32, height: 32, borderRadius: 6, opacity: 0.6 }}>
                    <Pencil size={13} />
                  </button>
                </div>
              ))}
            </div>
          ))}
          {gastos.length === 0 && (
            <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem', textAlign: 'center', padding: 40, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Sin gastos en este turno
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
              {editingId ? 'EDITAR EGRESO' : 'REGISTRAR NUEVO EGRESO'}
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
                    <option value="Efectivo">Efectivo</option>
                    <option value="Transferencia">Transferencia</option>
                  </select>
                </div>
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <label>Categoría</label>
                  <select value={categoriaId} onChange={e => setCategoriaId(e.target.value)} required>
                    <option value="" disabled>Selecciona...</option>
                    {categorias.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.nombre} ({cat.tipo})</option>
                    ))}
                  </select>
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
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <label>Descripción detallada</label>
                  <input
                    type="text"
                    placeholder="Ej: Reposición de insumos frescos"
                    value={desc}
                    onChange={e => setDesc(e.target.value)}
                    required
                  />
                </div>
                <div style={{ gridColumn: '1 / -1', marginTop: 16, display: 'flex', gap: 12 }}>
                  <button type="button" onClick={() => setIsModalOpen(false)} className="btn btn-secondary" style={{ flex: 1, height: 48, fontWeight: 800 }}>
                    CANCELAR
                  </button>
                  <button type="submit" disabled={saving || !categoriaId} className="btn" style={{ background: 'var(--accent)', color: '#fff', flex: 1, height: 48, fontWeight: 800 }}>
                    {saving ? 'GUARDANDO...' : (editingId ? 'GUARDAR CAMBIOS' : 'CREAR GASTO')}
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
