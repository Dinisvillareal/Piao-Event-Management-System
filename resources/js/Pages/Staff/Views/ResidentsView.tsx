import React, { useState, useMemo, useEffect } from "react";
import { Filter, XCircle } from "lucide-react";
import SearchBar from "../../../Components/UI/SearchBar";
import { availableMemberships } from "../data/mockData";

export default function ResidentsView() {
  const [residentSearch, setResidentSearch] = useState("");
  const [residentFilter, setResidentFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;
  const [showAddForm, setShowAddForm] = useState(false);
  const [viewRecord, setViewRecord] = useState<string | null>(null);
  const [editRecord, setEditRecord] = useState<string | null>(null);
  const [deleteRecord, setDeleteRecord] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const [residentsData, setResidentsData] = useState([
    { id: "R-001", lastName: "Santos", firstName: "Maria", middleName: "Reyes", contactNumber: "0917-123-4567", memberships: "Verified Resident, Women's Association, Senior Citizen, Health Worker", role: "Resident", hasAccount: true, username: "R-001", password: "temp1234", passwordChangedByUser: false, photo: "" },
    { id: "S-001", lastName: "Dela Cruz", firstName: "Juan", middleName: "Garcia", contactNumber: "0918-987-6543", memberships: "Barangay Staff, Peace & Order Team, Treasurer", role: "Staff", hasAccount: true, username: "S-001", password: "temp5678", passwordChangedByUser: true, photo: "" },
    { id: "R-002", lastName: "Reyes", firstName: "Ana", middleName: "Martinez", contactNumber: "0919-111-2222", memberships: "Senior Citizen, Health Worker", role: "Resident", hasAccount: false, username: "", password: "", passwordChangedByUser: false, photo: "" },
  ]);

  // Helpers
  const capitalizeName = (value: string) =>
    value.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");

  const formatContactNumber = (value: string) => {
    const d = value.replace(/\D/g, "").slice(0, 11);
    if (d.length <= 4) return d;
    if (d.length <= 7) return `${d.slice(0, 4)}-${d.slice(4)}`;
    return `${d.slice(0, 4)}-${d.slice(4, 7)}-${d.slice(7)}`;
  };

  const getMembershipBadgeStyle = (name: string) => {
    const colors = ["bg-teal-50 text-teal-800", "bg-orange-50 text-orange-800", "bg-blue-50 text-blue-800", "bg-purple-50 text-purple-800", "bg-amber-50 text-amber-800", "bg-emerald-50 text-emerald-800"];
    return colors[name.length % colors.length];
  };

  const highlightText = (text: string, query: string) => {
    if (!query.trim()) return text;
    try {
      const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
      const parts = text.split(regex);
      return parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? <mark key={i} className="bg-yellow-300 rounded-sm px-0.5">{part}</mark> : part
      );
    } catch { return text; }
  };

  // New Resident Form
  const [newResident, setNewResident] = useState({ firstName: "", middleName: "", lastName: "", contactNumber: "", hasMemberships: false, selectedMemberships: [] as string[], photo: "" });

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>, isEdit = false) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { alert("Please upload an image file only."); e.target.value = ""; return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const photoUrl = ev.target?.result as string;
      if (isEdit) setEditingResident((p) => ({ ...p, photo: photoUrl }));
      else setNewResident((p) => ({ ...p, photo: photoUrl }));
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleRemovePhoto = (isEdit = false) => {
    if (isEdit) setEditingResident((p) => ({ ...p, photo: "" }));
    else setNewResident((p) => ({ ...p, photo: "" }));
  };

  const validateAddForm = () => {
    const errors: Record<string, string> = {};
    if (!newResident.firstName.trim()) errors.firstName = "First name is required";
    if (!newResident.lastName.trim()) errors.lastName = "Last name is required";
    const raw = newResident.contactNumber.replace(/\D/g, "");
    if (!raw) errors.contactNumber = "Contact number is required";
    else if (raw.length !== 11) errors.contactNumber = "Must be exactly 11 digits";
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleAddResident = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateAddForm()) return;
    const newId = residentsData.length > 0
      ? `R-${String(Number(residentsData[residentsData.length - 1].id.split("-")[1]) + 1).padStart(3, "0")}`
      : "R-001";
    setResidentsData((prev) => [...prev, { id: newId, firstName: newResident.firstName, middleName: newResident.middleName, lastName: newResident.lastName, contactNumber: newResident.contactNumber, memberships: newResident.hasMemberships ? newResident.selectedMemberships.join(", ") : "", role: "Resident", hasAccount: false, username: "", password: "", passwordChangedByUser: false, photo: newResident.photo }]);
    setNewResident({ firstName: "", middleName: "", lastName: "", contactNumber: "", hasMemberships: false, selectedMemberships: [], photo: "" });
    setFormErrors({});
    setShowAddForm(false);
  };

  // Edit Form
  const [editingResident, setEditingResident] = useState({ firstName: "", middleName: "", lastName: "", contactNumber: "", hasMemberships: false, selectedMemberships: [] as string[], hasAccount: false, username: "", password: "", role: "Resident", passwordChangedByUser: false, photo: "" });

  const validateEditForm = () => {
    const errors: Record<string, string> = {};
    if (!editingResident.firstName.trim()) errors.firstName = "First name is required";
    if (!editingResident.lastName.trim()) errors.lastName = "Last name is required";
    const raw = editingResident.contactNumber.replace(/\D/g, "");
    if (!raw) errors.contactNumber = "Contact number is required";
    else if (raw.length !== 11) errors.contactNumber = "Must be exactly 11 digits";
    if (editingResident.hasAccount && !editingResident.passwordChangedByUser && !editingResident.password.trim()) errors.password = "Password is required";
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleUpdateResident = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editRecord || !validateEditForm()) return;
    setResidentsData((prev) => prev.map((r) =>
      r.id === editRecord
        ? { ...r, firstName: editingResident.firstName, middleName: editingResident.middleName, lastName: editingResident.lastName, contactNumber: editingResident.contactNumber, memberships: editingResident.hasMemberships ? editingResident.selectedMemberships.join(", ") : "", role: r.passwordChangedByUser ? r.role : editingResident.role, hasAccount: editingResident.hasAccount, username: editingResident.hasAccount ? (r.username || r.id) : "", password: r.passwordChangedByUser ? r.password : editingResident.password, passwordChangedByUser: r.passwordChangedByUser, photo: editingResident.photo }
        : r
    ));
    setEditRecord(null);
    setFormErrors({});
  };

  const handleDeleteResident = () => {
    if (!deleteRecord) return;
    setResidentsData((prev) => prev.filter((r) => r.id !== deleteRecord));
    setDeleteRecord(null);
  };

  const handleMembershipChange = (e: React.ChangeEvent<HTMLInputElement>, isEdit = false) => {
    const value = e.target.value;
    if (isEdit) {
      setEditingResident((prev) => ({ ...prev, selectedMemberships: prev.selectedMemberships.includes(value) ? prev.selectedMemberships.filter((m) => m !== value) : [...prev.selectedMemberships, value] }));
    } else {
      setNewResident((prev) => ({ ...prev, selectedMemberships: prev.selectedMemberships.includes(value) ? prev.selectedMemberships.filter((m) => m !== value) : [...prev.selectedMemberships, value] }));
    }
  };

  // Change detection
  const [initialEditData, setInitialEditData] = useState<any>(null);
  const [initialAddData, setInitialAddData] = useState<any>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState<"edit" | "add" | null>(null);

  const hasEditChanges = useMemo(() => initialEditData ? JSON.stringify(initialEditData) !== JSON.stringify(editingResident) : false, [initialEditData, editingResident]);
  const hasAddChanges = useMemo(() => initialAddData ? JSON.stringify(initialAddData) !== JSON.stringify(newResident) : false, [initialAddData, newResident]);

  useEffect(() => {
    if (!editRecord) { setInitialEditData(null); return; }
    const r = residentsData.find((x) => x.id === editRecord);
    if (!r) return;
    const state = { firstName: r.firstName, middleName: r.middleName, lastName: r.lastName, contactNumber: r.contactNumber, hasMemberships: r.memberships.trim().length > 0, selectedMemberships: r.memberships.split(",").map((m) => m.trim()).filter(Boolean), hasAccount: r.hasAccount, username: r.username, password: r.password, role: r.role, passwordChangedByUser: r.passwordChangedByUser, photo: r.photo };
    setEditingResident(state);
    setInitialEditData(JSON.parse(JSON.stringify(state)));
  }, [editRecord, residentsData]);

  const handleOpenAddForm = () => {
    const empty = { firstName: "", middleName: "", lastName: "", contactNumber: "", hasMemberships: false, selectedMemberships: [] as string[], photo: "" };
    setNewResident(empty);
    setInitialAddData(JSON.parse(JSON.stringify(empty)));
    setShowAddForm(true);
  };

  const handleCancelEdit = () => {
    if (hasEditChanges) setShowCancelConfirm("edit");
    else { setEditRecord(null); setFormErrors({}); }
  };

  const handleCancelAdd = () => {
    if (hasAddChanges) setShowCancelConfirm("add");
    else { setShowAddForm(false); setFormErrors({}); }
  };

  // Filter + Pagination
  const filteredResidents = useMemo(() => {
    let result = residentsData;
    if (residentFilter === "residents") result = result.filter((r) => r.role === "Resident");
    if (residentFilter === "staff") result = result.filter((r) => r.role === "Staff");
    if (residentFilter === "with-account") result = result.filter((r) => r.hasAccount);
    if (residentFilter === "no-account") result = result.filter((r) => !r.hasAccount);
    if (residentSearch.trim()) {
      const q = residentSearch.toLowerCase();
      result = result.filter((r) => [r.id, r.lastName, r.firstName, r.middleName, r.contactNumber, r.memberships, r.role].some((f) => f.toLowerCase().includes(q)));
    }
    return result;
  }, [residentsData, residentFilter, residentSearch]);

  const totalPages = useMemo(() => Math.ceil(filteredResidents.length / itemsPerPage), [filteredResidents]);
  const paginatedResidents = useMemo(() => filteredResidents.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage), [filteredResidents, currentPage]);
  useMemo(() => setCurrentPage(1), [residentSearch, residentFilter]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#fcfcf9] pt-2 pb-4 px-1 shadow-b-sm">
        <div className="w-[1200px]">
          <h1 className="text-4xl font-black text-[#005f63]">Residents Master List</h1>
          <p className="text-sm text-[#667777] mt-1">Manage all registered residents, staff, and their account status.</p>

          <div className="mt-4 flex items-center gap-4 w-[1580px]">
            <div className="flex-1">
              <SearchBar value={residentSearch} onChange={setResidentSearch} placeholder="Search by ID, name, contact, role or membership..." />
            </div>
            <div className="relative">
              <select
                value={residentFilter}
                onChange={(e) => setResidentFilter(e.target.value)}
                className="h-14 pl-10 pr-8 rounded-full border border-[#005f63]/20 bg-white text-base shadow-sm focus:outline-none appearance-none"
              >
                <option value="all">All Records</option>
                <option value="residents">Residents</option>
                <option value="staff">Staff</option>
                <option value="with-account">Has Account</option>
                <option value="no-account">No Account</option>
              </select>
              <Filter className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-[#005f63]/70 pointer-events-none" />
              <svg className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#005f63]/70 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>

          <p className="mt-2 text-xs text-gray-500">
            {filteredResidents.length} of {residentsData.length} record(s) match — showing {itemsPerPage} per page.
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="pl-1">
        <div className="flex justify-end mb-3">
          <button onClick={handleOpenAddForm} className="bg-[#005f63] hover:bg-[#004a4d] text-white px-5 py-2.5 rounded-full font-medium transition shadow-sm">
            + Add New Resident
          </button>
        </div>

        <div className="relative rounded-[20px] bg-white shadow-lg overflow-hidden">
          <div className="h-1 w-full bg-gradient-to-r from-[#3d9085] via-[#FFC107] to-[#00897B] absolute top-0 left-0 right-0"></div>
          <div className="p-5 pt-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#eee8e0]">
                  {["ID", "Last Name", "First Name", "Middle Name", "Contact Number", "Memberships", "Role", "Has Account?", "Actions"].map((h) => (
                    <th key={h} className={`py-3 px-2 font-bold text-[#005f63] whitespace-nowrap ${h === "Actions" ? "text-right" : "text-left"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginatedResidents.length === 0 ? (
                  <tr><td colSpan={9} className="py-6 text-center text-gray-500 italic">No records match your search or filter.</td></tr>
                ) : (
                  paginatedResidents.map((r) => {
                    const allMems = r.memberships ? r.memberships.split(",").map((m) => m.trim()).filter(Boolean) : [];
                    const visible = allMems.slice(0, 2);
                    const extra = allMems.length - 2;
                    return (
                      <tr key={r.id} className="border-b border-[#eee8e0] transition-all duration-200 hover:bg-teal-50/100 hover:shadow-md hover:rounded-lg">
                        <td className="py-3 px-2 font-mono text-gray-700">{highlightText(r.id, residentSearch)}</td>
                        <td className="py-3 px-2 font-medium text-gray-800">{highlightText(r.lastName, residentSearch)}</td>
                        <td className="py-3 px-2 text-gray-700">{highlightText(r.firstName, residentSearch)}</td>
                        <td className="py-3 px-2 text-gray-700">{highlightText(r.middleName, residentSearch)}</td>
                        <td className="py-3 px-2 text-gray-600">{highlightText(r.contactNumber, residentSearch)}</td>
                        <td className="py-3 px-2">
                          <div className="flex flex-wrap gap-1.5 items-center">
                            {visible.map((m, i) => <span key={i} className={`px-2 py-1 rounded-full text-xs font-medium ${getMembershipBadgeStyle(m)}`}>{highlightText(m, residentSearch)}</span>)}
                            {extra > 0 && <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">+{extra} more</span>}
                            {allMems.length === 0 && <span className="text-gray-400 text-xs">None</span>}
                          </div>
                        </td>
                        <td className="py-3 px-2">
                          <span className={`px-2 py-1 rounded-full text-xs font-semibold ${r.role === "Staff" ? "bg-orange-100 text-orange-800" : "bg-teal-50 text-teal-800"}`}>
                            {highlightText(r.role, residentSearch)}
                            {r.passwordChangedByUser && <span className="ml-1 text-yellow-600 text-[10px] font-bold">🔒</span>}
                          </span>
                        </td>
                        <td className="py-3 px-2">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${r.hasAccount ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                            {r.hasAccount ? "✅ Yes" : "❌ No"}
                          </span>
                        </td>
                        <td className="py-3 px-2 text-right">
                          <div className="inline-flex gap-1">
                            <button onClick={() => setViewRecord(r.id)} className="p-2 rounded-full hover:bg-teal-50 transition" title="View">
                              <svg width="16" height="16" fill="none" stroke="#006666" strokeWidth={2} viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                            </button>
                            <button onClick={() => setEditRecord(r.id)} className="p-2 rounded-full hover:bg-orange-50 transition" title="Edit">
                              <svg width="16" height="16" fill="none" stroke="#f59e0b" strokeWidth={2} viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                            </button>
                            <button onClick={() => setDeleteRecord(r.id)} className="p-2 rounded-full hover:bg-red-50 transition" title="Delete">
                              <svg width="16" height="16" fill="none" stroke="#ef4444" strokeWidth={2} viewBox="0 0 24 24"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* View Modal */}
        {viewRecord && (() => {
          const r = residentsData.find((x) => x.id === viewRecord)!;
          const allMems = r.memberships ? r.memberships.split(",").map((m) => m.trim()).filter(Boolean) : [];
          return (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
              <div className="bg-white rounded-[30px] w-full max-w-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-2xl font-black text-[#005f63]">Record Details</h2>
                  <button onClick={() => setViewRecord(null)} className="text-gray-500 hover:text-gray-700"><XCircle size={20} /></button>
                </div>
                <div className="text-sm">
                  <div className="flex gap-6">
                    <div className="flex-1 space-y-2">
                      <p><strong className="text-[#005f63]">ID:</strong> {r.id}</p>
                      <p><strong className="text-[#005f63]">Full Name:</strong> {r.lastName}, {r.firstName} {r.middleName}</p>
                      <p><strong className="text-[#005f63]">Contact:</strong> {r.contactNumber}</p>
                      <p><strong className="text-[#005f63]">Role:</strong> {r.role} {r.passwordChangedByUser && <span className="text-yellow-600 font-bold">(Locked)</span>}</p>
                      <p><strong className="text-[#005f63]">Has Account:</strong> {r.hasAccount ? "Yes" : "No"}</p>
                      {r.hasAccount && (<><p><strong className="text-[#005f63]">Username:</strong> {r.username}</p><p><strong className="text-[#005f63]">Password:</strong> {r.passwordChangedByUser ? "•••••••• (changed by user — hidden)" : r.password}</p></>)}
                    </div>
                    <div className="w-[160px]">
                      <div className="w-full rounded-lg overflow-hidden border border-gray-200 bg-gray-50" style={{ minHeight: "180px" }}>
                        {r.photo ? <img src={r.photo} alt="ID Photo" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs text-center p-2">No photo uploaded</div>}
                      </div>
                    </div>
                  </div>
                  <div className="mt-6">
                    <strong className="text-[#005f63] block mb-2">Memberships:</strong>
                    <div className="flex flex-wrap gap-1.5">
                      {allMems.length > 0 ? allMems.map((m, i) => <span key={i} className={`px-2 py-1 rounded-full text-xs font-medium ${getMembershipBadgeStyle(m)}`}>{m}</span>) : <span className="text-gray-500">None</span>}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Edit Modal */}
        {editRecord && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
            <div className="bg-white rounded-[30px] w-full max-w-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-black text-[#005f63]">Edit Resident / Staff</h2>
                <button onClick={handleCancelEdit} className="text-gray-500 hover:text-gray-700"><XCircle size={20} /></button>
              </div>
              <form onSubmit={handleUpdateResident} className="space-y-4">
                <div className="grid md:grid-cols-3 gap-4">
                  {(["firstName", "middleName", "lastName"] as const).map((field) => (
                    <div key={field}>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{field === "firstName" ? "First Name *" : field === "middleName" ? "Middle Name" : "Last Name *"}</label>
                      <input type="text" required={field !== "middleName"} value={editingResident[field]} onChange={(e) => setEditingResident((p) => ({ ...p, [field]: capitalizeName(e.target.value) }))} className={`w-full rounded-full border px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#005f63]/30 ${(formErrors as any)[field] ? "border-red-500" : "border-gray-200"}`} />
                      {(formErrors as any)[field] && <p className="text-red-500 text-xs mt-1">{(formErrors as any)[field]}</p>}
                    </div>
                  ))}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Contact Number *</label>
                  <input type="text" required value={editingResident.contactNumber} onChange={(e) => setEditingResident((p) => ({ ...p, contactNumber: formatContactNumber(e.target.value) }))} className={`w-full rounded-full border px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#005f63]/30 ${formErrors.contactNumber ? "border-red-500" : "border-gray-200"}`} placeholder="09XX-XXX-XXXX" />
                  {formErrors.contactNumber && <p className="text-red-500 text-xs mt-1">{formErrors.contactNumber}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ID Photo</label>
                  <input type="file" accept="image/*" onChange={(e) => handlePhotoChange(e, true)} className="w-full text-sm text-gray-500 file:mr-2 file:py-1 file:px-2 file:rounded-full file:border-0 file:bg-[#005f63]/10 file:text-[#005f63]" />
                  {editingResident.photo && (
                    <div className="relative inline-block mt-2">
                      <img src={editingResident.photo} alt="Preview" className="h-20 rounded border" />
                      <button type="button" onClick={() => handleRemovePhoto(true)} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold shadow">×</button>
                    </div>
                  )}
                </div>
                <div className="border-t border-b py-3 space-y-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={editingResident.hasMemberships} onChange={(e) => setEditingResident((p) => ({ ...p, hasMemberships: e.target.checked }))} className="w-4 h-4 text-[#005f63]" />
                    <span className="font-medium text-gray-700">Has Memberships?</span>
                  </label>
                  {editingResident.hasMemberships && (
                    <div className="pl-6 grid grid-cols-2 gap-2">
                      {availableMemberships.map((mem, idx) => (
                        <label key={idx} className="flex items-center gap-2 text-sm cursor-pointer">
                          <input type="checkbox" value={mem} checked={editingResident.selectedMemberships.includes(mem)} onChange={(e) => handleMembershipChange(e, true)} className="w-4 h-4 text-[#005f63]" />
                          <span>{mem}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                {editingResident.hasAccount && (
                  <div className="pl-6 space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                      <input type="text" value={editingResident.username || editRecord} readOnly className="w-full rounded-full border border-gray-200 bg-gray-100 px-4 py-2.5 text-gray-600" />
                      <p className="text-xs text-gray-500 mt-1">* Username is automatically set to ID and cannot be changed</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
                      <input type="text" value={editingResident.passwordChangedByUser ? "••••••••" : editingResident.password} onChange={(e) => !editingResident.passwordChangedByUser && setEditingResident((p) => ({ ...p, password: e.target.value }))} readOnly={editingResident.passwordChangedByUser} className={`w-full rounded-full border px-4 py-2.5 ${editingResident.passwordChangedByUser ? "bg-gray-100 text-gray-500 border-gray-200" : "border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#005f63]/30"}`} />
                      {editingResident.passwordChangedByUser ? <p className="text-xs text-gray-500 mt-1">* Password already changed by user</p> : formErrors.password && <p className="text-red-500 text-xs mt-1">{formErrors.password}</p>}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Role *</label>
                      <select required={editingResident.hasAccount} value={editingResident.role} onChange={(e) => setEditingResident((p) => ({ ...p, role: e.target.value }))} disabled={editingResident.passwordChangedByUser} className={`w-full rounded-full border px-4 py-2.5 focus:outline-none ${editingResident.passwordChangedByUser ? "bg-gray-100 text-gray-500 border-gray-200 cursor-not-allowed" : "border-gray-200 focus:ring-2 focus:ring-[#005f63]/30"}`}>
                        <option value="Resident">Resident</option>
                        <option value="Staff">Staff</option>
                      </select>
                    </div>
                  </div>
                )}
                <div className="flex justify-between gap-3 pt-2">
                  <button type="button" onClick={handleCancelEdit} className="px-5 py-2.5 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50 transition">Cancel</button>
                  <button type="submit" disabled={!hasEditChanges} className={`px-5 py-2.5 rounded-full transition ${hasEditChanges ? "bg-[#005f63] text-white hover:bg-[#004d4d]" : "bg-gray-200 text-gray-400 cursor-not-allowed"}`}>Save Changes</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Delete Confirm Modal */}
        {deleteRecord && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
            <div className="bg-white rounded-[30px] w-full max-w-lg p-6 shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <div><p className="text-xl font-black text-[#b91c1c]">Confirm Delete</p><p className="text-sm text-gray-600 mt-1">This action cannot be undone.</p></div>
                <button onClick={() => setDeleteRecord(null)} className="text-gray-500 hover:text-gray-700"><XCircle size={20} /></button>
              </div>
              <p className="text-sm text-gray-700 mb-5">Are you sure you want to delete record <strong>{deleteRecord}</strong>?</p>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setDeleteRecord(null)} className="px-5 py-2.5 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50 transition">Cancel</button>
                <button type="button" onClick={handleDeleteResident} className="px-5 py-2.5 rounded-full bg-red-600 text-white hover:bg-red-700 transition">Delete</button>
              </div>
            </div>
          </div>
        )}

        {/* Add Form Modal */}
        {showAddForm && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white rounded-[30px] w-full max-w-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-black text-[#005f63]">Add New Resident / Staff</h2>
                <button onClick={handleCancelAdd} className="text-gray-500 hover:text-gray-700"><XCircle size={20} /></button>
              </div>
              <form onSubmit={handleAddResident} className="space-y-4">
                <div className="grid md:grid-cols-3 gap-4">
                  {(["firstName", "middleName", "lastName"] as const).map((field) => (
                    <div key={field}>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{field === "firstName" ? "First Name *" : field === "middleName" ? "Middle Name" : "Last Name *"}</label>
                      <input type="text" required={field !== "middleName"} value={newResident[field]} onChange={(e) => setNewResident((p) => ({ ...p, [field]: capitalizeName(e.target.value) }))} className={`w-full rounded-full border px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#005f63]/30 ${(formErrors as any)[field] ? "border-red-500" : "border-gray-200"}`} />
                      {(formErrors as any)[field] && <p className="text-red-500 text-xs mt-1">{(formErrors as any)[field]}</p>}
                    </div>
                  ))}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Contact Number *</label>
                  <input type="text" required value={newResident.contactNumber} onChange={(e) => setNewResident((p) => ({ ...p, contactNumber: formatContactNumber(e.target.value) }))} className={`w-full rounded-full border px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#005f63]/30 ${formErrors.contactNumber ? "border-red-500" : "border-gray-200"}`} placeholder="09XX-XXX-XXXX" />
                  {formErrors.contactNumber && <p className="text-red-500 text-xs mt-1">{formErrors.contactNumber}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ID Photo</label>
                  <input type="file" accept="image/*" onChange={handlePhotoChange} className="w-full text-sm text-gray-500 file:mr-2 file:py-1 file:px-2 file:rounded-full file:border-0 file:bg-[#005f63]/10 file:text-[#005f63]" />
                  {newResident.photo && (
                    <div className="relative inline-block mt-3">
                      <img src={newResident.photo} alt="ID Preview" className="h-28 w-auto rounded-lg border border-gray-200 object-cover shadow-sm" />
                      <button type="button" onClick={() => handleRemovePhoto(false)} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold shadow-md hover:bg-red-600 transition">×</button>
                    </div>
                  )}
                  <p className="text-xs text-gray-500 mt-1">* Only 1 image file allowed (JPG, PNG, GIF)</p>
                </div>
                <div className="border-t border-b py-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={newResident.hasMemberships} onChange={(e) => setNewResident((p) => ({ ...p, hasMemberships: e.target.checked }))} className="w-4 h-4 text-[#005f63]" />
                    <span className="font-medium text-gray-700">Has Memberships?</span>
                  </label>
                  {newResident.hasMemberships && (
                    <div className="mt-3 pl-6 grid grid-cols-2 gap-2">
                      {availableMemberships.map((mem, idx) => (
                        <label key={idx} className="flex items-center gap-2 text-sm cursor-pointer">
                          <input type="checkbox" value={mem} checked={newResident.selectedMemberships.includes(mem)} onChange={handleMembershipChange} className="w-4 h-4 text-[#005f63]" />
                          <span>{mem}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={handleCancelAdd} className="px-5 py-2.5 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50 transition">Cancel</button>
                  <button type="submit" disabled={!hasAddChanges} className={`px-5 py-2.5 rounded-full transition ${hasAddChanges ? "bg-[#005f63] text-white hover:bg-[#004d4d]" : "bg-gray-200 text-gray-400 cursor-not-allowed"}`}>Save Record</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Unsaved Changes Confirm */}
        {showCancelConfirm && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] px-4">
            <div className="bg-white rounded-[30px] w-full max-w-md p-6 shadow-2xl">
              <h3 className="text-lg font-bold text-gray-800 mb-2">Discard changes?</h3>
              <p className="text-sm text-gray-600 mb-6">You have unsaved changes. If you leave now, your changes will be lost.</p>
              <div className="flex justify-end gap-3">
                <button onClick={() => setShowCancelConfirm(null)} className="px-5 py-2.5 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50 transition">Keep Editing</button>
                <button onClick={() => { setShowCancelConfirm(null); if (showCancelConfirm === "edit") { setEditRecord(null); setFormErrors({}); } else { setShowAddForm(false); setFormErrors({}); } }} className="px-5 py-2.5 rounded-full bg-red-600 text-white hover:bg-red-700 transition">Discard</button>
              </div>
            </div>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-8">
            <button onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))} disabled={currentPage === 1} className="px-2.5 py-1.5 rounded-lg border bg-white text-[#005f63] text-xs font-medium disabled:opacity-40 hover:bg-orange-50 transition">Previous</button>
            {Array.from({ length: totalPages }, (_, i) => (
              <button key={i + 1} onClick={() => setCurrentPage(i + 1)} className={`w-7 h-7 rounded-lg text-xs font-semibold transition ${currentPage === i + 1 ? "bg-[#005f63] text-white shadow-sm" : "bg-white border text-[#005f63] hover:bg-orange-50"}`}>{i + 1}</button>
            ))}
            <button onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))} disabled={currentPage === totalPages} className="px-2.5 py-1.5 rounded-lg border bg-white text-[#005f63] text-xs font-medium disabled:opacity-40 hover:bg-orange-50 transition">Next</button>
            <span className="text-xs text-gray-600 ml-1.5">Page {currentPage} of {totalPages}</span>
          </div>
        )}
      </div>
    </div>
  );
}