import React from "react";

// The XYi blue-to-teal fill that spreads across an outline button from its
// left edge on hover, the way the hub's rows fill. Put `sweepClass` on the
// button and <Sweep /> inside it as its first child: the fill sits behind the
// label, which turns white as it arrives. White is forced (!), because the
// dark themes set their own colours on the same text classes and would
// otherwise keep an icon green or grey on top of the fill. An icon with a
// colour of its own needs `group-hover/s:!text-white` too.
export const sweepClass =
  "group/s relative isolate overflow-hidden transition-colors duration-300 hover:!text-white hover:border-transparent focus-visible:!text-white";

export default function Sweep() {
  return (
    <span
      aria-hidden
      className="absolute inset-0 -z-10 bg-gradient-to-r from-[#12a0e1] to-[#1cc1a5] origin-left scale-x-0 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover/s:scale-x-100 group-focus-visible/s:scale-x-100 group-disabled/s:scale-x-0 motion-reduce:transition-none"
    />
  );
}
