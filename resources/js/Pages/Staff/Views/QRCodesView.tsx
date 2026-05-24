import React, { useState, useMemo } from "react";
import { Pencil, Users, Download } from "lucide-react";
import { Button, Input, FakeQR } from "../components/ui";

interface QRCodesViewProps {
  memberships: any[];
  highlightText: (text: string, query: string) => React.ReactNode;
}

export default function QRCodesView({ memberships, highlightText }: QRCodesViewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 6;

  const filteredMemberships = useMemo(() => {
    if (!searchQuery.trim()) return memberships;
    const q = searchQuery.toLowerCase();
    return memberships.filter(
      (m: any) =>
        m.name.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q) ||
        m.codeId?.toLowerCase().includes(q) ||
        m.note?.toLowerCase().includes(q)
    );
  }, [memberships, searchQuery]);

  const totalPages = useMemo(() => Math.ceil(filteredMemberships.length / itemsPerPage), [filteredMemberships]);
  const paginatedMemberships = useMemo(() => filteredMemberships.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage), [filteredMemberships, currentPage]);
  useMemo(() => setCurrentPage(1), [searchQuery]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#fcfcf9] pt-2 pb-4 px-1 shadow-b-sm">
        <h1 className="text-4xl font-black text-[#005f63]">Memberships & QR Codes</h1>
        <p className="text-sm text-[#667777] mt-1">Each membership type has a unique QR — manage and assign here.</p>
        <div className="mt-4">
          <Input value={searchQuery} onChange={(e: any) => setSearchQuery(e.target.value)} placeholder="Search memberships by name, ID or description…" />
        </div>
        <p className="mt-2 text-xs text-gray-500">
          {filteredMemberships.length} of {memberships.length} membership(s) match.
        </p>
      </div>

      <div className="pl-1">
        {filteredMemberships.length === 0 ? (
          <p className="text-gray-500 italic">No memberships match your search.</p>
        ) : (
          <>
            <div className="flex flex-row flex-wrap gap-5">
              {paginatedMemberships.map((m: any) => (
                <div
                  key={m.id}
                  className="rounded-3xl border border-gray-200 bg-white overflow-hidden w-[780px] shrink-0 hover:shadow-2xl transition-shadow duration-300"
                >
                  <div className="h-1.5 bg-gradient-to-r from-[#ff7a28] via-[#ff9a3c] to-[#ffd33d]"></div>
                  <div className="p-5">
                    <div className="flex items-start justify-between">
                      <div>
                        <h2 className="text-base font-bold text-[#006666]">{highlightText(m.name, searchQuery)}</h2>
                        <p className="text-sm text-[#667777] mt-1">{highlightText(m.description, searchQuery)}</p>
                      </div>
                      {m.verified && (
                        <span className="bg-[#2cb7b7] text-white text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
                          <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5" /></svg>
                          Verified
                        </span>
                      )}
                    </div>

                    <div className="mt-6 grid grid-cols-[auto_1fr] gap-x-8 gap-y-4 items-start">
                      <div className="row-span-3 flex flex-col items-center gap-3">
                        <FakeQR seed={m.codeId || m.id} large />
                        <span className="text-xs font-mono font-bold text-gray-600">{highlightText(m.codeId || m.id, searchQuery)}</span>
                      </div>

                      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                        <div><p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Type</p><p className="font-medium text-gray-800 mt-0.5">{m.type || "Standard"}</p></div>
                        <div><p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Validity</p><p className="font-medium text-gray-800 mt-0.5">{m.validity || "1 Year"}</p></div>
                        <div><p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Members</p><p className="font-medium text-gray-800 mt-0.5">{m.memberIds.length} resident(s)</p></div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Status</p>
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium mt-0.5 ${m.active ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                            {m.active ? "Active" : "Inactive"}
                          </span>
                        </div>
                      </div>

                      <div className="col-span-2">
                        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Notes</p>
                        <p className="text-sm text-gray-600 mt-0.5">{highlightText(m.note || "—", searchQuery)}</p>
                      </div>

                      <div className="col-span-2 flex items-center justify-end gap-2 pt-2">
                        <Button variant="outline" size="sm" className="border-teal-500/30 text-teal-700 hover:bg-teal-50"><Pencil className="mr-1 h-3.5 w-3.5" /> Edit</Button>
                        <Button variant="outline" size="sm" className="border-orange-500/30 text-orange-700 hover:bg-orange-50"><Users className="mr-1 h-3.5 w-3.5" /> Assign Residents</Button>
                        <Button variant="outline" size="sm" className="border-blue-500/30 text-blue-700 hover:bg-blue-50"><Download className="mr-1 h-3.5 w-3.5" /> Export QR</Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="mt-8 flex items-center justify-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => p - 1)} disabled={currentPage === 1} className="h-8 w-8 p-0">←</Button>
                {Array.from({ length: totalPages }).map((_, i) => (
                  <Button key={i} variant={currentPage === i + 1 ? "default" : "outline"} size="sm" onClick={() => setCurrentPage(i + 1)} className={`h-8 w-8 p-0 ${currentPage === i + 1 ? "bg-[#005f63] hover:bg-[#004a4d]" : ""}`}>{i + 1}</Button>
                ))}
                <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => p + 1)} disabled={currentPage === totalPages} className="h-8 w-8 p-0">→</Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}