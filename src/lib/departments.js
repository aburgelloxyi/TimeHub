import {
  Activity,
  LayoutList,
  Layout,
  Timer,
  User,
  Shield,
  Briefcase,
} from "lucide-react";
import { PAGE_GRADIENTS } from "./pageGradients";

// ── The pages registry ───────────────────────────────────────────────────────
// Single source of truth for every top-level page: label, description (Home
// row hover copy), icon, and gradient identity. Home's menu, the Rail, and
// the command palette all derive from this — a rename here renames it
// everywhere.
export const PAGES = {
  timesheet: {
    id: "timesheet",
    label: "Timesheeter",
    desc: "Track today's time",
    icon: Activity,
    gradient: PAGE_GRADIENTS.timesheet,
  },
  todayslist: {
    id: "todayslist",
    label: "Motion Board",
    desc: "Team task allocation",
    icon: LayoutList,
    gradient: PAGE_GRADIENTS.todayslist,
  },
  canvas: {
    id: "canvas",
    label: "Digi Canvas",
    desc: "MATRIX visualiser",
    icon: Layout,
    gradient: PAGE_GRADIENTS.canvas,
  },
  legacy: {
    id: "legacy",
    label: "Timesheets",
    desc: "Company timesheet database",
    icon: Timer,
    gradient: PAGE_GRADIENTS.legacy,
  },
  profile: {
    id: "profile",
    label: "Profile Hub",
    desc: "Your jobs & settings",
    icon: User,
    gradient: PAGE_GRADIENTS.profile,
  },
  management: {
    id: "management",
    label: "Administration",
    desc: "Jobs, people & reference data",
    icon: Shield,
    gradient: PAGE_GRADIENTS.management,
  },
  jobbook: {
    id: "jobbook",
    label: "Job Book",
    desc: "Live job numbers & budgets",
    icon: Briefcase,
    gradient: PAGE_GRADIENTS.jobbook,
  },
};

// ── Who sees what ────────────────────────────────────────────────────────────
// Keyed by profiles.department (check constraint: PM | Motion | Digital |
// AM | Operations | Print). Departments without an entry yet fall back to
// DEFAULT_PAGE_IDS — the historic five-page set — so nobody is locked out
// before their department's set is defined.
export const DEPARTMENT_PAGES = {
  Motion: ["timesheet", "todayslist", "canvas", "legacy", "profile"],
  PM: ["management", "jobbook", "legacy", "profile"],
};

export const DEFAULT_PAGE_IDS = ["timesheet", "todayslist", "canvas", "legacy", "profile"];

export function pageIdsFor(department) {
  return DEPARTMENT_PAGES[department] || DEFAULT_PAGE_IDS;
}

export function pagesFor(department) {
  return pageIdsFor(department).map((id) => PAGES[id]);
}
