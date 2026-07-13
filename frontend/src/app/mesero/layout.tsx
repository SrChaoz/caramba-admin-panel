'use client';

import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { LogOut, ChevronLeft } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';

export default function MeseroLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const isRoot = path === '/mesero';

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'var(--bg)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Top bar simplificada */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 20px',
        background: 'var(--surface)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {!isRoot && (
            <button
              onClick={() => router.back()}
              style={{
                background: 'var(--surface-max)',
                border: 'none',
                color: 'var(--text)',
                cursor: 'pointer',
                padding: '8px 10px',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <ChevronLeft size={20} />
            </button>
          )}
          <div>
            <div style={{
              fontFamily: 'Bebas Neue',
              fontSize: '1.5rem',
              color: 'var(--accent)',
              letterSpacing: '0.08em',
              lineHeight: 1,
            }}>
              CARAMBA
            </div>
            <div style={{
              fontSize: '0.6rem',
              color: 'var(--text-dim)',
              fontWeight: 800,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
            }}>
              PUNTO DE VENTA · MESA
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Link
            href="/tickets"
            style={{
              fontSize: '0.65rem',
              fontWeight: 800,
              color: 'var(--text-dim)',
              textDecoration: 'none',
              padding: '6px 12px',
              borderRadius: 6,
              background: 'var(--surface-max)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            Ver Tickets
          </Link>
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              router.replace('/login');
            }}
            style={{
              background: 'var(--surface-max)',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '8px 10px',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
            }}
            title="Cerrar sesión"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Contenido */}
      <main style={{ flex: 1, overflowY: 'auto' }}>
        {children}
      </main>
    </div>
  );
}
