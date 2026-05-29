import { useState } from "react";
import { KeyRound } from "lucide-react";

interface SettingsViewProps {
  member: {
    id: string;
    name: string;
  };
}

export default function SettingsView({ member }: SettingsViewProps) {
  const [newPassword, setNewPassword]       = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwError, setPwError]               = useState("");
  const [pwSuccess, setPwSuccess]           = useState("");
  const [pwLoading, setPwLoading]           = useState(false);

  const passwordsMatch = confirmPassword.length > 0 && newPassword === confirmPassword;
  const passwordsMismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;

  const handleChangePassword = async () => {
    setPwError("");
    setPwSuccess("");

    if (newPassword.length < 8) {
      setPwError("Password must be at least 8 characters.");
      return;
    }
    if (!passwordsMatch) {
      setPwError("Passwords do not match.");
      return;
    }

    setPwLoading(true);
    try {
      const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute("content");

      const res = await fetch(`/users/${member.id}/change-password`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "X-Requested-With": "XMLHttpRequest",
          ...(csrfToken && { "X-CSRF-TOKEN": csrfToken }),
        },
        body: JSON.stringify({
          new_password:              newPassword,
          new_password_confirmation: confirmPassword,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setPwSuccess("Password updated successfully!");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        setPwError(data.message || "Update failed.");
      }
    } catch {
      setPwError("Network error. Please try again.");
    } finally {
      setPwLoading(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* CHANGE PASSWORD */}
      <div className="overflow-hidden rounded-3xl bg-white shadow-[0_4px_12px_rgba(0,0,0,0.08)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.12)] transition-shadow duration-300">
        <div className="h-1.5 bg-gradient-to-r from-[#ffd33d] via-[#ff9a3c] to-[#28f1ff]" />
        <div className="p-6">
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-orange-500" />
            <h2 className="text-3xl font-black text-[#005f63]">Change Password</h2>
          </div>

          <div className="mt-6 space-y-4">
            {pwError && (
              <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
                {pwError}
              </div>
            )}
            {pwSuccess && (
              <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-600">
                {pwSuccess}
              </div>
            )}

            <div>
              <input
                type="password"
                placeholder="New Password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={pwLoading}
                className="w-full rounded-xl border border-gray-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-orange-300 disabled:opacity-50"
              />
            </div>

            <div>
              <input
                type="password"
                placeholder="Confirm Password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={pwLoading}
                className={`w-full rounded-xl border px-4 py-3 focus:outline-none focus:ring-2 disabled:opacity-50 transition-colors ${
                  passwordsMismatch
                    ? "border-red-400 focus:ring-red-300 bg-red-50"
                    : passwordsMatch
                    ? "border-green-400 focus:ring-green-300 bg-green-50"
                    : "border-gray-200 focus:ring-orange-300"
                }`}
              />
              {passwordsMismatch && (
                <p className="mt-1.5 text-xs text-red-500 font-medium">
                  ✗ Passwords do not match
                </p>
              )}
              {passwordsMatch && (
                <p className="mt-1.5 text-xs text-green-600 font-medium">
                  ✓ Passwords match
                </p>
              )}
            </div>

            <button
              onClick={handleChangePassword}
              disabled={pwLoading || !passwordsMatch}
              className="w-full rounded-xl bg-[#f8a02c] py-3 font-semibold text-white hover:bg-[#fcbd6c] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {pwLoading ? "Updating..." : "Update Password"}
            </button>
          </div>
        </div>
      </div>

      {/* PROFILE SETTINGS */}
      <div className="overflow-hidden rounded-3xl bg-white shadow-[0_4px_12px_rgba(0,0,0,0.08)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.12)] transition-shadow duration-300">
        <div className="h-1.5 bg-gradient-to-r from-[#28f1ff] via-[#ff9a3c] to-[#ffd33d]" />
        <div className="p-6">
          <h2 className="text-3xl font-black text-[#005f63]">Profile</h2>
          <div className="mt-6 space-y-4">
            <input
              type="text"
              defaultValue={member.name}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-orange-300"
            />
            <input
              type="text"
              defaultValue="0917-111-1001"
              className="w-full rounded-xl border border-gray-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-orange-300"
            />
            <input
              type="text"
              disabled
              defaultValue="Member · Resident"
              className="w-full rounded-xl border border-gray-200 bg-gray-100 px-4 py-3 text-gray-600"
            />
            <button className="w-full rounded-xl bg-[#2cb7b7] py-3 font-semibold text-white hover:bg-[#41d1d1] transition-colors">
              Save Profile
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
