import { useRef, useState, useEffect } from 'react';
import { Bell, CheckCheck, X } from 'lucide-react';
import { useNotifications, type Notification } from '@/lib/providers/notifications-provider';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function NotifItem({ n, onRead }: { n: Notification; onRead: (id: string) => void }) {
  return (
    <button
      onClick={() => !n.readAt && onRead(n.id)}
      className={`w-full text-left px-4 py-3 flex gap-3 items-start hover:bg-stone-50 transition-colors border-b hairline last:border-0 ${!n.readAt ? 'bg-stone-50/60' : ''}`}
    >
      <span className={`mt-1.5 size-2 rounded-full shrink-0 ${!n.readAt ? 'bg-foreground' : 'bg-transparent border border-border'}`} />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-foreground leading-snug">{n.title}</p>
        {n.body && <p className="text-[11px] text-taupe mt-0.5 leading-snug">{n.body}</p>}
        <p className="text-[10px] text-taupe/70 mt-1 uppercase tracking-wide">{timeAgo(n.createdAt)}</p>
      </div>
    </button>
  );
}

export function NotificationBell() {
  const { notifications, unreadCount, loading, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Auto-mark all as read 1s after panel opens so the user sees the dot briefly
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => { if (unreadCount > 0) markAllRead(); }, 1000);
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', handleClick); };
  }, [open, unreadCount, markAllRead]);

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(o => !o)}
        className="relative flex items-center justify-center size-9 rounded-full hover:bg-stone-100 transition-colors"
        aria-label="Notifications"
      >
        <Bell className="size-[18px] text-taupe" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-foreground text-background text-[9px] font-bold rounded-full flex items-center justify-center px-1 leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-offwhite border hairline shadow-lg z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b hairline">
            <span className="text-[11px] uppercase tracking-[0.2em] font-medium">Notifications</span>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-taupe hover:text-foreground transition-colors"
                >
                  <CheckCheck className="size-3" /> Mark all read
                </button>
              )}
              <button onClick={() => setOpen(false)} className="text-taupe hover:text-foreground">
                <X className="size-3.5" />
              </button>
            </div>
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {loading && notifications.length === 0 ? (
              <p className="px-4 py-8 text-center text-[11px] text-taupe">Loading…</p>
            ) : notifications.length === 0 ? (
              <p className="px-4 py-8 text-center text-[11px] text-taupe">No notifications yet</p>
            ) : (
              notifications.map(n => (
                <NotifItem key={n.id} n={n} onRead={markRead} />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
