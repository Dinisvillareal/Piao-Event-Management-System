// import React, { useState, useMemo } from "react";
// import { Pencil, Users, Download } from "lucide-react";
// import { Button, Input } from "../../../Components/UI/Core"; 
// import StaffFakeQR from "../StaffFakeQR"; // ✅ Using the Staff specific QR!

// const availableMemberships = [
//   "Verified Resident", "Women's Association", "Senior Citizen", 
//   "Health Worker", "Barangay Staff", "Peace & Order Team"
// ];

// interface QRCodesViewProps {
//   memberships: any[];
//   highlightText: (text: string, query: string) => React.ReactNode;
// }

// export default function QRCodesView({ memberships, highlightText }: QRCodesViewProps) {
//   const [searchQuery, setSearchQuery] = useState("");
//   const [currentPage, setCurrentPage] = useState(1);
//   const itemsPerPage = 6;

//   const filteredMemberships = useMemo(() => {
//     if (!searchQuery.trim()) return memberships;
//     const q = searchQuery.toLowerCase();
//     return memberships.filter(
//       (m: any) =>
//         m.name.toLowerCase().includes(q) ||
//         m.description.toLowerCase().includes(q) ||
//         m.codeId?.toLowerCase().includes(q) ||
//         m.note?.toLowerCase().includes(q)
//     );
//   }, [memberships, searchQuery]);

//   const totalPages = useMemo(() => Math.ceil(filteredMemberships.length / itemsPerPage), [filteredMemberships]);
//   const paginatedMemberships = useMemo(() => filteredMemberships.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage), [filteredMemberships, currentPage]);
//   useMemo(() => setCurrentPage(1), [searchQuery]);

//   return (
//     <div className="space-y-6">
//       {/* Header */}
//       <div className="sticky top-0 z-10 bg-[#fcfcf9] pt-2 pb-4 px-1 shadow-b-sm">
//         <h1 className="text-4xl font-black text-[#005f63]">Memberships & QR Codes</h1>
//         <p className="text-sm text-[#667777] mt-1">Each membership type has a unique QR — manage and assign here.</p>
//         <div className="mt-4">
//           <Input value={searchQuery} onChange={(e: any) => setSearchQuery(e.target.value)} placeholder="Search memberships by name, ID or description…" />
//         </div>
//         <p className="mt-2 text-xs text-gray-500">
//           {filteredMemberships.length} of {memberships.length} membership(s) match.
//         </p>
//       </div>

//       <div className="pl-1">
//         {filteredMemberships.length === 0 ? (
//           <p className="text-gray-500 italic">No memberships match your search.</p>
//         ) : (
//           <>
//             <div className="flex flex-row flex-wrap gap-5">
//               {paginatedMemberships.map((m: any) => (
//                 <div
//                   key={m.id}
//                   className="rounded-3xl border border-gray-200 bg-white overflow-hidden w-[780px] shrink-0 hover:shadow-2xl transition-shadow duration-300"
//                 >
//                   <div className="h-1.5 bg-gradient-to-r from-[#ff7a28] via-[#ff9a3c] to-[#ffd33d]"></div>
//                   <div className="p-5">
//                     <div className="flex items-start justify-between">
//                       <div>
//                         <h2 className="text-base font-bold text-[#006666]">{highlightText(m.name, searchQuery)}</h2>
//                         <p className="text-sm text-[#667777] mt-1">{highlightText(m.description, searchQuery)}</p>
//                       </div>
//                       {m.verified && (
//                         <span className="bg-[#2cb7b7] text-white text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
//                           <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5" /></svg>
//                           Verified
//                         </span>
//                       )}
//                     </div>

//                     <div className="mt-6 grid grid-cols-[auto_1fr] gap-x-8 gap-y-4 items-start">
//                       <div className="row-span-3 flex flex-col items-center gap-3">
//                         {/* ✅ USING THE STAFF FAKEQR */}
//                         <StaffFakeQR seed={m.codeId || m.id} large />
//                         <span className="text-xs font-mono font-bold text-gray-600">{highlightText(m.codeId || m.id, searchQuery)}</span>
//                       </div>

//                       <div className="grid grid-cols-2 gap-x-6 gap-y-3">
//                         <div><p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Type</p><p className="font-medium text-gray-800 mt-0.5">{m.type || "Standard"}</p></div>
//                         <div><p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Validity</p><p className="font-medium text-gray-800 mt-0.5">{m.validity || "1 Year"}</p></div>
//                         <div><p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Members</p><p className="font-medium text-gray-800 mt-0.5">{m.memberIds.length} resident(s)</p></div>
//                         <div>
//                           <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Status</p>
//                           <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium mt-0.5 ${m.active ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
//                             {m.active ? "Active" : "Inactive"}
//                           </span>
//                         </div>
//                       </div>

