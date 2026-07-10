import { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";

const CACHE_KEY = "xyi_department";

// The signed-in member's department (profiles.department: PM | Motion |
// Digital | AM | Operations | Print, or null). Drives which pages Home,
// the Rail, and the command palette offer — see src/lib/departments.js.
//
// localStorage-cached so navigation renders with the right page set on the
// first frame; the profiles row is still consulted in the background so a
// department change in Administration takes effect on the next load.
export function useDepartment() {
  const [department, setDepartment] = useState(
    () => localStorage.getItem(CACHE_KEY) || null
  );

  useEffect(() => {
    const uid = localStorage.getItem("wrike_user_id");
    if (!uid) return;
    let cancelled = false;
    supabase
      .from("profiles")
      .select("department")
      .eq("wrike_user_id", uid)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const dept = data?.department || null;
        if (dept) {
          localStorage.setItem(CACHE_KEY, dept);
          setDepartment(dept);
        } else {
          localStorage.removeItem(CACHE_KEY);
          setDepartment(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return department;
}
