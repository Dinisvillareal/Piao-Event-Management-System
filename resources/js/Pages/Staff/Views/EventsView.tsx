import React from "react";
import { Eye, Trash2 } from "lucide-react";

export function EventsView({ allEvents, onDeleteEvent, highlightText }: any) {
  return (
    <div className="space-y-4">
      {allEvents.map((e: any) => (
        <div key={e.id} className="p-5 bg-white rounded-2xl border shadow-sm flex justify-between items-center">
          <div>
            <h3 className="font-bold text-[#005f63]">{highlightText(e.title, "")}</h3>
            <p className="text-sm text-gray-500">{e.date} · {e.location}</p>
          </div>
          <div className="flex gap-2">
            <button className="p-2 text-teal-700 hover:bg-teal-50 rounded-full"><Eye size={18} /></button>
            <button onClick={() => onDeleteEvent(e.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-full"><Trash2 size={18} /></button>
          </div>
        </div>
      ))}
    </div>
  );
}