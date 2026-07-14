'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import AppShell from '@/components/AppShell';
import { Wallet, Check, DollarSign, Banknote, Landmark } from 'lucide-react';

export default function CajaPage() {
  const router = useRouter();
  const [sessionUser, setSessionUser] = useState<any>(null);
  const [checking, setChecking] = useState(true);

  const [activeSession, setActiveSession] = useState<any>(null);
  const [loadingSession, setLoadingSession] = useState(true);

  // Apertura
  const [saldoInicial, setSaldoInicial] = useState('');
  const [saldoInicialTransf, setSaldoInicialTransf] = useState('0'); // Normalmente el banco arranca en el saldo del dia

  // Cierre
  const [cajaFisica, setCajaFisica] = useState('');
  const [cajaTransf, setCajaTransf] = useState('');

  // Estadisticas turno
  const [stats, setStats] = useState({ ventasEfectivo: 0, salidasEfectivo: 0, ventasTransf: 0, salidasTransf: 0 });

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.replace('/login');
      else {
        setSessionUser(session.user);
        setChecking(false);
      }
    });
  }, [router]);

  const loadActiveSession = async () => {
    const { data } = await supabase.from('sesiones_caja').select('*').eq('estado', 'ABIERTA').maybeSingle();
    setActiveSession(data || null);

    if (data) {
      // Calculate ventas y salidas por método
      const [ventasRes, salidasRes] = await Promise.all([
        supabase.from('pedidos').select('total, metodo_pago').eq('sesion_caja_id', data.id).in('estado', ['entregado', 'cobrado']),
        supabase.from('transacciones').select('monto, metodo_pago').eq('sesion_caja_id', data.id).eq('tipo', 'SALIDA')
      ]);

      const vEf = ventasRes.data?.filter(x => x.metodo_pago === 'Efectivo').reduce((acc, curr) => acc + Number(curr.total), 0) || 0;
      const vTr = ventasRes.data?.filter(x => x.metodo_pago === 'Transferencia').reduce((acc, curr) => acc + Number(curr.total), 0) || 0;

      const sEf = salidasRes.data?.filter(x => x.metodo_pago === 'Efectivo').reduce((acc, curr) => acc + Number(curr.monto), 0) || 0;
      const sTr = salidasRes.data?.filter(x => x.metodo_pago === 'Transferencia').reduce((acc, curr) => acc + Number(curr.monto), 0) || 0;

      setStats({ ventasEfectivo: vEf, salidasEfectivo: sEf, ventasTransf: vTr, salidasTransf: sTr });
    }
    setLoadingSession(false);
  };

  useEffect(() => {
    if (!sessionUser) return;
    loadActiveSession();

    // Sincronización en tiempo real para Caja
    const channel = supabase.channel('caja_live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, () => {
        console.log('Update in pedidos detected (Caja)');
        loadActiveSession();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transacciones' }, () => {
        console.log('Update in transacciones detected (Caja)');
        loadActiveSession();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sesiones_caja' }, () => {
        console.log('Update in sesiones_caja detected (Caja)');
        loadActiveSession();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionUser]);

  const handleOpenShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!saldoInicial || !saldoInicialTransf) return;
    setLoadingSession(true);
    await supabase.from('sesiones_caja').insert({
      saldo_inicial: parseFloat(saldoInicial),
      saldo_inicial_transferencia: parseFloat(saldoInicialTransf),
      usuario_apertura_id: sessionUser?.id,
      estado: 'ABIERTA'
    });
    setSaldoInicial('');
    setSaldoInicialTransf('0');
    await loadActiveSession();
  };

  const handleCloseShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cajaFisica || !cajaTransf || !activeSession) return;
    if (!confirm('¿Estás seguro de cerrar la caja de este turno?')) return;
    setLoadingSession(true);

    await supabase.from('sesiones_caja').update({
      caja_fisica_ingresada: parseFloat(cajaFisica),
      caja_transferencia_ingresada: parseFloat(cajaTransf),
      usuario_cierre_id: sessionUser?.id,
      fecha_cierre: new Date().toISOString(),
      estado: 'CERRADA'
    }).eq('id', activeSession.id);

    setCajaFisica('');
    setCajaTransf('');
    await loadActiveSession();
  };

  if (checking || loadingSession) return null;

  // Calculos Efectivo
  const cajaTeoricaEfectivo = activeSession ? (Number(activeSession.saldo_inicial) + stats.ventasEfectivo - stats.salidasEfectivo) : 0;
  const difEfectivo = cajaFisica ? (parseFloat(cajaFisica) - cajaTeoricaEfectivo) : 0;

  // Calculos Transferencia
  const cajaTeoricaTransf = activeSession ? (Number(activeSession.saldo_inicial_transferencia || 0) + stats.ventasTransf - stats.salidasTransf) : 0;
  const difTransf = cajaTransf ? (parseFloat(cajaTransf) - cajaTeoricaTransf) : 0;

  return (
    <AppShell user={sessionUser}>
      <div className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="topbar-page-name" style={{ color: 'var(--accent)' }}>TURNO</span>
          <span style={{ color: 'var(--text-muted)', fontFamily: 'Bebas Neue', fontSize: '1.5rem' }}>/ DE CAJA CON BANCOS</span>
        </div>
      </div>

      <div className="page" style={{ maxWidth: 860, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24, paddingTop: 40, paddingBottom: 60 }}>
        
        {!activeSession ? (
          <div className="card" style={{ padding: 40, textAlign: 'center', maxWidth: 450, margin: '0 auto' }}>
            <Wallet size={48} color="var(--text-muted)" style={{ margin: '0 auto 20px', opacity: 0.5 }} />
            <div style={{ fontFamily: 'Bebas Neue', fontSize: '1.6rem', color: 'var(--text)', letterSpacing: '0.08em', marginBottom: 8 }}>
              LA CAJA ESTÁ CERRADA
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: 24, lineHeight: 1.5 }}>
              Abre tu turno ingresando el fondo inicial físico y el saldo con el que arrancas el turno en el banco (opcional).
            </div>
            <form onSubmit={handleOpenShift} style={{ background: 'var(--surface-max)', padding: 20, borderRadius: 12 }}>
              
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6, textAlign: 'left' }}>
                  <Banknote size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'text-bottom' }} /> Fondo de Apertura Físico (Efectivo)
                </label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 16, top: 12, color: 'var(--text)', fontWeight: 800, fontSize: '1.1rem' }}>$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={saldoInicial}
                    onChange={(e) => setSaldoInicial(e.target.value)}
                    placeholder="Efectivo"
                    style={{ width: '100%', padding: '12px 16px 12px 32px', fontSize: '1.1rem', fontWeight: 700, borderRadius: 8, border: '2px solid var(--surface)', background: 'var(--bg)', color: 'var(--text)', outline: 'none' }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6, textAlign: 'left' }}>
                  <Landmark size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'text-bottom' }} /> Saldo Inicial Banco (Transferencias)
                </label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 16, top: 12, color: 'var(--text)', fontWeight: 800, fontSize: '1.1rem' }}>$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={saldoInicialTransf}
                    onChange={(e) => setSaldoInicialTransf(e.target.value)}
                    placeholder="Saldo en banco al empezar"
                    style={{ width: '100%', padding: '12px 16px 12px 32px', fontSize: '1.1rem', fontWeight: 700, borderRadius: 8, border: '2px solid var(--surface)', background: 'var(--bg)', color: 'var(--text)', outline: 'none' }}
                  />
                </div>
              </div>

              <button type="submit" className="btn btn-primary" style={{ width: '100%', height: 44 }}>
                ABRIR TURNO
              </button>
            </form>
          </div>
        ) : (
          <>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(46,186,91,0.1)', border: '1px solid rgba(46,186,91,0.2)', padding: '16px 24px', borderRadius: 10 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--success)', fontWeight: 800, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  <Check size={12} /> TURNO ACTIVO DESDE LAS {new Date(activeSession.fecha_apertura).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 32 }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}><Banknote size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'text-bottom' }} /> CAJA EFECTIVO (TEÓRICA)</div>
                  <div style={{ fontFamily: 'Bebas Neue', fontSize: '1.6rem', color: 'var(--success)', lineHeight: 1.1 }}>
                    ${cajaTeoricaEfectivo.toFixed(2)}
                  </div>
                </div>
                <div style={{ textAlign: 'right', borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: 24 }}>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}><Landmark size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'text-bottom' }} /> SALDO EN BANCO (TEÓRICA)</div>
                  <div style={{ fontFamily: 'Bebas Neue', fontSize: '1.6rem', color: '#3b82f6', lineHeight: 1.1 }}>
                    ${cajaTeoricaTransf.toFixed(2)}
                  </div>
                </div>
              </div>
            </div>

            {/* TABLA DE MOVIMIENTOS EN VIVO */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              
              {/* Columna Efectivo */}
              <div className="card" style={{ padding: 20, borderTop: '3px solid var(--success)' }}>
                <div style={{ fontFamily: 'Bebas Neue', fontSize: '1.2rem', marginBottom: 16 }}><Banknote size={18} style={{ display: 'inline', marginRight: 6, verticalAlign: 'text-bottom' }} /> EFECTIVO (GAVETA)</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    <span>Fondo Inicial:</span>
                    <span style={{ fontWeight: 700, color: 'var(--text)' }}>${Number(activeSession.saldo_inicial).toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--success)' }}>
                    <span>+ Ventas / Ingresos:</span>
                    <span style={{ fontWeight: 700 }}>+${stats.ventasEfectivo.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--accent)' }}>
                    <span>- Gastos / Nómina:</span>
                    <span style={{ fontWeight: 700 }}>-${stats.salidasEfectivo.toFixed(2)}</span>
                  </div>
                  <div style={{ height: 1, background: 'rgba(255,255,255,0.06)' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                    <span style={{ fontWeight: 700 }}>= SALDO FINAL ESPERADO:</span>
                    <span style={{ fontWeight: 800 }}>${cajaTeoricaEfectivo.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Columna Transferencia */}
              <div className="card" style={{ padding: 20, borderTop: '3px solid #3b82f6' }}>
                <div style={{ fontFamily: 'Bebas Neue', fontSize: '1.2rem', marginBottom: 16 }}><Landmark size={18} style={{ display: 'inline', marginRight: 6, verticalAlign: 'text-bottom' }} /> TRANSFERENCIAS (BANCO)</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    <span>Saldo Inicial Día:</span>
                    <span style={{ fontWeight: 700, color: 'var(--text)' }}>${Number(activeSession.saldo_inicial_transferencia || 0).toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#10b981' }}>
                    <span>+ Ingresos App Bank:</span>
                    <span style={{ fontWeight: 700 }}>+${stats.ventasTransf.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--accent)' }}>
                    <span>- Transferencias enviadas:</span>
                    <span style={{ fontWeight: 700 }}>-${stats.salidasTransf.toFixed(2)}</span>
                  </div>
                  <div style={{ height: 1, background: 'rgba(255,255,255,0.06)' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                    <span style={{ fontWeight: 700 }}>= SALDO FINAL ESPERADO:</span>
                    <span style={{ fontWeight: 800 }}>${cajaTeoricaTransf.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Cierre de Caja */}
            <div className="card" style={{ padding: 32, marginTop: 12 }}>
              <div style={{ fontFamily: 'Bebas Neue', fontSize: '1.3rem', letterSpacing: '0.08em', marginBottom: 20 }}>CIERRE DE TURNO (CORTE GENERAL)</div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-dim)', lineHeight: 1.5 }}>
                  Retira y cuenta todo el efectivo de la gaveta. Luego revisa el saldo actual en tu App del Banco (Transferencias). Ingresa ambos valores finales aquí para terminar el turno:
                </label>
                
                <form onSubmit={handleCloseShift}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 1fr) minmax(200px, 1fr) auto', gap: 16, alignItems: 'end' }}>
                    
                    {/* Físico */}
                    <div>
                      <div style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}><Banknote size={14} style={{ display: 'inline', marginRight: 4, verticalAlign: 'text-bottom' }} /> Total contado Físico</div>
                      <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: 16, top: 12, color: 'var(--text)', fontWeight: 800, fontSize: '1.1rem' }}>$</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          required
                          value={cajaFisica}
                          onChange={(e) => setCajaFisica(e.target.value)}
                          placeholder="0.00"
                          style={{ width: '100%', padding: '12px 16px 12px 32px', fontSize: '1.1rem', fontWeight: 700, borderRadius: 8, border: '2px solid var(--surface-max)', background: 'var(--bg)', color: 'var(--text)', outline: 'none' }}
                        />
                      </div>
                    </div>

                    {/* Banco */}
                    <div>
                      <div style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}><Landmark size={14} style={{ display: 'inline', marginRight: 4, verticalAlign: 'text-bottom' }} /> Saldo actual en Banco</div>
                      <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: 16, top: 12, color: 'var(--text)', fontWeight: 800, fontSize: '1.1rem' }}>$</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          required
                          value={cajaTransf}
                          onChange={(e) => setCajaTransf(e.target.value)}
                          placeholder="0.00"
                          style={{ width: '100%', padding: '12px 16px 12px 32px', fontSize: '1.1rem', fontWeight: 700, borderRadius: 8, border: '2px solid var(--surface-max)', background: 'var(--bg)', color: 'var(--text)', outline: 'none' }}
                        />
                      </div>
                    </div>

                    <button type="submit" className="btn" style={{ background: 'var(--accent)', color: '#fff', padding: '0 24px', height: 48, fontWeight: 800 }}>
                      CERRAR TURNO
                    </button>
                  </div>
                </form>

                {/* Mostrar Diferencias en tiempo real */}
                {(cajaFisica || cajaTransf) && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 12, background: 'var(--bg)', padding: 16, borderRadius: 10, border: '1px solid rgba(255,255,255,0.05)' }}>
                    
                    {/* Diferencia Efectivo */}
                    <div style={{ borderRight: '1px solid rgba(255,255,255,0.1)', paddingRight: 16 }}>
                      <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Diferencia Efectivo</div>
                      {cajaFisica ? (
                        <>
                          <div style={{ fontFamily: 'Bebas Neue', fontSize: '1.5rem', color: Math.abs(difEfectivo) < 0.05 ? 'var(--success)' : 'var(--accent)', lineHeight: 1 }}>
                            {difEfectivo > 0 ? '+' : ''}{difEfectivo.toFixed(2)}
                          </div>
                          <div style={{ fontSize: '0.6rem', color: Math.abs(difEfectivo) < 0.05 ? 'var(--success)' : 'var(--accent)', marginTop: 4, fontWeight: 700 }}>
                            {Math.abs(difEfectivo) < 0.05 ? '¡Excelente Cuadre Físico!' : (difEfectivo < 0 ? '⚠️ Faltante Físico' : '⚠️ Sobrante Físico')}
                          </div>
                        </>
                      ) : <span style={{ color: 'var(--text-muted)' }}>Esperando conteo...</span>}
                    </div>

                    {/* Diferencia Banco */}
                    <div style={{ paddingLeft: 8 }}>
                      <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Diferencia Banco</div>
                      {cajaTransf ? (
                        <>
                          <div style={{ fontFamily: 'Bebas Neue', fontSize: '1.5rem', color: Math.abs(difTransf) < 0.05 ? '#3b82f6' : 'var(--accent)', lineHeight: 1 }}>
                            {difTransf > 0 ? '+' : ''}{difTransf.toFixed(2)}
                          </div>
                          <div style={{ fontSize: '0.6rem', color: Math.abs(difTransf) < 0.05 ? '#3b82f6' : 'var(--accent)', marginTop: 4, fontWeight: 700 }}>
                            {Math.abs(difTransf) < 0.05 ? '¡Banco coincide perfecto!' : (difTransf < 0 ? '⚠️ Falta dinero en banco' : '⚠️ Dinero extra en banco')}
                          </div>
                        </>
                      ) : <span style={{ color: 'var(--text-muted)' }}>Esperando captura del banco...</span>}
                    </div>

                  </div>
                )}
              </div>
            </div>
          </>
        )}

      </div>
    </AppShell>
  );
}
