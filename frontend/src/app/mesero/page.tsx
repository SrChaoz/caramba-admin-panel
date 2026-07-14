'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { UtensilsCrossed, AlertCircle, Clock, CheckCircle2 } from 'lucide-react';

type Mesa = { id: number; nombre: string; activa: boolean; orden: number; estado: 'libre' | 'ocupada' | 'por_cobrar' };

const ESTADO_CONFIG = {
  libre:      { color: 'rgba(255,255,255,0.08)', text: 'var(--text-dim)',   border: 'rgba(255,255,255,0.08)', badge: null,                       icon: UtensilsCrossed },
  ocupada:    { color: 'rgba(234,179,8,0.10)',   text: '#fbbf24',           border: 'rgba(234,179,8,0.35)',   badge: { label: 'OCUPADA',   bg: 'rgba(234,179,8,0.2)',    fg: '#fbbf24' },    icon: Clock },
  por_cobrar: { color: 'rgba(34,197,94,0.10)',   text: '#4ade80',           border: 'rgba(34,197,94,0.35)',   badge: { label: 'POR COBRAR', bg: 'rgba(34,197,94,0.2)',   fg: '#4ade80' },    icon: CheckCircle2 },
};

export default function MeseroPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [mesas, setMesas] = useState<Mesa[]>([]);
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
      const { data } = await supabase.from('mesas').select('*').eq('activa', true).order('orden');
      setMesas((data || []) as Mesa[]);
      setLoading(false);
    };
    load();

    const ch = supabase
      .channel('mesero_mesas_v2')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mesas' }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [checking]);

  if (checking || loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60dvh', flexDirection: 'column', gap: 12 }}>
      <UtensilsCrossed size={36} color="var(--accent)" style={{ opacity: 0.5 }} />
      <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', fontWeight: 700 }}>Cargando mesas…</div>
    </div>
  );

  if (mesas.length === 0) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60dvh', flexDirection: 'column', gap: 16, padding: 24 }}>
      <AlertCircle size={48} color="var(--warning)" style={{ opacity: 0.7 }} />
      <div style={{ fontFamily: 'Bebas Neue', fontSize: '1.6rem', color: 'var(--text)', letterSpacing: '0.06em', textAlign: 'center' }}>No hay mesas configuradas</div>
      <div style={{ color: 'var(--text-dim)', fontSize: '0.82rem', textAlign: 'center', maxWidth: 320, lineHeight: 1.6 }}>
        El administrador debe crear las mesas desde <strong style={{ color: 'var(--text)' }}>Configuración → Mesas</strong>.
      </div>
    </div>
  );

  const libres    = mesas.filter(m => m.estado === 'libre');
  const ocupadas  = mesas.filter(m => m.estado === 'ocupada');
  const porCobrar = mesas.filter(m => m.estado === 'por_cobrar');

  const MesaCard = ({ mesa }: { mesa: Mesa }) => {
    const cfg = ESTADO_CONFIG[mesa.estado];
    const Icon = cfg.icon;
    return (
      <button
        onClick={() => router.push(`/mesero/${mesa.id}`)}
        style={{
          position: 'relative', padding: '24px 16px', borderRadius: 18,
          border: `2px solid ${cfg.border}`, background: cfg.color,
          cursor: 'pointer', display: 'flex', flexDirection: 'column',
          alignItems: 'center', gap: 10, minHeight: 155, justifyContent: 'center',
          WebkitTapHighlightColor: 'transparent', transition: 'transform 0.12s',
        }}
      >
        <Icon size={34} color={cfg.text} />
        <div style={{ fontFamily: 'Bebas Neue', fontSize: '1.7rem', color: cfg.text, letterSpacing: '0.06em', lineHeight: 1 }}>
          {mesa.nombre}
        </div>
        {cfg.badge && (
          <div style={{ fontSize: '0.6rem', fontWeight: 900, color: cfg.badge.fg, letterSpacing: '0.12em', textTransform: 'uppercase', background: cfg.badge.bg, padding: '3px 12px', borderRadius: 99 }}>
            {cfg.badge.label}
          </div>
        )}
        {mesa.estado === 'libre' && (
          <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', letterSpacing: '0.08em' }}>DISPONIBLE</div>
        )}
      </button>
    );
  };

  return (
    <div style={{ padding: '28px 20px', maxWidth: 720, margin: '0 auto' }}>

      {/* Resumen de estados */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 28, flexWrap: 'wrap' }}>
        {[
          { label: 'Libres',     count: libres.length,    color: 'var(--text-dim)' },
          { label: 'Ocupadas',   count: ocupadas.length,  color: '#fbbf24' },
          { label: 'Por cobrar', count: porCobrar.length, color: '#4ade80' },
        ].map(s => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 99, background: 'var(--surface)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.color }} />
            <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-dim)' }}>{s.label}</span>
            <span style={{ fontSize: '0.8rem', fontWeight: 900, color: s.color }}>{s.count}</span>
          </div>
        ))}
      </div>

      <div style={{ fontFamily: 'Bebas Neue', fontSize: '1.8rem', color: 'var(--text)', letterSpacing: '0.08em', marginBottom: 16 }}>
        SELECCIONA UNA MESA
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))', gap: 14 }}>
        {mesas.map(mesa => <MesaCard key={mesa.id} mesa={mesa} />)}
      </div>
    </div>
  );
}
