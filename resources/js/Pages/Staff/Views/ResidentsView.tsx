import React, { useState, useMemo, useEffect } from "react";
import { Filter, XCircle } from "lucide-react";
import SearchBar from "../../../Components/UI/SearchBar";

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
  const [residentsData, setResidentsData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // ✅ Dynamic from API: {id, name} only
  const [availableMemberships, setAvailableMemberships] = useState<Array<{ id: number; name: string }>>([]);

  // ✅ Fetch memberships from API
  useEffect(() => {
    fetch("/memberships", { headers: { Accept: "application/json" } })
      .then((res) => res.json())
      .then((data) => {
        const list = data.data ? data.data : data;
        setAvailableMemberships(list);
      })
      .catch((err) => console.error("Error loading memberships:", err));
  }, []);

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
    const colors = [
      "bg-teal-50 text-teal-800",
      "bg-orange-50 text-orange-800",
      "bg-blue-50 text-blue-800",
      "bg-purple-50 text-purple-800",
      "bg-amber-50 text-amber-800",
      "bg-emerald-50 text-emerald-800",
    ];
    return colors[name.length % colors.length];
  };

  // ✅ FIXED: safe from null/undefined
  const highlightText = (text: string | null | undefined, query: string) => {
    const safeText = text || "";
    if (!query.trim()) return safeText;
    try {
      const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
      const parts = safeText.split(regex);
      return parts.map((part, i: number) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} className="bg-yellow-300 rounded-sm px-0.5">
            {part}
          </mark>
        ) : (
          part
        )
      );
    } catch {
      return safeText;
    }
  };

  // Fetch Residents
  const fetchResidents = async () => {
    setLoading(true);
    try {
      const res = await fetch("/membership-residents", { headers: { Accept: "application/json" } });
      const data = await res.json();
      const formatted = data.map((item: any) => ({
        id: item.user_code,
        real_id: item.user_id,
        lastName: item.last_name,
        firstName: item.first_name,
        middleName: item.middle_name,
        contactNumber: item.contact_number,
        memberships: item.memberships?.map((m: any) => m.name).join(", ") || "",
        role: item.role,
        hasAccount: item.has_account,
        username: item.user_code,
        password: "",
        passwordChangedByUser: false,
        photo: "",
        is_deleted: item.is_deleted,
      }));
      setResidentsData(formatted);
    } catch (err) {
      console.error("Error fetching residents:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchResidents();
  }, []);

  // Add Form
  const [newResident, setNewResident] = useState({
    firstName: "",
    middleName: "",
    lastName: "",
    contactNumber: "",
    role: "",
    hasAccount: false,
    username: "",
    password: "",
    hasMemberships: false,
    selectedMemberships: [] as number[],
    photo: "",
  });

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>, isEdit = false) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Please upload an image file only.");
      e.target.value = "";
      return;
    }
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
    if (!newResident.role.trim()) errors.role = "Role is required";
    const raw = newResident.contactNumber.replace(/\D/g, "");
    if (!raw) errors.contactNumber = "Contact number is required";
    else if (raw.length !== 11) errors.contactNumber = "Must be exactly 11 digits";
    if (newResident.hasAccount && !newResident.password.trim())
      errors.password = "Password is required when account is enabled";
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleAddResident = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateAddForm()) return;

    const payload = {
      first_name: newResident.firstName,
      middle_name: newResident.middleName,
      last_name: newResident.lastName,
      contact_number: newResident.contactNumber,
      role: newResident.role,
      has_account: newResident.hasAccount,
      ...(newResident.hasAccount && { password: newResident.password }),
    };

    try {
      const res = await fetch("/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-CSRF-TOKEN": document.querySelector('meta[name="csrf-token"]')?.getAttribute("content") || "",
        },
        body: JSON.stringify(payload),
      });
      const user = await res.json();

      if (newResident.hasMemberships && newResident.selectedMemberships.length > 0) {
        await fetch("/membership-residents", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "X-CSRF-TOKEN": document.querySelector('meta[name="csrf-token"]')?.getAttribute("content") || "",
          },
          body: JSON.stringify({
            user_id: user.user.id,
            membership_ids: newResident.selectedMemberships,
          }),
        });
      }

      setNewResident({
        firstName: "", middleName: "", lastName: "", contactNumber: "", role: "",
        hasAccount: false, username: "", password: "", hasMemberships: false, selectedMemberships: [], photo: ""
      });
      setFormErrors({});
      setShowAddForm(false);
      fetchResidents();
    } catch (err) {
      console.error("Add error:", err);
    }
  };

  // Edit Form
  const [editingResident, setEditingResident] = useState({
    real_id: "",
    firstName: "",
    middleName: "",
    lastName: "",
    contactNumber: "",
    role: "",
    hasMemberships: false,
    selectedMemberships: [] as number[],
    hasAccount: false,
    username: "",
    password: "",
    passwordChangedByUser: false,
    photo: "",
    is_deleted: false,
  });

  const validateEditForm = () => {
    const errors: Record<string, string> = {};
    if (!editingResident.firstName.trim()) errors.firstName = "First name is required";
    if (!editingResident.lastName.trim()) errors.lastName = "Last name is required";
    if (!editingResident.role.trim()) errors.role = "Role is required";
    const raw = editingResident.contactNumber.replace(/\D/g, "");
    if (!raw) errors.contactNumber = "Contact number is required";
    else if (raw.length !== 11) errors.contactNumber = "Must be exactly 11 digits";
    if (editingResident.hasAccount && !editingResident.passwordChangedByUser && !editingResident.password.trim())
      errors.password = "Password is required";
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleUpdateResident = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editRecord || !validateEditForm()) return;

    try {
      await fetch(`/users/${editingResident.real_id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-CSRF-TOKEN": document.querySelector('meta[name="csrf-token"]')?.getAttribute("content") || "",
        },
        body: JSON.stringify({
          first_name: editingResident.firstName,
          middle_name: editingResident.middleName,
          last_name: editingResident.lastName,
          contact_number: editingResident.contactNumber,
          role: editingResident.role,
          has_account: editingResident.hasAccount,
          ...(editingResident.password && !editingResident.passwordChangedByUser && { password: editingResident.password }),
        }),
      });

      await fetch(`/membership-residents/${editingResident.real_id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-CSRF-TOKEN": document.querySelector('meta[name="csrf-token"]')?.getAttribute("content") || "",
        },
        body: JSON.stringify({
          membership_ids: editingResident.hasMemberships ? editingResident.selectedMemberships : [],
        }),
      });

      setEditRecord(null);
      setFormErrors({});
      fetchResidents();
    } catch (err) {
      console.error("Update error:", err);
    }
  };

  // ✅ Soft Delete
  const handleDeleteResident = async () => {
    if (!deleteRecord) return;
    const rec = residentsData.find((r) => r.id === deleteRecord);
    if (!rec) return;

    try {
      await fetch(`/users/${rec.real_id}`, {
        method: "DELETE",
        headers: {
          Accept: "application/json",
          "X-CSRF-TOKEN": document.querySelector('meta[name="csrf-token"]')?.getAttribute("content") || "",
        },
      });

      setDeleteRecord(null);
      fetchResidents();
    } catch (err) {
      console.error("Delete error:", err);
    }
  };

  // ✅ Restore soft deleted record
  const handleRestoreResident = async (realId: string) => {
    try {
      await fetch(`/users/${realId}/restore`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "X-CSRF-TOKEN": document.querySelector('meta[name="csrf-token"]')?.getAttribute("content") || "",
        },
      });
      fetchResidents();
    } catch (err) {
      console.error("Restore error:", err);
    }
  };

  const handleMembershipChange = (e: React.ChangeEvent<HTMLInputElement>, isEdit = false) => {
    const id = Number(e.target.value);
    if (isEdit) {
      setEditingResident((prev) => ({
        ...prev,
        selectedMemberships: prev.selectedMemberships.includes(id)
          ? prev.selectedMemberships.filter((m) => m !== id)
          : [...prev.selectedMemberships, id],
      }));
    } else {
      setNewResident((prev) => ({
        ...prev,
        selectedMemberships: prev.selectedMemberships.includes(id)
          ? prev.selectedMemberships.filter((m) => m !== id)
          : [...prev.selectedMemberships, id],
      }));
    }
  };

  // Change detection
  const [initialEditData, setInitialEditData] = useState<any>(null);
  const [initialAddData, setInitialAddData] = useState<any>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState<"edit" | "add" | null>(null);

  const hasEditChanges = useMemo(
    () => (initialEditData ? JSON.stringify(initialEditData) !== JSON.stringify(editingResident) : false),
    [initialEditData, editingResident]
  );

  const hasAddChanges = useMemo(
    () => (initialAddData ? JSON.stringify(initialAddData) !== JSON.stringify(newResident) : false),
    [initialAddData, newResident]
  );

  useEffect(() => {
    if (!editRecord) {
      setInitialEditData(null);
      return;
    }
    const r = residentsData.find((x) => x.id === editRecord);
    if (!r) return;

    const currentMemNames = r.memberships ? r.memberships.split(", ").filter(Boolean) : [];
    const currentMemIds = availableMemberships.filter((m) => currentMemNames.includes(m.name)).map((m) => m.id);

    const state = {
      real_id: r.real_id,
      firstName: r.firstName,
      middleName: r.middleName,
      lastName: r.lastName,
      contactNumber: r.contactNumber,
      role: r.role,
      hasMemberships: currentMemNames.length > 0,
      selectedMemberships: currentMemIds,
      hasAccount: r.hasAccount,
      username: r.username,
      password: r.password,
      passwordChangedByUser: r.passwordChangedByUser,
      photo: r.photo,
      is_deleted: r.is_deleted,
    };
    setEditingResident(state);
    setInitialEditData(JSON.parse(JSON.stringify(state)));
  }, [editRecord, residentsData, availableMemberships]);

  const handleOpenAddForm = () => {
    const empty = {
      firstName: "", middleName: "", lastName: "", contactNumber: "", role: "",
      hasAccount: false, username: "", password: "", hasMemberships: false, selectedMemberships: [], photo: ""
    };
    setNewResident(empty);
    setInitialAddData(JSON.parse(JSON.stringify(empty)));
    setShowAddForm(true);
  };

  const handleCancelEdit = () => {
    if (hasEditChanges) setShowCancelConfirm("edit");
    else {
      setEditRecord(null);
      setFormErrors({});
    }
  };

  const handleCancelAdd = () => {
    if (hasAddChanges) setShowCancelConfirm("add");
    else {
      setShowAddForm(false);
      setFormErrors({});
    }
  };

  // Filter + Pagination
  const filteredResidents = useMemo(() => {
    let result = residentsData;
    if (residentFilter === "residents") result = result.filter((r) => r.role === "Resident");
    if (residentFilter === "staff") result = result.filter((r) => r.role === "Staff");
    if (residentFilter === "with-account") result = result.filter((r) => r.hasAccount);
    if (residentFilter === "no-account") result = result.filter((r) => !r.hasAccount);
    if (residentFilter === "trashed") result = result.filter((r) => r.is_deleted);
    if (residentSearch.trim()) {
      const q = residentSearch.toLowerCase();
      result = result.filter((r) =>
        [r.id, r.lastName, r.firstName, r.middleName, r.contactNumber, r.memberships, r.role].some((f) =>
          f?.toLowerCase().includes(q)
        )
      );
    }
    return result;
  }, [residentsData, residentFilter, residentSearch]);

  const totalPages = useMemo(() => Math.ceil(filteredResidents.length / itemsPerPage), [filteredResidents]);
  const paginatedResidents = useMemo(
    () => filteredResidents.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage),
    [filteredResidents, currentPage]
  );
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
                <option value="residents">Role: Resident</option>
                <option value="staff">Role: Staff</option>
                <option value="with-account">Has Account</option>
                <option value="no-account">No Account</option>
                <option value="trashed">Trashed</option>
              </select>
              <Filter className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-[#005f63]/70 pointer-events-none" />
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
          <button
            onClick={handleOpenAddForm}
            className="bg-[#005f63] hover:bg-[#004a4d] text-white px-5 py-2.5 rounded-full font-medium transition shadow-sm"
          >
            + Add New Record
          </button>
        </div>
        <div className="relative rounded-[20px] bg-white shadow-lg overflow-hidden">
          <div className="h-1 w-full bg-gradient-to-r from-[#3d9085] via-[#FFC107] to-[#00897B] absolute top-0 left-0 right-0"></div>
          <div className="p-5 pt-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#eee8e0]">
                  {["ID", "Last Name", "First Name", "Middle Name", "Contact Number", "Memberships", "Role", "Has Account?", "Actions"].map((h) => (
                    <th
                      key={h}
                      className={`py-3 px-2 font-bold text-[#005f63] whitespace-nowrap ${h === "Actions" ? "text-right" : "text-left"}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={9} className="py-6 text-center text-gray-500 italic">Loading...</td></tr>
                ) : paginatedResidents.length === 0 ? (
                  <tr><td colSpan={9} className="py-6 text-center text-gray-500 italic">No records match your search or filter.</td></tr>
                ) : (
                  paginatedResidents.map((r) => {
                    const allMems = r.memberships ? r.memberships.split(", ").map((m: string) => m.trim()).filter(Boolean) : [];
                    const visible = allMems.slice(0, 2);
                    const extra = allMems.length - 2;
                    return (
                      <tr
                        key={r.id}
                        className={`border-b border-[#eee8e0] transition-all duration-200 hover:shadow-md hover:rounded-lg ${
                          r.is_deleted ? "bg-gray-100 text-gray-400 line-through" : "hover:bg-teal-50/100"
                        }`}
                      >
                        <td className="py-3 px-2 font-mono">{highlightText(r.id, residentSearch)}</td>
                        <td className="py-3 px-2 font-medium">{highlightText(r.lastName, residentSearch)}</td>
                        <td className="py-3 px-2">{highlightText(r.firstName, residentSearch)}</td>
                        <td className="py-3 px-2">{highlightText(r.middleName, residentSearch)}</td>
                        <td className="py-3 px-2">{highlightText(r.contactNumber, residentSearch)}</td>
                        <td className="py-3 px-2">
                          <div className="flex flex-wrap gap-1.5 items-center">
               {visible.map((m: string, i: number) => (
  <span key={i} className={`px-2 py-1 rounded-full text-xs font-medium ${getMembershipBadgeStyle(m)}`}>
    {highlightText(m, residentSearch)}
  </span>
))}
                            {extra > 0 && <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">+{extra} more</span>}
                            {allMems.length === 0 && <span className="text-gray-400 text-xs">None</span>}
                          </div>
                        </td>
                        <td className="py-3 px-2">
                          <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                            r.role === "Staff" ? "bg-orange-100 text-orange-800" :
                            r.role === "Resident" ? "bg-teal-50 text-teal-800" :
                            "bg-gray-100 text-gray-800"
                          }`}>
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
                            {!r.is_deleted ? (
                              <>
                                <button onClick={() => setEditRecord(r.id)} className="p-2 rounded-full hover:bg-orange-50 transition" title="Edit">
                                  <svg width="16" height="16" fill="none" stroke="#f59e0b" strokeWidth={2} viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                                </button>
                                <button onClick={() => setDeleteRecord(r.id)} className="p-2 rounded-full hover:bg-red-50 transition" title="Delete">
                                  <svg width="16" height="16" fill="none" stroke="#ef4444" strokeWidth={2} viewBox="0 0 24 24"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                                </button>
                              </>
                            ) : (
                              <button onClick={() => handleRestoreResident(r.real_id)} className="p-2 rounded-full hover:bg-green-50 transition" title="Restore">
                                <svg width="16" height="16" fill="none" stroke="#10b981" strokeWidth={2} viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L13 11h7V4l-2.26 2.26A8.25 8.25 0 0 0 12 3a8 8 0 1 0 8 8Z" /></svg>
                              </button>
                            )}
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
      </div>

      {/* View Modal */}
      {viewRecord && (() => {
        const r = residentsData.find((x) => x.id === viewRecord)!;
        const allMems = r.memberships ? r.memberships.split(", ").map((m: string) => m.trim()).filter(Boolean) : [];
        return (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
            <div className="bg-white rounded-[30px] w-full max-w-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-black text-[#005f63]">Record Details</h2>
                <button onClick={() => setViewRecord(null)} className="text-gray-500 hover:text-gray-700"><XCircle size={20} /></button>
              </div>
              <div className="text-sm">
                {r.is_deleted && <div className="mb-3 p-2 bg-red-100 text-red-700 rounded">⚠️ This record is deleted</div>}
                <div className="flex gap-6">
                  <div className="flex-1 space-y-2">
                    <p><strong className="text-[#005f63]">ID:</strong> {r.id}</p>
                    <p><strong className="text-[#005f63]">Full Name:</strong> {r.lastName}, {r.firstName} {r.middleName}</p>
                    <p><strong className="text-[#005f63]">Contact:</strong> {r.contactNumber}</p>
                    <p><strong className="text-[#005f63]">Role:</strong> {r.role} {r.passwordChangedByUser && <span className="text-yellow-600 font-bold">(Locked)</span>}</p>
                    <p><strong className="text-[#005f63]">Has Account:</strong> {r.hasAccount ? "Yes" : "No"}</p>
                    {r.hasAccount && (<><p><strong className="text-[#005f63]">Username:</strong> {r.username}</p><p><strong className="text-[#005f63]">Password:</strong> {r.passwordChangedByUser ? "•••••••• (changed by user — hidden)" : r.password || "•••••••• (saved)"}</p></>)}
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
                    {allMems.length > 0 ? allMems.map((m: string, i: number) => <span key={i} className={`px-2 py-1 rounded-full text-xs font-medium ${getMembershipBadgeStyle(m)}`}>{m}</span>) : <span className="text-gray-500">None</span>}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Add Modal */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-[30px] w-full max-w-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-black text-[#005f63]">Add New Record</h2>
              <button onClick={handleCancelAdd} className="text-gray-500 hover:text-gray-700"><XCircle size={20} /></button>
            </div>
            <form onSubmit={handleAddResident} className="space-y-4">
              <div className="grid md:grid-cols-3 gap-4">
                {(["firstName", "middleName", "lastName"] as const).map((field) => (
                  <div key={field}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{field === "firstName" ? "First Name *" : field === "middleName" ? "Middle Name" : "Last Name *"}</label>
                    <input
                      type="text"
                      required={field !== "middleName"}
                      value={newResident[field]}
                      onChange={(e) => setNewResident((p) => ({ ...p, [field]: capitalizeName(e.target.value) }))}
                      className={`w-full rounded-full border px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#005f63]/30 ${(formErrors as any)[field] ? "border-red-500" : "border-gray-200"}`}
                    />
                    {(formErrors as any)[field] && <p className="text-red-500 text-xs mt-1">{(formErrors as any)[field]}</p>}
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role *</label>
                {/* ✅ HARDCODED COMBOBOX: Staff / Resident */}
                    <select
                    required
                    value={newResident.role}
                    onChange={(e) => setNewResident((p) => ({ ...p, role: e.target.value }))}
                    className={`w-full rounded-full border px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#005f63]/30 ${formErrors.role ? "border-red-500" : "border-gray-200"}`}
                    >
                    <option value="Resident">Resident</option>
                    <option value="Staff">Staff</option>
                    </select>
                {formErrors.role && <p className="text-red-500 text-xs mt-1">{formErrors.role}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contact Number *</label>
                <input
                  type="text"
                  required
                  value={newResident.contactNumber}
                  onChange={(e) => setNewResident((p) => ({ ...p, contactNumber: formatContactNumber(e.target.value) }))}
                  className={`w-full rounded-full border px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#005f63]/30 ${formErrors.contactNumber ? "border-red-500" : "border-gray-200"}`}
                  placeholder="09XX-XXX-XXXX"
                />
                {formErrors.contactNumber && <p className="text-red-500 text-xs mt-1">{formErrors.contactNumber}</p>}
              </div>

              <div>
                <label className="flex items-center gap-2 cursor-pointer mb-2">
                  <input
                    type="checkbox"
                    checked={newResident.hasAccount}
                    onChange={(e) => setNewResident(prev => ({ ...prev, hasAccount: e.target.checked }))}
                    className="w-4 h-4 text-[#005f63]"
                  />
                  <span className="font-medium text-gray-700">Has Account?</span>
                </label>

                {newResident.hasAccount && (
                  <div className="pl-6 space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                      <input
                        type="text"
                        value={newResident.username}
                        onChange={(e) => setNewResident(prev => ({ ...prev, username: e.target.value }))}
                        className="w-full rounded-full border border-gray-200 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#005f63]/30"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
                      <input
                        type="password"
                        value={newResident.password}
                        onChange={(e) => setNewResident(prev => ({ ...prev, password: e.target.value }))}
                        className={`w-full rounded-full border px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#005f63]/30 ${formErrors.password ? "border-red-500" : "border-gray-200"}`}
                        placeholder="Enter password here"
                      />
                      {formErrors.password && <p className="text-red-500 text-xs mt-1">{formErrors.password}</p>}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ID Photo</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handlePhotoChange(e)}
                  className="w-full text-sm text-gray-500 file:mr-2 file:py-1 file:px-2 file:rounded-full file:border-0 file:bg-[#005f63]/10 file:text-[#005f63]"
                />
                {newResident.photo && (
                  <div className="relative inline-block mt-2">
                    <img src={newResident.photo} alt="Preview" className="h-20 rounded border" />
                    <button
                      type="button"
                      onClick={() => handleRemovePhoto()}
                      className="absolute -top-2 -right-2 bg-gray-200/70 text-gray-500 rounded-full w-6 h-6 flex items-center justify-center text-xs font-semibold border border-gray-300 hover:bg-gray-300/80 transition"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>

              <div className="border-t border-b py-3 space-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newResident.hasMemberships}
                    onChange={(e) => setNewResident((p) => ({ ...p, hasMemberships: e.target.checked }))}
                    className="w-4 h-4 text-[#005f63]"
                  />
                  <span className="font-medium text-gray-700">Has Memberships?</span>
                </label>
                {newResident.hasMemberships && (
                  <div className="pl-6 grid grid-cols-2 gap-2">
                    {availableMemberships.map((mem) => (
                      <label key={mem.id} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          value={mem.id}
                          checked={newResident.selectedMemberships.includes(mem.id)}
                          onChange={(e) => handleMembershipChange(e)}
                          className="w-4 h-4 text-[#005f63]"
                        />
                        <span>{mem.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleCancelAdd}
                  className="px-5 py-2.5 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!hasAddChanges}
                  className={`px-5 py-2.5 rounded-full transition ${hasAddChanges ? "bg-[#005f63] text-white hover:bg-[#004d4d]" : "bg-gray-200 text-gray-400 cursor-not-allowed"}`}
                >
                  Save Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editRecord && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-[30px] w-full max-w-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-black text-[#005f63]">Edit Record</h2>
              <button onClick={handleCancelEdit} className="text-gray-500 hover:text-gray-700"><XCircle size={20} /></button>
            </div>
            {editingResident.is_deleted && <div className="mb-3 p-2 bg-red-100 text-red-700 rounded">⚠️ This record is deleted — editing disabled</div>}
            <form onSubmit={handleUpdateResident} className="space-y-4" style={{ pointerEvents: editingResident.is_deleted ? "none" : "auto", opacity: editingResident.is_deleted ? 0.6 : 1 }}>
              <div className="grid md:grid-cols-3 gap-4">
                {(["firstName", "middleName", "lastName"] as const).map((field) => (
                  <div key={field}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{field === "firstName" ? "First Name *" : field === "middleName" ? "Middle Name" : "Last Name *"}</label>
                    <input
                      type="text"
                      required={field !== "middleName"}
                      value={editingResident[field]}
                      onChange={(e) => setEditingResident((p) => ({ ...p, [field]: capitalizeName(e.target.value) }))}
                      className={`w-full rounded-full border px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#005f63]/30 ${(formErrors as any)[field] ? "border-red-500" : "border-gray-200"}`}
                    />
                    {(formErrors as any)[field] && <p className="text-red-500 text-xs mt-1">{(formErrors as any)[field]}</p>}
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role *</label>
                <select
                required
                value={editingResident.role}
                onChange={(e) => setEditingResident((p) => ({ ...p, role: e.target.value }))}
                className={`w-full rounded-full border px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#005f63]/30 ${formErrors.role ? "border-red-500" : "border-gray-200"}`}
                >
                <option value="Resident">Resident</option>
                <option value="Staff">Staff</option>
                </select>
                {formErrors.role && <p className="text-red-500 text-xs mt-1">{formErrors.role}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contact Number *</label>
                <input
                  type="text"
                  required
                  value={editingResident.contactNumber}
                  onChange={(e) => setEditingResident((p) => ({ ...p, contactNumber: formatContactNumber(e.target.value) }))}
                  className={`w-full rounded-full border px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#005f63]/30 ${formErrors.contactNumber ? "border-red-500" : "border-gray-200"}`}
                  placeholder="09XX-XXX-XXXX"
                />
                {formErrors.contactNumber && <p className="text-red-500 text-xs mt-1">{formErrors.contactNumber}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ID Photo</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handlePhotoChange(e, true)}
                  className="w-full text-sm text-gray-500 file:mr-2 file:py-1 file:px-2 file:rounded-full file:border-0 file:bg-[#005f63]/10 file:text-[#005f63]"
                />
                {editingResident.photo && (
                  <div className="relative inline-block mt-2">
                    <img src={editingResident.photo} alt="Preview" className="h-20 rounded border" />
                    <button
                      type="button"
                      onClick={() => handleRemovePhoto(true)}
                      className="absolute -top-2 -right-2 bg-gray-200/70 text-gray-500 rounded-full w-6 h-6 flex items-center justify-center text-xs font-semibold border border-gray-300 hover:bg-gray-300/80 transition"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>

              <div className="border-t border-b py-3 space-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingResident.hasAccount}
                    onChange={(e) => setEditingResident(prev => ({ ...prev, hasAccount: e.target.checked }))}
                    className="w-4 h-4 text-[#005f63]"
                  />
                  <span className="font-medium text-gray-700">Has Account?</span>
                </label>

                {editingResident.hasAccount && (
                  <div className="pl-6 space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                      <input
                        type="text"
                        value={editingResident.username}
                        onChange={(e) => setEditingResident(prev => ({ ...prev, username: e.target.value }))}
                        className="w-full rounded-full border border-gray-200 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#005f63]/30"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                      <input
                        type="password"
                        value={editingResident.password}
                        onChange={(e) => setEditingResident(prev => ({ ...prev, password: e.target.value }))}
                        disabled={editingResident.passwordChangedByUser}
                        className={`w-full rounded-full border px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#005f63]/30 ${
                          editingResident.passwordChangedByUser
                            ? "bg-gray-100 text-gray-500 border-gray-200"
                            : formErrors.password ? "border-red-500" : "border-gray-200"
                        }`}
                        placeholder={editingResident.passwordChangedByUser ? "Changed by user — cannot edit" : "Enter new password"}
                      />
                      {formErrors.password && <p className="text-red-500 text-xs mt-1">{formErrors.password}</p>}
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editingResident.passwordChangedByUser}
                        onChange={(e) => setEditingResident(prev => ({ ...prev, passwordChangedByUser: e.target.checked }))}
                        className="w-4 h-4 text-[#005f63]"
                      />
                      <span className="text-sm text-gray-600">Password already changed by user</span>
                    </label>
                  </div>
                )}

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                                        type="checkbox"
                    checked={editingResident.hasMemberships}
                    onChange={(e) => setEditingResident((p) => ({ ...p, hasMemberships: e.target.checked }))}
                    className="w-4 h-4 text-[#005f63]"
                  />
                  <span className="font-medium text-gray-700">Has Memberships?</span>
                </label>
                {editingResident.hasMemberships && (
                  <div className="pl-6 grid grid-cols-2 gap-2">
                    {availableMemberships.map((mem) => (
                      <label key={mem.id} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          value={mem.id}
                          checked={editingResident.selectedMemberships.includes(mem.id)}
                          onChange={(e) => handleMembershipChange(e, true)}
                          className="w-4 h-4 text-[#005f63]"
                        />
                        <span>{mem.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="px-5 py-2.5 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!hasEditChanges}
                  className={`px-5 py-2.5 rounded-full transition ${hasEditChanges ? "bg-[#005f63] text-white hover:bg-[#004d4d]" : "bg-gray-200 text-gray-400 cursor-not-allowed"}`}
                >
                  Update Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteRecord && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-[30px] w-full max-w-md p-6 shadow-2xl text-center">
            <div className="mb-4 text-red-500">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">Confirm Deletion</h3>
            <p className="text-sm text-gray-600 mb-6">This action will move the record to trash. You can restore it later if needed.</p>
            <div className="flex justify-center gap-4">
              <button
                onClick={() => setDeleteRecord(null)}
                className="px-5 py-2.5 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteResident}
                className="px-5 py-2.5 rounded-full bg-red-500 text-white hover:bg-red-600 transition"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Changes Confirmation Modal */}
      {showCancelConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-[30px] w-full max-w-md p-6 shadow-2xl text-center">
            <div className="mb-4 text-amber-500">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0 0h.01M12 3v12m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">Unsaved Changes</h3>
            <p className="text-sm text-gray-600 mb-6">You have unsaved changes. Are you sure you want to leave without saving?</p>
            <div className="flex justify-center gap-4">
              <button
                onClick={() => setShowCancelConfirm(null)}
                className="px-5 py-2.5 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50 transition"
              >
                Continue Editing
              </button>
              <button
                onClick={() => {
                  setShowCancelConfirm(null);
                  if (showCancelConfirm === "edit") {
                    setEditRecord(null);
                    setFormErrors({});
                  } else {
                    setShowAddForm(false);
                    setFormErrors({});
                  }
                }}
                className="px-5 py-2.5 rounded-full bg-amber-500 text-white hover:bg-amber-600 transition"
              >
                Discard Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-1">
          <p className="text-sm text-gray-600">
            Page {currentPage} of {totalPages}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="p-2 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={() => setCurrentPage(prev => prev - 1)}
              disabled={currentPage === 1}
              className="p-2 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`w-9 h-9 rounded-full text-sm font-medium transition ${
                  currentPage === page
                    ? "bg-[#005f63] text-white"
                    : "border border-gray-200 text-gray-700 hover:bg-gray-50"
                }`}
              >
                {page}
              </button>
            ))}

            <button
              onClick={() => setCurrentPage(prev => prev + 1)}
              disabled={currentPage === totalPages}
              className="p-2 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="p-2 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path d="M13 5l7 7-7 7M5 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
