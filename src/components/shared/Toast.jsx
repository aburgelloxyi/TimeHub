import React from "react";
import { AlertCircle, X } from "lucide-react";

/**
 * @param {{ toast: { show: boolean, message: string, type: string }, onClose: () => void }} props
 */
export default function Toast({ toast, onClose }) {
  if (!toast.show) return null;

  return (
    <div className="fixed top-4 right-4 z-[9999] animate-slide-in">
      <div
        className={`flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-xl border backdrop-blur-md ${
          toast.type === "success"
            ? "bg-[#1cc1a5]/10 border-[#1cc1a5]/30 text-[#122027]"
            : "bg-rose-50/90 border-rose-200 text-rose-800"
        }`}
      >
        <AlertCircle
          className={`w-5 h-5 shrink-0 ${toast.type === "success" ? "text-[#1cc1a5]" : ""}`}
        />
        <span className="text-sm font-medium">{toast.message}</span>
        <button onClick={onClose} className="ml-2 hover:opacity-70">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
