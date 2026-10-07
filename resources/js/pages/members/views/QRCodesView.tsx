// LAST WORKING IMPLEMENTATION
// import { useState, useEffect, useRef, useCallback, useMemo } from "react";
// import SearchBar from "../../../components/ui/SearchBar";
// import ConfirmDialog from "../../../components/ui/ConfirmDialog";
// import StatusModal from "../../../components/ui/StatusModal";
// import { QRCodeCanvas } from "qrcode.react";
// import { QrCode, Download } from "lucide-react";
// import { useLanguage } from "../../../i18n/LanguageContext";
// import Skeleton from "../../../components/ui/Skeleton";

// export default function QRCodesView({ highlightText, userId, userCode, fullName }: any) {
//   const { t } = useLanguage();
//   const [searchQuery, setSearchQuery] = useState("");
//   const [currentPage, setCurrentPage] = useState(1);
//   // Brief skeleton flash on every page switch, same as Activity Logs --
//   // this list paginates client-side so there's nothing to actually wait
//   // on, but the flash keeps page switches feeling consistent app-wide.
//   const [pageSwitching, setPageSwitching] = useState(false);
//   const pageSwitchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
//   const goToPage = (updater: number | ((p: number) => number)) => {
//     setCurrentPage(updater as any);
//     setPageSwitching(true);
//     if (pageSwitchTimer.current) clearTimeout(pageSwitchTimer.current);
//     pageSwitchTimer.current = setTimeout(() => setPageSwitching(false), 350);
//   };
//   useEffect(() => () => { if (pageSwitchTimer.current) clearTimeout(pageSwitchTimer.current); }, []);
//   const [allMemberships, setAllMemberships] = useState<any[]>([]);
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState<string | null>(null);
//   const itemsPerPage = 6;
//   const qrCodeRef = useRef<HTMLDivElement>(null);
//   const [qrSize, setQrSize] = useState(280);
//   const [downloadError, setDownloadError] = useState<string | null>(null);
//   const [downloadSuccess, setDownloadSuccess] = useState(false);
//   const [showDownloadConfirm, setShowDownloadConfirm] = useState(false);

//   // Handle responsive QR size
//   useEffect(() => {
//     const handleResize = () => {
//       const width = window.innerWidth;
//       let newSize;

//       if (width < 640) {
//         newSize = Math.min(width - 80, 240);
//       } else if (width < 1024) {
//         newSize = Math.min(width - 100, 260);
//       } else {
//         newSize = 280;
//       }

//       setQrSize(Math.max(newSize, 180));
//     };

//     handleResize();
//     window.addEventListener('resize', handleResize);
//     return () => window.removeEventListener('resize', handleResize);
//   }, []);

//   // Fetch user's memberships only once
//   useEffect(() => {
//     if (!userId) return;

//     const fetchMemberships = async () => {
//       setLoading(true);
//       setError(null);

//       try {
//         // Get user's membership IDs
//         const membershipRes = await fetch(`/membership-residents/${userId}?per_page=100`, {
//           credentials: 'include',
//           headers: {
//             'Accept': 'application/json',
//             'X-Requested-With': 'XMLHttpRequest'
//           }
//         });

//         if (!membershipRes.ok) throw new Error(`HTTP ${membershipRes.status}`);
//         const membershipData = await membershipRes.json();
//         const membershipIds = (membershipData.memberships || []).map((m: any) => m.id);

//         // If no memberships, set empty array but continue (QR will still show)
//         if (membershipIds.length === 0) {
//           setAllMemberships([]);
//           setLoading(false);
//           return;
//         }

//         // Fetch all memberships
//         const allMembershipsRes = await fetch(`/api/memberships`, {
//           credentials: 'include',
//           headers: {
//             'Accept': 'application/json',
//             'X-Requested-With': 'XMLHttpRequest'
//           }
//         });

//         if (!allMembershipsRes.ok) throw new Error(`HTTP ${allMembershipsRes.status}`);
//         const allMembershipsData = await allMembershipsRes.json();
//         const allMembershipsList = Array.isArray(allMembershipsData) ? allMembershipsData : (allMembershipsData.data || []);

//         // Filter to user's memberships
//         const userMemberships = allMembershipsList.filter((m: any) =>
//           membershipIds.includes(m.id)
//         );

//         setAllMemberships(userMemberships);

//       } catch (err) {
//         console.error('Failed to fetch memberships:', err);
//         setError(err instanceof Error ? err.message : 'Failed to load memberships');
//       } finally {
//         setLoading(false);
//       }
//     };

//     fetchMemberships();
//   }, [userId]);

//   // Filter memberships based on search query (local filtering, no API call)
//   const filteredMemberships = useMemo(() => {
//     if (!searchQuery.trim()) return allMemberships;
//     const q = searchQuery.toLowerCase();
//     return allMemberships.filter(m =>
//       m.name?.toLowerCase().includes(q)
//     );
//   }, [allMemberships, searchQuery]);

//   // Paginate the filtered results
//   const totalItems = filteredMemberships.length;
//   const totalPages = Math.ceil(totalItems / itemsPerPage);
//   const displayMemberships = useMemo(() => {
//     const startIndex = (currentPage - 1) * itemsPerPage;
//     return filteredMemberships.slice(startIndex, startIndex + itemsPerPage);
//   }, [filteredMemberships, currentPage, itemsPerPage]);

//   // Reset to page 1 when search query changes
//   useEffect(() => {
//     setCurrentPage(1);
//   }, [searchQuery]);

//   const performDownloadQRCode = useCallback(() => {
//     setShowDownloadConfirm(false);

//     if (!qrCodeRef.current) {
//       setDownloadError("QR code container not found");
//       return;
//     }

//     const canvas = qrCodeRef.current.querySelector('canvas');
//     if (!canvas) {
//       setDownloadError("Canvas not found. Please try again.");
//       return;
//     }

//     try {
//       const link = document.createElement('a');
//       link.download = `qr-code-${userCode || 'membership'}.png`;
//       link.href = canvas.toDataURL('image/png', 1.0);
//       link.click();
//       setDownloadSuccess(true);
//     } catch (err) {
//       console.error('Download failed:', err);
//       setDownloadError('Failed to download QR code. Please try again.');
//     }
//   }, [userCode]);

//   // // ✅ FIXED: QR code generates even WITHOUT memberships
//   // const qrData = useMemo(() => {
//   //   // Only require basic user info - memberships are optional
//   //   if (!userId || !userCode || !fullName) return null;

//   //   return JSON.stringify({
//   //     user_id: userId,
//   //     user_code: userCode,
//   //     name: fullName,
//   //     memberships: allMemberships.map((m: any) => m.name),
//   //     timestamp: Date.now()
//   //   });
//   // }, [userId, userCode, fullName, allMemberships]);


