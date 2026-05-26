// import React from "react";
// import StaffFakeQR from "../StaffFakeQR"; // ✅ Using the Staff specific QR!

// export default function DashboardView({ memberName, membershipsCount, setActive }: any) {
//   const stats = [
//     { value: 8, label: "RESIDENTS", key: "residents", gradient: "from-orange-400 to-yellow-300" },
//     { value: membershipsCount, label: "MEMBERSHIPS", key: "memberships", gradient: "from-[#067a7a] to-[#5fd3d3]" },
//     { value: 4, label: "EVENTS", key: "events", gradient: "from-orange-400 to-yellow-300" }
//   ];

//   const recentActivities = [
//     { action: "Scanned QR — Sign In", detail: "Maria Santos · General Assembly", staff: "Brgy. Captain", time: "2026-05-12 08:55" },
//     { action: "Created Event", detail: "Senior Citizens Health Check", staff: "Brgy. Captain", time: "2026-05-06 11:02" },
//     { action: "Sent Notification", detail: "General Assembly Reminder", staff: "Kagawad Lina", time: "2026-05-05 16:20" },
//     { action: "Generated QR", detail: "SK Youth Council — 2 members", staff: "Brgy. Captain", time: "2026-05-05 10:11" },
//     { action: "Added Resident", detail: "Liza Domingo (R-007)", staff: "Kagawad Lina", time: "2026-05-04 09:32" }
//   ];

//   return (
//     <div className="space-y-6">
//       <div className="rounded-[30px] bg-gradient-to-r from-[#067a7a] via-[#3ec5c5] to-orange-300 p-5 text-white shadow-lg">
//         <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/80">STAFF CONSOLE</p>
//         <h1 className="mt-2 text-4xl font-black">Welcome back, {memberName}! 👋</h1>
//       </div>

//       <div className="grid gap-4 md:grid-cols-3 mt-4">
//         {stats.map((item, idx) => (
//           <button
//             key={idx}
//             onClick={() => setActive(item.key)}
//             className={`w-full rounded-[30px] bg-gradient-to-r ${item.gradient} p-5 text-left text-white transition-all duration-300 hover:scale-[1.02] hover:shadow-sm`}
//           >
//             <h2 className="text-5xl font-black">{item.value}</h2>
//             <p className="mt-2 text-sm font-semibold uppercase tracking-wide">{item.label}</p>
//           </button>
//         ))}
//       </div>

//       <div className="grid gap-4 lg:grid-cols-2 mt-4">
//         <div className="rounded-[30px] border border-[#ddd5ca] bg-white p-5 hover:shadow-2xl transition-shadow duration-300">
//           <h2 className="text-2xl font-black text-[#005f63]">System QR Code</h2>
//           <p className="text-[15px] mt-1 text-gray-600">Residents scan this code to open the membership portal on their phone.</p>
//           <div className="mt-5 flex items-start gap-4">
//             <div className="shrink-0">
//               <StaffFakeQR seed="BARangay-E-MEMBERSHIP-001" large />
//             </div>
//             <div className="flex-1">
//               <p className="font-medium text-[#005f63]">Barangay e-Membership</p>
//               <p className="text-sm text-gray-600 mt-1">Posted at the Barangay Hall lobby</p>
//               <button className="mt-3 bg-orange-500 text-white px-4 py-2 rounded-[30px] text-sm font-medium hover:bg-orange-600 transition">
//                 Download printable QR
//               </button>
//             </div>
//           </div>
//         </div>

