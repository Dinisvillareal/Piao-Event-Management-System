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
import { useState, useEffect, useRef, useCallback } from "react";
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
  const [qrKey, setQrKey] = useState(0);
  const itemsPerPage = 4;
  const qrCodeRef = useRef<HTMLDivElement>(null);
  const [qrSize, setQrSize] = useState(280);

  const storedUser = sessionStorage.getItem('user') || localStorage.getItem('user');
  const user = storedUser ? JSON.parse(storedUser) : null;
  const userId = user?.id;
  const user_code = user?.user_code;
  const fullName = `${user?.first_name || ''} ${user?.last_name || ''}`.trim();

  // Handle responsive QR size with better breakpoints
  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      let newSize;
      
      if (width < 640) {
        // Mobile: smaller QR code
        newSize = Math.min(width - 80, 240);
      } else if (width < 1024) {
        // Tablet: medium QR code
        newSize = Math.min(width - 100, 260);
      } else {
        // Desktop: full size
        newSize = 280;
      }
      
      setQrSize(Math.max(newSize, 180)); // Minimum size of 180px
    };
    
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Fetch ALL memberships for QR code
  useEffect(() => {
    if (!userId) return;
    
    fetch(`/membership-residents/${userId}/memberships?per_page=100`, {
      credentials: 'include',
      headers: { 'Accept': 'application/json' }
    })
    .then(res => {
      if (res.status === 403) {
        throw new Error('You can only view your own memberships. Please log in again.');
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then(data => {
      setAllMemberships(data.memberships || []);
      setUserData({
        user_code: data.user_code,
        first_name: data.first_name,
        last_name: data.last_name
      });
      setQrKey(prev => prev + 1);
    })
    .catch(err => {
      console.error('Failed to fetch all memberships:', err);
      setError(err.message);
    });
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
      if (res.status === 403) {
        throw new Error('You can only view your own memberships. Please log in again.');
      }
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

  const downloadQRCode = useCallback(async () => {
    if (!qrCodeRef.current) {
      alert("QR code container not found");
      return;
    }
    
    await new Promise(resolve => setTimeout(resolve, 200));
    
    const canvas = qrCodeRef.current.querySelector('canvas');
    if (!canvas) {
      alert("Canvas not found. Please try again.");
      return;
    }
    
    if (canvas.width === 0 || canvas.height === 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    try {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvas.width;
      tempCanvas.height = canvas.height;
      const tempCtx = tempCanvas.getContext('2d');
      
      if (!tempCtx) {
        alert("Could not create canvas context");
        return;
      }
      
      tempCtx.drawImage(canvas, 0, 0);
      
      const link = document.createElement('a');
      link.download = `qr-code-${user_code || 'membership'}.png`;
      link.href = tempCanvas.toDataURL('image/png', 1.0);
      link.click();
    } catch (err) {
      console.error('Download failed:', err);
      alert('Failed to download QR code. Please try again.');
    }
  }, [user_code]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-5">
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-600">
          <p className="font-semibold">Access Denied</p>
          <p className="text-sm mt-1">{error}</p>
          <div className="flex gap-3 mt-3 flex-wrap">
            <button 
              onClick={() => window.location.reload()} 
              className="text-sm underline hover:text-red-800"
            >
              Retry
            </button>
            <button 
              onClick={async () => {
                await fetch('/logout', { method: 'POST', credentials: 'include' });
                localStorage.clear();
                sessionStorage.clear();
                window.location.href = '/';
              }}
              className="text-sm underline hover:text-red-800"
            >
              Logout
            </button>
          </div>
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

  const qrData = JSON.stringify({
    user_id: userId,
    user_code: user_code,
    name: fullName,
    memberships: allMemberships.map((m: any) => m.name)
  });

  return (
    <div className="bg-[#fcfcf9]">
      {/* STICKY HEADER - matching EventsView style */}
      <div className="sticky top-0 z-40 bg-[#fcfcf9] px-4 sm:px-6 pt-2 pb-4 border-b border-[#ece7de]">
        <div className="max-w-[1580px] mx-auto">
          <h1 className="text-3xl sm:text-4xl font-black text-[#005f63]">
            My QR Code and Memberships
          </h1>
          <p className="mt-1 text-sm text-[#667777]">
            Your personal QR code and membership cards in one place.
          </p>

          {/* Search Bar */}
          <div className="mt-4">
            <div className="w-full">
              <SearchBar 
                value={searchQuery} 
                onChange={setSearchQuery} 
                placeholder="Search your memberships by name…" 
              />
            </div>
            <p className="mt-2 text-xs text-gray-500">
              {displayMemberships.length} of {totalItems} membership(s) found
            </p>
          </div>
        </div>
      </div>

      {/* SCROLLABLE CONTENT - with responsive padding */}
      <div className="px-4 sm:px-6 mt-5">
        <div className="max-w-[1580px] mx-auto">
          <div className="flex flex-col lg:flex-row gap-6">
            
            {/* LEFT COLUMN - QR CODE SECTION (full width on mobile, 1/3 on desktop) */}
            <div className="w-full lg:w-1/3">
              <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-6 shadow-lg lg:sticky lg:top-24 overflow-hidden">
                <p className="text-center mb-4 text-gray-500 text-sm">
                  Scan this at events for attendance
                </p>
                <div className="text-center">
                  {/* Fixed container with overflow handling */}
                  <div className="flex justify-center overflow-x-auto">
                    <div ref={qrCodeRef} className="flex justify-center items-center">
                      <div className="bg-white p-2 rounded-2xl shadow-lg border border-gray-200 inline-flex">
                        <QRCodeCanvas 
                          key={qrKey}
                          value={qrData} 
                          size={qrSize} 
                          level="H" 
                          bgColor="#ffffff" 
                          fgColor="#005f63"
                          includeMargin={true}
                        />
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-6">
                    <button
                      onClick={downloadQRCode}
                      className="bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3 px-6 rounded-full transition-colors duration-300 shadow-md w-full max-w-[280px] mx-auto block"
                    >
                      <svg 
                        className="inline-block w-5 h-5 mr-2 -mt-1" 
                        fill="none" 
                        stroke="currentColor" 
                        viewBox="0 0 24 24" 
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path 
                          strokeLinecap="round" 
                          strokeLinejoin="round" 
                          strokeWidth={2} 
                          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" 
                        />
                      </svg>
                      Download QR Code
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN - MEMBERSHIP CARDS (2/3 on desktop, 1 column on mobile) */}
            <div className="w-full lg:w-2/3">
              {displayMemberships.length === 0 ? (
                <div className="flex items-center justify-center h-64">
                  <p className="text-gray-500 italic">No memberships match your search.</p>
                </div>
              ) : (
                <>
                  {/* Mobile: 1 column, Desktop: 2 columns */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {displayMemberships.map((m: any) => (
                      <div
                        key={m.id}
                        className="rounded-3xl border border-gray-200 bg-white overflow-hidden hover:shadow-2xl transition-shadow duration-300 w-full"
                      >
                        <div className="h-1.5 bg-gradient-to-r from-[#ff7a28] via-[#ff9a3c] to-[#ffd33d]"></div>
                        <div className="p-5">
                          <div>
                            <h2 className="text-xl font-bold text-[#006666] break-words">
                              {highlightText(m.name, searchQuery)}
                            </h2>
                            {m.description && (
                              <p className="text-sm text-[#667777] mt-2 break-words">
                                {highlightText(m.description, searchQuery)}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Pagination - responsive spacing */}
                  {totalPages > 1 && (
                    <div className="mt-8 flex items-center justify-center gap-2 flex-wrap">
                      <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="h-8 w-8 rounded-lg border border-gray-300 bg-white text-[#005f63] text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#005f63] hover:text-white hover:border-[#005f63] transition-all"
                      >
                        ←
                      </button>
                      <div className="flex gap-2 flex-wrap justify-center">
                        {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                          let pageNum;
                          if (totalPages <= 5) {
                            pageNum = i + 1;
                          } else if (currentPage <= 3) {
                            pageNum = i + 1;
                          } else if (currentPage >= totalPages - 2) {
                            pageNum = totalPages - 4 + i;
                          } else {
                            pageNum = currentPage - 2 + i;
                          }
                          
                          return (
                            <button
                              key={pageNum}
                              onClick={() => setCurrentPage(pageNum)}
                              className={`h-8 w-8 rounded-lg text-sm font-semibold transition-all ${
                                currentPage === pageNum
                                  ? "bg-[#005f63] text-white shadow-sm"
                                  : "border border-gray-300 bg-white text-[#005f63] hover:bg-[#005f63] hover:text-white hover:border-[#005f63]"
                              }`}
                            >
                              {pageNum}
                            </button>
                          );
                        })}
                        {totalPages > 5 && currentPage < totalPages - 2 && (
                          <>
                            <span className="text-gray-400">...</span>
                            <button
                              onClick={() => setCurrentPage(totalPages)}
                              className="h-8 w-8 rounded-lg border border-gray-300 bg-white text-[#005f63] text-sm font-semibold hover:bg-[#005f63] hover:text-white hover:border-[#005f63] transition-all"
                            >
                              {totalPages}
                            </button>
                          </>
                        )}
                      </div>
                      <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="h-8 w-8 rounded-lg border border-gray-300 bg-white text-[#005f63] text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#005f63] hover:text-white hover:border-[#005f63] transition-all"
                      >
                        →
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}