//   /*NEW DATA STRUCTURE*/
//   const qrData = useMemo(() => {
//     // Keep: user_id, user_code, name
//     // Removed: memberships, timestamp
//     if (!userId || !userCode || !fullName) return null;

//     return JSON.stringify({
//       user_id: userId,
//       user_code: userCode,
//       name: fullName
//     });
//   }, [userId, userCode, fullName]);

//   // Loading state
//   if (loading) {
//     return (
//       <div className="-m-3 sm:-m-5 min-h-[calc(100vh-73px)] bg-[#0A0E1A] p-4 sm:p-8 space-y-6">
//         <div className="space-y-2">
//           <Skeleton className="h-8 w-64" />
//           <Skeleton className="h-4 w-48" />
//         </div>
//         <Skeleton className="h-64 rounded-2xl" />
//         <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
//           <Skeleton className="h-28 rounded-2xl" />
//           <Skeleton className="h-28 rounded-2xl" />
//         </div>
//       </div>
//     );
//   }

//   // Error state
//   if (error) {
//     return (
//       <div className="-m-3 sm:-m-5 min-h-[calc(100vh-73px)] bg-[#0A0E1A] p-5">
//         <div className="bg-red-500/10 border border-red-500/25 rounded-xl p-4 text-red-400">
//           <p className="font-semibold">{t("errorLabel")}</p>
//           <p className="text-sm mt-1">{error}</p>
//           <button
//             onClick={() => window.location.reload()}
//             className="text-sm underline hover:text-red-300 mt-2"
//           >
//             {t("retry")}
//           </button>
//         </div>
//       </div>
//     );
//   }

//   return (
//     <div className="-m-3 sm:-m-5 min-h-[calc(100vh-73px)] bg-[#0A0E1A] h-[calc(100vh-73px)] p-4 sm:p-8 flex flex-col">
//       {/* Fixed Header - Never scrolls */}
//       <div className="flex-shrink-0 px-2 sm:px-3 pt-2 z-10">
//         <div className="max-w-6xl pb-4 border-b border-white/10">
//           <h1 className="text-3xl sm:text-4xl font-black text-white">
//             {t("myQrAndMemberships")}
//           </h1>
//           <p className="mt-1 text-sm text-white/50">
//             {t("qrPageSubtitle")}
//           </p>

//           {allMemberships.length > 0 && (
//             <div className="mt-4">
//               <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
//                 <SearchBar
//                   value={searchQuery}
//                   onChange={setSearchQuery}
//                   placeholder={t("searchMembershipsPlaceholder")}
//                   dark
//                 />
//               </div>
//               <p className="mt-2 text-xs text-white/40">
//                 {totalItems} {t("membershipsFoundCount")} — {t("showingLabel")} {itemsPerPage} {t("perPage")}
//               </p>
//             </div>
//           )}

//           {/* Pagination - ← 1 → */}
//           <div className="flex justify-end mt-4">
//             {totalPages > 1 && (
//               <div className="flex items-center gap-2">
//                 <button
//                   onClick={() => goToPage(p => Math.max(1, p - 1))}
//                   disabled={currentPage === 1}
//                   className="h-8 w-8 rounded-full border border-white/10 bg-white/[0.04] text-white/70 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/[0.08] transition-all active:scale-95"
//                 >
//                   ←
//                 </button>

//                 <span className="h-8 w-8 rounded-full bg-gold-400 text-[#08130F] shadow-sm flex items-center justify-center text-sm font-bold">
//                   {currentPage}
//                 </span>

//                 <button
//                   onClick={() => goToPage(p => Math.min(totalPages, p + 1))}
//                   disabled={currentPage === totalPages}
//                   className="h-8 w-8 rounded-full border border-white/10 bg-white/[0.04] text-white/70 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/[0.08] transition-all active:scale-95"
//                 >
//                   →
//                 </button>
//               </div>
//             )}
//           </div>
//         </div>
//       </div>

//       {/* Scrollable Content Area - Only memberships scroll */}
//       <div className="flex-1 overflow-y-auto px-2 sm:px-3 mt-5 pb-4">
//         <div className="max-w-6xl">
//           <div className="flex flex-col lg:flex-row gap-4">

//             {/* LEFT COLUMN - QR CODE SECTION */}
//             <div className="w-full lg:w-[360px] lg:shrink-0">
//               <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 sm:p-6 shadow-lg lg:sticky lg:top-24 overflow-hidden">
//                 <p className="text-center mb-4 text-white/50 text-sm">
//                   {t("scanAtEvents")}
//                 </p>
//                 <div className="text-center">
//                   <div className="flex justify-center overflow-x-auto">
//                     <div ref={qrCodeRef} className="flex justify-center items-center">
//                       {/* QR itself stays on a plain white card -- scanners
//                           read a light-background/dark-module code far more
//                           reliably, so this one surface is intentionally not
//                           dark-themed. */}
//                       <div className="bg-white p-2 rounded-2xl shadow-sm border border-white/10 inline-flex">
//                         {qrData ? (
//                           <QRCodeCanvas
//                             value={qrData}
//                             size={qrSize}
//                             level="H"
//                             bgColor="#ffffff"
//                             fgColor="#052e16"
//                             includeMargin={true}
//                           />
//                         ) : (
//                           <div className="text-center py-8 px-4">
//                             <QrCode className="mx-auto mb-3 text-gray-300" size={48} />
//                             <p className="text-gray-500 text-sm">{t("unableToGenerateQr")}</p>
//                             <p className="text-gray-400 text-xs mt-1">{t("pleaseLoggedIn")}</p>
//                           </div>
//                         )}
//                       </div>
//                     </div>
//                   </div>

//                   <div className="mt-6">
//                     <button
//                       onClick={() => setShowDownloadConfirm(true)}
//                       disabled={!qrData}
//                       className={`font-semibold py-3 px-6 rounded-full transition-colors duration-300 shadow-md w-full max-w-[280px] mx-auto block ${
//                         qrData
//                           ? 'bg-gold-400 hover:bg-gold-300 text-[#08130F] cursor-pointer'
//                           : 'bg-white/10 text-white/30 cursor-not-allowed'
//                       }`}
//                     >
//                       <svg
//                         className="inline-block w-5 h-5 mr-2 -mt-1"
//                         fill="none"
//                         stroke="currentColor"
//                         viewBox="0 0 24 24"
//                         xmlns="http://www.w3.org/2000/svg"
//                       >
//                         <path
//                           strokeLinecap="round"
//                           strokeLinejoin="round"
//                           strokeWidth={2}
//                           d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
//                         />
//                       </svg>
//                       {t("downloadQrCode")}
//                     </button>
//                   </div>
//                 </div>
//               </div>
//             </div>

