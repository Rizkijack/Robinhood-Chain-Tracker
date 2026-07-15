"use client";

/* ------------------------------------------------------------------ */
/*  Primitives                                                         */
/* ------------------------------------------------------------------ */
/*  CSS @keyframes sk-pulse is defined in app/styles/states.css         */
/*  CSS class .sk is defined in app/styles/states.css                   */
/* ------------------------------------------------------------------ */

export function SkeletonBlock({
  width,
  height,
  style,
}: {
  width?: number | string;
  height?: number | string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className="sk"
      style={{
        width: width ?? "100%",
        height: height ?? 16,
        ...style,
      }}
    />
  );
}

export function SkeletonText({ width = "100%" }: { width?: number | string }) {
  return <SkeletonBlock width={width} height={14} />;
}

export function SkeletonCircle({ size = 32 }: { size?: number }) {
  return (
    <div
      className="sk"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        flexShrink: 0,
      }}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Composed skeletons                                                 */
/* ------------------------------------------------------------------ */

export function SkeletonStatCard() {
  return (
    <div
      style={{
        background: "var(--bg-2, #121826)",
        border: "1px solid var(--line, #243049)",
        borderRadius: 8,
        padding: "10px 12px",
      }}
    >
      <SkeletonText width="50%" />
      <div style={{ height: 6 }} />
      <SkeletonBlock width="40%" height={22} />
    </div>
  );
}

export function SkeletonTableRow() {
  return (
    <tr>
      <td style={{ padding: "10px 12px" }}>
        <SkeletonText width={20} />
      </td>
      <td style={{ padding: "10px 12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 220 }}>
          <SkeletonCircle size={32} />
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <SkeletonText width={80} />
            <SkeletonText width={140} />
          </div>
        </div>
      </td>
      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((i) => (
        <td key={i} style={{ padding: "10px 12px" }}>
          <SkeletonText width={i % 3 === 0 ? 40 : i % 3 === 1 ? 60 : 80} />
        </td>
      ))}
    </tr>
  );
}

export function SkeletonTable({ rows = 8 }: { rows?: number }) {
  return (
    <div className="table-wrap">
      <div className="table-scroll">
        <table className="pairs">
          <thead>
            <tr>
              {["#", "Token", "Age", "DEX", "Price", "5m", "1h", "24h", "Liq", "Vol 1h", "Txns", "MCap", "Src", "Links"].map(
                (h) => (
                  <th key={h}>{h}</th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, i) => (
              <SkeletonTableRow key={i} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
