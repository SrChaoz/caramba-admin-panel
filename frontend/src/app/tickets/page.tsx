'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import AppShell from '@/components/AppShell';
import { Search, Clock, X, Check, ChevronRight, Phone, Calendar, Package, Trash2, Edit2, Save, User, MapPin, CreditCard, Banknote, Star, Printer, Bluetooth, BluetoothConnected, BluetoothOff, Eye, Bell } from 'lucide-react';
import { useRef } from 'react';
import { printerInstance } from '@/lib/printer';
import { generateTicketCanvas } from '@/lib/TicketGenerator';

type Extra  = { nombre: string; precio: number };
type Pedido = {
  id: string;
  codigo_ticket: string;
  cliente_nombre: string;
  cliente_telefono: string;
  cliente_direccion: string;
  cantidad_burritos: number;
  total: number;
  estado: string;
  dia_entrega: string;
  bloque_horario: string;
  ingredientes: string[];
  extras: Extra[];
  metodo_pago: string;
  fecha_pedido: string;
  canal?: string;
  mesa_id?: number;
};

type DialogType = 'confirm' | 'ready' | 'deliver' | 'delete' | null;
type TabType = 'all' | 'no_confirmado' | 'pendiente' | 'para_entregar';
type MenuTopping = { id: string; nombre: string; emoji: string; precio_extra: number; precio_surcharge: number; };
type MenuConfig = { basePrice: number; freeToppingsLimit: number; };

/** Split ingredient array into per-burrito arrays. */
function splitIngredients(ingredientes: string[], cantidad: number): string[][] {
  if (!ingredientes?.length) return Array.from({ length: Math.max(cantidad, 1) }, () => []);

  const hasSeparators = ingredientes.some(i => i.startsWith('---'));

  if (hasSeparators) {
    const groups: string[][] = [];
    let current: string[] = [];
    for (const item of ingredientes) {
      if (item.startsWith('---')) {
        if (current.length > 0) groups.push(current);
        current = [];
      } else {
        current.push(item);
      }
    }
    if (current.length > 0) groups.push(current);
    return groups;
  }

  // same mode: repeat for each burrito
  return Array.from({ length: cantidad }, () => [...ingredientes]);
}

/** Recalculate total from ingredients using menu config */
function calcTotal(ingredientes: string[], cantidad: number, toppings: MenuTopping[], cfg: MenuConfig): number {
  const { basePrice, freeToppingsLimit } = cfg;
  // surcharge: within free limit
  const inLimit = ingredientes.slice(0, freeToppingsLimit);
  const surchargeCost = inLimit.reduce((acc, nom) => {
    const t = toppings.find(to => to.nombre === nom);
    return acc + (t?.precio_surcharge ?? 0);
  }, 0);
  // extras: beyond free limit
  const extras = ingredientes.slice(freeToppingsLimit);
  const extraCost = extras.reduce((acc, nom) => {
    const t = toppings.find(to => to.nombre === nom);
    return acc + (t?.precio_extra ?? 0);
  }, 0);
  return (basePrice + surchargeCost + extraCost) * cantidad;
}

