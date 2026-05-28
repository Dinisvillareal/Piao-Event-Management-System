// import {
//   Bell,
//   CalendarDays,
//   ClipboardCheck,
//   LayoutDashboard,
//   LogOut,
//   QrCode,
//   Settings,
// } from "lucide-react";

// interface SidebarProps {
//   active: string;
//   setActive: (page: string) => void;
// }

// export default function Sidebar({ active, setActive }: SidebarProps) {
//   const navItems = [
//     { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
//     { key: "qr", label: "My QR Codes", icon: QrCode },
//     { key: "attendance", label: "Attendance", icon: ClipboardCheck },
//     { key: "events", label: "Events", icon: CalendarDays },
//     { key: "notify", label: "Notifications", icon: Bell },
//     { key: "settings", label: "Settings", icon: Settings },
//   ];

//   // LOGOUT FUNCTION
//   const handleLogout = async () => {
//     try {
//       const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
      
//       await fetch('/logout', {
//         method: 'POST',
//         credentials: 'include',
//         headers: {
//           'Content-Type': 'application/json',
//           'Accept': 'application/json',
//           'X-Requested-With': 'XMLHttpRequest',
//           ...(csrfToken && { 'X-CSRF-TOKEN': csrfToken })
//         }
//       });

//       // Clear all stored user data
//       localStorage.clear();
//       sessionStorage.clear();
      
//       // Redirect to login page
//       window.location.href = '/';
      
//     } catch (err) {
//       console.error('Logout error:', err);
//       // Force clear local data even if API fails
//       localStorage.clear();
//       sessionStorage.clear();
//       window.location.href = '/';
//     }
//   };

//   return (
//     <aside className="hidden w-[250px] flex-col border-r border-[#ddd5ca] bg-[#fcfcf9] md:flex h-screen sticky top-0">
//       <div className="border-b border-[#ddd5ca] px-5 py-5 shrink-0">
//         <div className="flex items-center gap-3">
//           <div className="flex h-11 w-11 items-center justify-center rounded-full bg-orange-400 font-black text-black">
//             B
//           </div>
//           <div>
//             <p className="text-[11px] uppercase tracking-[0.2em] text-[#005f63]/70">
//               Barangay Piao
//             </p>
//             <h1 className="text-xl font-black text-[#005f63]">e-Membership</h1>
//           </div>
//         </div>
//       </div>

//       <div className="flex-1 px-2 py-5 overflow-y-auto smooth-scroll">
//         <p className="mb-3 px-3 text-sm font-semibold text-[#005f63]/70">
//           Member Area
//         </p>
//         <div className="space-y-1">
//           {navItems.map((item) => {
//             const Icon = item.icon;
//             return (
//               <button
//                 key={item.key}
//                 onClick={() => setActive(item.key)}
//                 className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-all duration-200 ${
//                   active === item.key
//                     ? "bg-gradient-to-r from-orange-300 via-orange-200 to-yellow-200 text-[#005f63] shadow-[0_8px_25px_rgba(150,146,60,0.35)] font-bold scale-[1.02]"
//                     : "text-[#005f63] hover:bg-orange-100 hover:shadow-md"
//                 }`}
//               >
//                 <Icon className="h-5 w-5" />
//                 <span>{item.label}</span>
//               </button>
//             );
//           })}
//         </div>
//       </div>

//       <div className="border-t border-[#ddd5ca] p-2 shrink-0">
//         <button 
//           onClick={handleLogout}
//           className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-[#005f63] transition hover:bg-orange-100"
//         >
//           <LogOut className="h-5 w-5" />
//           <span className="font-medium">Sign out</span>
//         </button>
//       </div>
//     </aside>
//   );
// }
import {
  Bell,
  CalendarDays,
  ClipboardCheck,
  LayoutDashboard,
  LogOut,
  QrCode,
  Settings,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useState } from "react";

