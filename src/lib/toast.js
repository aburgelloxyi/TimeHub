// Global toast API — notify() can be called from anywhere (hooks, utilities,
// components). Backed by Sonner for real: stacking, swipe-to-dismiss,
// pause-on-hover, and exit animations, with our own ToastPill markup so the
// brand pill look is unchanged. <ToastHost/> renders Sonner's <Toaster/>.
import React from "react";
import { toast } from "sonner";
import ToastPill from "../components/shared/ToastPill";

// `action` is an optional { label, onClick } button on the pill; a toast with
// one stays longer, since there is something to decide.
export function notify(message, type = "error", { action, duration } = {}) {
  return toast.custom(
    (t) =>
      React.createElement(ToastPill, {
        message,
        type,
        action: action && { label: action.label, onClick: () => { toast.dismiss(t); action.onClick(); } },
        onDismiss: () => toast.dismiss(t),
      }),
    { duration: duration ?? (action ? 9000 : 4000) }
  );
}
