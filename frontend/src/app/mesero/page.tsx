'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { UtensilsCrossed, AlertCircle } from 'lucide-react';

type Mesa = { id: number; nombre: string; activa: boolean; orden: number };
type PedidoActivo = { mesa_id: number };

export default function MeseroPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [pedidosActivos, setPedidosActivos] = useState<PedidoActivo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.replace('/login');
      else setChecking(false);
    });
  }, [router]);

  useEffect(() => {
    if (checking) return;
    const load = async () => {
      setLoading(true);
      const [mesasRes, pedRes] = await Promise.all([
        supabase.from('mesas').select('*').eq('activa', true).order('orden'),
        supabase
          .from('pedidos')
          .select('mesa_id')
          .eq('canal', 'mesa')
          .in('estado', ['no_confirmado', 'pendiente', 'para_entregar'])
          .not('mesa_id', 'is', null),
      ]);
      setMesas(mesasRes.data || []);
      setPedidosActivos(pedRes.data || []);
      setLoading(false);
    };
    load();

    // Realtime: refrescar cuando cambian pedidos
    const ch = supabase
      .channel('mesero_mesas')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [checking]);

  if (checking || loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', flexDirection: 'column', gap: 12 }}>
        <UtensilsCrossed size={36} color="var(--accent)" style={{ opacity: 0.5 }} />
        <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', fontWeight: 700 }}>Cargando mesas…</div>
      </div>
    );
  }

  if (mesas.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', flexDirection: 'column', gap: 16, padding: 24 }}>
        <AlertCircle size={48} color="var(--warning)" style={{ opacity: 0.7 }} />
        <div style={{ fontFamily: 'Bebas Neue', fontSize: '1.6rem', color: 'var(--text)', letterSpacing: '0.06em', textAlign: 'center' }}>
          No hay mesas configuradas
        </div>
        <div style={{ color: 'var(--text-dim)', fontSize: '0.82rem', textAlign: 'center', maxWidth: 320, lineHeight: 1.6 }}>
          El administrador debe crear las mesas desde{' '}
          <strong style={{ color: 'var(--text)' }}>Configuración → Mesas</strong>.
        </div>
      </div>
    );
  }

  const mesasConPedido = new Set(pedidosActivos.map(p => p.mesa_id));

  return (
    <div style={{ padding: '32px 24px', maxWidth: 700, margin: '0 auto' }}>
      <div style={{ marginBottom: 32, textAlign: 'center' }}>
        <div style={{
          fontFamily: 'Bebas Neue',
          fontSize: '2rem',
          color: 'var(--text)',
          letterSpacing: '0.08em',
          lineHeight: 1,
        }}>
          SELECCIONA UNA MESA
        </div>
        <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginTop: 6 }}>
          Toca la mesa para empezar a tomar el pedido
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
        gap: 16,
      }}>
        {mesas.map(mesa => {
          const tienePedido = mesasConPedido.has(mesa.id);
          return (
            <button
              key={mesa.id}
              onClick={() => router.push(`/mesero/${mesa.id}`)}
              style={{
                position: 'relative',
                padding: '28px 16px',
                borderRadius: 16,
                border: tienePedido
                  ? '2px solid var(--warning)'
                  : '2px solid rgba(255,255,255,0.08)',
                background: tienePedido
                  ? 'rgba(255,170,0,0.08)'
                  : 'var(--surface)',
                cursor: 'pointer',
                transition: 'all 0.18s',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 10,
                minHeight: 150,
                justifyContent: 'center',
              }}
            >
              {/* Indicador de pedido activo */}
              {tienePedido && (
                <div style={{
                  position: 'absolute',
                  top: 10,
                  right: 10,
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: 'var(--warning)',
                  boxShadow: '0 0 8px var(--warning)',
                  animation: 'pulse 2s infinite',
                }} />
              )}

              <UtensilsCrossed
                size={36}
                color={tienePedido ? 'var(--warning)' : 'var(--text-dim)'}
              />

              <div style={{
                fontFamily: 'Bebas Neue',
                fontSize: '1.6rem',
                color: tienePedido ? 'var(--warning)' : 'var(--text)',
                letterSpacing: '0.06em',
                lineHeight: 1,
              }}>
                {mesa.nombre}
              </div>

              {tienePedido && (
                <div style={{
                  fontSize: '0.6rem',
                  fontWeight: 800,
                  color: 'var(--warning)',
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  background: 'rgba(255,170,0,0.15)',
                  padding: '3px 10px',
                  borderRadius: 99,
                }}>
                  Pedido activo
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