interface SidebarProps {
  active: string;
  setActive: (page: string) => void;
}

export default function Sidebar({ active, setActive }: SidebarProps) {
  const [isOpen, setIsOpen] = useState(true); // controls show/hide

  const navItems = [
    { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { key: "qr", label: "My QR Code", icon: QrCode },
    { key: "attendance", label: "Attendance", icon: ClipboardCheck },
    { key: "events", label: "Events", icon: CalendarDays },
    { key: "notify", label: "Notifications", icon: Bell },
    { key: "settings", label: "Settings", icon: Settings },
  ];

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
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      // Clear ALL storage (safe because user is logging out)
      localStorage.clear();
      sessionStorage.clear();
      
      // Redirect to login page
      window.location.href = '/';
    }
  };

  return (
    <>
      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed top-4 z-50 bg-[#006666] text-white p-1.5 rounded-full shadow-md transition-all duration-300 ${
          isOpen ? "left-[235px]" : "left-[55px]"
        }`}
      >
        {isOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
      </button>

      <aside
        className={`flex-col border-r border-[#006666] bg-[#006666] h-screen sticky top-0 transition-all duration-300 flex overflow-hidden ${
          isOpen ? "w-[250px]" : "w-[70px]"
        }`}
      >
        {/* Sidebar Header */}
        <div className="border-b border-[#007777] px-3 py-5 shrink-0 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-r from-orange-400 to-yellow-300 font-black text-[#005f63] shrink-0 shadow-md">
            B
          </div>
          <div
            className={`transition-all duration-300 overflow-hidden ${
              isOpen ? "opacity-100 w-auto visible" : "opacity-0 w-0 invisible"
            }`}
          >
            <p className="text-[11px] uppercase tracking-[0.2em] text-white/70 font-medium">
              BARANGAY PIAO
            </p>
            <h1 className="text-[15px] font-black text-white whitespace-nowrap leading-tight">
              e-Membership
            </h1>
          </div>
        </div>

        {/* Navigation Menu */}
        <div className="flex-1 px-2 py-5 overflow-y-auto smooth-scroll">
          <p
            className={`mb-3 px-3 text-sm font-semibold text-white/60 transition-opacity duration-300 ${
              isOpen ? "opacity-100" : "opacity-0"
            }`}
          >
            Member Area
          </p>
          <div className="space-y-1.5">
            {/* ✅ FIX: changed NAV → navItems */}
            {navItems.map((item) => {
              const isActive = active === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => setActive(item.key)}
                  className={`flex items-center w-full rounded-[20px] py-3 transition-all duration-200 group ${
                    isOpen ? "px-4 justify-start gap-3" : "justify-center px-0"
                  } ${
                    isActive
                      ? "bg-[#008888] text-white shadow-md font-medium border-l-4 border-[#ffc107]"
                      : "text-white/80 hover:bg-[#007777] hover:text-white hover:translate-x-1"
                  }`}
                >
                  <item.icon className="h-5 w-5 shrink-0" />
                  <span
                    className={`transition-all duration-300 whitespace-nowrap ${
                      isOpen ? "opacity-100 w-auto" : "opacity-0 w-0 overflow-hidden"
                    }`}
                  >
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Logout */}
        <div className="border-t border-[#007777] p-2 shrink-0">
          <button
            onClick={handleLogout}
            className={`flex items-center w-full rounded-[20px] py-3 text-white/80 transition hover:bg-[#007777] hover:text-white ${
              isOpen ? "px-4 justify-start gap-3" : "justify-center px-0"
            }`}
          >
            <LogOut className="h-5 w-5 shrink-0" />
            <span
              className={`transition-all duration-300 whitespace-nowrap ${
                isOpen ? "opacity-100 w-auto" : "opacity-0 w-0 overflow-hidden"
              }`}
            >
              Sign out
            </span>
          </button>
        </div>
      </aside>
    </>
  );
}
