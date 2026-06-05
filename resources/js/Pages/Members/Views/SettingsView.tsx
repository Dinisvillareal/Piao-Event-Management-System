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
    <div className="max-w-xl">
      {/* CHANGE PASSWORD — TEAL THEME MATCHING PROFILE SETTINGS */}
      <div className="overflow-hidden rounded-3xl bg-white shadow-[8px_8px_6px_rgba(0,0,0,0.10)] hover:shadow-[12px_12px_18px_rgba(0,0,0,0.20)] transition-shadow duration-300">
        <div className="h-1.5 bg-gradient-to-r from-[#067a7a] via-[#3ec5c5] to-orange-300" />
        <div className="p-10">
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-[#005f63]" />
            <h2 className="text-3xl font-black text-[#005f63]">Change Password</h2>
          </div>

          <div className="mt-6 space-y-4">
            {pwError && (
              <div className="rounded-full bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
                {pwError}
              </div>
            )}
            {pwSuccess && (
              <div className="rounded-full bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-600">
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
                className="w-full rounded-full border border-gray-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#9acace] disabled:opacity-50"
              />
            </div>

            <div>
              <input
                type="password"
                placeholder="Confirm Password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={pwLoading}
                className={`w-full rounded-full border px-4 py-3 focus:outline-none focus:ring-2 disabled:opacity-50 transition-colors ${
                  passwordsMismatch
                    ? "border-red-400 focus:ring-red-300 bg-red-50"
                    : passwordsMatch
                    ? "border-green-400 focus:ring-green-300 bg-green-50"
                    : "border-gray-200 focus:ring-[#9acace]"
                }`}
              />
              {passwordsMismatch && (
                <p className="mt-1.5 text-xs text-red-500 font-medium px-2">
                  ✗ Passwords do not match
                </p>
              )}
              {passwordsMatch && (
                <p className="mt-1.5 text-xs text-green-600 font-medium px-2">
                  ✓ Passwords match
                </p>
              )}
            </div>

            <button
              onClick={handleChangePassword}
              disabled={pwLoading || !passwordsMatch}
              className="w-full rounded-full bg-[#2cb7b7] py-3 font-semibold text-white hover:bg-[#41d1d1] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {pwLoading ? "Updating..." : "Update Password"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
