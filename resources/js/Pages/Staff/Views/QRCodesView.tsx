import React, { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { Users, Plus, Pencil, Trash2, Search } from "lucide-react";
import { Button, Input } from "../../../Components/UI/Core";
import SearchBar from "../../../Components/UI/SearchBar";


export interface Membership {
  id: string | number;
  name: string;
  description: string;
}

interface QRCodesViewProps {
  highlightText: (text: string, query: string) => React.ReactNode;
  memberships?: Membership[];
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

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (showModal || showAddModal || showEditModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [showModal, showAddModal, showEditModal]);

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
    <div className="h-full flex flex-col relative">
      {/* Fixed Header - Never scrolls */}
      <div className="flex-shrink-0 bg-[#fcfcf9] pt-2 pb-4 px-4 sm:px-6 shadow-b-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl sm:text-4xl font-black text-[#005f63]">Memberships</h1>
            <p className="text-xs sm:text-sm text-[#667777] mt-1">Manage memberships and view assigned residents.</p>
          </div>
        </div>
        <div className="mt-4 relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#005f63]/70" />
          <SearchBar value={searchQuery} onChange={(value: string) => setSearchQuery(value)} placeholder="Search by name or description..." />
        </div>
        {/* Added extra margin bottom here for spacing */}
        <p className="mt-2 mb-10 text-xs text-gray-500">
          {filteredMemberships.length} membership(s) found
        </p>

        {/* Pagination & Add Button Row — Pagination moved here, fully rounded */}
        <div className="flex items-center justify-between">
          {totalPages > 1 && (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="h-8 w-8 rounded-full border border-gray-300 bg-white text-[#005f63] text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#005f63] hover:text-white hover:border-[#005f63] transition-all active:scale-95"
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
                      className={`h-8 w-8 rounded-full text-sm font-semibold transition-all active:scale-95 ${
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
                      className="h-8 w-8 rounded-full border border-gray-300 bg-white text-[#005f63] text-sm font-semibold hover:bg-[#005f63] hover:text-white hover:border-[#005f63] transition-all active:scale-95"
                    >
                      {totalPages}
                    </button>
                  </>
                )}
              </div>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="h-8 w-8 rounded-full border border-gray-300 bg-white text-[#005f63] text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#005f63] hover:text-white hover:border-[#005f63] transition-all active:scale-95"
              >
                →
              </button>
            </div>
          )}

          {/* Desktop button - aligned right */}
          <button
            onClick={() => setShowAddModal(true)}
            className="ml-auto bg-[#005f63] hover:bg-[#004a4d] text-white px-4 sm:px-5 py-2 sm:py-2.5 rounded-full font-medium transition shadow-sm items-center gap-2 text-sm sm:text-base"
          >
            <div className="flex items-center gap-2">
              <Plus className="h-4 w-4" /> Add New Membership
            </div>
          </button>
        </div>
      </div>

      {/* Scrollable Content Area - Cards scroll here, header stays fixed */}
      <div className="flex-1 overflow-y-auto px-4 sm:pl-6 pb-20 sm:pb-6 pr-4 sm:pr-6">
        {filteredMemberships.length === 0 ? (
          <p className="text-center text-gray-500 py-12">No memberships found.</p>
        ) : (
          <>
            {/* Responsive grid: 1 column on mobile, 2 columns on desktop */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
              {paginatedMemberships.map((m) => {
                const residentCount = getResidentsByMembership(m.name).length;

                return (
                  <div
                    key={m.id}
                    className="rounded-2xl sm:rounded-3xl border border-gray-200 bg-white overflow-hidden hover:shadow-2xl transition-shadow duration-300 w-full"
                  >
                    <div className="h-1.5 bg-gradient-to-r from-[#ff7a28] via-[#ff9a3c] to-[#ffd33d]"></div>
                    <div className="p-4 sm:p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <h2 className="text-lg sm:text-xl font-bold text-[#006666] break-words">
                            {highlightText(m.name, searchQuery)}
                          </h2>
                          <p className="text-xs sm:text-sm text-[#667777] mt-1 break-words line-clamp-2 sm:line-clamp-none">
                            {highlightText(m.description || 'No description', searchQuery)}
                          </p>
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          <button
                            onClick={() => openEditModal(m)}
                            className="p-2 rounded-full hover:bg-orange-50 transition text-orange-600 active:bg-orange-100"
                            title="Edit Membership"
                          >
                            <svg width="16" height="16" fill="none" stroke="#f59e0b" strokeWidth={2} viewBox="0 0 24 24">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDeleteMembership(m.id, m.name)}
                            className="p-2 rounded-full hover:bg-red-50 transition text-red-500 active:bg-red-100"
                            title="Delete Membership"
                          >
                            <svg width="16" height="16" fill="none" stroke="#ef4444" strokeWidth={2} viewBox="0 0 24 24">
                              <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                          </button>
                        </div>
                      </div>

                      <div className="mt-4 sm:mt-6">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 sm:pt-4 mt-2 border-t border-gray-100">
                          <div className="text-left">
                            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">TOTAL MEMBERS</p>
                            <p className="font-medium text-gray-800 mt-0.5 text-sm sm:text-base">{residentCount} resident(s)</p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-teal-500/30 text-teal-700 hover:bg-teal-50 w-full sm:w-auto justify-center"
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
          </>
        )}
      </div>

      {/* Floating Action Button (FAB) - visible only on mobile */}
      <button
        onClick={() => setShowAddModal(true)}
        className="sm:hidden fixed bottom-6 right-6 z-50 bg-[#005f63] hover:bg-[#004a4d] text-white rounded-full p-4 shadow-lg transition-all duration-200 hover:scale-110 active:scale-95"
        aria-label="Add new membership"
      >
        <Plus className="h-6 w-6" />
      </button>

      {/* View Members Modal - Mobile optimized */}
      {showModal && selectedMembership && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4 sm:p-0"
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
          onClick={handleBackdropClick}
        >
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden shadow-2xl relative mx-4 sm:mx-auto">
            <div className="bg-white px-4 sm:px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-gray-800">{selectedMembership.name}</h2>
                <p className="text-xs sm:text-sm text-gray-500 mt-0.5 line-clamp-2">{selectedMembership.description || 'No description'}</p>
              </div>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 p-1">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-4 sm:p-6 overflow-y-auto max-h-[60vh]">
              <div className="flex items-center gap-2 mb-4">
                <Users className="h-5 w-5 text-teal-600" />
                <span className="text-sm font-semibold text-gray-700">
                  {selectedMembership.residents.length} Resident(s)
                </span>
              </div>

              {selectedMembership.residents.length === 0 ? (
                <div className="text-center py-8 sm:py-12">
                  <div className="text-gray-400 mb-2">
                    <Users className="h-12 w-12 mx-auto opacity-50" />
                  </div>
                  <p className="text-gray-500 text-sm sm:text-base">No residents assigned to this membership yet.</p>
                  <p className="text-xs text-gray-400 mt-2">
                    Go to Residents section and edit a resident to assign memberships.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {selectedMembership.residents.map((resident: any, idx: number) => (
                    <div
                      key={resident.id || idx}
                      className="flex items-center justify-between p-3 sm:p-4 rounded-xl bg-gray-50 hover:bg-teal-50 transition-all active:bg-teal-100"
                    >
                      <div className="flex items-center gap-3 sm:gap-4">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-r from-teal-400 to-teal-600 flex items-center justify-center text-white font-bold text-sm sm:text-base">
                          {resident.first_name?.charAt(0)}{resident.last_name?.charAt(0)}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-800 text-sm sm:text-base">
                            {resident.first_name} {resident.last_name}
                          </p>
                          <p className="text-xs text-gray-500 font-mono">
                            {resident.user_code || resident.id}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white px-4 sm:px-6 py-4 border-t border-gray-100 flex justify-end">
              <button onClick={closeModal} className="bg-[#005f63] hover:bg-[#004a4d] text-white px-4 py-2 rounded-lg text-sm font-medium transition active:scale-95">
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Add New Membership Modal — FULLY ROUNDED EDGES */}
      {showAddModal && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4"
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
          onClick={handleAddBackdropClick}
        >
          <div className="bg-white rounded-[2rem] w-full max-w-md max-h-[85vh] overflow-hidden shadow-2xl relative">
            <div className="bg-white px-4 sm:px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg sm:text-xl font-bold text-gray-800">Add New Membership</h2>
              <button onClick={closeAddModal} className="text-gray-400 hover:text-gray-600 p-1">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleAddMembership} className="p-4 sm:p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Membership Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newMembership.name}
                  onChange={(e) => setNewMembership(prev => ({ ...prev, name: e.target.value }))}
                  className={`w-full rounded-full border px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[#005f63]/30 text-sm sm:text-base ${
                    addFormErrors.name ? "border-red-500" : "border-gray-300"
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
                  rows={3}
                  className="w-full rounded-3xl border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[#005f63]/30 resize-none text-sm sm:text-base"
                  placeholder="Describe the membership benefits and requirements..."
                />
              </div>

              <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={closeAddModal}
                  className="px-4 py-2 rounded-full border border-gray-300 text-gray-700 hover:bg-gray-50 transition active:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-full bg-[#005f63] text-white hover:bg-[#004a4d] disabled:opacity-50 transition active:scale-95"
                >
                  {isSubmitting ? "Adding..." : "Add Membership"}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Edit Membership Modal — also rounded for consistency */}
      {showEditModal && editingMembership && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4"
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
          onClick={handleEditBackdropClick}
        >
          <div className="bg-white rounded-[2rem] w-full max-w-md max-h-[85vh] overflow-hidden shadow-2xl relative">
            <div className="bg-white px-4 sm:px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg sm:text-xl font-bold text-gray-800">Edit Membership</h2>
              <button onClick={closeEditModal} className="text-gray-400 hover:text-gray-600 p-1">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleEditMembership} className="p-4 sm:p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Membership Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editingMembership.name}
                  onChange={(e) => setEditingMembership((prev: any) => ({ ...prev, name: e.target.value }))}
                  className={`w-full rounded-full border px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[#005f63]/30 text-sm sm:text-base ${
                    editFormErrors.name ? "border-red-500" : "border-gray-300"
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
                  rows={3}
                  className="w-full rounded-3xl border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[#005f63]/30 resize-none text-sm sm:text-base"
                  placeholder="Describe the membership benefits and requirements..."
                />
              </div>

              <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={closeEditModal}
                  className="px-4 py-2 rounded-full border border-gray-300 text-gray-700 hover:bg-gray-50 transition active:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-full bg-[#005f63] text-white hover:bg-[#004a4d] disabled:opacity-50 transition active:scale-95"
                >
                  {isSubmitting ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
