interface Props {
  score: number;
  grade: string;
  size?: number;
}

export default function ScoreRing({ score, grade, size = 92 }: Props) {
  const stroke = 7;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = (score / 100) * circumference;
  const color = score >= 75 ? "#15803d" : score >= 50 ? "#b45309" : "#c81e1e";

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e8ebef" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
        />
      </svg>
      <div style={{
        position: "absolute", inset: 0, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
      }}>
        <span style={{ fontSize: 24, fontWeight: 750, letterSpacing: "-0.03em", lineHeight: 1 }}>{score}</span>
        <span style={{ fontSize: 10.5, color: "#8a94a3", fontWeight: 600 }}>GRADE {grade}</span>
      </div>
    </div>
  );
}