//             {/* RIGHT COLUMN - MEMBERSHIP CARDS */}
//             <div className="w-full lg:flex-1 lg:min-w-0">
//               {pageSwitching ? (
//                 <div className="grid gap-4 justify-start grid-cols-1 sm:[grid-template-columns:repeat(auto-fit,minmax(260px,340px))]">
//                   {Array.from({ length: 2 }).map((_, i) => (
//                     <Skeleton key={i} className="h-28 rounded-3xl" />
//                   ))}
//                 </div>
//               ) : allMemberships.length === 0 ? (
//                 <div className="flex flex-col items-center justify-center h-96 bg-white/[0.04] rounded-xl border border-white/10">
//                   <svg className="w-24 h-24 text-white/15 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
//                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
//                   </svg>
//                   <h3 className="text-xl font-semibold text-white/70 mb-2">{t("noMembershipsYet")}</h3>
//                   <p className="text-white/40 text-center max-w-md">
//                     {t("noMembershipsBody")}
//                   </p>
//                   <div className="mt-6 text-sm text-white/50 bg-white/[0.05] px-4 py-2 rounded-lg">
//                     {t("needAssistance")}
//                   </div>
//                 </div>
//               ) : displayMemberships.length === 0 && searchQuery ? (
//                 <div className="flex flex-col items-center justify-center h-64 bg-white/[0.04] rounded-xl border border-white/10">
//                   <svg className="w-16 h-16 text-white/15 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
//                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
//                   </svg>
//                   <p className="text-white/50 text-lg">{t("noMatchingMemberships")}</p>
//                   <p className="text-white/30 text-sm mt-1">{t("tryDifferentSearch")}</p>
//                 </div>
//               ) : (
//                 <div className="grid gap-4 justify-start grid-cols-1 sm:[grid-template-columns:repeat(auto-fit,minmax(260px,340px))]">
//                   {displayMemberships.map((m: any) => (
//                     <div
//                       key={m.id}
//                       className="rounded-3xl border border-white/10 bg-white/[0.04] overflow-hidden hover:bg-white/[0.06] transition-all duration-300 w-full"
//                     >
//                       <div className="h-1.5 bg-gradient-to-r from-gold-400 via-[#E8B84A] to-[#4FBEB0]"></div>
//                       <div className="p-8">
//                         <div>
//                           <h2 className="text-base font-bold text-white break-words">
//                             {highlightText(m.name, searchQuery)}
//                           </h2>
//                           {m.description && (
//                             <p className="text-sm text-white/50 mt-2 break-words">
//                               {highlightText(m.description, searchQuery)}
//                             </p>
//                           )}
//                         </div>
//                       </div>
//                     </div>
//                   ))}
//                 </div>
//               )}
//             </div>
//           </div>
//         </div>
//       </div>

//       <ConfirmDialog
//         open={showDownloadConfirm}
//         icon={<Download size={40} />}
//         title={t("confirmDownloadQrTitle")}
//         body={t("confirmDownloadQrBody")}
//         cancelLabel={t("cancelLabel")}
//         confirmLabel={t("yesDownload")}
//         onCancel={() => setShowDownloadConfirm(false)}
//         onConfirm={performDownloadQRCode}
//         tone="brand"
//       />

//       <StatusModal open={!!downloadError} type="error" title={t("errorTitle")} message={downloadError || ""} okLabel={t("okLabel")} onClose={() => setDownloadError(null)} />
//       <StatusModal open={downloadSuccess} type="success" title={t("successTitle")} message={t("qrCodeDownloadedSuccess")} okLabel={t("okLabel")} onClose={() => setDownloadSuccess(false)} />
//     </div>
//   );
// }

//LAST WORKING IMPLEMENTATION
// import { useState, useEffect, useRef, useCallback, useMemo } from "react";
// import SearchBar from "../../../components/ui/SearchBar";
// import ConfirmDialog from "../../../components/ui/ConfirmDialog";
// import StatusModal from "../../../components/ui/StatusModal";
// import { QRCodeCanvas } from "qrcode.react";
// import { QrCode, Download } from "lucide-react";
// import { useLanguage } from "../../../i18n/LanguageContext";
// import Skeleton from "../../../components/ui/Skeleton";
// import { tc } from "../../../lib/contentTranslations";

// export default function QRCodesView({ highlightText, userId, userCode, fullName }: any) {
//   const { t, language } = useLanguage();
//   const [searchQuery, setSearchQuery] = useState("");
//   const [currentPage, setCurrentPage] = useState(1);
//   const [pageSwitching, setPageSwitching] = useState(false);
//   const pageSwitchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
//   const goToPage = (updater: number | ((p: number) => number)) => {
//     setCurrentPage(updater as any);
//     setPageSwitching(true);
//     if (pageSwitchTimer.current) clearTimeout(pageSwitchTimer.current);
//     pageSwitchTimer.current = setTimeout(() => setPageSwitching(false), 350);
//   };
//   useEffect(() => () => { if (pageSwitchTimer.current) clearTimeout(pageSwitchTimer.current); }, []);
//   const [allMemberships, setAllMemberships] = useState<any[]>([]);
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState<string | null>(null);
//   // Fixed 6 per page = 2 columns × 3 rows on desktop.
//   const itemsPerPage = 2;
//   // Ref points at the QR-only wrapper (the canvas source), NOT the whole
//   // ID card -- the download uses this canvas to render a purpose-built
//   // ID-card layout on an offscreen <canvas>, not a screenshot of the DOM.
//   const qrCodeRef = useRef<HTMLDivElement>(null);
//   const [qrSize, setQrSize] = useState(180);
//   const [downloadError, setDownloadError] = useState<string | null>(null);
//   const [downloadSuccess, setDownloadSuccess] = useState(false);
//   const [showDownloadConfirm, setShowDownloadConfirm] = useState(false);

//   useEffect(() => {
//     const handleResize = () => {
//       const width = window.innerWidth;
//       let newSize;
//       if (width < 640) newSize = 120;
//       else if (width < 1024) newSize = 150;
//       else newSize = 180;
//       setQrSize(newSize);
//     };
//     handleResize();
//     window.addEventListener('resize', handleResize);
//     return () => window.removeEventListener('resize', handleResize);
//   }, []);

//   useEffect(() => {
//     if (!userId) return;
//     const fetchMemberships = async () => {
//       setLoading(true);
//       setError(null);
//       try {
//         const membershipRes = await fetch(`/membership-residents/${userId}?per_page=100`, {
//           credentials: 'include', headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }
//         });
//         if (!membershipRes.ok) throw new Error(`HTTP ${membershipRes.status}`);
//         const membershipData = await membershipRes.json();
//         const membershipIds = (membershipData.memberships || []).map((m: any) => m.id);
//         if (membershipIds.length === 0) { setAllMemberships([]); setLoading(false); return; }

