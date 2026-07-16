import React from "react";
import * as Sentry from "@sentry/react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

// ---------------------------------------------------------------------------
// AppErrorBoundary — stops one broken page taking the whole app down.
//
// Without a boundary anywhere in the tree, React unmounts everything when a
// render throws: the screen goes white and the only way back is a manual
// reload, with the reason visible solely in the console. Wrapping the page
// content (rather than the whole app) keeps the Rail mounted, so a page that
// fails to render leaves you able to navigate somewhere that still works.
//
// Sentry's boundary is used rather than a hand-rolled one so a caught error is
// reported automatically — it degrades to a plain boundary when no DSN is
// configured (see lib/monitoring.js), so this is safe either way.
// ---------------------------------------------------------------------------

function Fallback({ error, resetError, onGoHome }) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="bg-white rounded-3xl border border-[#dce4ec] shadow-sm max-w-md w-full overflow-hidden">
        <div className="h-1.5 bg-gradient-to-r from-amber-400 to-orange-500" />
        <div className="p-8">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center mb-5">
            <AlertTriangle className="w-7 h-7 text-amber-500" />
          </div>
          <h2 className="font-display text-xl font-bold text-[#122027] tracking-tight">
            This page hit a snag
          </h2>
          <p className="text-sm text-[#768994] mt-2 leading-relaxed">
            Something broke while rendering. The rest of the app is still fine —
            you can retry this page or head back to the hub.
          </p>

          {error?.message && (
            <pre className="mt-4 p-3 rounded-xl bg-slate-50 border border-[#dce4ec] text-[11px] text-[#768994] font-mono whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
              {error.message}
            </pre>
          )}

          <div className="mt-6 flex gap-2">
            <button
              onClick={resetError}
              className="flex-1 flex items-center justify-center gap-2 bg-[#12a0e1] hover:bg-[#0d8bc4] text-white text-sm font-black py-2.5 rounded-xl transition-colors shadow-sm"
            >
              <RefreshCw className="w-4 h-4" /> Try again
            </button>
            {onGoHome && (
              <button
                onClick={() => { resetError(); onGoHome(); }}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-[#768994] hover:text-[#122027] rounded-xl hover:bg-slate-50 border border-[#dce4ec] transition-colors"
              >
                <Home className="w-4 h-4" /> Hub
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AppErrorBoundary({ children, resetKey, onGoHome }) {
  return (
    <Sentry.ErrorBoundary
      // Remounting on resetKey clears a caught error when the user navigates,
      // so a page that broke once doesn't stay broken behind the fallback.
      key={resetKey}
      fallback={({ error, resetError }) => (
        <Fallback error={error} resetError={resetError} onGoHome={onGoHome} />
      )}
    >
      {children}
    </Sentry.ErrorBoundary>
  );
}
