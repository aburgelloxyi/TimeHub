// The client list, with each client's billing increment and rate card.
//
// Part of Administration.
import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../lib/supabaseClient";
import { notify } from "../../lib/toast";
import { incrementFor } from "../../lib/consolidate";
import { SimpleListSection } from "./SimpleListSection";
import { ClientRatesModal } from "./ClientRatesModal";

// Common increments. A client set to something else by hand still displays its
// own value, below, rather than silently reading as the first option.
const INCREMENT_OPTIONS = [15, 30, 45, 60];

export function ClientsSection({ quickFilters }) {
  const [open, setOpen] = useState(null);
  const [withRates, setWithRates] = useState(new Set());

  const loadWithRates = useCallback(async () => {
    const { data } = await supabase.from("client_rates").select("client_id");
    setWithRates(new Set((data || []).map((r) => r.client_id)));
  }, []);
  useEffect(() => { loadWithRates(); }, [loadWithRates]);

  // SimpleListSection hands over the patch but leaves persisting to us.
  const saveIncrement = async (id, minutes, patchItem) => {
    const { error } = await supabase.from("clients").update({ increment_minutes: minutes }).eq("id", id);
    if (error) {
      notify(`Could not save the billing increment: ${error.message}`, "error");
      return;
    }
    patchItem(id, { increment_minutes: minutes });
  };

  return (
    <>
      <SimpleListSection
        table="clients"
        labelField="name"
        label="Clients"
        quickFilters={quickFilters}
        quickFilterLabel="Filter by studio"
        renderRowExtra={(item, patchItem) => {
          const value = incrementFor(item.increment_minutes);
          const options = INCREMENT_OPTIONS.includes(value)
            ? INCREMENT_OPTIONS
            : [...INCREMENT_OPTIONS, value].sort((a, b) => a - b);
          return (
            <div className="shrink-0 flex items-center gap-2">
              <label
                className="flex items-center gap-1.5"
                title="Billable time in Project/Time rounds up to this many minutes per week"
              >
                <span className="text-[11px] font-bold text-[#768994]">Bills</span>
                <select
                  value={value}
                  onChange={(e) => saveIncrement(item.id, Number(e.target.value), patchItem)}
                  className="px-2 py-1.5 rounded-lg border border-[#dce4ec] bg-white text-[11px] font-bold text-[#122027] outline-none hover:border-slate-300 focus:border-[#12a0e1]"
                >
                  {options.map((m) => <option key={m} value={m}>{m} min</option>)}
                </select>
              </label>
              <button
                type="button"
                onClick={() => setOpen({ client: item, patch: (p) => patchItem(item.id, p) })}
                className={`shrink-0 px-2.5 py-1.5 rounded-lg border text-[11px] font-bold transition-colors ${
                  withRates.has(item.id)
                    ? "bg-[#12a0e1]/10 border-[#12a0e1]/40 text-[#12a0e1] hover:bg-[#12a0e1]/15"
                    : "bg-white border-[#dce4ec] text-[#768994] hover:border-slate-300 hover:text-[#122027]"
                }`}
              >
                Rates
              </button>
            </div>
          );
        }}
      />
      {open && (
        <ClientRatesModal
          client={open.client}
          onClose={() => setOpen(null)}
          onChanged={(patch) => {
            if (patch) open.patch(patch);
            loadWithRates();
          }}
        />
      )}
    </>
  );
}
