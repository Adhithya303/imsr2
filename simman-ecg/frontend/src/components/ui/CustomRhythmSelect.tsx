import { useState, useRef, useEffect } from "react";
import type { RhythmType } from "../../types/ecgState";
import { RHYTHM_GROUPS, RHYTHM_LABELS } from "../../types/ecgState";
import "./CustomRhythmSelect.css";

interface CustomRhythmSelectProps {
  value: RhythmType;
  onChange: (rhythm: RhythmType) => void;
  disabled?: boolean;
}

export default function CustomRhythmSelect({ value, onChange, disabled }: CustomRhythmSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleSelect = (rhythm: RhythmType) => {
    onChange(rhythm);
    setIsOpen(false);
  };

  return (
    <div className={`custom-rhythm-select ${disabled ? "disabled" : ""}`} ref={containerRef}>
      <div 
        className={`rhythm-select-trigger ${isOpen ? "open" : ""}`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
      >
        <span>{RHYTHM_LABELS[value] || value}</span>
        <svg className="dropdown-arrow" viewBox="0 0 24 24" width="16" height="16">
          <path fill="currentColor" d="M7 10l5 5 5-5z" />
        </svg>
      </div>

      {isOpen && (
        <div className="rhythm-select-dropdown">
          {RHYTHM_GROUPS.map((group) => (
            <div key={group.label} className="rhythm-group">
              <div className="rhythm-group-label">{group.label}</div>
              {group.rhythms.map((r) => (
                <div
                  key={r}
                  className={`rhythm-option ${value === r ? "selected" : ""}`}
                  onClick={() => handleSelect(r)}
                >
                  {RHYTHM_LABELS[r]}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
