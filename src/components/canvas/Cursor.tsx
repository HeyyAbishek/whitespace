import React from "react";
import { MousePointer2 } from "lucide-react";

type Props = {
  x: number;
  y: number;
  connectionId: number;
};

// Generate a consistent color based on connectionId
const COLORS = ["#DC2626", "#D97706", "#059669", "#7C3AED", "#DB2777"];

export default function Cursor({ x, y, connectionId }: Props) {
  const color = COLORS[connectionId % COLORS.length];

  return (
    <div 
      className="pointer-events-none absolute top-0 left-0 transition-transform duration-100 ease-linear"
      style={{ transform: `translateX(${x}px) translateY(${y}px)` }}
    >
      <MousePointer2 
        className="h-5 w-5" 
        style={{ fill: color, color: color }} 
      />
      <div 
        className="absolute left-5 top-5 px-1.5 py-0.5 rounded-md text-xs text-white font-semibold whitespace-nowrap" 
        style={{ backgroundColor: color }}
      >
        User {connectionId}
      </div>
    </div>
  );
}
