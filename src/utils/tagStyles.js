// --- HELPER: Dynamic Status Colors ---
export const getTagStyle = (tag) => {
  const baseStyle =
    "text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded border whitespace-nowrap";

  if (!tag) return `${baseStyle} bg-slate-100 text-slate-500 border-slate-200`;

  const lowerTag = String(tag).toLowerCase();

  if (lowerTag.includes("to amend"))
    return `${baseStyle} bg-rose-50 text-rose-600 border-rose-200`;
  if (lowerTag.includes("render review"))
    return `${baseStyle} bg-indigo-50 text-indigo-600 border-indigo-200`;
  if (lowerTag.includes("revised"))
    return `${baseStyle} bg-teal-50 text-teal-600 border-teal-200`;
  if (lowerTag.includes("creative approved"))
    return `${baseStyle} bg-blue-50 text-blue-600 border-blue-200`;
  if (lowerTag.includes("content approved"))
    return `${baseStyle} bg-purple-50 text-purple-600 border-purple-200`;
  if (lowerTag.includes("client review") || lowerTag.includes("content review"))
    return `${baseStyle} bg-yellow-50 text-yellow-600 border-yellow-200`;
  if (lowerTag.includes("motion"))
    return `${baseStyle} bg-emerald-50 text-emerald-600 border-emerald-200`;
  if (lowerTag.includes("digital"))
    return `${baseStyle} bg-cyan-50 text-cyan-600 border-cyan-200`;
  if (lowerTag.includes("prep for delivery"))
    return `${baseStyle} bg-orange-50 text-orange-600 border-orange-200`;
  if (lowerTag === "delivering" || lowerTag === "delivery")
    return `${baseStyle} bg-yellow-100 text-yellow-700 border-yellow-400`;
  if (lowerTag.includes("on hold"))
    return `${baseStyle} bg-red-50 text-red-600 border-red-200`;
  if (lowerTag.includes("pm"))
    return `${baseStyle} bg-fuchsia-50 text-fuchsia-600 border-fuchsia-200`;
  if (lowerTag.includes("backlog"))
    return `${baseStyle} bg-slate-100 text-slate-500 border-slate-200`;

  return `${baseStyle} bg-slate-100 text-slate-500 border-slate-200`;
};