//         const allMembershipsRes = await fetch(`/api/memberships`, {
//           credentials: 'include', headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }
//         });
//         if (!allMembershipsRes.ok) throw new Error(`HTTP ${allMembershipsRes.status}`);
//         const allMembershipsData = await allMembershipsRes.json();
//         const allMembershipsList = Array.isArray(allMembershipsData) ? allMembershipsData : (allMembershipsData.data || []);
//         setAllMemberships(allMembershipsList.filter((m: any) => membershipIds.includes(m.id)));
//       } catch (err) {
//         console.error('Failed to fetch memberships:', err);
//         setError(err instanceof Error ? err.message : 'Failed to load memberships');
//       } finally { setLoading(false); }
//     };
//     fetchMemberships();
//   }, [userId]);

//   const filteredMemberships = useMemo(() => {
//     if (!searchQuery.trim()) return allMemberships;
//     const q = searchQuery.toLowerCase();
//     return allMemberships.filter(m => m.name?.toLowerCase().includes(q));
//   }, [allMemberships, searchQuery]);

//   const totalItems = filteredMemberships.length;
//   const totalPages = Math.ceil(totalItems / itemsPerPage);
//   const displayMemberships = useMemo(() => {
//     const startIndex = (currentPage - 1) * itemsPerPage;
//     return filteredMemberships.slice(startIndex, startIndex + itemsPerPage);
//   }, [filteredMemberships, currentPage, itemsPerPage]);

//   useEffect(() => { setCurrentPage(1); }, [searchQuery]);

//   // ─────────────────────────────────────────────────────────────
//   // Download the QR as a proper, purpose-built ID card PNG --
//   // NOT a screenshot of the DOM. Renders a fixed 720×300 card on
//   // an offscreen canvas: QR on the left in a white rounded box,
//   // resident name + user code + hint on the right, dark navy
//   // background matching the app, thin rounded border around it.
//   // ─────────────────────────────────────────────────────────────
//   const performDownloadQRCode = useCallback(() => {
//     setShowDownloadConfirm(false);

//     // Grab the source QR canvas from the visible page (the QRCodeCanvas
//     // component renders an actual <canvas> element under the hood).
//     const qrCanvasEl = qrCodeRef.current?.querySelector("canvas") as HTMLCanvasElement | null;
//     if (!qrCanvasEl) {
//       setDownloadError("QR code not ready. Please try again.");
//       return;
//     }

//     const CARD_W = 720;
//     const CARD_H = 300;
//     const PADDING = 28;
//     const BORDER_R = 24;

//     const out = document.createElement("canvas");
//     out.width = CARD_W;
//     out.height = CARD_H;
//     const ctx = out.getContext("2d");
//     if (!ctx) {
//       setDownloadError("Could not create the image.");
//       return;
//     }

//     // ── Background ───────────────────────────────────────────────
//     ctx.fillStyle = "#0A0E1A";
//     ctx.fillRect(0, 0, CARD_W, CARD_H);

//     // ── Rounded border ───────────────────────────────────────────
//     ctx.strokeStyle = "rgba(255,255,255,0.18)";
//     ctx.lineWidth = 2;
//     ctx.beginPath();
//     ctx.moveTo(BORDER_R, 1);
//     ctx.lineTo(CARD_W - BORDER_R, 1);
//     ctx.quadraticCurveTo(CARD_W - 1, 1, CARD_W - 1, BORDER_R);
//     ctx.lineTo(CARD_W - 1, CARD_H - BORDER_R);
//     ctx.quadraticCurveTo(CARD_W - 1, CARD_H - 1, CARD_W - BORDER_R, CARD_H - 1);
//     ctx.lineTo(BORDER_R, CARD_H - 1);
//     ctx.quadraticCurveTo(1, CARD_H - 1, 1, CARD_H - BORDER_R);
//     ctx.lineTo(1, BORDER_R);
//     ctx.quadraticCurveTo(1, 1, BORDER_R, 1);
//     ctx.closePath();
//     ctx.stroke();

//     // ── QR inside a white rounded box, left side ─────────────────
//     const QR_BOX = 220;
//     const QR_INNER_PAD = 12;
//     const qrBoxX = PADDING;
//     const qrBoxY = (CARD_H - QR_BOX) / 2;

//     const boxR = 18;
//     ctx.fillStyle = "#FFFFFF";
//     ctx.beginPath();
//     ctx.moveTo(qrBoxX + boxR, qrBoxY);
//     ctx.lineTo(qrBoxX + QR_BOX - boxR, qrBoxY);
//     ctx.quadraticCurveTo(qrBoxX + QR_BOX, qrBoxY, qrBoxX + QR_BOX, qrBoxY + boxR);
//     ctx.lineTo(qrBoxX + QR_BOX, qrBoxY + QR_BOX - boxR);
//     ctx.quadraticCurveTo(qrBoxX + QR_BOX, qrBoxY + QR_BOX, qrBoxX + QR_BOX - boxR, qrBoxY + QR_BOX);
//     ctx.lineTo(qrBoxX + boxR, qrBoxY + QR_BOX);
//     ctx.quadraticCurveTo(qrBoxX, qrBoxY + QR_BOX, qrBoxX, qrBoxY + QR_BOX - boxR);
//     ctx.lineTo(qrBoxX, qrBoxY + boxR);
//     ctx.quadraticCurveTo(qrBoxX, qrBoxY, qrBoxX + boxR, qrBoxY);
//     ctx.closePath();
//     ctx.fill();

//     // Draw the source QR canvas inside the white box, preserving aspect
//     ctx.drawImage(
//       qrCanvasEl,
//       qrBoxX + QR_INNER_PAD,
//       qrBoxY + QR_INNER_PAD,
//       QR_BOX - QR_INNER_PAD * 2,
//       QR_BOX - QR_INNER_PAD * 2
//     );

//     // ── Text block on the right ──────────────────────────────────
//     const textX = qrBoxX + QR_BOX + 32;
//     const textMaxW = CARD_W - textX - PADDING;

//     // Small uppercase label
//     ctx.fillStyle = "rgba(255,255,255,0.45)";
//     ctx.font = "700 12px sans-serif";
//     ctx.textBaseline = "top";
//     ctx.fillText("MEMBER", textX, 62);

//     // Full name (with simple truncation if it's very long)
//     ctx.fillStyle = "#FFFFFF";
//     ctx.font = "800 30px sans-serif";
//     let displayName = fullName || "—";
//     while (ctx.measureText(displayName).width > textMaxW && displayName.length > 3) {
//       displayName = displayName.slice(0, -2) + "…";
//     }
//     ctx.fillText(displayName, textX, 84);

