import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { connectGoogle, disconnectGoogle, googleConnected, onGoogleChange } from "../../lib/orderForms/googleApi";
import { googleMessage } from "./GoogleSource";
import { notify } from "../../lib/toast";

// The Google sign-in, always in reach in the page header. A round button with
// Google's G that widens when pointed at (or focused) to say whether this tab
// is connected and offer the one thing to do about it. The sign-in itself was
// only reachable from the "add a film" panel, and whether you were connected
// wasn't shown anywhere.

// Google's mark in one colour: the chip's own text colour, so it is white when
// off and green when on.
function G() {
  return (
    <svg viewBox="0 0 24 24" className="w-[18px] h-[18px] shrink-0" fill="currentColor" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

// The part that slides out. A grid track going from 0 to its content's width
// animates without the content's width having to be known. The padding is on
// the content, inside the clipped box, or it would hold the track open. On a device with no
// hover there is nothing to open it, so it is simply open.
const reveal =
  "grid grid-cols-[0fr] opacity-0 transition-[grid-template-columns,opacity] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none group-hover:grid-cols-[1fr] group-hover:opacity-100 group-focus-within:grid-cols-[1fr] group-focus-within:opacity-100 [@media(hover:none)]:grid-cols-[1fr] [@media(hover:none)]:opacity-100";

export default function GoogleButton() {
  const [connected, setConnected] = useState(googleConnected);
  const [working, setWorking] = useState(false);

  // The sign-in can change from anywhere on the page (Refresh, saving a
  // correction, the add-a-film panel), and it lapses by itself after an hour.
  useEffect(() => {
    const sync = () => setConnected(googleConnected());
    const off = onGoogleChange(sync);
    const timer = setInterval(sync, 30000);
    return () => { off(); clearInterval(timer); };
  }, []);

  const connect = async () => {
    setWorking(true);
    try {
      await connectGoogle();
    } catch (err) {
      // Closing Google's window is a decision, not a fault.
      if (err?.reason !== "cancelled") notify(googleMessage(err), "error");
    } finally {
      setWorking(false);
    }
  };

  const shell = `group flex items-center h-10 rounded-full border overflow-hidden transition-colors duration-300 ${
    // On is the same chip lit green, not a different one: the state reads from
    // the colour and the header keeps one kind of button.
    connected
      ? "bg-emerald-400/20 hover:bg-emerald-400/30 border-emerald-300/60 text-emerald-300 shadow-[0_0_14px_rgb(52_211_153/0.45)] backdrop-blur-sm"
      : "bg-white/15 hover:bg-white/25 border-white/25 text-white backdrop-blur-sm"
  }`;
  const icon = <span className="w-10 h-10 shrink-0 flex items-center justify-center">{working ? <Loader2 className="w-4 h-4 animate-spin" /> : <G />}</span>;

  if (!connected) {
    return (
      <button onClick={connect} disabled={working} aria-label="Connect Google" className={`${shell} press focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70`}>
        {icon}
        <span className={reveal}>
          <span className="overflow-hidden">
            <span className="block whitespace-nowrap text-sm font-bold pr-4">{working ? "Waiting for Google…" : "Connect Google"}</span>
          </span>
        </span>
      </button>
    );
  }

  return (
    <div className={shell} role="group" aria-label="Google, connected">
      {icon}
      <span className={reveal}>
        <span className="overflow-hidden">
          <span className="flex items-center gap-3 whitespace-nowrap pr-1.5">
            <span className="text-sm font-bold text-white">Connected</span>
            <button
              onClick={disconnectGoogle}
              className="press px-3 py-1.5 rounded-full bg-white/15 hover:bg-white/25 text-xs font-bold text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            >
              Disconnect
            </button>
          </span>
        </span>
      </span>
    </div>
  );
}
