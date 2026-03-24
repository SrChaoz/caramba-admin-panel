'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { LogIn } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace('/tickets');
      else setChecking(false);
    });
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError('Correo o contraseña incorrectos.');
      setLoading(false);
    } else {
      router.replace('/tickets');
    }
  };

  if (checking) return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: '#444', fontFamily: 'Bebas Neue, sans-serif', fontSize: '1.5rem', letterSpacing: '0.1em' }}>CARGANDO...</div>
    </div>
  );

  return (
    <main style={{ minHeight: '100vh', background: '#0a0a0a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', fontFamily: 'Inter, sans-serif', position: 'relative' }}>
      {/* System info top right */}
      <div style={{ position: 'absolute', top: 20, right: 24, textAlign: 'right' }}>
        <div style={{ fontSize: '0.6rem', color: '#333', letterSpacing: '0.1em', fontWeight: 700 }}>127.0.0.1</div>
        <div style={{ fontSize: '0.6rem', color: '#333', letterSpacing: '0.1em', fontWeight: 700 }}>SYSTEM_READY</div>
      </div>

      {/* Logo */}
      <div style={{ textAlign: 'center', marginBottom: 12 }}>
        <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: '4rem', color: '#CC0000', letterSpacing: '0.08em', lineHeight: 1 }}>CARAMBA</div>
        <div style={{ width: 60, height: 2, background: '#CC0000', margin: '8px auto 10px' }} />
        <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.3em', color: '#555', textTransform: 'uppercase' }}>Control</div>
      </div>

      <div style={{ fontSize: '0.65rem', color: '#333', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 36, fontWeight: 600 }}>
        Acceso Restringido — Solo para Administradores
      </div>

      {/* Form Card */}
      <form onSubmit={handleLogin} style={{ background: '#111', width: '100%', maxWidth: 420, borderRadius: 12, padding: '32px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {error && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '10px 14px', color: '#EF4444', fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.04em' }}>
            {error}
          </div>
        )}

        <div className="field">
          <label>Correo Electrónico</label>
          <input
            type="email"
            placeholder="admin@caramba.com"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
          />
        </div>

        <div className="field">
          <label>Contraseña</label>
          <input
            type="password"
            placeholder="••••••••••"
            required
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="btn btn-primary"
          style={{ marginTop: 8, padding: '14px', fontSize: '0.85rem', letterSpacing: '0.14em', borderRadius: 6 }}
        >
          {loading ? 'INGRESANDO...' : (
            <>INGRESAR <LogIn size={15} /></>
          )}
        </button>
      </form>

      {/* Footer */}
      <div style={{ marginTop: 40, textAlign: 'center' }}>
        <div style={{ fontSize: '0.6rem', color: '#2a2a2a', letterSpacing: '0.1em' }}>V.1.0.0 — ENCRYPTED CONNECTION REQUIRED</div>
      </div>

      {/* Station info bottom left */}
      <div style={{ position: 'absolute', bottom: 24, left: 24, borderLeft: '2px solid #CC0000', paddingLeft: 10 }}>
        <div style={{ fontSize: '0.55rem', color: '#333', letterSpacing: '0.1em', fontWeight: 700 }}>STATION_ID: ALPHA_01</div>
        <div style={{ fontSize: '0.55rem', color: '#333', letterSpacing: '0.1em', fontWeight: 700 }}>STATUS: WAITING_AUTH</div>
      </div>
    </main>
  );
}