export default function TicketsPage() {
  const router = useRouter();
  const [session, setSession]       = useState<any>(null);
  const [checking, setChecking]     = useState(true);
  const [pedidos, setPedidos]       = useState<Pedido[]>([]);
  const [menuToppings, setMenuToppings] = useState<MenuTopping[]>([]);
  const [menuConfig, setMenuConfig]    = useState<MenuConfig>({ basePrice: 3.50, freeToppingsLimit: 8 });
  const [search, setSearch]         = useState('');
  const [dayFilter, setDayFilter]   = useState<string | null>(null);
  const [activeTab, setActiveTab]   = useState<TabType>('all');
  const [detailTicket, setDetail]   = useState<Pedido | null>(null);
  const [isEditing, setIsEditing]   = useState(false);
  const [editDraft, setEditDraft]   = useState<Pedido | null>(null);
  const [otroIngrediente, setOtro]  = useState('');
  const [dialog, setDialog]         = useState<{ type: Exclude<DialogType, null>; ticket: Pedido } | null>(null);
  const [working, setWorking]       = useState(false);
  const [saving, setSaving]         = useState(false);
  const [printerStatus, setPrinterStatus] = useState<'connected' | 'disconnected' | 'connecting'>('disconnected');
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Initialize audio
  useEffect(() => {
    audioRef.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
    audioRef.current.load();
  }, []);

  const playNotification = () => {
    if (audioRef.current && notificationsEnabled) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(e => console.warn('Audio play blocked:', e));
    }
  };

  const toggleNotifications = () => {
    if (!notificationsEnabled) {
      // First time enabling requires a user gesture.
      // We play a quick silent sound or the bell to unlock.
      if (audioRef.current) {
        audioRef.current.play().then(() => {
          audioRef.current?.pause();
          audioRef.current!.currentTime = 0;
        }).catch(e => console.warn('Audio unlock failed:', e));
      }
    }
    setNotificationsEnabled(!notificationsEnabled);
  };

  useEffect(() => {
    // Resync on mount in case of hot-reload preserving state while losing singleton
    if (printerInstance.isConnected()) {
      setPrinterStatus('connected');
    } else {
      printerInstance.autoConnect();
    }
    printerInstance.onStatusChange = (s) => setPrinterStatus(s);
  }, []);

  const handleConnectPrinter = async () => {
    if (printerStatus === 'connected') {
      printerInstance.disconnect();
    } else {
      await printerInstance.connect();
    }
  };

  const printTicket = async (ticket: Pedido) => {
    console.log('printTicket called for:', ticket.codigo_ticket);
    if (!printerInstance.isConnected()) {
      console.warn('Printer instance is empty or disconnected, resolving UI state out-of-sync');
      setPrinterStatus('disconnected');
      alert('La impresora se desconectó. Por favor, dale al botón de "CONECTAR IMPRESORA" nuevamente.');
      return;
    }
    try {
      const canvas = await generateTicketCanvas(ticket);
      await printerInstance.printCanvas(canvas);
    } catch (error) {
      console.error('Print failed:', error);
      alert('Error al imprimir. Verifica la conexión con la impresora.');
    }
  };

  const previewTicket = async (ticket: Pedido) => {
    try {
      const canvas = await generateTicketCanvas(ticket);
      const dataUrl = canvas.toDataURL('image/png');
      const w = window.open('about:blank', '_blank');
      if (w) {
        w.document.write(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Vista Previa - ${ticket.codigo_ticket}</title>
              <style>
                body { margin: 0; background: #e0e0e0; display: flex; justify-content: center; padding: 40px; font-family: sans-serif; }
                .ticket { background: white; box-shadow: 0 10px 25px rgba(0,0,0,0.15); max-width: 100%; border-radius: 4px; }
              </style>
            </head>
            <body>
              <img src="${dataUrl}" class="ticket" alt="Ticket Preview">
            </body>
          </html>
        `);
        w.document.close();
      } else {
        alert('Por favor, permite las ventanas emergentes (pop-ups) en tu navegador para ver la vista previa.');
      }
    } catch (error) {
      console.error('Preview failed:', error);
      alert('Error al generar la vista previa.');
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.replace('/login');
      else { setSession(session); setChecking(false); }
    });
  }, [router]);

  const fetchPedidos = useCallback(async () => {
    const { data } = await supabase
      .from('pedidos').select('*')
      .in('estado', ['no_confirmado', 'pendiente', 'para_entregar'])
      .order('fecha_pedido', { ascending: true });
    if (data) setPedidos(data);
  }, []);

  useEffect(() => {
    if (!session) return;
    fetchPedidos();

    // Fetch menu toppings + config for the editor
    (async () => {
      const [prodRes, topRes] = await Promise.all([
        supabase.from('menu_productos').select('precio_base,free_toppings_limit').eq('id', 'burrito-armalo').single(),
        supabase.from('menu_toppings').select('id,nombre,emoji,precio_extra,precio_surcharge').order('orden'),
      ]);
      if (prodRes.data) {
        setMenuConfig({
          basePrice: Number(prodRes.data.precio_base),
          freeToppingsLimit: Number(prodRes.data.free_toppings_limit),
        });
      }
      if (topRes.data) {
        setMenuToppings(topRes.data.map((t: any) => ({
          id: t.id,
          nombre: t.nombre,
          emoji: t.emoji || '',
          precio_extra: Number(t.precio_extra ?? 0),
          precio_surcharge: Number(t.precio_surcharge ?? 0),
        })));
      }
    })();

    const sub = supabase.channel('pedidos_live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, (payload) => {
        console.log('Realtime change detected:', payload.eventType);
        
        if (payload.eventType === 'INSERT') {
          playNotification();
        }
        
        fetchPedidos();
      })
      .subscribe((status) => {
        console.log('Realtime status:', status);
        setIsLive(status === 'SUBSCRIBED');
      });

    return () => { supabase.removeChannel(sub); };
  }, [session, fetchPedidos, notificationsEnabled]);

  const act = async (type: Exclude<DialogType, null>, ticket: Pedido, payload?: any) => {
    setWorking(true);
    if (type === 'delete') {
      setPedidos(prev => prev.filter(p => p.id !== ticket.id));
    } else {
      const nextEstado = type === 'confirm' ? 'pendiente' : type === 'ready' ? 'para_entregar' : 'entregado';
      setPedidos(prev => prev.map(p => p.id === ticket.id ? { ...p, estado: nextEstado, metodo_pago: payload?.metodoPago || p.metodo_pago } : p));
    }
    setDialog(null);
    if (type === 'confirm') await supabase.from('pedidos').update({ estado: 'pendiente' }).eq('id', ticket.id);
    else if (type === 'ready') {
      console.log('Order ready: Attempting auto-print for', ticket.codigo_ticket);
      await supabase.from('pedidos').update({ estado: 'para_entregar' }).eq('id', ticket.id);
      // Auto print ticket
      if (printerStatus === 'connected') {
        printTicket(ticket);
      } else {
        console.warn('Printer not connected, skipping auto-print. Status:', printerStatus);
      }
    }
    else if (type === 'deliver') {
      const { data: sData } = await supabase.from('sesiones_caja').select('id').eq('estado', 'ABIERTA').single();
      await supabase.from('pedidos').update({ estado: 'entregado', metodo_pago: payload?.metodoPago || ticket.metodo_pago, sesion_caja_id: sData ? sData.id : null }).eq('id', ticket.id);
    }
    else if (type === 'delete')  await supabase.from('pedidos').delete().eq('id', ticket.id);
    await fetchPedidos();
    setWorking(false);
  };

  const openDialog = (type: Exclude<DialogType, null>, ticket: Pedido, e: React.MouseEvent) => {
    e.stopPropagation();
    setDetail(null);
    setDialog({ type, ticket });
  };

  const openDetail = (ticket: Pedido) => {
    setDetail(ticket);
    setIsEditing(false);
    setEditDraft(null);
    setOtro('');
  };

  const startEdit = () => {
    if (!detailTicket) return;
    // Base ingredients (first split group, unique for same mode)
    const baseIngs = splitIngredients(detailTicket.ingredientes, detailTicket.cantidad_burritos)[0] ?? [];
    // Append extra ingredient names so they show as selected in the mini-menu
    const extraNames = (detailTicket.extras ?? []).map((e: Extra) => e.nombre);
    // Avoid duplicates in case extras are already in ingredientes somehow
    const allIngs = [...baseIngs, ...extraNames.filter((n: string) => !baseIngs.includes(n))];
    setEditDraft({ ...detailTicket, ingredientes: allIngs });
    setIsEditing(true);
    setOtro('');
  };

  const toggleIngrediente = (ing: string) => {
    if (!editDraft) return;
    const has = editDraft.ingredientes.includes(ing);
    const newIngs = has
      ? editDraft.ingredientes.filter(i => i !== ing)
      : [...editDraft.ingredientes, ing];
    const newTotal = calcTotal(newIngs, editDraft.cantidad_burritos, menuToppings, menuConfig);
    setEditDraft(d => d ? { ...d, ingredientes: newIngs, total: Number(newTotal.toFixed(2)) } : d);
  };

  const addOtro = () => {
    const trimmed = otroIngrediente.trim();
    if (!trimmed || !editDraft) return;
    if (!editDraft.ingredientes.includes(trimmed)) {
      setEditDraft(d => d ? { ...d, ingredientes: [...d.ingredientes, trimmed] } : d);
    }
    setOtro('');
  };

  const saveEdit = async () => {
    if (!editDraft) return;
    setSaving(true);

    // Recalculate extras column: ingredients beyond freeToppingsLimit
    const extraIngs = editDraft.ingredientes.slice(menuConfig.freeToppingsLimit);
    const newExtras = extraIngs.map((nom: string) => {
      const t = menuToppings.find(to => to.nombre === nom);
      return { nombre: nom, precio: t?.precio_extra ?? 0 };
    });
    // Base ingredients = everything within the free limit
    const baseIngs = editDraft.ingredientes.slice(0, menuConfig.freeToppingsLimit);

    const { error } = await supabase.from('pedidos').update({
      cliente_nombre: editDraft.cliente_nombre,
      cliente_telefono: editDraft.cliente_telefono,
      cliente_direccion: editDraft.cliente_direccion,
      dia_entrega: editDraft.dia_entrega,
      cantidad_burritos: editDraft.cantidad_burritos,
      total: editDraft.total,
      ingredientes: baseIngs,
      extras: newExtras,
    }).eq('id', editDraft.id);

    if (!error) {
      await fetchPedidos();
      setDetail({ ...editDraft, ingredientes: baseIngs, extras: newExtras });
      setIsEditing(false);
      setEditDraft(null);
    }
    setSaving(false);
  };

  if (checking) return null;

  const filtered = pedidos.filter(p => {
    const matchSearch =
      p.codigo_ticket?.toLowerCase().includes(search.toLowerCase()) ||
      p.cliente_nombre?.toLowerCase().includes(search.toLowerCase());
    const matchDay = !dayFilter || p.dia_entrega?.toUpperCase().includes(dayFilter.toUpperCase());
    return matchSearch && matchDay;
  });

  const byEstado = (e: string) => filtered.filter(p => p.estado === e);
  const countBy  = (e: string) => filtered.filter(p => p.estado === e).length;

  const DAY_FILTERS = ['VIERNES', 'SÁBADO', 'DOMINGO'];

  const TABS: { key: TabType; label: string; estado?: string; color: string }[] = [
    { key: 'all',           label: 'Todos',          color: 'var(--text-muted)' },
    { key: 'no_confirmado', label: 'Por Confirmar',  estado: 'no_confirmado', color: 'var(--warning)' },
    { key: 'pendiente',     label: 'En Cocina',      estado: 'pendiente',     color: 'var(--accent)'  },
    { key: 'para_entregar', label: 'Para Entregar',  estado: 'para_entregar', color: 'var(--success)' },
  ];

  const activeTickets = activeTab === 'all' ? filtered : byEstado(activeTab);

  const currentTab = TABS.find(t => t.key === activeTab)!;

  return (
    <AppShell user={session?.user}>
      {/* Topbar */}
      <div className="topbar" style={{ flexWrap: 'wrap', height: 'auto', minHeight: 'var(--topbar-h)', gap: 8, padding: '8px 20px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="topbar-page-name">TICKETS</span>
            {pedidos.length > 0 && <span className="topbar-badge">{pedidos.length}</span>}
          </div>
          <span className="topbar-subtitle">Live Kitchen Monitor</span>
        </div>
        <div className="topbar-actions" style={{ flexWrap: 'wrap', gap: 8 }}>
          {/* Day filter chips */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            {(['TODOS', ...DAY_FILTERS]).map(day => {
              const active = day === 'TODOS' ? !dayFilter : dayFilter === day;
              return (
                <button
                  key={day}
                  onClick={() => setDayFilter(day === 'TODOS' ? null : day)}
                  style={{
                    padding: '5px 12px', borderRadius: 4, fontSize: '0.65rem', fontWeight: 800,
                    letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer',
                    transition: 'all 0.15s',
                    border: active ? 'none' : '1px solid rgba(255,255,255,0.1)',
                    background: active ? 'var(--accent)' : 'transparent',
                    color: active ? '#fff' : 'var(--text-dim)',
                  }}
                >
                  {day}
                </button>
              );
            })}
          </div>
          <div className="topbar-search">
            <Search size={14} color="var(--text-dim)" />
            <input placeholder="Buscar por ID o cliente..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          <button
            onClick={toggleNotifications}
            style={{
              padding: '6px 12px', borderRadius: 6, fontSize: '0.65rem', fontWeight: 800,
              display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', transition: 'all 0.2s',
              background: notificationsEnabled ? 'var(--accent)' : 'var(--surface-max)',
              color: notificationsEnabled ? '#fff' : 'var(--text-muted)',
              border: 'none',
              boxShadow: notificationsEnabled ? '0 0 10px rgba(255,51,51,0.3)' : 'none',
            }}
          >
            <Bell size={14} className={notificationsEnabled ? 'animate-pulse' : ''} />
            {notificationsEnabled ? 'NOTIFICACIONES ACTIVAS' : 'ACTIVAR SONIDO'}
          </button>

          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
            background: 'var(--surface-max)', borderRadius: 6, fontSize: '0.65rem', fontWeight: 800,
            color: isLive ? 'var(--success)' : 'var(--warning)'
          }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: isLive ? 'var(--success)' : 'var(--warning)',
              boxShadow: isLive ? '0 0 8px var(--success)' : 'none',
              animation: isLive ? 'pulse 2s infinite' : 'none'
            }} />
            {isLive ? 'LIVE' : 'CONNECTING...'}
          </div>

          <button
            onClick={handleConnectPrinter}
            style={{
              padding: '6px 12px', borderRadius: 6, fontSize: '0.65rem', fontWeight: 800,
              display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', transition: 'all 0.2s',
              background: printerStatus === 'connected' ? 'var(--success)' : (printerStatus === 'connecting' ? 'var(--warning)' : 'var(--surface-max)'),
              color: printerStatus === 'connected' ? '#111' : (printerStatus === 'connecting' ? '#111' : 'var(--text-muted)'),
              border: 'none',
              opacity: printerStatus === 'connecting' ? 0.7 : 1,
            }}
          >
            {printerStatus === 'connected' ? <BluetoothConnected size={14} /> : (printerStatus === 'connecting' ? <Bluetooth size={14} className="animate-spin" /> : <BluetoothOff size={14} />)}
            {printerStatus === 'connected' ? 'IMPRESORA LISTA' : (printerStatus === 'connecting' ? 'CONECTANDO...' : 'CONECTAR IMPRESORA')}
          </button>
        </div>
      </div>

      {/* ── Status Tabs ── */}
      <div style={{
        display: 'flex', gap: 0, borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: 'var(--surface)', overflowX: 'auto',
      }}>
        {TABS.map(tab => {
          const count = tab.estado ? countBy(tab.estado) : filtered.length;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 8,
                background: 'transparent', border: 'none', cursor: 'pointer',
                borderBottom: isActive ? `2px solid ${tab.color}` : '2px solid transparent',
                color: isActive ? tab.color : 'var(--text-dim)',
                fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.08em',
                textTransform: 'uppercase', transition: 'all 0.15s', whiteSpace: 'nowrap',
                marginBottom: '-1px',
              }}
            >
              {tab.label}
              {count > 0 && (
                <span style={{
                  background: isActive ? tab.color : 'var(--surface-max)',
                  color: isActive ? (tab.color === 'var(--success)' ? '#111' : '#fff') : 'var(--text-muted)',
                  fontSize: '0.6rem', fontWeight: 900,
                  padding: '1px 6px', borderRadius: 99,
                }}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Content ── */}
      <div className="page">
        {activeTab === 'all' ? (
          /* Kanban */
          <div className="kanban">
            <KanbanCol title="Por Confirmar" color="yellow" tickets={byEstado('no_confirmado')} onOpen={openDetail}
              actions={t => (
                <div style={{ display: 'flex', gap: 6, width: '100%' }}>
                  <ActionBtn label="Rechazar"  icon={<X size={12} />}    danger onClick={e => openDialog('delete', t, e)} />
                  <ActionBtn label="Confirmar" icon={<Check size={12} />} primary onClick={e => openDialog('confirm', t, e)} style={{ flex: 2 }} />
                </div>
              )}
            />
            <KanbanCol title="En Cocina" color="red" tickets={byEstado('pendiente')} onOpen={openDetail} variant="hot"
              actions={t => (
                <div style={{ display: 'flex', gap: 6, width: '100%' }}>
                  <ActionBtn label="Cancelar" icon={<Trash2 size={12} />} danger onClick={e => openDialog('delete', t, e)} />
                  <ActionBtn label="Listo"    icon={<Check size={12} />}  muted  onClick={e => openDialog('ready', t, e)} style={{ flex: 2 }} />
                </div>
              )}
            />
            <KanbanCol title="Para Entregar" color="green" tickets={byEstado('para_entregar')} onOpen={openDetail} variant="ready"
              actions={t => (
                <div style={{ display: 'flex', gap: 6, width: '100%' }}>
                  <ActionBtn label="Cancelar" icon={<Trash2 size={12} />} danger   onClick={e => openDialog('delete', t, e)} />
                  <ActionBtn label="Entregar" icon={<Check size={12} />}  success  onClick={e => openDialog('deliver', t, e)} style={{ flex: 2 }} />
                </div>
              )}
            />
          </div>
        ) : (
          /* Single column list */
          <div style={{ maxWidth: 600 }}>
            {activeTickets.length === 0 ? (
              <div style={{ color: 'var(--text-dim)', fontSize: '0.72rem', textAlign: 'center', padding: '60px 0', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600 }}>
                Sin tickets en esta categoría
              </div>
            ) : (
              activeTickets.map(p => {
                const burritos = splitIngredients(p.ingredientes, p.cantidad_burritos);
                const actionsMap: Record<string, React.ReactNode> = {
                  no_confirmado: (
                    <div style={{ display: 'flex', gap: 6, width: '100%' }}>
                      <ActionBtn label="Rechazar"  icon={<X size={12} />}    danger onClick={e => openDialog('delete', p, e)} />
                      <ActionBtn label="Confirmar" icon={<Check size={12} />} primary onClick={e => openDialog('confirm', p, e)} style={{ flex: 2 }} />
                    </div>
                  ),
                  pendiente: (
                    <div style={{ display: 'flex', gap: 6, width: '100%' }}>
                      <ActionBtn label="Cancelar" icon={<Trash2 size={12} />} danger onClick={e => openDialog('delete', p, e)} />
                      <ActionBtn label="Listo"    icon={<Check size={12} />}  muted  onClick={e => openDialog('ready', p, e)} style={{ flex: 2 }} />
                    </div>
                  ),
                  para_entregar: (
                    <div style={{ display: 'flex', gap: 6, width: '100%' }}>
                      <ActionBtn label="Cancelar" icon={<Trash2 size={12} />} danger   onClick={e => openDialog('delete', p, e)} />
                      <ActionBtn label="Entregar" icon={<Check size={12} />}  success  onClick={e => openDialog('deliver', p, e)} style={{ flex: 2 }} />
                    </div>
                  ),
                };
                return (
                  <div key={p.id} className={`ticket-card ${p.estado === 'pendiente' ? 'hot' : p.estado === 'para_entregar' ? 'ready' : ''}`}
                    style={{ cursor: 'pointer', marginBottom: 12 }} onClick={() => openDetail(p)}>
                    <div className="ticket-header">
                      <span className="ticket-code">{p.codigo_ticket || '#----'}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {p.canal === 'mesa' && (
                          <span style={{
                            fontSize: '0.55rem', fontWeight: 900, letterSpacing: '0.1em',
                            background: 'rgba(59,130,246,0.15)', color: '#60a5fa',
                            border: '1px solid rgba(59,130,246,0.3)',
                            padding: '2px 7px', borderRadius: 99, textTransform: 'uppercase',
                          }}>🪑 MESA</span>
                        )}
                        <span className="ticket-total">${Number(p.total).toFixed(2)}</span>
                        <ChevronRight size={13} color="var(--text-dim)" />
                      </div>
                    </div>
                    <div className="ticket-name">{p.cliente_nombre}</div>
                    {burritos.map((ings, idx) => (
                      <div key={idx} style={{ marginBottom: 6 }}>
                        <div className="ticket-item-pill">
                          <span>{p.cantidad_burritos === 1 ? `${p.cantidad_burritos}x` : `${idx + 1}/${p.cantidad_burritos}`}</span>
                          <Package size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: 'text-bottom' }} /> BURRITO
                        </div>
                        <div className="ticket-ingredients" style={{ marginTop: 3 }}>
                          {ings.slice(0, 5).join(' · ')}{ings.length > 5 ? ` +${ings.length - 5}` : ''}
                        </div>
                      </div>
                    ))}
                    {p.extras?.length > 0 && (
                      <div style={{ fontSize: '0.65rem', color: 'var(--warning)', marginBottom: 6 }}>
                        <Star size={10} style={{ display: 'inline', marginRight: 3, verticalAlign: 'text-bottom' }} /> {p.extras.map(e => e.nombre).join(', ')}
                      </div>
                    )}
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 10, marginTop: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.63rem', color: 'var(--text-dim)', marginBottom: 8 }}>
                        <Clock size={11} /> {p.bloque_horario} · {p.dia_entrega} {p.metodo_pago ? <><span style={{ margin: '0 4px' }}>·</span><CreditCard size={11} /> {p.metodo_pago}</> : ''}
                      </div>
                      {actionsMap[p.estado]}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* ── Detail / Edit Modal ── */}
      {detailTicket && (
        <div className="modal-overlay" onClick={() => { setDetail(null); setIsEditing(false); }}>
          <div className="modal-box" style={{ maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <div style={{ fontFamily: 'Bebas Neue', fontSize: '1.6rem', color: 'var(--accent)', letterSpacing: '0.06em', lineHeight: 1 }}>
                  {detailTicket.codigo_ticket}
                </div>
                <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: 2 }}>
                  {isEditing ? 'Editando pedido' : 'Detalle del Pedido'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {!isEditing && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => previewTicket(detailTicket)}
                      title="Ver vista previa"
                      style={{ background: 'var(--surface-max)', border: 'none', color: 'var(--text)', cursor: 'pointer', padding: '6px 10px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.06em' }}>
                      <Eye size={13} /> VISTA PREVIA
                    </button>
                    <button onClick={() => printTicket(detailTicket)}
                      title="Imprimir ticket"
                      style={{ background: 'var(--surface-max)', border: 'none', color: 'var(--success)', cursor: 'pointer', padding: '6px 10px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.06em' }}>
                      <Printer size={13} /> IMPRIMIR
                    </button>
                    <button onClick={startEdit} title="Editar pedido"
                      style={{ background: 'var(--surface-max)', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '6px 10px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.06em' }}>
                      <Edit2 size={13} /> EDITAR
                    </button>
                  </div>
                )}
                <button onClick={() => { setDetail(null); setIsEditing(false); }}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', paddingTop: 4 }}>
                  <X size={20} />
                </button>
              </div>
            </div>

            {isEditing && editDraft ? (
              /* ── Edit Mode ── */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                {/* Customer fields */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {[
                    { label: 'Nombre', key: 'cliente_nombre' as const },
                    { label: 'Teléfono', key: 'cliente_telefono' as const },
                    { label: 'Dirección', key: 'cliente_direccion' as const },
                  ].map(({ label, key }) => (
                    <div key={key} className="field" style={key === 'cliente_direccion' ? { gridColumn: '1/-1' } : undefined}>
                      <label>{label}</label>
                      <input value={(editDraft as any)[key]} onChange={e => setEditDraft(d => d ? { ...d, [key]: e.target.value } : d)} />
                    </div>
                  ))}

                  <div className="field">
                    <label>Día entrega</label>
                    <select value={editDraft.dia_entrega} onChange={e => setEditDraft(d => d ? { ...d, dia_entrega: e.target.value } : d)}>
                      {['VIERNES','SÁBADO','DOMINGO'].map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>

                  <div className="field">
                    <label>Cantidad burritos</label>
                    <input type="number" min={1} value={editDraft.cantidad_burritos}
                      onChange={e => setEditDraft(d => d ? { ...d, cantidad_burritos: Number(e.target.value) } : d)} />
                  </div>

                  <div className="field" style={{ gridColumn: '1/-1' }}>
                    <label>Total ($)</label>
                    <input type="number" step="0.01" min={0} value={editDraft.total}
                      onChange={e => setEditDraft(d => d ? { ...d, total: Number(e.target.value) } : d)} />
                  </div>
                </div>

                {/* Ingredient mini-menu */}
                <div>
                  <div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>
                    Ingredientes — {editDraft.ingredientes.length} seleccionados
                    &nbsp;·&nbsp;
                    <span style={{ color: 'var(--success)', fontFamily: 'var(--font-display)', fontSize: '0.9rem' }}>
                      ${editDraft.total.toFixed(2)}
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                    {menuToppings.map(t => {
                      const active = editDraft.ingredientes.includes(t.nombre);
                      const showSurcharge = !active && t.precio_surcharge > 0 && editDraft.ingredientes.length < menuConfig.freeToppingsLimit;
                      const showExtra = !active && t.precio_extra > 0 && editDraft.ingredientes.length >= menuConfig.freeToppingsLimit;
                      return (
                        <button key={t.id} onClick={() => toggleIngrediente(t.nombre)} style={{
                          padding: '7px 8px', borderRadius: 6, fontSize: '0.67rem', fontWeight: 700,
                          textAlign: 'center', cursor: 'pointer', transition: 'all 0.12s',
                          background: active ? 'rgba(204,0,0,0.15)' : 'var(--surface-max)',
                          border: active ? '1px solid var(--accent)' : '1px solid transparent',
                          color: active ? '#fff' : 'var(--text-muted)',
                        }}>
                          {active && <Check size={9} style={{ display: 'inline', marginRight: 3 }} />}
                          {t.emoji && <span style={{ marginRight: 3 }}>{t.emoji}</span>}
                          {t.nombre}
                          {showSurcharge && (
                            <span style={{ display: 'block', fontSize: '0.55rem', color: 'var(--warning)', marginTop: 1 }}>+${t.precio_surcharge.toFixed(2)}</span>
                          )}
                          {showExtra && (
                            <span style={{ display: 'block', fontSize: '0.55rem', color: 'var(--success)', marginTop: 1 }}>+${t.precio_extra.toFixed(2)}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Ingredientes del pedido que no están en el menú actual (personalizados) */}
                  {editDraft.ingredientes
                    .filter((i: string) => !menuToppings.some(t => t.nombre === i))
                    .map((ing: string) => (
                      <button key={ing} onClick={() => toggleIngrediente(ing)} style={{
                        marginTop: 6, padding: '7px 8px', borderRadius: 6, fontSize: '0.67rem', fontWeight: 700,
                        cursor: 'pointer', transition: 'all 0.12s', width: '100%', textAlign: 'left',
                        background: 'rgba(204,0,0,0.15)', border: '1px solid var(--accent)', color: '#fff',
                      }}>
                        <Check size={9} style={{ display: 'inline', marginRight: 3 }} /> {ing} (personalizado)
                      </button>
                    ))}

                  {/* Otro */}
                  <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                    <input
                      placeholder="Otro ingrediente..."
                      value={otroIngrediente}
                      onChange={e => setOtro(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addOtro()}
                      style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--surface-max)', borderRadius: 6, padding: '7px 10px', fontSize: '0.75rem', color: 'var(--text)', outline: 'none' }}
                    />
                    <button onClick={addOtro} style={{
                      padding: '7px 14px', borderRadius: 6, background: 'var(--surface-max)', border: 'none',
                      color: 'var(--text)', fontSize: '0.7rem', fontWeight: 800, cursor: 'pointer',
                    }}>+ AÑADIR</button>
                  </div>
                </div>

                {/* Save / Cancel */}
                <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                  <button className="btn btn-secondary" style={{ flex: 1 }}
                    onClick={() => { setIsEditing(false); setEditDraft(null); }} disabled={saving}>
                    Cancelar
                  </button>
                  <button className="btn" style={{ flex: 1, background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}
                    onClick={saveEdit} disabled={saving}>
                    <Save size={13} /> {saving ? 'Guardando...' : 'Guardar cambios'}
                  </button>
                </div>
              </div>
            ) : (
              /* ── View Mode ── */
              <>
                {[
                  { icon: <Calendar size={14} />, text: `Para entregar el: ${detailTicket.dia_entrega} (${detailTicket.bloque_horario})` },
                  { icon: <User size={14} />, text: `Nombre: ${detailTicket.cliente_nombre}` },
                  { icon: <Phone size={14} />, text: `Teléfono: ${detailTicket.cliente_telefono || '—'}` },
                  { icon: <MapPin size={14} />, text: `Dirección: ${detailTicket.cliente_direccion || '—'}` },
                  { icon: <Package size={14} />, text: `Cantidad: ${detailTicket.cantidad_burritos} burrito${detailTicket.cantidad_burritos > 1 ? 's' : ''}` },
                  { icon: <CreditCard size={14} />, text: `Método de pago: ${detailTicket.metodo_pago || 'Efectivo'}` },
                ].map(({ icon, text }, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 8, fontSize: '0.82rem', color: 'var(--text)', alignItems: 'flex-start' }}>
                    <span style={{ flexShrink: 0 }}>{icon}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{text}</span>
                  </div>
                ))}

                <div style={{ display: 'flex', gap: 10, marginBottom: 20, fontSize: '0.82rem' }}>
                  <Banknote size={15} color="var(--text-muted)" />
                  <span style={{ color: 'var(--text-muted)' }}>Total a pagar: </span>
                  <span style={{ fontFamily: 'Bebas Neue', fontSize: '1.1rem', color: 'var(--success)' }}>${Number(detailTicket.total).toFixed(2)}</span>
                </div>

                <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '4px 0 20px' }} />

                {splitIngredients(detailTicket.ingredientes, detailTicket.cantidad_burritos).map((ings, idx) => {
                  const burritoNumber = idx + 1;
                  const isFirst = burritoNumber === 1;

                  const burritoExtras = detailTicket.extras?.filter(ext => {
                    const match = ext.nombre.match(/^\[B(\d+)\]/i);
                    return match ? parseInt(match[1]) === burritoNumber : isFirst;
                  }) || [];

                  const mainIngs = [...ings];
                  const realExtras: string[] = [];

                  burritoExtras.forEach(ext => {
                    let cleanName = ext.nombre.replace(/^\[B\d+\]\s*/i, '');
                    cleanName = cleanName.replace(/\s*\(\+\$[\d.]+\)/, ''); // Quitar los precios visuales del UI
                    
                    if (cleanName.toLowerCase().startsWith('extra:')) {
                      cleanName = cleanName.replace(/^Extra:\s*/i, '').trim();
                      realExtras.push(cleanName);
                    } else if (cleanName.toLowerCase().startsWith('recargo:')) {
                      cleanName = cleanName.replace(/^Recargo:\s*/i, '').trim();
                      mainIngs.push(cleanName);
                    } else {
                      realExtras.push(cleanName.trim());
                    }
                  });

                  const justIngs = mainIngs.filter(i => !i.toLowerCase().startsWith('nota:'));
                  const notes = mainIngs.filter(i => i.toLowerCase().startsWith('nota:'));

                  return (
                    <div key={idx} style={{ marginBottom: 14 }}>
                      <div style={{ fontFamily: 'Bebas Neue', fontSize: '0.9rem', color: 'var(--accent)', letterSpacing: '0.08em', marginBottom: 5 }}>
                        <Package size={14} style={{ display: 'inline', marginRight: 4, verticalAlign: 'text-bottom' }} /> {detailTicket.cantidad_burritos === 1 ? 'Ingredientes:' : `Burrito ${burritoNumber}:`}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.7, paddingLeft: 24 }}>
                        {justIngs.length > 0 ? justIngs.join(', ') + '.' : '—'}
                      </div>
                      {realExtras.length > 0 && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--warning)', paddingLeft: 24, marginTop: 4 }}>
                          <Star size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: 'text-bottom' }} /> Extras: {realExtras.join(', ')}
                        </div>
                      )}
                      {notes.length > 0 && (
                        <div style={{ fontSize: '0.8rem', color: 'var(--accent)', paddingLeft: 24, marginTop: 4, fontStyle: 'italic', fontWeight: 600 }}>
                          📝 {notes.join(' | ')}
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Confirm Dialog ── */}
      {dialog && <ConfirmDialog {...dialog} working={working} onCancel={() => setDialog(null)} onConfirm={(p) => act(dialog.type, dialog.ticket, p)} />}
    </AppShell>
  );
}

// ── KanbanCol ────────────────────────────────────────────────────────
function KanbanCol({ title, color, tickets, actions, onOpen, variant = 'default' }: {
  title: string; color: 'yellow'|'red'|'green'; tickets: Pedido[];
  actions: (t: Pedido) => React.ReactNode; onOpen: (t: Pedido) => void;
  variant?: 'default'|'hot'|'ready';
}) {
  const countColors = { yellow: 'var(--warning)', red: 'var(--accent)', green: 'var(--success)' };
  return (
    <div>
      <div className="kanban-col-header">
        <span className="kanban-col-title">{title}</span>
        <span className="kanban-col-count" style={{ color: countColors[color] }}>{tickets.length}</span>
      </div>
      <div className={`kanban-col-line ${color}`} />
      {tickets.length === 0
        ? <div style={{ color: 'var(--text-dim)', fontSize: '0.72rem', textAlign: 'center', padding: '40px 0', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600 }}>Sin Tickets</div>
        : tickets.map(p => {
            const burritos = splitIngredients(p.ingredientes, p.cantidad_burritos);
            return (
              <div key={p.id} className={`ticket-card ${variant}`} style={{ cursor: 'pointer' }} onClick={() => onOpen(p)}>
                <div className="ticket-header">
                  <span className="ticket-code">{p.codigo_ticket || '#----'}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {p.canal === 'mesa' && (
                      <span style={{
                        fontSize: '0.55rem', fontWeight: 900, letterSpacing: '0.1em',
                        background: 'rgba(59,130,246,0.15)', color: '#60a5fa',
                        border: '1px solid rgba(59,130,246,0.3)',
                        padding: '2px 7px', borderRadius: 99, textTransform: 'uppercase',
                      }}>🪑 MESA</span>
                    )}
                    <span className="ticket-total">${Number(p.total).toFixed(2)}</span>
                    <ChevronRight size={13} color="var(--text-dim)" />
                  </div>
                </div>
                <div className="ticket-name">{p.cliente_nombre}</div>

                {burritos.map((ings, idx) => {
                  const burritoNumber = idx + 1;
                  const isFirst = burritoNumber === 1;

                  const burritoExtras = p.extras?.filter(ext => {
                    const match = ext.nombre.match(/^\[B(\d+)\]/i);
                    return match ? parseInt(match[1]) === burritoNumber : isFirst;
                  }) || [];

                  const mainIngs = [...ings];
                  const realExtras: string[] = [];

                  burritoExtras.forEach(ext => {
                    let cleanName = ext.nombre.replace(/^\[B\d+\]\s*/i, '');
                    cleanName = cleanName.replace(/\s*\(\+\$[\d.]+\)/, ''); // Ocultar precios en Kanban view
                    
                    if (cleanName.toLowerCase().startsWith('extra:')) {
                      cleanName = cleanName.replace(/^Extra:\s*/i, '').trim();
                      mainIngs.push(cleanName);
                    } else if (cleanName.toLowerCase().startsWith('recargo:')) {
                      cleanName = cleanName.replace(/^Recargo:\s*/i, '').trim();
                      mainIngs.push(cleanName);
                    } else {
                      realExtras.push(cleanName.trim());
                    }
                  });

                  return (
                    <div key={idx} style={{ marginBottom: 8 }}>
                      <div className="ticket-item-pill" style={{ marginBottom: 4 }}>
                        <span>{p.cantidad_burritos === 1 ? `${p.cantidad_burritos}x` : `${burritoNumber}/${p.cantidad_burritos}`}</span>
                        <Package size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: 'text-bottom' }} /> BURRITO
                      </div>
                      <div className="ticket-ingredients" style={{ marginTop: 2 }}>
                        {mainIngs.slice(0, 5).join(' · ')}{mainIngs.length > 5 ? ` +${mainIngs.length - 5}` : ''}
                      </div>
                      {realExtras.length > 0 && (
                        <div style={{ fontSize: '0.65rem', color: 'var(--warning)', marginTop: 3 }}>
                          <Star size={9} style={{ display: 'inline', marginRight: 3, verticalAlign: 'text-bottom' }} /> {realExtras.join(', ')}
                        </div>
                      )}
                    </div>
                  );
                })}

                <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 10, marginTop: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.63rem', color: 'var(--text-dim)', marginBottom: 8 }}>
                    <Clock size={11} /> {p.bloque_horario} · {p.dia_entrega} {p.metodo_pago ? <><span style={{ margin: '0 4px' }}>·</span><CreditCard size={11} /> {p.metodo_pago}</> : ''}
                  </div>
                  {actions(p)}
                </div>
              </div>
            );
          })
      }
    </div>
  );
}

// ── ActionBtn ──────────────────────────────────────────────────
function ActionBtn({ label, icon, danger, primary, success, muted, onClick, style = {} }: {
  label: string; icon: React.ReactNode;
  danger?: boolean; primary?: boolean; success?: boolean; muted?: boolean;
  onClick: (e: React.MouseEvent) => void; style?: React.CSSProperties;
}) {
  const bg  = danger ? 'transparent' : primary ? 'var(--accent)' : success ? 'var(--success)' : 'var(--surface-max)';
  const col = danger ? 'var(--danger)' : primary ? '#fff' : success ? '#111' : 'var(--text)';
  const border = danger ? '1px solid rgba(239,68,68,0.25)' : 'none';
  return (
    <button onClick={onClick} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '7px 10px', borderRadius: 4, background: bg, color: col, border, fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer', transition: 'all 0.15s', ...style }}>
      {icon} {label}
    </button>
  );
}

// ── ConfirmDialog ─────────────────────────────────────────────
const DIALOGS: Record<Exclude<DialogType, null>, { title: string; msg: string; btnLabel: string; btnBg: string; btnColor?: string }> = {
  confirm: { title: '¿Confirmar pedido?',      msg: 'Pasará a EN COCINA.',                                                          btnLabel: 'Sí, confirmar', btnBg: 'var(--accent)' },
  ready:   { title: '¿Marcar como listo?',     msg: 'Pasará a PARA ENTREGAR.',                                                      btnLabel: 'Sí, está listo', btnBg: 'var(--success)', btnColor: '#111' },
  deliver: { title: '¿Marcar como entregado?', msg: 'Se quitará del tablero y se registrará como venta.',                           btnLabel: 'Sí, entregar',  btnBg: 'var(--success)', btnColor: '#111' },
  delete:  { title: '¿Eliminar este pedido?',  msg: 'Se eliminará permanentemente. Esta acción no se puede deshacer.',              btnLabel: 'Sí, eliminar',  btnBg: 'var(--danger)' },
};

function ConfirmDialog({ type, ticket, working, onCancel, onConfirm }: {
  type: Exclude<DialogType, null>; ticket: Pedido; working: boolean;
  onCancel: () => void; onConfirm: (payload?: any) => void;
}) {
  const cfg = DIALOGS[type];
  const [metodoPago, setMetodoPago] = useState(ticket.metodo_pago || 'Efectivo');

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-box" style={{ maxWidth: 360 }} onClick={e => e.stopPropagation()}>
        <div style={{ fontFamily: 'Bebas Neue', fontSize: '1.1rem', letterSpacing: '0.06em', marginBottom: 6 }}>{cfg.title}</div>
        <div style={{ fontSize: '0.75rem', color: 'var(--accent)', fontWeight: 700, marginBottom: 6 }}>
          {ticket.codigo_ticket} — {ticket.cliente_nombre}
        </div>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: type === 'deliver' ? 12 : 24, lineHeight: 1.5 }}>{cfg.msg}</div>
        
        {type === 'deliver' && (
          <div style={{ marginBottom: 24, background: 'var(--surface)', padding: 12, borderRadius: 8 }}>
            <label style={{ fontSize: '0.65rem', color: 'var(--text-dim)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6, display: 'block' }}>
              Confirmar método de pago final:
            </label>
            <select
              value={metodoPago}
              onChange={e => setMetodoPago(e.target.value)}
              style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--surface-max)', color: 'var(--text)', padding: '8px 10px', borderRadius: 6, fontSize: '0.75rem', outline: 'none' }}
            >
              <option value="Efectivo">Efectivo</option>
              <option value="Transferencia">Transferencia</option>
            </select>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onCancel} disabled={working}>Cancelar</button>
          <button className="btn" style={{ flex: 1, background: cfg.btnBg, color: cfg.btnColor ?? '#fff' }} onClick={() => onConfirm(type === 'deliver' ? { metodoPago } : undefined)} disabled={working}>
            {working ? 'Procesando...' : cfg.btnLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
