import {
  Bell,
  CalendarDays,
  ClipboardCheck,
  LayoutDashboard,
  LogOut,
  QrCode,
  Settings,
} from "lucide-react";

interface SidebarProps {
  active: string;
  setActive: (page: string) => void;
}

export default function Sidebar({ active, setActive }: SidebarProps) {
  const navItems = [
    { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { key: "qr", label: "My QR Codes", icon: QrCode },
    { key: "attendance", label: "Attendance", icon: ClipboardCheck },
    { key: "events", label: "Events", icon: CalendarDays },
    { key: "notify", label: "Notifications", icon: Bell },
    { key: "settings", label: "Settings", icon: Settings },
  ];

  // LOGOUT FUNCTION
  const handleLogout = async () => {
    try {
      const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
      
      await fetch('/logout', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          ...(csrfToken && { 'X-CSRF-TOKEN': csrfToken })
        }
      });

      // Clear all stored user data
      localStorage.clear();
      sessionStorage.clear();
      
      // Redirect to login page
      window.location.href = '/';
      
    } catch (err) {
      console.error('Logout error:', err);
      // Force clear local data even if API fails
      localStorage.clear();
      sessionStorage.clear();
      window.location.href = '/';
    }
  };

  return (
    <aside className="hidden w-[250px] flex-col border-r border-[#ddd5ca] bg-[#fcfcf9] md:flex h-screen sticky top-0">
      <div className="border-b border-[#ddd5ca] px-5 py-5 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-orange-400 font-black text-black">
            B
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-[#005f63]/70">
              Barangay Piao
            </p>
            <h1 className="text-xl font-black text-[#005f63]">e-Membership</h1>
          </div>
        </div>
      </div>

      <div className="flex-1 px-2 py-5 overflow-y-auto smooth-scroll">
        <p className="mb-3 px-3 text-sm font-semibold text-[#005f63]/70">
          Member Area
        </p>
        <div className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                onClick={() => setActive(item.key)}
                className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-all duration-200 ${
                  active === item.key
                    ? "bg-gradient-to-r from-orange-300 via-orange-200 to-yellow-200 text-[#005f63] shadow-[0_8px_25px_rgba(150,146,60,0.35)] font-bold scale-[1.02]"
                    : "text-[#005f63] hover:bg-orange-100 hover:shadow-md"
                }`}
              >
                <Icon className="h-5 w-5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="border-t border-[#ddd5ca] p-2 shrink-0">
        <button 
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-[#005f63] transition hover:bg-orange-100"
        >
          <LogOut className="h-5 w-5" />
          <span className="font-medium">Sign out</span>
        </button>
      </div>
    </aside>
  );
}