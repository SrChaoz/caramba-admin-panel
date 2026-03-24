'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import AppShell from '@/components/AppShell';

type MenuTopping = {
  id: string;
  nombre: string;
  emoji: string;
  disponible: boolean;
};

export default function MenuPage() {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [checking, setChecking] = useState(true);
  const [toppings, setToppings] = useState<MenuTopping[]>([]);
  const [working, setWorking] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.replace('/login');
      else { setSession(session); setChecking(false); }
    });
  }, [router]);

  const fetchToppings = async () => {
    const { data } = await supabase.from('menu_toppings').select('*').order('nombre');
    if (data) setToppings(data);
  };

  useEffect(() => {
    if (!session) return;
    fetchToppings();
    
    // Suscripción por si otro admin cambia algo al mismo tiempo
    const sub = supabase.channel('menu_toppings_live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_toppings' }, fetchToppings)
      .subscribe();
      
    return () => { supabase.removeChannel(sub); };
  }, [session]);

  const toggleTopping = async (t: MenuTopping) => {
    setWorking(t.id);
    // Optimistic update
    setToppings(prev => prev.map(item => item.id === t.id ? { ...item, disponible: !t.disponible } : item));
    
    await supabase.from('menu_toppings').update({ disponible: !t.disponible }).eq('id', t.id);
    await fetchToppings();
    setWorking(null);
  };

  if (checking) return null;

  return (
    <AppShell user={session?.user}>
      <div className="topbar">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="topbar-page-name">MENÚ WEB</span>
          </div>
          <span className="topbar-subtitle">Disponibilidad en el Portal de Pedidos</span>
        </div>
      </div>

      <div className="page" style={{ maxWidth: 800 }}>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 24, lineHeight: 1.5 }}>
          Apaga un ingrediente aquí cuando se acabe en cocina. Se marcará como <strong>AGOTADO</strong> inmediatamente en el portal web y los clientes no podrán seleccionarlo en sus burritos.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
          {toppings.map(t => (
            <div 
              key={t.id} 
              className="card" 
              style={{ padding: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', transition: 'all 0.2s', opacity: t.disponible ? 1 : 0.6, border: t.disponible ? '1px solid var(--surface-hi)' : '1px solid var(--danger-dim, rgba(204,0,0,0.3))' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: '1.8rem' }}>{t.emoji}</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', color: t.disponible ? 'var(--text)' : 'var(--text-muted)' }}>{t.nombre}</div>
                  <div style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: t.disponible ? 'var(--success)' : 'var(--danger)', marginTop: 4 }}>
                    {t.disponible ? '🟢 Disponible' : '🔴 Agotado'}
                  </div>
                </div>
              </div>

              {/* Botón Toggle */}
              <button 
                onClick={() => toggleTopping(t)}
                disabled={working === t.id}
                style={{
                  background: t.disponible ? 'var(--surface-max)' : 'var(--danger)',
                  border: 'none',
                  color: t.disponible ? 'var(--text)' : '#fff',
                  width: 44,
                  height: 26,
                  borderRadius: 13,
                  cursor: 'pointer',
                  position: 'relative',
                  transition: 'all 0.2s ease',
                  opacity: working === t.id ? 0.5 : 1
                }}
              >
                <div style={{
                  position: 'absolute',
                  top: 2,
                  left: t.disponible ? 20 : 2,
                  width: 22,
                  height: 22,
                  background: '#fff',
                  borderRadius: '50%',
                  transition: 'all 0.2s ease',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
                }} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
