import { KeyRound } from "lucide-react";

interface SettingsViewProps {
  member: {
    id: string;
    name: string;
  };
}

export default function SettingsView({ member }: SettingsViewProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* CHANGE PASSWORD */}
      <div className="overflow-hidden rounded-3xl bg-white shadow-[0_4px_12px_rgba(0,0,0,0.08)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.12)] transition-shadow duration-300">
        <div className="h-1.5 bg-gradient-to-r from-[#ffd33d] via-[#ff9a3c] to-[#28f1ff]"></div>
        <div className="p-6">
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-orange-500" />
            <h2 className="text-3xl font-black text-[#005f63]">Change Password</h2>
          </div>
          <div className="mt-6 space-y-4">
            <input
              type="password"
              placeholder="Current Password"
              className="w-full rounded-xl border border-gray-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-orange-300"
            />
            <input
              type="password"
              placeholder="New Password"
              className="w-full rounded-xl border border-gray-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-orange-300"
            />
            <input
              type="password"
              placeholder="Confirm Password"
              className="w-full rounded-xl border border-gray-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-orange-300"
            />
            <button className="w-full rounded-xl bg-[#f8a02c] py-3 font-semibold text-white hover:bg-[#fcbd6c] transition-colors">
              Update Password
            </button>
          </div>
        </div>
      </div>

      {/* PROFILE SETTINGS */}
      <div className="overflow-hidden rounded-3xl bg-white shadow-[0_4px_12px_rgba(0,0,0,0.08)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.12)] transition-shadow duration-300">
        <div className="h-1.5 bg-gradient-to-r from-[#28f1ff] via-[#ff9a3c] to-[#ffd33d]"></div>
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