//                       <div className="col-span-2">
//                         <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Notes</p>
//                         <p className="text-sm text-gray-600 mt-0.5">{highlightText(m.note || "—", searchQuery)}</p>
//                       </div>

//                       <div className="col-span-2 flex items-center justify-end gap-2 pt-2">
//                         <Button variant="outline" size="sm" className="border-teal-500/30 text-teal-700 hover:bg-teal-50"><Pencil className="mr-1 h-3.5 w-3.5" /> Edit</Button>
//                         <Button variant="outline" size="sm" className="border-orange-500/30 text-orange-700 hover:bg-orange-50"><Users className="mr-1 h-3.5 w-3.5" /> Assign Residents</Button>
//                         <Button variant="outline" size="sm" className="border-blue-500/30 text-blue-700 hover:bg-blue-50"><Download className="mr-1 h-3.5 w-3.5" /> Export QR</Button>
//                       </div>
//                     </div>
//                   </div>
//                 </div>
//               ))}
//             </div>

//             {totalPages > 1 && (
//               <div className="mt-8 flex items-center justify-center gap-2">
//                 <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => p - 1)} disabled={currentPage === 1} className="h-8 w-8 p-0">←</Button>
//                 {Array.from({ length: totalPages }).map((_, i) => (
//                   <Button key={i} variant={currentPage === i + 1 ? "default" : "outline"} size="sm" onClick={() => setCurrentPage(i + 1)} className={`h-8 w-8 p-0 ${currentPage === i + 1 ? "bg-[#005f63] hover:bg-[#004a4d]" : ""}`}>{i + 1}</Button>
//                 ))}
//                 <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => p + 1)} disabled={currentPage === totalPages} className="h-8 w-8 p-0">→</Button>
//               </div>
//             )}
//           </>
//         )}
//       </div>
//     </div>
//   );
// }
import React, { useState, useMemo, useEffect } from "react";
import { Users, Plus, Pencil, Trash2 } from "lucide-react";
import { Button, Input } from "../../../Components/UI/Core";

interface QRCodesViewProps {
  highlightText: (text: string, query: string) => React.ReactNode;
}

