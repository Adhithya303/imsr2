import { useLayoutEffect, useMemo, useRef, useState } from "react";
import ECGTrack from "./ECGTrack";
import PlethTrack from "./PlethTrack";
import ABPTrack from "./ABPTrack";
import PAPTrack from "./PAPTrack";
import ETCO2Track from "./ETCO2Track";

const TRACK_COUNT = 5;
const TRACK_GAP = 8;
const MAX_TRACK_HEIGHT = 250;

export default function WaveformStack({ lead = "II" }) {
  const stackRef = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const element = stackRef.current;
    if (!element) return undefined;

    const readSize = () => {
      setSize({
        width: Math.floor(element.clientWidth),
        height: Math.floor(element.clientHeight),
      });
    };

    readSize();
    const observer = new ResizeObserver(readSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const trackSize = useMemo(() => {
    const width = Math.max(1, size.width);
    const availableHeight = Math.max(0, size.height - TRACK_GAP * (TRACK_COUNT - 1));
    const height = Math.max(
      1,
      Math.min(MAX_TRACK_HEIGHT, Math.floor(availableHeight / TRACK_COUNT))
    );
    return { width, height };
  }, [size]);

  const plethGain = useMemo(
    () => Math.max(8, Math.min(42, (trackSize.height - 31) / 1.75)),
    [trackSize.height]
  );

  return (
    <div ref={stackRef} className="waveform-stack">
      {size.width > 0 && size.height > 0 && (
        <>
          <ECGTrack lead={lead} width={trackSize.width} height={trackSize.height} />
          <PlethTrack width={trackSize.width} height={trackSize.height} gain={plethGain} />
          <ABPTrack width={trackSize.width} height={trackSize.height} />
          <PAPTrack width={trackSize.width} height={trackSize.height} />
          <ETCO2Track width={trackSize.width} height={trackSize.height} />
        </>
      )}
    </div>
  );
}
