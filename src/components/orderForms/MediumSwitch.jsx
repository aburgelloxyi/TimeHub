import { motion } from "framer-motion";
import { MEDIA, ON_COLOUR } from "./media";
import { mediumOf } from "../../lib/orderForms/studios";

// Motion or Print for the film in the header, in each side's own colour. When
// the film is loaded for both, it switches between them with one thumb sliding
// to the chosen side; when only one is loaded, it just says which.
export default function MediumSwitch({ current, twin, onSelect }) {
  const sides = twin
    ? [current, twin].sort((a, b) => (mediumOf(a) === "Motion" ? -1 : 1) - (mediumOf(b) === "Motion" ? -1 : 1))
    : [current];

  if (!twin) {
    const { colour, Icon } = MEDIA[mediumOf(current)];
    return (
      <span className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-wide shadow-sm ${ON_COLOUR}`} style={{ background: colour }}>
        <Icon className="h-3.5 w-3.5" strokeWidth={2.5} /> {mediumOf(current)}
      </span>
    );
  }

  return (
    <div role="group" aria-label="Motion or Print" className="flex rounded-full bg-black/20 p-1 ring-1 ring-white/20">
      {sides.map((file) => {
        const medium = mediumOf(file);
        const { colour, Icon } = MEDIA[medium];
        const on = file.id === current.id;
        return (
          <button
            key={file.id}
            type="button"
            onClick={() => !on && onSelect(file.id)}
            aria-pressed={on}
            className={`press relative flex items-center gap-1.5 rounded-full px-3.5 py-1 text-[11px] font-black uppercase tracking-wide transition-colors ${on ? ON_COLOUR : "text-white/75 hover:text-white"}`}
          >
            {on && (
              <motion.span
                layoutId="header-medium-thumb"
                transition={{ type: "tween", duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="absolute inset-0 rounded-full shadow-sm"
                style={{ background: colour }}
              />
            )}
            <Icon className="relative h-3.5 w-3.5" strokeWidth={2.5} />
            <span className="relative">{medium}</span>
          </button>
        );
      })}
    </div>
  );
}
