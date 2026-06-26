import React, { useEffect, useState } from "react";
import { AlertCircle, CheckCircle, Info, AlertTriangle, X } from "lucide-react";
import { subscribeToasts } from "../../lib/toast";

const STYLES = {
  success: { bg: "bg-[#1cc1a5]", Icon: CheckCircle },
  error:   { bg: "bg-rose-500",  Icon: AlertCircle },
  info:    { bg: "bg-[#12a0e1]", Icon: Info },
  warning: { bg: "bg-amber-500", Icon: AlertTriangle },
};

// Global toast renderer — top-right, prominent pill (matches the Legacy style).
export default function ToastHost() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    return subscribeToasts((toast) => {
      setToasts((prev) => [...prev, toast]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id));
      }, 4000);
    });
  }, []);

  const dismiss = (id) => setToasts((prev) => prev.filter((t) => t.id !== id));

  return (
    <div className="fixed top-5 right-5 z-[99999] flex flex-col gap-2.5 pointer-events-none">
      {toasts.map(({ id, message, type }) => {
        const { bg, Icon } = STYLES[type] || STYLES.error;
        return (
          <div
            key={id}
            className={`pointer-events-auto flex items-center gap-3 pl-5 pr-3 py-3.5 rounded-2xl shadow-2xl text-sm font-bold text-white max-w-md animate-in fade-in slide-in-from-top-2 zoom-in-95 duration-300 ${bg}`}
          >
            <Icon className="w-5 h-5 shrink-0" />
            <span className="flex-1">{message}</span>
            <button
              onClick={() => dismiss(id)}
              className="shrink-0 p-1 rounded-lg hover:bg-white/20 transition-colors"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