//     // User code
//     ctx.fillStyle = "rgba(255,255,255,0.6)";
//     ctx.font = "600 18px monospace";
//     ctx.fillText(userCode || "—", textX, 130);

//     // Small accent divider
//     ctx.strokeStyle = "rgba(232,184,74,0.6)"; // gold
//     ctx.lineWidth = 2;
//     ctx.beginPath();
//     ctx.moveTo(textX, 168);
//     ctx.lineTo(textX + 44, 168);
//     ctx.stroke();

//     // Footer hint (wrapped if needed)
//     ctx.fillStyle = "rgba(255,255,255,0.4)";
//     ctx.font = "500 13px sans-serif";
//     const hintLine1 = "Scan this QR code at barangay";
//     const hintLine2 = "events to check in.";
//     ctx.fillText(hintLine1, textX, 186);
//     ctx.fillText(hintLine2, textX, 206);

//     // Small "Piao Connect" attribution bottom-right
//     ctx.fillStyle = "rgba(125,216,203,0.7)"; // teal
//     ctx.font = "700 11px sans-serif";
//     const brandText = "PIAO CONNECT";
//     const brandW = ctx.measureText(brandText).width;
//     ctx.fillText(brandText, CARD_W - PADDING - brandW, CARD_H - 34);

//     // ── Save ─────────────────────────────────────────────────────
//     try {
//       const link = document.createElement("a");
//       link.download = `qr-id-${userCode || "member"}.png`;
//       link.href = out.toDataURL("image/png", 1.0);
//       link.click();
//       setDownloadSuccess(true);
//     } catch (err) {
//       console.error("Download failed:", err);
//       setDownloadError("Failed to download QR ID. Please try again.");
//     }
//   }, [userCode, fullName]);

//   const qrData = useMemo(() => {
//     if (!userId || !userCode || !fullName) return null;
//     return JSON.stringify({ user_id: userId, user_code: userCode, name: fullName });
//   }, [userId, userCode, fullName]);

//   if (loading) {
//     return (
//       <div className="h-full bg-[#0A0E1A] p-4 sm:p-8 space-y-6">
//         <div className="space-y-2">
//           <Skeleton className="h-8 w-64" />
//           <Skeleton className="h-4 w-48" />
//         </div>
//         <Skeleton className="h-64 rounded-2xl" />
//         <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
//           <Skeleton className="h-28 rounded-2xl" />
//           <Skeleton className="h-28 rounded-2xl" />
//         </div>
//       </div>
//     );
//   }

//   if (error) {
//     return (
//       <div className="h-full bg-[#0A0E1A] p-5">
//         <div className="bg-red-500/10 border border-red-500/25 rounded-xl p-4 text-red-400">
//           <p className="font-semibold">{t("errorLabel")}</p>
//           <p className="text-sm mt-1">{error}</p>
//           <button onClick={() => window.location.reload()} className="text-sm underline hover:text-red-300 mt-2">{t("retry")}</button>
//         </div>
//       </div>
//     );
//   }

//   return (
//     <div className="h-full bg-[#0A0E1A] p-4 sm:p-8 flex flex-col">
//       {/* Fixed Header -- title on the left, compact QR ID badge on the
//           right, then search + pagination underneath. The QR badge is
//           inline (not a big hero block) so the whole thing reads like a
//           compact ID strip, not a splash screen. */}
//       <div className="flex-shrink-0 pt-2 pb-4">
//         <div className="flex flex-col lg:flex-row gap-5 lg:items-start">

//           {/* LEFT: title + search + pagination */}
//           <div className="flex-1 min-w-0">
//             <h1 className="text-3xl sm:text-4xl font-black text-white">{t("myQrAndMemberships")}</h1>
//             <p className="mt-1 text-sm text-white/50">{t("qrPageSubtitle")}</p>

//             {allMemberships.length > 0 && (
//               <div className="mt-4">
//                 <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
//                   <SearchBar
//                     value={searchQuery}
//                     onChange={setSearchQuery}
//                     placeholder={t("searchMembershipsPlaceholder")}
//                     dark
//                   />
//                 </div>
//                 <p className="mt-2 text-xs text-white/40">
//                   {totalItems} {t("membershipsFoundCount")} — {t("showingLabel")} {itemsPerPage} {t("perPage")}
//                 </p>
//               </div>
//             )}

//             {/* PAGINATION — stays pinned in the fixed header */}
//             <div className="flex justify-end mt-4">
//               {totalPages > 1 && (
//                 <div className="flex items-center gap-2">
//                   <button onClick={() => goToPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
//                     className="h-8 w-8 rounded-full border border-white/10 bg-white/[0.04] text-white/70 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/[0.08] transition-all active:scale-95">←</button>
//                   <span className="h-8 w-8 rounded-full bg-gold-400 text-[#08130F] shadow-sm flex items-center justify-center text-sm font-bold">{currentPage}</span>
//                   <button onClick={() => goToPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
//                     className="h-8 w-8 rounded-full border border-white/10 bg-white/[0.04] text-white/70 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/[0.08] transition-all active:scale-95">→</button>
//                 </div>
//               )}
//             </div>
//           </div>

//           {/* RIGHT: compact QR ID badge card. The `qrCodeRef` wraps ONLY
//               the QR box, so `performDownloadQRCode` can pull the source
//               <canvas> out of the page to compose the printed ID card. */}
//           <div className="w-full lg:w-auto shrink-0">
//             <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 flex items-center gap-4">
//               <div ref={qrCodeRef} className="shrink-0">
//                 <div className="bg-white p-2 rounded-xl shadow-sm border border-white/10 inline-flex">
//                   {qrData ? (
//                     <QRCodeCanvas
//                       value={qrData}
//                       size={qrSize}
//                       level="H"
//                       bgColor="#ffffff"
//                       fgColor="#052e16"
//                       includeMargin={false}
//                     />
//                   ) : (
//                     <div className="flex flex-col items-center justify-center" style={{ width: qrSize, height: qrSize }}>
//                       <QrCode className="text-gray-300" size={32} />
//                       <p className="text-gray-400 text-[10px] mt-1 text-center px-1">{t("unableToGenerateQr")}</p>
//                     </div>
//                   )}
//                 </div>
//               </div>
//               <div className="min-w-0">
//                 <p className="text-[11px] font-semibold uppercase tracking-wide text-white/40">
//                   {t("memberRole")}
//                 </p>
//                 <p className="text-base font-bold text-white truncate">{fullName || "—"}</p>
//                 <p className="text-xs text-white/50 font-mono">{userCode || "—"}</p>
//                 <button
//                   onClick={() => setShowDownloadConfirm(true)}
//                   disabled={!qrData}
//                   className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
//                     qrData
//                       ? 'bg-gold-400 hover:bg-gold-300 text-[#08130F] cursor-pointer'
//                       : 'bg-white/10 text-white/30 cursor-not-allowed'
//                   }`}
//                 >
//                   <Download className="h-3.5 w-3.5" />
//                   {t("downloadQrCode")}
//                 </button>
//               </div>
//             </div>
//           </div>
//         </div>
//       </div>

