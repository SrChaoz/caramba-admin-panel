'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import AppShell from '@/components/AppShell';
import { BarChart3, TrendingUp, AlertTriangle, Calendar, Star, DollarSign, Package } from 'lucide-react';

type Categoria = { id: string; nombre: string; orden: number; };
type Topping = { id: string; nombre: string; emoji: string; categoria_id: string; disponible: boolean; };
type Pedido = { id: string; fecha_pedido: string; ingredientes: string[]; extras: { nombre: string; precio: number }[] | null; };

type TimeFilter = 'all' | '30d' | '7d';

type ToppingStat = {
  nombre: string;
  emoji: string;
  categoriaNombre: string;
  categoriaId: string;
  count: number;
  esExtra: number; // Veces que se pidió como extra pagado
};

export default function AnaliticasPage() {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [checking, setChecking] = useState(true);
  
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [toppings, setToppings] = useState<Topping[]>([]);
  const [loading, setLoading] = useState(false);
  
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.replace('/login');
      else { setSession(session); setChecking(false); }
    });
  }, [router]);

  useEffect(() => {
    if (session) fetchAll();
  }, [session]);

  const fetchAll = async () => {
    setLoading(true);
    const [pedRes, catRes, topRes] = await Promise.all([
      supabase.from('pedidos').select('id, fecha_pedido, ingredientes, extras'),
      supabase.from('menu_categorias').select('id, nombre, orden').order('orden'),
      supabase.from('menu_toppings').select('id, nombre, emoji, categoria_id, disponible')
    ]);

    if (pedRes.data) setPedidos(pedRes.data);
    if (catRes.data) setCategorias(catRes.data);
    if (topRes.data) setToppings(topRes.data);
    setLoading(false);
  };

  const filteredPedidos = useMemo(() => {
    if (timeFilter === 'all') return pedidos;
    
    const now = new Date();
    const daysToSubtract = timeFilter === '30d' ? 30 : 7;
    const thresholdDate = new Date(now.setDate(now.getDate() - daysToSubtract));
    
    return pedidos.filter(p => new Date(p.fecha_pedido) >= thresholdDate);
  }, [pedidos, timeFilter]);

  const stats = useMemo(() => {
    if (toppings.length === 0 || categorias.length === 0) return [];
    
    // Inicializar mapa con todos los toppings del menú (incluso si tienen 0 pedidos)
    const map = new Map<string, ToppingStat>();
    
    toppings.forEach(t => {
      const cat = categorias.find(c => c.id === t.categoria_id);
      map.set(t.nombre.toLowerCase().trim(), {
        nombre: t.nombre,
        emoji: t.emoji || '🥘',
        categoriaNombre: cat?.nombre || 'Desconocida',
        categoriaId: t.categoria_id,
        count: 0,
        esExtra: 0
      });
    });

    // Contar ocurrencias en pedidos filtrados
    filteredPedidos.forEach(pedido => {
      // Ingredientes incluidos
      if (pedido.ingredientes && Array.isArray(pedido.ingredientes)) {
        pedido.ingredientes.forEach(ing => {
          if (ing.startsWith('---')) return; // Ignore separator
          const key = ing.toLowerCase().trim();
          if (map.has(key)) {
            const stat = map.get(key)!;
            stat.count += 1;
          }
        });
      }
      
      // Extras pagados
      if (pedido.extras && Array.isArray(pedido.extras)) {
        pedido.extras.forEach(ext => {
          const key = ext.nombre.toLowerCase().trim();
          if (map.has(key)) {
            const stat = map.get(key)!;
            stat.count += 1;
            stat.esExtra += 1;
          }
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [filteredPedidos, toppings, categorias]);

  if (checking) return null;

  // Calculos para tarjetas destacadas
  const totalItemsSold = stats.reduce((acc, curr) => acc + curr.count, 0);
  
  // Encontrar tops por categoría adivinando desde el nombre o id de la categoria.
  // Asumimos que los IDs de categoría pueden ser "base", "meat", etc. Si no, usamos includes.
  const topProteina = stats.find(s => s.categoriaId === 'meat' || s.categoriaNombre.toLowerCase().includes('prote')) || null;
  const topBase = stats.find(s => s.categoriaId === 'base' || s.categoriaNombre.toLowerCase().includes('base') || s.categoriaNombre.toLowerCase().includes('arroz')) || null;
  const topExtra = [...stats].sort((a,b) => b.esExtra - a.esExtra)[0] || null;

  const coldIngredients = stats.filter(s => s.count === 0);

  const maxCount = stats.length > 0 ? stats[0].count : 1;

  return (
    <AppShell user={session?.user}>
      {/* Top Bar */}
      <div className="topbar">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="topbar-page-name">ANALÍTICAS DE MENÚ</span>
          </div>
          <span className="topbar-subtitle">Descubre qué ingredientes son los favoritos de tus clientes.</span>
        </div>
        <div className="topbar-actions">
          <div style={{ display: 'flex', gap: 8, background: 'var(--surface)', padding: 4, borderRadius: 8, border: '1px solid var(--surface-hi)' }}>
            <button 
              className={`btn btn-sm ${timeFilter === 'all' ? 'btn-primary' : 'btn-ghost'}`} 
              onClick={() => setTimeFilter('all')}
              style={{ fontSize: '0.75rem', padding: '4px 12px' }}
            >
              Todo Histórico
            </button>
            <button 
              className={`btn btn-sm ${timeFilter === '30d' ? 'btn-primary' : 'btn-ghost'}`} 
              onClick={() => setTimeFilter('30d')}
              style={{ fontSize: '0.75rem', padding: '4px 12px' }}
            >
              Últimos 30 días
            </button>
            <button 
              className={`btn btn-sm ${timeFilter === '7d' ? 'btn-primary' : 'btn-ghost'}`} 
              onClick={() => setTimeFilter('7d')}
              style={{ fontSize: '0.75rem', padding: '4px 12px' }}
            >
              Últimos 7 días
            </button>
          </div>
        </div>
      </div>

      <div className="page" style={{ maxWidth: 1000 }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 0', gap: 16, color: 'var(--text-dim)' }}>
            <div style={{ width: 36, height: 36, border: '3px solid var(--surface-max)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
            <span style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Procesando Analíticas...</span>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            
            {/* Contexto Rango */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-dim)', fontSize: '0.85rem' }}>
              <Calendar size={14} /> 
              <span>Mostrando datos de <strong>{filteredPedidos.length}</strong> pedidos en el rango seleccionado.</span>
            </div>

            {/* Top Stats Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
              {/* Card 1: Proteína */}
              <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12, borderTop: '3px solid var(--accent)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-dim)', fontSize: '0.8rem', textTransform: 'uppercase', fontWeight: 'bold' }}>
                  <Star size={14} /> Proteína Más Popular
                </div>
                {topProteina && topProteina.count > 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <span style={{ fontSize: '2.5rem' }}>{topProteina.emoji}</span>
                    <div>
                      <div style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--text)' }}>{topProteina.nombre}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>{topProteina.count} selecciones ({Math.round((topProteina.count / Math.max(1, filteredPedidos.length)) * 100)}% de los pedidos)</div>
                    </div>
                  </div>
                ) : (
                  <span style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>No hay datos suficientes.</span>
                )}
              </div>

              {/* Card 2: Base */}
              <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12, borderTop: '3px solid #3b82f6' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-dim)', fontSize: '0.8rem', textTransform: 'uppercase', fontWeight: 'bold' }}>
                  <Package size={14} /> Base (Arroz) Más Elegida
                </div>
                {topBase && topBase.count > 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <span style={{ fontSize: '2.5rem' }}>{topBase.emoji}</span>
                    <div>
                      <div style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--text)' }}>{topBase.nombre}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>{topBase.count} selecciones</div>
                    </div>
                  </div>
                ) : (
                  <span style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>No hay datos suficientes.</span>
                )}
              </div>

              {/* Card 3: Top Extra */}
              <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12, borderTop: '3px solid #22c55e' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-dim)', fontSize: '0.8rem', textTransform: 'uppercase', fontWeight: 'bold' }}>
                  <DollarSign size={14} /> Extra Mayoritario (Cobrado)
                </div>
                {topExtra && topExtra.esExtra > 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <span style={{ fontSize: '2.5rem' }}>{topExtra.emoji}</span>
                    <div>
                      <div style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--text)' }}>{topExtra.nombre}</div>
                      <div style={{ fontSize: '0.8rem', color: '#22c55e', fontWeight: 'bold' }}>{topExtra.esExtra} veces pagado como extra</div>
                    </div>
                  </div>
                ) : (
                  <span style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>Aún no se han cobrado extras.</span>
                )}
              </div>
            </div>

            {/* Ranking Completo de Ingredientes */}
            <div className="card" style={{ padding: 24 }}>
              <h2 style={{ fontSize: '1.2rem', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
                <TrendingUp size={18} color="var(--accent)" /> Ranking de Rendimiento por Ingrediente
              </h2>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {stats.length > 0 ? stats.filter(s => s.count > 0).map((stat, idx) => (
                  <div key={stat.nombre} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ width: 24, fontSize: '0.8rem', color: 'var(--text-dim)', fontWeight: 'bold', textAlign: 'right' }}>#{idx + 1}</div>
                    <div style={{ width: 36, textAlign: 'center', fontSize: '1.5rem' }}>{stat.emoji}</div>
                    
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>
                          {stat.nombre} <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 'normal', marginLeft: 4 }}>{stat.categoriaNombre}</span>
                        </span>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{stat.count} <span style={{ color: 'var(--text-dim)', fontWeight: 'normal', fontSize: '0.75rem' }}>({Math.round((stat.count / Math.max(1, totalItemsSold)) * 100)}%)</span></span>
                      </div>
                      <div style={{ width: '100%', height: 8, background: 'var(--surface-max)', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ 
                          height: '100%', 
                          background: idx === 0 ? 'var(--accent)' : stat.categoriaId === 'meat' ? '#ef4444' : stat.categoriaId === 'base' ? '#3b82f6' : 'var(--text-muted)', 
                          width: `${(stat.count / maxCount) * 100}%`,
                          transition: 'width 0.5s ease-out'
                        }} />
                      </div>
                    </div>
                  </div>
                )) : (
                  <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-dim)' }}>No hay datos suficientes para generar un ranking en este rango de tiempo.</div>
                )}
              </div>
            </div>

            {/* Alerta de Ingredientes sin ventas (Baja Rotación) */}
            {coldIngredients.length > 0 && (
              <div className="card" style={{ padding: 20, border: '1px solid var(--danger-dim)', background: 'rgba(239, 68, 68, 0.05)' }}>
                <h3 style={{ fontSize: '1rem', color: 'var(--danger)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <AlertTriangle size={16} /> Alerta de Baja Rotación (0 Selecciones)
                </h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: 16 }}>
                  Los siguientes ingredientes del menú no han sido seleccionados ni una sola vez en el rango de tiempo actual. Considera rotarlos, eliminarlos del menú o crear una promoción para darles salida y no perder insumos.
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {coldIngredients.map(stat => (
                    <div key={stat.nombre} style={{ background: 'var(--surface-max)', padding: '6px 12px', borderRadius: 20, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6, border: '1px solid var(--surface-hi)' }}>
                      <span>{stat.emoji}</span> {stat.nombre}
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        )}
      </div>
    </AppShell>
  );
}
