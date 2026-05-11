import { SquareMenu } from "lucide-react";

interface TopHeaderProps {
  memberName: string;
}

export default function TopHeader({ memberName }: TopHeaderProps) {
  return (
    <div className="flex items-center justify-between border-b bg-[#f5f3ef] px-6 py-4">
      <div className="flex items-center gap-2">
        <SquareMenu className="h-5 w-5 text-gray-700" />
        <p className="text-[11px] uppercase tracking-[0.2em] text-gray-500 m-0">
          Resident Member Portal
        </p>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="text-xs text-gray-500">Signed in as</p>
          <p className="text-sm font-bold text-[#005f63]">{memberName}</p>
        </div>
        <div className="rounded-full bg-[#2cb7b7] px-4 py-2 text-xs font-black uppercase tracking-wide text-white shadow">
          Member · Resident
        </div>
      </div>
    </div>
  );
}