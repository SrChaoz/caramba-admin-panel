'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import {
  Ticket, Package, DollarSign, ReceiptText, Users, LogOut, Utensils, BarChart3, Tag, Inbox, Settings, UtensilsCrossed
} from 'lucide-react';

const NAV = [
  { href: '/caja',          label: 'Turno / Caja',   icon: Inbox           },
  { href: '/mesero',        label: 'Mesero / POS',   icon: UtensilsCrossed },
  { href: '/tickets',       label: 'Pedidos',         icon: Ticket          },
  { href: '/menu',          label: 'Menú Web',        icon: Utensils        },
  { href: '/promociones',   label: 'Promociones',     icon: Tag             },
  { href: '/finanzas',      label: 'Finanzas',        icon: DollarSign      },
  { href: '/gastos',        label: 'Gastos',          icon: ReceiptText     },
  { href: '/nomina',        label: 'Nómina / Pagos',  icon: Users           },
  { href: '/inventario',    label: 'Inventario',      icon: Package         },
  { href: '/analiticas',    label: 'Analíticas',      icon: BarChart3       },
  { href: '/configuracion', label: 'Configuración',   icon: Settings        },
];

export default function AppShell({ children, user }: { children: React.ReactNode; user?: { email?: string } }) {
  const path = usePathname();
  const initial = user?.email?.[0]?.toUpperCase() ?? 'A';

  return (
    <div className="app-shell">
      {/* ── Sidebar (desktop) ── */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="sidebar-logo-text">CARAMBA</div>
          <div className="sidebar-logo-sub">Control</div>
        </div>
        <div className="sidebar-divider" />

        <nav className="sidebar-nav">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`sidebar-link ${path.startsWith(href) ? 'active' : ''}`}
            >
              <Icon size={15} />
              {label}
            </Link>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-avatar">{initial}</div>
            <div>
              <div className="sidebar-user-name">Admin</div>
              <div className="sidebar-user-role">Main Station</div>
            </div>
            <button
              onClick={() => supabase.auth.signOut()}
              className="btn btn-ghost btn-icon"
              style={{ marginLeft: 'auto' }}
              title="Cerrar sesión"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="main-content">
        {children}
      </main>

      {/* ── Bottom nav (mobile) ── */}
      <nav className="bottom-nav">
        <div className="bottom-nav-inner">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`bottom-nav-item ${path.startsWith(href) ? 'active' : ''}`}
            >
              <Icon />
              {label.split(' ')[0]}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
