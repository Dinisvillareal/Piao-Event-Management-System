// import { useState, useMemo } from "react";
// import SearchBar from "../../../Components/UI/SearchBar";
// import FakeQR from "../../../Components/UI/FakeQR";

// // Define the shape of a single membership
// interface Membership {
//   id: string;
//   name: string;
//   description: string;
//   codeId: string;
//   note: string;
//   verified: boolean;
// }

// interface QRCodesViewProps {
//   memberships: Membership[];
//   highlightText: (text: string, query: string) => React.ReactNode;
// }

// export default function QRCodesView({ memberships, highlightText }: QRCodesViewProps) {
//   // ✅ We moved all the QR-specific state inside the component that actually uses it!
//   const [searchQuery, setSearchQuery] = useState("");
//   const [currentPage, setCurrentPage] = useState(1);
//   const itemsPerPage = 6;

//   const filteredMemberships = useMemo(() => {
//     if (!searchQuery.trim()) return memberships;
//     return memberships.filter((m) =>
//       m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
//       m.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
//       m.codeId.toLowerCase().includes(searchQuery.toLowerCase()) ||
//       m.note.toLowerCase().includes(searchQuery.toLowerCase())
//     );
//   }, [memberships, searchQuery]);

//   const totalPages = useMemo(() => {
//     return Math.ceil(filteredMemberships.length / itemsPerPage);
//   }, [filteredMemberships, itemsPerPage]);

//   const paginatedMemberships = useMemo(() => {
//     const startIndex = (currentPage - 1) * itemsPerPage;
//     return filteredMemberships.slice(startIndex, startIndex + itemsPerPage);
//   }, [filteredMemberships, currentPage, itemsPerPage]);

//   // Reset to page 1 when typing in the search bar
//   useMemo(() => {
//     setCurrentPage(1);
//   }, [searchQuery]);

//   return (
//     <div className="space-y-6">
//       {/* FIXED HEADER & SEARCH AREA */}
//       <div className="sticky top-0 z-10 bg-[#fcfcf9] pt-2 pb-4 px-1 shadow-b-sm">
//         <div className="w-[1200px]">
//           <h1 className="text-4xl font-black text-[#005f63]">My QR Codes</h1>
//           <p className="text-sm text-[#667777] mt-1">Each membership has its own unique QR. Show the right one at the right event.</p>

//           <div className="mt-4 w-[1580px]">
//             <SearchBar
//               value={searchQuery}
//               onChange={setSearchQuery}
//               placeholder="Search your memberships by name, description, or ID…"
//             />
//           </div>
//           <p className="mt-2 text-xs text-gray-500">
//             {filteredMemberships.length} of {memberships.length} membership(s) match.
//           </p>
//         </div>
//       </div>

//       {/* SCROLLABLE QR CARDS AREA */}
//       <div className="pl-1">
//         {filteredMemberships.length === 0 ? (
//           <p className="text-gray-500 italic">No memberships match your search.</p>
//         ) : (
//           <>
//             <div className="flex flex-row flex-wrap gap-5">
//               {paginatedMemberships.map((m) => (
//                 <div
//                   key={m.id}
//                   className="rounded-3xl border border-gray-200 bg-white overflow-hidden w-[780px] shrink-0 hover:shadow-2xl transition-shadow duration-300"
//                 >
//                   <div className="h-1.5 bg-gradient-to-r from-[#ff7a28] via-[#ff9a3c] to-[#ffd33d]"></div>
//                   <div className="p-5">
//                     <div className="flex items-start justify-between">
//                       <div>
//                         <h2 className="text-base font-bold text-[#006666]">
//                           {highlightText(m.name, searchQuery)}
//                         </h2>
//                         <p className="text-sm text-[#667777] mt-1">
//                           {highlightText(m.description, searchQuery)}
//                         </p>
//                       </div>
//                       <span className="bg-[#2cb7b7] text-white text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
//                         <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
//                           <path d="M20 6L9 17l-5-5" />
//                         </svg>
//                         Verified
//                       </span>
//                     </div>

//                     <div className="mt-6 flex items-center gap-4">
//                       <div className="border border-gray-200 rounded-xl p-3 bg-white shadow-md">
//                         <FakeQR seed={m.codeId} />
//                       </div>
//                       <div>
//                         <p className="text-sm font-medium text-[#0f5050]">Code ID</p>
//                         <p className="text-xs text-[#365f5f] mt-1">
//                           {highlightText(m.codeId, searchQuery)}
//                         </p>
//                         <p className="text-xs text-[#1e2c2c] mt-2">
//                           {highlightText(m.note, searchQuery)}
//                         </p>
//                       </div>
//                     </div>
//                   </div>
//                 </div>
//               ))}
//             </div>

//             {/* PAGINATION */}
//             {totalPages > 1 && (
//               <div className="flex items-center justify-center gap-2 mt-8">
//                 <button
//                   onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
//                   disabled={currentPage === 1}
//                   className="px-2.5 py-1.5 rounded-lg border bg-white text-[#005f63] text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-orange-50 transition"
//                 >
//                   Previous
//                 </button>

//                 {Array.from({ length: totalPages }, (_, i) => (
//                   <button
//                     key={i + 1}
//                     onClick={() => setCurrentPage(i + 1)}
//                     className={`w-7 h-7 rounded-lg text-xs font-semibold transition ${
//                       currentPage === i + 1
//                         ? "bg-[#005f63] text-white shadow-sm"
//                         : "bg-white border text-[#005f63] hover:bg-orange-50"
//                     }`}
//                   >
//                     {i + 1}
//                   </button>
//                 ))}