export default function QRCodesView({ highlightText }: QRCodesViewProps) {
  const [memberships, setMemberships] = useState<any[]>([]);
  const [allResidents, setAllResidents] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selectedMembership, setSelectedMembership] = useState<any>(null);
  const [showModal, setShowModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingMembership, setEditingMembership] = useState<any>(null);
  const [addFormErrors, setAddFormErrors] = useState<Record<string, string>>({});
  const [editFormErrors, setEditFormErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [newMembership, setNewMembership] = useState({
    name: "",
    description: ""
  });

  const itemsPerPage = 6;

  const fetchMemberships = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/memberships', {
        headers: {
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        credentials: 'include'
      });
      
      if (!response.ok) throw new Error('Failed to fetch');
      
      const membershipsData = await response.json();
      setMemberships(membershipsData);
      
    } catch (error) {
      console.error('Error fetching memberships:', error);
      setMemberships([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchAllResidents = async () => {
    try {
      const response = await fetch('/users/all-for-memberships', {
        headers: {
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        const residents = Array.isArray(data) ? data : (data.data || []);
        setAllResidents(residents);
      } else {
        const fallbackResponse = await fetch('/users?per_page=1000', {
          headers: { 'Accept': 'application/json' },
          credentials: 'include'
        });
        if (fallbackResponse.ok) {
          const result = await fallbackResponse.json();
          setAllResidents(result.data || []);
        }
      }
    } catch (error) {
      console.error('Error fetching residents:', error);
      setAllResidents([]);
    }
  };

  const handleAddMembership = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const errors: Record<string, string> = {};
    if (!newMembership.name.trim()) errors.name = "Membership name is required";
    if (newMembership.name.length < 3) errors.name = "Name must be at least 3 characters";
    
    setAddFormErrors(errors);
    if (Object.keys(errors).length > 0) return;
    
    setIsSubmitting(true);
    
    try {
      const token = document.cookie
        .split('; ')
        .find(row => row.startsWith('XSRF-TOKEN='))
        ?.split('=')[1];
      
      const decodedToken = token ? decodeURIComponent(token) : '';
      
      const response = await fetch('/api/memberships', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          'X-XSRF-TOKEN': decodedToken
        },
        body: JSON.stringify({
          name: newMembership.name,
          description: newMembership.description
        })
      });
      
      const result = await response.json();
      
      if (response.ok) {
        alert('Membership added successfully!');
        setShowAddModal(false);
        setNewMembership({
          name: "",
          description: ""
        });
        fetchMemberships();
        window.dispatchEvent(new Event('refreshMemberships'));
      } else {
        alert(result.message || 'Failed to add membership');
      }
    } catch (error) {
      console.error('Error adding membership:', error);
      alert('An error occurred while adding membership');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditMembership = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const errors: Record<string, string> = {};
    if (!editingMembership.name.trim()) errors.name = "Membership name is required";
    if (editingMembership.name.length < 3) errors.name = "Name must be at least 3 characters";
    
    setEditFormErrors(errors);
    if (Object.keys(errors).length > 0) return;
    
    setIsSubmitting(true);
    
    try {
      const token = document.cookie
        .split('; ')
        .find(row => row.startsWith('XSRF-TOKEN='))
        ?.split('=')[1];
      
      const decodedToken = token ? decodeURIComponent(token) : '';
      
      const response = await fetch(`/api/memberships/${editingMembership.id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          'X-XSRF-TOKEN': decodedToken
        },
        body: JSON.stringify({
          name: editingMembership.name,
          description: editingMembership.description
        })
      });
      
      const result = await response.json();
      
      if (response.ok) {
        alert('Membership updated successfully!');
        setShowEditModal(false);
        setEditingMembership(null);
        fetchMemberships();
        window.dispatchEvent(new Event('refreshMemberships'));
      } else {
        alert(result.message || 'Failed to update membership');
      }
    } catch (error) {
      console.error('Error updating membership:', error);
      alert('An error occurred while updating membership');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteMembership = async (id: number, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"? This action cannot be undone.`)) return;
    
    try {
      const token = document.cookie
        .split('; ')
        .find(row => row.startsWith('XSRF-TOKEN='))
        ?.split('=')[1];
      
      const decodedToken = token ? decodeURIComponent(token) : '';
      
      const response = await fetch(`/api/memberships/${id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          'X-XSRF-TOKEN': decodedToken
        }
      });
      
      if (response.ok) {
        alert('Membership deleted successfully!');
        fetchMemberships();
        window.dispatchEvent(new Event('refreshMemberships'));
      } else {
        alert('Failed to delete membership');
      }
    } catch (error) {
      console.error('Error deleting membership:', error);
      alert('An error occurred while deleting membership');
    }
  };

  const openEditModal = (membership: any) => {
    setEditingMembership({
      id: membership.id,
      name: membership.name,
      description: membership.description || ""
    });
    setShowEditModal(true);
  };

  useEffect(() => {
    fetchMemberships();
    fetchAllResidents();
    
    const handleRefresh = () => {
      fetchMemberships();
      fetchAllResidents();
    };
    
    window.addEventListener('refreshMemberships', handleRefresh);
    window.addEventListener('resident-updated', handleRefresh);
    
    return () => {
      window.removeEventListener('refreshMemberships', handleRefresh);
      window.removeEventListener('resident-updated', handleRefresh);
    };
  }, []);

  const filteredMemberships = useMemo(() => {
    if (!searchQuery.trim()) return memberships;
    const q = searchQuery.toLowerCase();
    return memberships.filter(m =>
      m.name?.toLowerCase().includes(q) ||
      m.description?.toLowerCase().includes(q)
    );
  }, [memberships, searchQuery]);

  const totalPages = Math.ceil(filteredMemberships.length / itemsPerPage);
  const paginatedMemberships = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredMemberships.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredMemberships, currentPage, itemsPerPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  const getResidentsByMembership = (membershipName: string) => {
    if (!allResidents.length) return [];
    
    const filtered = allResidents.filter(resident => {
      let residentMembershipNames: string[] = [];
      
      if (Array.isArray(resident.memberships)) {
        residentMembershipNames = resident.memberships.map((m: any) => m.name || m);
      } else if (resident.memberships && typeof resident.memberships === 'object') {
        residentMembershipNames = [resident.memberships.name];
      } else if (typeof resident.memberships === 'string') {
        residentMembershipNames = resident.memberships.split(',').map((m: string) => m.trim());
      }
      
      return residentMembershipNames.includes(membershipName);
    });
    
    return filtered;
  };

  const handleViewMembers = (membership: any) => {
    const residents = getResidentsByMembership(membership.name);
    setSelectedMembership({
      ...membership,
      residents: residents
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedMembership(null);
  };

  const closeAddModal = () => {
    setShowAddModal(false);
    setAddFormErrors({});
    setNewMembership({
      name: "",
      description: ""
    });
  };

  const closeEditModal = () => {
    setShowEditModal(false);
    setEditingMembership(null);
    setEditFormErrors({});
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      closeModal();
    }
  };

  const handleAddBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      closeAddModal();
    }
  };

  const handleEditBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      closeEditModal();
    }
  };

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeModal();
        closeAddModal();
        closeEditModal();
      }
    };
    if (showModal || showAddModal || showEditModal) {
      document.addEventListener('keydown', handleEsc);
    }
    return () => document.removeEventListener('keydown', handleEsc);
  }, [showModal, showAddModal, showEditModal]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#fcfcf9] pt-2 pb-4 px-1 shadow-b-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-black text-[#005f63]">Memberships</h1>
            <p className="text-sm text-[#667777] mt-1">Manage memberships and view assigned residents.</p>
          </div>
          <Button 
            onClick={() => setShowAddModal(true)}
            className="bg-[#005f63] hover:bg-[#004a4d] text-white rounded-full"
          >
            <Plus className="mr-2 h-4 w-4" /> Add Membership
          </Button>
        </div>
        <div className="mt-4">
          <Input 
            value={searchQuery} 
            onChange={(e: any) => setSearchQuery(e.target.value)} 
            placeholder="Search memberships by name or description…" 
          />
        </div>
        <p className="mt-2 text-xs text-gray-500">
          {filteredMemberships.length} membership(s) found
        </p>
      </div>

      {/* Membership Cards */}
      <div className="pl-1">
        {filteredMemberships.length === 0 ? (
          <p className="text-center text-gray-500 py-12">No memberships found.</p>
        ) : (
          <>
            <div className="flex flex-row flex-wrap gap-5">
              {paginatedMemberships.map((m) => {
                const residentCount = getResidentsByMembership(m.name).length;
                
                return (
                  <div 
                    key={m.id} 
                    className="rounded-3xl border border-gray-200 bg-white overflow-hidden w-[780px] shrink-0 hover:shadow-2xl transition-shadow duration-300"
                  >
                    <div className="h-1.5 bg-gradient-to-r from-[#ff7a28] via-[#ff9a3c] to-[#ffd33d]"></div>
                    <div className="p-5">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h2 className="text-xl font-bold text-[#006666]">
                            {highlightText(m.name, searchQuery)}
                          </h2>
                          <p className="text-sm text-[#667777] mt-1">
                            {highlightText(m.description || 'No description', searchQuery)}
                          </p>
                        </div>
                        <div className="flex gap-1 ml-4">
                          <button
                            onClick={() => openEditModal(m)}
                            className="p-2 rounded-full hover:bg-orange-50 transition text-orange-600"
                            title="Edit Membership"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteMembership(m.id, m.name)}
                            className="p-2 rounded-full hover:bg-red-50 transition text-red-500"
                            title="Delete Membership"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      <div className="mt-6">
                        <div className="flex items-center justify-between pt-4 mt-2 border-t border-gray-100">
                          <div className="text-left">
                            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">TOTAL MEMBERS</p>
                            <p className="font-medium text-gray-800 mt-0.5">{residentCount} resident(s)</p>
                          </div>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="border-teal-500/30 text-teal-700 hover:bg-teal-50"
                            onClick={() => handleViewMembers(m)}
                          >
                            <Users className="mr-1 h-3.5 w-3.5" /> View Members ({residentCount})
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-8 flex items-center justify-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))} 
                  disabled={currentPage === 1} 
                  className="h-8 w-8 p-0"
                >
                  ←
                </Button>
                {Array.from({ length: totalPages }, (_, i) => (
                  <Button 
                    key={i} 
                    variant={currentPage === i + 1 ? "default" : "outline"} 
                    size="sm" 
                    onClick={() => setCurrentPage(i + 1)} 
                    className={`h-8 w-8 p-0 ${currentPage === i + 1 ? "bg-[#005f63] hover:bg-[#004a4d]" : ""}`}
                  >
                    {i + 1}
                  </Button>
                ))}
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} 
                  disabled={currentPage === totalPages} 
                  className="h-8 w-8 p-0"
                >
                  →
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* View Members Modal */}
      {showModal && selectedMembership && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={handleBackdropClick}
        >
          <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[85vh] overflow-hidden shadow-2xl">
            <div className="sticky top-0 bg-white px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-black text-[#005f63]">{selectedMembership.name}</h2>
                <p className="text-sm text-gray-500 mt-0.5">{selectedMembership.description || 'No description'}</p>
              </div>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[60vh]">
              <div className="flex items-center gap-2 mb-4">
                <Users className="h-5 w-5 text-teal-600" />
                <span className="text-sm font-semibold text-gray-700">
                  {selectedMembership.residents.length} Resident(s)
                </span>
              </div>
              
              {selectedMembership.residents.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-gray-400 mb-2">
                    <Users className="h-12 w-12 mx-auto opacity-50" />
                  </div>
                  <p className="text-gray-500">No residents assigned to this membership yet.</p>
                  <p className="text-xs text-gray-400 mt-2">
                    Go to Residents section and edit a resident to assign memberships.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {selectedMembership.residents.map((resident: any, idx: number) => (
                    <div 
                      key={resident.id || idx} 
                      className="flex items-center justify-between p-4 rounded-xl bg-gray-50 hover:bg-teal-50 transition-all"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-r from-teal-400 to-teal-600 flex items-center justify-center text-white font-bold">
                          {resident.first_name?.charAt(0)}{resident.last_name?.charAt(0)}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-800">
                            {resident.first_name} {resident.last_name}
                          </p>
                          <p className="text-sm text-gray-500 font-mono">
                            {resident.user_code || resident.id}
                          </p>
                        </div>
                      </div>
                      <button 
                        onClick={() => closeModal()}
                        className="text-xs text-teal-600 hover:text-teal-800 font-medium px-3 py-1.5 rounded-full hover:bg-teal-100"
                      >
                       
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="sticky bottom-0 bg-white px-6 py-4 border-t border-gray-100 flex justify-end">
              <Button onClick={closeModal} className="bg-[#005f63] hover:bg-[#004a4d] text-white px-6">
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Add Membership Modal */}
      {showAddModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={handleAddBackdropClick}
        >
          <div className="bg-white rounded-3xl w-full max-w-lg max-h-[85vh] overflow-hidden shadow-2xl">
            <div className="sticky top-0 bg-white px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-black text-[#005f63]">Add New Membership</h2>
                <p className="text-sm text-gray-500 mt-0.5">Create a new membership type for residents.</p>
              </div>
              <button onClick={closeAddModal} className="text-gray-400 hover:text-gray-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleAddMembership} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Membership Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newMembership.name}
                  onChange={(e) => setNewMembership(prev => ({ ...prev, name: e.target.value }))}
                  className={`w-full rounded-full border px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#005f63]/30 ${
                    addFormErrors.name ? "border-red-500" : "border-gray-200"
                  }`}
                  placeholder="e.g., Senior Citizen Program"
                />
                {addFormErrors.name && (
                  <p className="text-red-500 text-xs mt-1">{addFormErrors.name}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={newMembership.description}
                  onChange={(e) => setNewMembership(prev => ({ ...prev, description: e.target.value }))}
                  rows={4}
                  className="w-full rounded-2xl border border-gray-200 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#005f63]/30 resize-none"
                  placeholder="Describe the membership benefits and requirements..."
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeAddModal}
                  className="px-5 py-2.5 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 rounded-full bg-[#005f63] text-white hover:bg-[#004d4d] disabled:opacity-50"
                >
                  {isSubmitting ? "Adding..." : "Add Membership"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Membership Modal */}
      {showEditModal && editingMembership && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={handleEditBackdropClick}
        >
          <div className="bg-white rounded-3xl w-full max-w-lg max-h-[85vh] overflow-hidden shadow-2xl">
            <div className="sticky top-0 bg-white px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-black text-[#005f63]">Edit Membership</h2>
                <p className="text-sm text-gray-500 mt-0.5">Update membership name or description.</p>
              </div>
              <button onClick={closeEditModal} className="text-gray-400 hover:text-gray-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleEditMembership} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Membership Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editingMembership.name}
                  onChange={(e) => setEditingMembership((prev: any) => ({ ...prev, name: e.target.value }))}
                  className={`w-full rounded-full border px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#005f63]/30 ${
                    editFormErrors.name ? "border-red-500" : "border-gray-200"
                  }`}
                  placeholder="e.g., Senior Citizen Program"
                />
                {editFormErrors.name && (
                  <p className="text-red-500 text-xs mt-1">{editFormErrors.name}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={editingMembership.description}
                  onChange={(e) => setEditingMembership((prev: any) => ({ ...prev, description: e.target.value }))}
                  rows={4}
                  className="w-full rounded-2xl border border-gray-200 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#005f63]/30 resize-none"
                  placeholder="Describe the membership benefits and requirements..."
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeEditModal}
                  className="px-5 py-2.5 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 rounded-full bg-[#005f63] text-white hover:bg-[#004d4d] disabled:opacity-50"
                >
                  {isSubmitting ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}