import React from "react";

export default function SettingsView({ member }: any) {
  return (
    <div className="bg-white p-6 rounded-2xl border shadow-sm">
      <h2 className="text-xl font-bold text-gray-800 mb-4">Account Settings</h2>
      <div className="space-y-4">
        <p><strong>Name:</strong> {member.name}</p>
        <p><strong>Role:</strong> {member.role}</p>
      </div>
    </div>
  );
}