//                 <button
//                   onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
//                   disabled={currentPage === totalPages}
//                   className="px-2.5 py-1.5 rounded-lg border bg-white text-[#005f63] text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-orange-50 transition"
//                 >
//                   Next
//                 </button>

//                 <span className="text-xs text-gray-600 ml-1.5">
//                   Page {currentPage} of {totalPages}
//                 </span>
//               </div>
//             )}
//           </>
//         )}
//       </div>
//     </div>
//   );
// }
import { useState, useEffect } from "react";
import SearchBar from "../../../Components/UI/SearchBar";
import { QRCodeCanvas } from "qrcode.react";

export default function QRCodesView({ highlightText }: any) {
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [userData, setUserData] = useState<any>(null);
  const [allMemberships, setAllMemberships] = useState<any[]>([]);
  const [displayMemberships, setDisplayMemberships] = useState<any[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const itemsPerPage = 6;

  const storedUser = sessionStorage.getItem('user');
  const user = storedUser ? JSON.parse(storedUser) : null;
  const userId = user?.id;
  const user_code = user?.user_code;

  // Fetch ALL memberships for QR code (no search, no pagination)
  useEffect(() => {
    if (!userId) return;
    
    fetch(`/membership-residents/${userId}/memberships?per_page=100`, {
      credentials: 'include',
      headers: { 'Accept': 'application/json' }
    })
    .then(res => res.json())
    .then(data => {
      setAllMemberships(data.memberships || []);
      setUserData({
        user_code: data.user_code,
        first_name: data.first_name,
        last_name: data.last_name
      });
    })
    .catch(err => console.error('Failed to fetch all memberships:', err));
  }, [userId]);

  // Fetch filtered/paginated memberships for DISPLAY
  useEffect(() => {
    if (!userId) return;
    
    let url = `/membership-residents/${userId}/memberships?page=${currentPage}&per_page=${itemsPerPage}`;
    if (searchQuery) {
      url += `&search=${encodeURIComponent(searchQuery)}`;
    }
    
    fetch(url, {
      credentials: 'include',
      headers: { 'Accept': 'application/json' }
    })
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then(data => {
      setDisplayMemberships(data.memberships || []);
      setTotalPages(data.last_page || 1);
      setTotalItems(data.total || 0);
      setError(null);
    })
    .catch(err => {
      console.error('Failed to fetch:', err);
      setError(err.message);
    })
    .finally(() => setLoading(false));
  }, [userId, currentPage, searchQuery]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto"></div>
        <p className="ml-3 text-gray-600">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-5">
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-600">
          <p>Error: {error}</p>
          <button onClick={() => window.location.reload()} className="mt-2 text-sm underline">Retry</button>
        </div>
      </div>
    );
  }

  if (allMemberships.length === 0) {
    return (
      <div className="p-5">
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-yellow-600">
          <p>No memberships found for this user.</p>
        </div>
      </div>
    );
  }

  // ✅ UPDATED: QR code uses MEMBERSHIP NAMES (not IDs)
  const qrData = JSON.stringify({
    user_code: user_code,
    memberships: allMemberships.map((m: any) => m.name)
  });

  return (
    <div className="space-y-6">
      {/* STICKY HEADER - Contains both QR Code section AND My Memberships title */}
      <div className="sticky top-0 z-10 bg-[#fcfcf9] pt-2 pb-4 px-1 shadow-b-sm">
        <div>
          <h1 className="text-4xl font-black text-[#005f63]">My QR Code</h1>
          <p className="text-sm text-[#667777] mt-1">
            Scan this QR code at events. One QR code for all your memberships.
          </p>

          <div className="mt-6">
            <div className="bg-white p-4 rounded-2xl shadow-lg border border-gray-200 inline-block">
              <QRCodeCanvas 
                value={qrData} 
                size={200} 
                level="H" 
                bgColor="#ffffff" 
                fgColor="#095a5a" 
              />
            </div>
          </div>

          {/* SEARCH BAR */}
          <div className="mt-8">
            <SearchBar 
              value={searchQuery} 
              onChange={setSearchQuery} 
              placeholder="Search your memberships by name…" 
            />
          </div>
          <p className="mt-2 text-xs text-gray-500">
            {displayMemberships.length} of {totalItems} membership(s) found.
          </p>
        </div>

        {/* MY MEMBERSHIPS TITLE - Inside sticky header so it won't hide */}
        <div className="mt-6">
          <h1 className="text-4xl font-black text-[#005f63]">My Memberships</h1>
        </div>
      </div>

      {/* MEMBERSHIPS LIST - Scrollable content */}
      <div className="pl-1">
        {displayMemberships.length === 0 ? (
          <p className="text-gray-500 italic">No memberships match your search.</p>
        ) : (
          <>
            <div className="flex flex-row flex-wrap gap-5">
              {displayMemberships.map((m: any) => (
                <div
                  key={m.id}
                  className="rounded-3xl border border-gray-200 bg-white overflow-hidden w-[780px] shrink-0 hover:shadow-xl transition-shadow duration-300"
                >
                  <div className="h-1.5 bg-gradient-to-r from-[#ff7a28] via-[#ff9a3c] to-[#ffd33d]"></div>
                  <div className="p-5">
                    <div>
                      <h2 className="text-base font-bold text-[#006666]">
                        {highlightText(m.name, searchQuery)}
                      </h2>
                      {m.description && (
                        <p className="text-sm text-[#667777] mt-1">
                          {highlightText(m.description, searchQuery)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* PAGINATION */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-8">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1 rounded-lg border bg-white text-[#005f63] text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-orange-50 transition"
                >
                  Previous
                </button>
                <span className="text-sm text-gray-600">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1 rounded-lg border bg-white text-[#005f63] text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-orange-50 transition"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}