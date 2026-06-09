"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

export function SignaturePad({ onApply, onClose }: { onApply: (dataUrl: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = "#0b1b4d";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  function at(e: ReactPointerEvent<HTMLCanvasElement>) {
    const c = ref.current!;
    const r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
  }

  function down(e: ReactPointerEvent<HTMLCanvasElement>) {
    drawing.current = true;
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    const ctx = ref.current!.getContext("2d")!;
    const { x, y } = at(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setEmpty(false);
  }
  function moveTo(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = ref.current!.getContext("2d")!;
    const { x, y } = at(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  }
  function up() {
    drawing.current = false;
  }
  function clear() {
    const c = ref.current!;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    setEmpty(true);
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "grid", placeItems: "center", zIndex: 50 }}
      onClick={onClose}
    >
      <div className="card" onClick={(e) => e.stopPropagation()} style={{ width: 480, maxWidth: "92vw" }}>
        <h2>Draw your signature</h2>
        <canvas
          ref={ref}
          width={440}
          height={160}
          style={{
            width: "100%",
            height: 160,
            background: "#fff",
            borderRadius: 8,
            border: "1px solid var(--border)",
            touchAction: "none",
            cursor: "crosshair",
          }}
          onPointerDown={down}
          onPointerMove={moveTo}
          onPointerUp={up}
        />
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn secondary" onClick={clear}>
            Clear
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn secondary" onClick={onClose}>
              Cancel
            </button>
            <button className="btn" disabled={empty} onClick={() => onApply(ref.current!.toDataURL("image/png"))}>
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