//         <div className="rounded-[30px] border border-[#ddd5ca] bg-white p-5 hover:shadow-2xl transition-shadow duration-300">
//           <h2 className="text-2xl font-black text-[#005f63]">Recent Activity</h2>
//           <div className="mt-5 space-y-4 relative max-h-[260px] overflow-y-auto pr-2 smooth-scroll">
//             <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-teal-500/40"></div>
//             {recentActivities.map((act, i) => (
//               <div key={i} className="relative pl-6">
//                 <span className="absolute left-[4px] top-2 w-2 h-2 rounded-full bg-orange-400"></span>
//                 <p className="font-semibold text-[#005f63]">{act.action}</p>
//                 <p className="text-[11px] text-gray-600">{act.detail}</p>
//                 <p className="text-[11px] text-gray-500">Staff: {act.staff} · {act.time}</p>
//               </div>
//             ))}
//           </div>
//         </div>
//       </div>
//     </div>
//   );
// }
import React, { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";

interface DashboardViewProps {
  setActive: (route: string) => void;
  notifications?: any[];
  upcomingEvents?: any[];
  pastEventsCount?: number;
}

export default function DashboardView({ setActive, upcomingEvents = [], pastEventsCount = 0 }: DashboardViewProps) {
  const [stats, setStats] = useState({
    residents: 0,
    memberships: 0,
    events: 0
  });
  const [memberName, setMemberName] = useState("");
  const [loading, setLoading] = useState(true);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [appUrl, setAppUrl] = useState("");
  const [recentActivities, setRecentActivities] = useState([
    { action: "Scanned QR — Sign In", detail: "Maria Santos · General Assembly", staff: "Brgy. Captain", time: "2026-05-12 08:55" },
    { action: "Created Event", detail: "Senior Citizens Health Check", staff: "Brgy. Captain", time: "2026-05-06 11:02" },
    { action: "Sent Notification", detail: "General Assembly Reminder", staff: "Kagawad Lina", time: "2026-05-05 16:20" },
    { action: "Generated QR", detail: "SK Youth Council — 2 members", staff: "Brgy. Captain", time: "2026-05-05 10:11" },
    { action: "Added Resident", detail: "Liza Domingo (R-007)", staff: "Kagawad Lina", time: "2026-05-04 09:32" }
  ]);

  useEffect(() => {
    const url = `${window.location.protocol}//${window.location.host}`;
    setAppUrl(url);
  }, []);

  const fetchCurrentUser = async () => {
    try {
      const response = await fetch('/me', {
        headers: {
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        credentials: 'include'
      });
      
      if (!response.ok) throw new Error('Failed to fetch user');
      
      const user = await response.json();
      
      let formattedName = "Staff";
      if (user.first_name && user.last_name) {
        formattedName = `${user.first_name} ${user.last_name}`;
      } else if (user.first_name) {
        formattedName = user.first_name;
      } else if (user.name) {
        formattedName = user.name;
      }
      
      setMemberName(formattedName);
      
    } catch (error) {
      console.error('Error fetching current user:', error);
      setMemberName("Staff");
    }
  };

  const fetchAllStats = async () => {
    try {
      const residentsResponse = await fetch('/users?per_page=1', {
        headers: { 'Accept': 'application/json' },
        credentials: 'include'
      });
      
      const membershipsResponse = await fetch('/api/memberships', {
        headers: { 'Accept': 'application/json' },
        credentials: 'include'
      });
      
      const [residentsResult, membershipsResult] = await Promise.all([
        residentsResponse.json(),
        membershipsResponse.json()
      ]);
      
      const totalResidents = residentsResult.total || residentsResult.data?.length || 0;
      
      let totalMemberships = 0;
      if (Array.isArray(membershipsResult)) {
        totalMemberships = membershipsResult.length;
      } else if (membershipsResult.data && Array.isArray(membershipsResult.data)) {
        totalMemberships = membershipsResult.data.length;
      }
      
      setStats({
        residents: totalResidents,
        memberships: totalMemberships,
        events: (upcomingEvents?.length || 0) + (pastEventsCount || 0)
      });
      
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  useEffect(() => {
    const loadDashboard = async () => {
      if (isInitialLoad) {
        setLoading(true);
      }
      
      try {
        await Promise.all([
          fetchCurrentUser(),
          fetchAllStats()
        ]);
      } catch (error) {
        console.error('Error loading dashboard:', error);
      } finally {
        setLoading(false);
        setIsInitialLoad(false);
      }
    };
    
    loadDashboard();
  }, [upcomingEvents, pastEventsCount]);

  const downloadQRCode = () => {
    const canvas = document.getElementById('system-qr-code') as HTMLCanvasElement;
    if (canvas) {
      const pngUrl = canvas
        .toDataURL('image/png')
        .replace('image/png', 'image/octet-stream');
      const downloadLink = document.createElement('a');
      downloadLink.href = pngUrl;
      downloadLink.download = 'barangay-system-qr.png';
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
    }
  };

  // ✅ Only 3 stat cards now
  const statsCards = [
    { 
      value: stats.residents, 
      label: "RESIDENTS", 
      gradient: "from-orange-400 to-yellow-300", 
      route: "residents",
      description: "Total registered residents"
    },
    { 
      value: stats.memberships, 
      label: "MEMBERSHIPS", 
      gradient: "from-[#067a7a] to-[#5fd3d3]", 
      route: "memberships",
      description: "Active membership types"
    },
    { 
      value: stats.events, 
      label: "EVENTS", 
      gradient: "from-orange-400 to-yellow-300", 
      route: "events",
      description: "Total events"
    }
  ];

  if (loading && isInitialLoad) {
    return (
      <div className="flex justify-center items-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div className="rounded-[30px] bg-gradient-to-r from-[#067a7a] via-[#3ec5c5] to-orange-300 p-5 text-white shadow-lg">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/80">
          STAFF CONSOLE
        </p>
        <h1 className="mt-2 text-4xl font-black">Welcome back, {memberName}! 👋</h1>
        <p className="mt-2 text-base text-white/90">
          Manage residents, memberships, events, attendance and notifications.
        </p>
      </div>

      {/* Stats Cards - 3 columns grid */}
      <div className="grid gap-4 md:grid-cols-3">
        {statsCards.map((item, idx) => (
          <button
            key={idx}
            onClick={() => setActive(item.route)}
            className={`group w-full rounded-[30px] bg-gradient-to-r ${item.gradient} p-5 text-left text-white transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_18px_45px_rgba(0,0,0,0.22)]`}
          >
            <h2 className="text-4xl lg:text-5xl font-black">{item.value}</h2>
            <p className="mt-2 text-sm font-semibold uppercase tracking-wide">
              {item.label}
            </p>
            <p className="mt-1 text-xs text-white/70 opacity-0 group-hover:opacity-100 transition-opacity">
              {item.description}
            </p>
          </button>
        ))}
      </div>

      {/* 2 Column Section: System QR + Recent Activity */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Left: System QR Code */}
        <div className="rounded-[30px] border border-[#ddd5ca] bg-white p-5 hover:shadow-2xl transition-shadow duration-300">
          <h2 className="text-2xl font-black text-[#005f63]">System QR Code</h2>
          <p className="text-[15px] mt-1 text-gray-600">
            Residents scan this code to open the membership portal on their phone.
          </p>

          <div className="mt-5 flex flex-col sm:flex-row items-start gap-4">
            <div className="shrink-0 flex justify-center w-full sm:w-auto">
              <QRCodeSVG
                id="system-qr-code"
                value={appUrl}
                size={160}
                bgColor="#ffffff"
                fgColor="#005f63"
                level="H"
                includeMargin={true}
              />
            </div>
            <div className="flex-1">
              <p className="font-medium text-[#005f63]">Barangay e-Membership</p>
              <p className="text-sm text-gray-600 mt-1">Posted at the Barangay Hall lobby</p>
              <p className="text-sm text-gray-600 mt-1">
                Print and post in public places — residents scan to access.
              </p>
              <button 
                onClick={downloadQRCode}
                className="mt-3 bg-orange-500 text-white px-4 py-2 rounded-[30px] text-sm font-medium hover:bg-orange-600 transition"
              >
                Download QR Code
              </button>
            </div>
          </div>
        </div>

        {/* Right: Recent Activity */}
        <div className="rounded-[30px] border border-[#ddd5ca] bg-white p-5 hover:shadow-2xl transition-shadow duration-300">
          <h2 className="text-2xl font-black text-[#005f63]">Recent Activity</h2>
          <p className="text-[15px] mt-1 text-gray-600">Latest staff actions in the system.</p>

          <div className="mt-5 space-y-4 relative max-h-[260px] overflow-y-auto pr-2">
            <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-teal-500/40"></div>

            {recentActivities.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No recent activity to display
              </div>
            ) : (
              recentActivities.map((act, i) => (
                <div key={i} className="relative pl-6">
                  <span className="absolute left-[4px] top-2 w-2 h-2 rounded-full bg-orange-400"></span>
                  <p className="font-semibold text-[#005f63]">{act.action}</p>
                  <p className="text-[11px] text-gray-600">{act.detail}</p>
                  <p className="text-[11px] text-gray-500">
                    Staff: {act.staff} · {act.time}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}