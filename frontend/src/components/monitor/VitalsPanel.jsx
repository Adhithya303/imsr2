import useMonitorStore from "../../store/monitorStore";

const VITAL_GROUPS = [
  {
    label: "ECG",
    color: "#00FF00",
    items: [
      { key: "HR", label: "HR", unit: "bpm", size: "xl" },
    ],
  },
  {
    label: "SpO₂",
    color: "#FFFF00",
    items: [
      { key: "SpO2", label: "SpO₂", unit: "%", size: "xl" },
    ],
  },
  {
    label: "ABP",
    color: "#FF3333",
    items: [
      { key: "ABP_sys", label: "ABP", unit: "mmHg", size: "lg", paired: "ABP_dia", separator: "/" },
    ],
  },
  {
    label: "PAP",
    color: "#FF9900",
    items: [
      { key: "PAP_sys", label: "PAP", unit: "mmHg", size: "md", paired: "PAP_dia", separator: "/" },
    ],
  },
  {
    label: "CO₂",
    color: "#00CCFF",
    items: [
      { key: "etCO2", label: "etCO₂", unit: "mmHg", size: "lg", highlight: true },
      { key: "avRR", label: "awRR", unit: "/min", size: "md" },
    ],
  },
  {
    label: "Temp",
    color: "#CC99FF",
    items: [
      { key: "Tperi", label: "T peri", unit: "°C", size: "md" },
      { key: "Tblood", label: "T blood", unit: "°C", size: "md" },
    ],
  },
  {
    label: "CO",
    color: "#FF66CC",
    items: [
      { key: "CO", label: "CO", unit: "L/min", size: "md" },
    ],
  },
];

const SIZE_CLASSES = {
  xl: "text-5xl font-bold font-mono",
  lg: "text-3xl font-bold font-mono",
  md: "text-2xl font-bold font-mono",
};

export default function VitalsPanel({ onVitalClick }) {
  const state = useMonitorStore();

  return (
    <div className="vitals-panel">
      {VITAL_GROUPS.map((group) => (
        <div key={group.label} className="vital-brick">
          <div className="vital-brick-label" style={{ color: group.color }}>
            {group.label}
          </div>
          {group.items.map((item) => {
            const val = state[item.key];
            const displayVal = item.paired
              ? `${Math.round(val)}/${Math.round(state[item.paired])}`
              : typeof val === "number"
              ? val % 1 === 0
                ? val
                : val.toFixed(1)
              : val;

            return (
              <div
                key={item.key}
                className={`vital-value-row ${item.highlight ? "vital-highlight" : ""}`}
                onClick={() => onVitalClick && onVitalClick(item.key)}
                style={{ cursor: onVitalClick ? "pointer" : "default" }}
              >
                <span className="vital-sublabel" style={{ color: group.color }}>
                  {item.label}
                </span>
                <span
                  className={SIZE_CLASSES[item.size]}
                  style={{ color: group.color }}
                >
                  {displayVal}
                </span>
                <span className="vital-unit">{item.unit}</span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
