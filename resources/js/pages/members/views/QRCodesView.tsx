import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import SearchBar from "../../../components/ui/SearchBar";
import { QRCodeCanvas } from "qrcode.react";
import { QrCode, XCircle, CheckCircle } from "lucide-react";
import { useLanguage } from "../../../i18n/LanguageContext";

export default function QRCodesView({ highlightText, userId, userCode, fullName }: any) {
  const { t } = useLanguage();
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [allMemberships, setAllMemberships] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const itemsPerPage = 6;
  const qrCodeRef = useRef<HTMLDivElement>(null);
  const [qrSize, setQrSize] = useState(280);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  // Handle responsive QR size
  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      let newSize;

      if (width < 640) {
        newSize = Math.min(width - 80, 240);
      } else if (width < 1024) {
        newSize = Math.min(width - 100, 260);
      } else {
        newSize = 280;
      }

      setQrSize(Math.max(newSize, 180));
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Fetch user's memberships only once
  useEffect(() => {
    if (!userId) return;

    const fetchMemberships = async () => {
      setLoading(true);
      setError(null);

      try {
        // Get user's membership IDs
        const membershipRes = await fetch(`/membership-residents/${userId}?per_page=100`, {
          credentials: 'include',
          headers: {
            'Accept': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
          }
        });

        if (!membershipRes.ok) throw new Error(`HTTP ${membershipRes.status}`);
        const membershipData = await membershipRes.json();
        const membershipIds = (membershipData.memberships || []).map((m: any) => m.id);

        // If no memberships, set empty array but continue (QR will still show)
        if (membershipIds.length === 0) {
          setAllMemberships([]);
          setLoading(false);
          return;
        }

        // Fetch all memberships
        const allMembershipsRes = await fetch(`/api/memberships`, {
          credentials: 'include',
          headers: {
            'Accept': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
          }
        });

        if (!allMembershipsRes.ok) throw new Error(`HTTP ${allMembershipsRes.status}`);
        const allMembershipsData = await allMembershipsRes.json();
        const allMembershipsList = Array.isArray(allMembershipsData) ? allMembershipsData : (allMembershipsData.data || []);

        // Filter to user's memberships
        const userMemberships = allMembershipsList.filter((m: any) =>
          membershipIds.includes(m.id)
        );

        setAllMemberships(userMemberships);

      } catch (err) {
        console.error('Failed to fetch memberships:', err);
        setError(err instanceof Error ? err.message : 'Failed to load memberships');
      } finally {
        setLoading(false);
      }
    };

    fetchMemberships();
  }, [userId]);

  // Filter memberships based on search query (local filtering, no API call)
  const filteredMemberships = useMemo(() => {
    if (!searchQuery.trim()) return allMemberships;
    const q = searchQuery.toLowerCase();
    return allMemberships.filter(m =>
      m.name?.toLowerCase().includes(q)
    );
  }, [allMemberships, searchQuery]);

  // Paginate the filtered results
  const totalItems = filteredMemberships.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const displayMemberships = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredMemberships.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredMemberships, currentPage, itemsPerPage]);

  // The QR panel is a fixed ~360px; each membership card tops out at
  // 340px. Letting the page always claim max-w-6xl left a large dead
  // rectangle to the right (and below, since the QR panel is taller)
  // whenever a resident had only one or two memberships. Size the page
  // to roughly how many cards are actually on screen instead.
  const pageMaxWidthClass =
    displayMemberships.length <= 1 ? "max-w-3xl" :
    displayMemberships.length === 2 ? "max-w-4xl" :
    displayMemberships.length <= 4 ? "max-w-5xl" :
    "max-w-6xl";

  // Reset to page 1 when search query changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  const downloadQRCode = useCallback(() => {
    if (!qrCodeRef.current) {
      setDownloadError("QR code container not found");
      return;
    }

    const canvas = qrCodeRef.current.querySelector('canvas');
    if (!canvas) {
      setDownloadError("Canvas not found. Please try again.");
      return;
    }

    try {
      const link = document.createElement('a');
      link.download = `qr-code-${userCode || 'membership'}.png`;
      link.href = canvas.toDataURL('image/png', 1.0);
      link.click();
      setDownloadSuccess(true);
    } catch (err) {
      console.error('Download failed:', err);
      setDownloadError('Failed to download QR code. Please try again.');
    }
  }, [userCode]);

  // // ✅ FIXED: QR code generates even WITHOUT memberships
  // const qrData = useMemo(() => {
  //   // Only require basic user info - memberships are optional
  //   if (!userId || !userCode || !fullName) return null;

  //   return JSON.stringify({
  //     user_id: userId,
  //     user_code: userCode,
  //     name: fullName,
  //     memberships: allMemberships.map((m: any) => m.name),
  //     timestamp: Date.now()
  //   });
  // }, [userId, userCode, fullName, allMemberships]);


  /*NEW DATA STRUCTURE*/
  const qrData = useMemo(() => {
    // Keep: user_id, user_code, name
    // Removed: memberships, timestamp
    if (!userId || !userCode || !fullName) return null;

    return JSON.stringify({
      user_id: userId,
      user_code: userCode,
      name: fullName
    });
  }, [userId, userCode, fullName]);

  // Loading state
  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="p-5">
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-600">
          <p className="font-semibold">{t("errorLabel")}</p>
          <p className="text-sm mt-1">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="text-sm underline hover:text-red-800 mt-2"
          >
            {t("retry")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#fcfcf9] h-full flex flex-col">
      {/* Fixed Header - Never scrolls */}
      <div className="flex-shrink-0 bg-[#fcfcf9] px-2 sm:px-3 pt-2 pb-4 border-b border-[#ece7de] z-10">
        <div className={`${pageMaxWidthClass} mx-auto transition-[max-width] duration-300`}>
          <h1 className="text-3xl sm:text-4xl font-black text-[#005f63]">
            {t("myQrAndMemberships")}
          </h1>
          <p className="mt-1 text-sm text-[#667777]">
            {t("qrPageSubtitle")}
          </p>

          {allMemberships.length > 0 && (
            <div className="mt-4">
              <div className="w-full">
                <SearchBar
                  value={searchQuery}
                  onChange={setSearchQuery}
                  placeholder={t("searchMembershipsPlaceholder")}
                />
              </div>
              <p className="mt-2 text-xs text-gray-500">
                {totalItems} {t("membershipsFoundCount")} — {t("showingLabel")} {itemsPerPage} {t("perPage")}
              </p>
            </div>
          )}

          {/* Pagination - ← 1 → */}
          <div className="flex justify-end mt-4">
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="h-8 w-8 rounded-full border border-gray-300 bg-white text-[#005f63] text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#005f63] hover:text-white hover:border-[#005f63] transition-all active:scale-95"
                >
                  ←
                </button>
                
                <span className="h-8 w-8 rounded-full bg-[#005f63] text-white shadow-sm flex items-center justify-center text-sm font-semibold">
                  {currentPage}
                </span>
                
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="h-8 w-8 rounded-full border border-gray-300 bg-white text-[#005f63] text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#005f63] hover:text-white hover:border-[#005f63] transition-all active:scale-95"
                >
                  →
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Scrollable Content Area - Only memberships scroll */}
      <div className="flex-1 overflow-y-auto px-2 sm:px-3 mt-5 pb-4">
        <div className={`${pageMaxWidthClass} mx-auto transition-[max-width] duration-300`}>
          <div className="flex flex-col lg:flex-row gap-4">

            {/* LEFT COLUMN - QR CODE SECTION */}
            <div className="w-full lg:w-[360px] lg:shrink-0">
              <div className="rounded-3xl border border-gray-200 bg-transparent p-4 sm:p-6 shadow-lg lg:sticky lg:top-24 overflow-hidden">
                <p className="text-center mb-4 text-gray-500 text-sm">
                  {t("scanAtEvents")}
                </p>
                <div className="text-center">
                  <div className="flex justify-center overflow-x-auto">
                    <div ref={qrCodeRef} className="flex justify-center items-center">
                      <div className="bg-white p-2 rounded-2xl shadow:sm border border-gray-500 inline-flex">
                        {qrData ? (
                          <QRCodeCanvas
                            value={qrData}
                            size={qrSize}
                            level="H"
                            bgColor="#ffffff"
                            fgColor="#005f63"
                            includeMargin={true}
                          />
                        ) : (
                          <div className="text-center py-8 px-4">
                            <QrCode className="mx-auto mb-3 text-gray-300" size={48} />
                            <p className="text-gray-500 text-sm">{t("unableToGenerateQr")}</p>
                            <p className="text-gray-400 text-xs mt-1">{t("pleaseLoggedIn")}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-6">
                    <button
                      onClick={downloadQRCode}
                      disabled={!qrData}
                      className={`font-semibold py-3 px-6 rounded-full transition-colors duration-300 shadow-md w-full max-w-[280px] mx-auto block ${
                        qrData
                          ? 'bg-[#359ca0] hover:bg-[#2a7d82] text-white cursor-pointer'
                          : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      }`}
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
                      {t("downloadQrCode")}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN - MEMBERSHIP CARDS */}
            <div className="w-full lg:flex-1 lg:min-w-0">
              {allMemberships.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-96 bg-white rounded-xl border border-gray-200 shadow-sm">
                  <svg className="w-24 h-24 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  <h3 className="text-xl font-semibold text-gray-700 mb-2">{t("noMembershipsYet")}</h3>
                  <p className="text-gray-500 text-center max-w-md">
                    {t("noMembershipsBody")}
                  </p>
                  <div className="mt-6 text-sm text-[#667777] bg-gray-50 px-4 py-2 rounded-lg">
                    {t("needAssistance")}
                  </div>
                </div>
              ) : displayMemberships.length === 0 && searchQuery ? (
                <div className="flex flex-col items-center justify-center h-64 bg-white rounded-xl border border-gray-200">
                  <svg className="w-16 h-16 text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <p className="text-gray-500 text-lg">{t("noMatchingMemberships")}</p>
                  <p className="text-gray-400 text-sm mt-1">{t("tryDifferentSearch")}</p>
                </div>
              ) : (
                <div className="grid gap-4 justify-start grid-cols-1 sm:[grid-template-columns:repeat(auto-fit,minmax(260px,340px))]">
                  {displayMemberships.map((m: any) => (
                    <div
                      key={m.id}
                      className="rounded-3xl border border-gray-200 bg-white overflow-hidden shadow-[8px_8px_6px_rgba(0,0,0,0.10)] hover:shadow-[12px_12px_18px_rgba(0,0,0,0.20)] transition-shadow duration-300 w-full"
                    >
                      <div className="h-1.5 bg-gradient-to-r from-[#fdde8a] via-[#e2964f] to-[#91f0f3]"></div>
                      <div className="p-8">
                        <div>
                          <h2 className="text-base font-bold text-[#006666] break-words">
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
              )}
            </div>
          </div>
        </div>
      </div>

      {downloadError && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setDownloadError(null)}>
          <div className="bg-white rounded-[30px] w-full max-w-md p-6 shadow-2xl text-center" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 text-red-500 flex justify-center"><XCircle size={40} /></div>
            <h3 className="text-xl font-bold text-red-600 mb-3">{t("errorTitle")}</h3>
            <p className="text-[15px] text-gray-600 mb-5">{downloadError}</p>
            <button
              onClick={() => setDownloadError(null)}
              className="px-6 py-2.5 rounded-full bg-[#005f63] hover:bg-[#004a4d] text-white transition"
            >
              {t("okLabel")}
            </button>
          </div>
        </div>
      )}

      {downloadSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setDownloadSuccess(false)}>
          <div className="bg-white rounded-[30px] w-full max-w-md p-6 shadow-2xl text-center" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 text-[#005f63] flex justify-center"><CheckCircle size={40} /></div>
            <h3 className="text-xl font-bold text-[#005f63] mb-3">{t("successTitle")}</h3>
            <p className="text-[15px] text-gray-600 mb-5">{t("qrCodeDownloadedSuccess")}</p>
            <button
              onClick={() => setDownloadSuccess(false)}
              className="px-6 py-2.5 rounded-full bg-[#005f63] hover:bg-[#004a4d] text-white transition"
            >
              {t("okLabel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}