//       {/* Scrollable body -- uniform 2 × 3 grid of membership cards. */}
//       <div className="flex-1 overflow-y-auto min-h-0 mt-2 pb-4">
//         {pageSwitching ? (
//           <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
//             {Array.from({ length: 6 }).map((_, i) => (
//               <Skeleton key={i} className="h-32 rounded-3xl" />
//             ))}
//           </div>
//         ) : allMemberships.length === 0 ? (
//           <div className="flex flex-col items-center justify-center h-96 bg-white/[0.04] rounded-xl border border-white/10">
//             <svg className="w-24 h-24 text-white/15 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
//               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
//             </svg>
//             <h3 className="text-xl font-semibold text-white/70 mb-2">{t("noMembershipsYet")}</h3>
//             <p className="text-white/40 text-center max-w-md">{t("noMembershipsBody")}</p>
//             <div className="mt-6 text-sm text-white/50 bg-white/[0.05] px-4 py-2 rounded-lg">{t("needAssistance")}</div>
//           </div>
//         ) : displayMemberships.length === 0 && searchQuery ? (
//           <div className="flex flex-col items-center justify-center h-64 bg-white/[0.04] rounded-xl border border-white/10">
//             <svg className="w-16 h-16 text-white/15 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
//               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
//             </svg>
//             <p className="text-white/50 text-lg">{t("noMatchingMemberships")}</p>
//             <p className="text-white/30 text-sm mt-1">{t("tryDifferentSearch")}</p>
//           </div>
//         ) : (
//           <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
//             {displayMemberships.map((m: any) => (
//               <div
//                 key={m.id}
//                 className="rounded-2xl border border-white/10 bg-white/[0.04] overflow-hidden hover:bg-white/[0.06] transition-all duration-200 flex flex-col min-h-[128px]"
//               >
//                 <div className="h-1.5 bg-gradient-to-r from-gold-400 via-[#E8B84A] to-[#4FBEB0]" />
//                 <div className="p-5 flex-1 flex flex-col justify-center">
//                   <h2 className="text-base font-bold text-white break-words">
//                     {highlightText(tc(m.name, language as any), searchQuery)}
//                   </h2>
//                   {m.description && (
//                     <p className="text-sm text-white/50 mt-2 break-words line-clamp-2">
//                       {highlightText(tc(m.description, language as any), searchQuery)}
//                     </p>
//                   )}
//                 </div>
//               </div>
//             ))}
//           </div>
//         )}
//       </div>

//       <ConfirmDialog
//         open={showDownloadConfirm}
//         icon={<Download size={40} />}
//         title={t("confirmDownloadQrTitle")}
//         body={t("confirmDownloadQrBody")}
//         cancelLabel={t("cancelLabel")}
//         confirmLabel={t("yesDownload")}
//         onCancel={() => setShowDownloadConfirm(false)}
//         onConfirm={performDownloadQRCode}
//         tone="brand"
//       />

//       <StatusModal open={!!downloadError} type="error" title={t("errorTitle")} message={downloadError || ""} okLabel={t("okLabel")} onClose={() => setDownloadError(null)} />
//       <StatusModal open={downloadSuccess} type="success" title={t("successTitle")} message={t("qrCodeDownloadedSuccess")} okLabel={t("okLabel")} onClose={() => setDownloadSuccess(false)} />
//     </div>
//   );
// }

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import SearchBar from "../../../components/ui/SearchBar";
import ConfirmDialog from "../../../components/ui/ConfirmDialog";
import StatusModal from "../../../components/ui/StatusModal";
import { QRCodeCanvas } from "qrcode.react";
import { QrCode, Download } from "lucide-react";
import { useLanguage } from "../../../i18n/LanguageContext";
import Skeleton from "../../../components/ui/Skeleton";
import { tc } from "../../../lib/contentTranslations";

export default function QRCodesView({ highlightText, userId, userCode, fullName }: any) {
  const { t, language } = useLanguage();
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSwitching, setPageSwitching] = useState(false);
  const pageSwitchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const goToPage = (updater: number | ((p: number) => number)) => {
    setCurrentPage(updater as any);
    setPageSwitching(true);
    if (pageSwitchTimer.current) clearTimeout(pageSwitchTimer.current);
    pageSwitchTimer.current = setTimeout(() => setPageSwitching(false), 350);
  };
  useEffect(() => () => { if (pageSwitchTimer.current) clearTimeout(pageSwitchTimer.current); }, []);
  const [allMemberships, setAllMemberships] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const itemsPerPage = 6;
  const qrCodeRef = useRef<HTMLDivElement>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [showDownloadConfirm, setShowDownloadConfirm] = useState(false);

  useEffect(() => {
    if (!userId) return;
    const fetchMemberships = async () => {
      setLoading(true);
      setError(null);
      try {
        const membershipRes = await fetch(`/membership-residents/${userId}?per_page=100`, {
          credentials: 'include', headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }
        });
        if (!membershipRes.ok) throw new Error(`HTTP ${membershipRes.status}`);
        const membershipData = await membershipRes.json();
        const membershipIds = (membershipData.memberships || []).map((m: any) => m.id);
        if (membershipIds.length === 0) { setAllMemberships([]); setLoading(false); return; }

        const allMembershipsRes = await fetch(`/api/memberships`, {
          credentials: 'include', headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }
        });
        if (!allMembershipsRes.ok) throw new Error(`HTTP ${allMembershipsRes.status}`);
        const allMembershipsData = await allMembershipsRes.json();
        const allMembershipsList = Array.isArray(allMembershipsData) ? allMembershipsData : (allMembershipsData.data || []);
        setAllMemberships(allMembershipsList.filter((m: any) => membershipIds.includes(m.id)));
      } catch (err) {
        console.error('Failed to fetch memberships:', err);
        setError(err instanceof Error ? err.message : 'Failed to load memberships');
      } finally { setLoading(false); }
    };
    fetchMemberships();
  }, [userId]);

  const filteredMemberships = useMemo(() => {
    if (!searchQuery.trim()) return allMemberships;
    const q = searchQuery.toLowerCase();
    return allMemberships.filter(m => m.name?.toLowerCase().includes(q));
  }, [allMemberships, searchQuery]);

  const totalItems = filteredMemberships.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const displayMemberships = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredMemberships.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredMemberships, currentPage, itemsPerPage]);

  useEffect(() => { setCurrentPage(1); }, [searchQuery]);

  const performDownloadQRCode = useCallback(() => {
    setShowDownloadConfirm(false);

    const qrCanvasEl = qrCodeRef.current?.querySelector("canvas") as HTMLCanvasElement | null;
    if (!qrCanvasEl) {
      setDownloadError("QR code not ready. Please try again.");
      return;
    }

    const CARD_W = 720;
    const CARD_H = 300;
    const PADDING = 28;
    const BORDER_R = 24;

    const out = document.createElement("canvas");
    out.width = CARD_W;
    out.height = CARD_H;
    const ctx = out.getContext("2d");
    if (!ctx) {
      setDownloadError("Could not create the image.");
      return;
    }

    ctx.fillStyle = "#0A0E1A";
    ctx.fillRect(0, 0, CARD_W, CARD_H);

    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(BORDER_R, 1);
    ctx.lineTo(CARD_W - BORDER_R, 1);
    ctx.quadraticCurveTo(CARD_W - 1, 1, CARD_W - 1, BORDER_R);
    ctx.lineTo(CARD_W - 1, CARD_H - BORDER_R);
    ctx.quadraticCurveTo(CARD_W - 1, CARD_H - 1, CARD_W - BORDER_R, CARD_H - 1);
    ctx.lineTo(BORDER_R, CARD_H - 1);
    ctx.quadraticCurveTo(1, CARD_H - 1, 1, CARD_H - BORDER_R);
    ctx.lineTo(1, BORDER_R);
    ctx.quadraticCurveTo(1, 1, BORDER_R, 1);
    ctx.closePath();
    ctx.stroke();

    const QR_BOX = 220;
    const QR_INNER_PAD = 12;
    const qrBoxX = PADDING;
    const qrBoxY = (CARD_H - QR_BOX) / 2;

    const boxR = 18;
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    ctx.moveTo(qrBoxX + boxR, qrBoxY);
    ctx.lineTo(qrBoxX + QR_BOX - boxR, qrBoxY);
    ctx.quadraticCurveTo(qrBoxX + QR_BOX, qrBoxY, qrBoxX + QR_BOX, qrBoxY + boxR);
    ctx.lineTo(qrBoxX + QR_BOX, qrBoxY + QR_BOX - boxR);
    ctx.quadraticCurveTo(qrBoxX + QR_BOX, qrBoxY + QR_BOX, qrBoxX + QR_BOX - boxR, qrBoxY + QR_BOX);
    ctx.lineTo(qrBoxX + boxR, qrBoxY + QR_BOX);
    ctx.quadraticCurveTo(qrBoxX, qrBoxY + QR_BOX, qrBoxX, qrBoxY + QR_BOX - boxR);
    ctx.lineTo(qrBoxX, qrBoxY + boxR);
    ctx.quadraticCurveTo(qrBoxX, qrBoxY, qrBoxX + boxR, qrBoxY);
    ctx.closePath();
    ctx.fill();

    ctx.drawImage(
      qrCanvasEl,
      qrBoxX + QR_INNER_PAD,
      qrBoxY + QR_INNER_PAD,
      QR_BOX - QR_INNER_PAD * 2,
      QR_BOX - QR_INNER_PAD * 2
    );

    const textX = qrBoxX + QR_BOX + 32;
    const textMaxW = CARD_W - textX - PADDING;

    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = "700 12px sans-serif";
    ctx.textBaseline = "top";
    ctx.fillText("MEMBER", textX, 62);

    ctx.fillStyle = "#FFFFFF";
    ctx.font = "800 30px sans-serif";
    let displayName = fullName || "—";
    while (ctx.measureText(displayName).width > textMaxW && displayName.length > 3) {
      displayName = displayName.slice(0, -2) + "…";
    }
    ctx.fillText(displayName, textX, 84);

    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = "600 18px monospace";
    ctx.fillText(userCode || "—", textX, 130);

    ctx.strokeStyle = "rgba(232,184,74,0.6)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(textX, 168);
    ctx.lineTo(textX + 44, 168);
    ctx.stroke();

    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.font = "500 13px sans-serif";
    ctx.fillText("Scan this QR code at barangay", textX, 186);
    ctx.fillText("events to check in.", textX, 206);

    ctx.fillStyle = "rgba(125,216,203,0.7)";
    ctx.font = "700 11px sans-serif";
    const brandText = "PIAO CONNECT";
    const brandW = ctx.measureText(brandText).width;
    ctx.fillText(brandText, CARD_W - PADDING - brandW, CARD_H - 34);

    try {
      const link = document.createElement("a");
      link.download = `qr-id-${userCode || "member"}.png`;
      link.href = out.toDataURL("image/png", 1.0);
      link.click();
      setDownloadSuccess(true);
    } catch (err) {
      console.error("Download failed:", err);
      setDownloadError("Failed to download QR ID. Please try again.");
    }
  }, [userCode, fullName]);

  const qrData = useMemo(() => {
    if (!userId || !userCode || !fullName) return null;
    return JSON.stringify({ user_id: userId, user_code: userCode, name: fullName });
  }, [userId, userCode, fullName]);

  if (loading) {
    return (
      <div className="h-full bg-[#0A0E1A] p-4 sm:p-8">
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="w-full lg:w-[280px] lg:shrink-0">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 flex flex-col items-center">
              <Skeleton className="h-3 w-20 self-start" />
              <Skeleton className="h-5 w-32 self-start mt-1" />
              <Skeleton className="h-3 w-24 self-start mt-0.5" />
              <Skeleton className="h-[216px] w-[216px] rounded-xl mt-5" />
              <Skeleton className="h-3 w-36 mt-3" />
              <Skeleton className="h-10 w-full rounded-full mt-4" />
            </div>
          </div>
          <div className="flex-1 min-w-0 space-y-4">
            <Skeleton className="h-11 w-full rounded-xl" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-32 rounded-2xl" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full bg-[#0A0E1A] p-5">
        <div className="bg-red-500/10 border border-red-500/25 rounded-xl p-4 text-red-400">
          <p className="font-semibold">{t("errorLabel")}</p>
          <p className="text-sm mt-1">{error}</p>
          <button onClick={() => window.location.reload()} className="text-sm underline hover:text-red-300 mt-2">{t("retry")}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-[#0A0E1A] p-4 sm:p-8 flex flex-col"> 
    {/* <div className="h-[calc(100vh-73px)] bg-[#0A0E1A] p-4 sm:p-8 flex flex-col overflow-hidden"> */}
      {/* Fixed header: title + subtitle */}
      <div className="flex-shrink-0 pt-2 pb-4">
        <h1 className="text-3xl sm:text-4xl font-black text-white">{t("myQrAndMemberships")}</h1>
        <p className="mt-1 text-sm text-white/50">{t("qrPageSubtitle")}</p>
      </div>

      {/* Body: side-by-side layout on lg+, stacked on mobile.
          - LEFT (lg): QR ID panel, sticky so it stays visible while cards scroll.
          - RIGHT: search + pagination + memberships grid.
          `scrollbarGutter: stable` reserves the scrollbar's width whether
          or not it's visible, so switching pages can't shift the columns. */}
      <div className="flex-1 overflow-y-auto min-h-0" style={{ scrollbarGutter: "stable" }}>
        <div className="flex flex-col lg:flex-row gap-6 items-start">

          {/* LEFT: QR panel -- on screen this shows ONLY the QR in a clean
              white tile. The full ID-card layout (dark navy, name, code,
              caption, footer) exists only in the downloaded PNG that
              `performDownloadQRCode` paints on an offscreen canvas.
              `qrCodeRef` wraps ONLY the QR tile so the download has a
              clean <canvas> to pull from. */}
          <div className="w-full lg:w-[280px] lg:shrink-0 lg:sticky lg:top-4">
            <div className="flex flex-col items-center rounded-2xl border border-white/10 bg-white/[0.04] p-5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-white/40 self-start">
                {t("memberRole")}
              </p>
              <p className="text-base font-bold text-white self-start truncate max-w-full">
                {fullName || "—"}
              </p>
              <p className="text-xs text-white/45 font-mono self-start">
                {userCode || "—"}
              </p>

              {/* QR -- clean, square tile with the standard quiet zone
                  (includeMargin) so it scans reliably. Fixed size so the
                  layout never shifts. */}
              <div ref={qrCodeRef} className="mt-5 rounded-xl bg-white p-2 overflow-hidden shrink-0">
                {qrData ? (
                  <QRCodeCanvas
                    value={qrData}
                    size={200}
                    level="H"
                    bgColor="#ffffff"
                    fgColor="#052e16"
                    includeMargin={true}
                  />
                ) : (
                  <div
                    className="flex flex-col items-center justify-center"
                    style={{ width: 200, height: 200 }}
                  >
                    <QrCode className="text-gray-300" size={32} />
                    <p className="text-gray-400 text-[10px] mt-1 text-center px-2">{t("unableToGenerateQr")}</p>
                  </div>
                )}
              </div>

              <p className="mt-3 text-[11px] text-white/40 text-center">
                {t("scanAtEvents")}
              </p>

              <button
                onClick={() => setShowDownloadConfirm(true)}
                disabled={!qrData}
                className={`mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-semibold transition-colors ${
                  qrData
                    ? 'bg-gold-400 hover:bg-gold-300 text-[#08130F] cursor-pointer'
                    : 'bg-white/10 text-white/30 cursor-not-allowed'
                }`}
              >
                <Download className="h-4 w-4" />
                {t("downloadQrCode")}
              </button>
            </div>
          </div>

          {/* RIGHT: search + pagination + membership cards.
              `min-h` on the grid region prevents the page height from
              changing when switching between pages with different card
              counts, which would otherwise cause the layout to jump. */}
          <div className="w-full lg:flex-1 lg:min-w-0">
            {allMemberships.length > 0 && (
              <>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                  <SearchBar
                    value={searchQuery}
                    onChange={setSearchQuery}
                    placeholder={t("searchMembershipsPlaceholder")}
                    dark
                  />
                </div>
                <div className="mt-2 flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-xs text-white/40">
                    {totalItems} {t("membershipsFoundCount")} — {t("showingLabel")} {itemsPerPage} {t("perPage")}
                  </p>
                  {totalPages > 1 && (
                    <div className="flex items-center gap-2">
                      <button onClick={() => goToPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
                        className="h-8 w-8 rounded-full border border-white/10 bg-white/[0.04] text-white/70 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/[0.08] transition-all active:scale-95">←</button>
                      <span className="h-8 w-8 rounded-full bg-gold-400 text-[#08130F] shadow-sm flex items-center justify-center text-sm font-bold">{currentPage}</span>
                      <button onClick={() => goToPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
                        className="h-8 w-8 rounded-full border border-white/10 bg-white/[0.04] text-white/70 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/[0.08] transition-all active:scale-95">→</button>
                    </div>
                  )}
                </div>
              </>
            )}

            <div className="mt-4 min-h-[500px]">
              {pageSwitching ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-32 rounded-2xl" />
                  ))}
                </div>
              ) : allMemberships.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-96 bg-white/[0.04] rounded-2xl border border-white/10">
                  <svg className="w-24 h-24 text-white/15 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  <h3 className="text-xl font-semibold text-white/70 mb-2">{t("noMembershipsYet")}</h3>
                  <p className="text-white/40 text-center max-w-md px-4">{t("noMembershipsBody")}</p>
                  <div className="mt-6 text-sm text-white/50 bg-white/[0.05] px-4 py-2 rounded-lg">{t("needAssistance")}</div>
                </div>
              ) : displayMemberships.length === 0 && searchQuery ? (
                <div className="flex flex-col items-center justify-center h-64 bg-white/[0.04] rounded-2xl border border-white/10">
                  <svg className="w-16 h-16 text-white/15 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <p className="text-white/50 text-lg">{t("noMatchingMemberships")}</p>
                  <p className="text-white/30 text-sm mt-1">{t("tryDifferentSearch")}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {displayMemberships.map((m: any) => (
                    <div
                      key={m.id}
                      className="rounded-2xl border border-white/10 bg-white/[0.04] overflow-hidden hover:bg-white/[0.06] transition-all duration-200 flex flex-col min-h-[128px]"
                    >
                      <div className="h-1.5 bg-gradient-to-r from-gold-400 via-[#E8B84A] to-[#4FBEB0]" />
                      <div className="p-5 flex-1 flex flex-col justify-center">
                        <h2 className="text-base font-bold text-white break-words">
                          {highlightText(tc(m.name, language as any), searchQuery)}
                        </h2>
                        {m.description && (
                          <p className="text-sm text-white/50 mt-2 break-words line-clamp-2">
                            {highlightText(tc(m.description, language as any), searchQuery)}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={showDownloadConfirm}
        icon={<Download size={40} />}
        title={t("confirmDownloadQrTitle")}
        body={t("confirmDownloadQrBody")}
        cancelLabel={t("cancelLabel")}
        confirmLabel={t("yesDownload")}
        onCancel={() => setShowDownloadConfirm(false)}
        onConfirm={performDownloadQRCode}
        tone="brand"
      />

      <StatusModal open={!!downloadError} type="error" title={t("errorTitle")} message={downloadError || ""} okLabel={t("okLabel")} onClose={() => setDownloadError(null)} />
      <StatusModal open={downloadSuccess} type="success" title={t("successTitle")} message={t("qrCodeDownloadedSuccess")} okLabel={t("okLabel")} onClose={() => setDownloadSuccess(false)} />
    </div>
  );
}