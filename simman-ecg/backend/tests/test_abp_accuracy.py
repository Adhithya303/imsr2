"""ABP generation acceptance tests across pressure, HR, and rhythm states."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from engine.waveform_generator import WaveformGenerator
from models.ecg_state import ECGState, RhythmType


def generate_abp(state: ECGState, seconds: float = 12.0) -> np.ndarray:
    generator = WaveformGenerator(fs=512)
    packets = []
    for _ in range(round(seconds / (26 / 512))):
        generator.generate(state, 26)
        packets.append(generator.generate_abp(state, 26))
    return np.concatenate(packets)


def generate_pleth(state: ECGState, seconds: float = 12.0) -> np.ndarray:
    generator = WaveformGenerator(fs=512)
    packets = []
    for _ in range(round(seconds / (26 / 512))):
        generator.generate(state, 26)
        packets.append(generator.generate_pleth(state, 26))
    return np.concatenate(packets)


def generate_pap(state: ECGState, seconds: float = 12.0) -> np.ndarray:
    generator = WaveformGenerator(fs=512)
    packets = []
    for _ in range(round(seconds / (26 / 512))):
        generator.generate(state, 26)
        packets.append(generator.generate_pap(state, 26))
    return np.concatenate(packets)


def generate_etco2(state: ECGState, seconds: float = 12.0) -> np.ndarray:
    generator = WaveformGenerator(fs=512)
    packets = []
    for _ in range(round(seconds / (26 / 512))):
        generator.generate(state, 26)
        packets.append(generator.generate_etco2(state, 26))
    return np.concatenate(packets)


def count_visible_pulses(signal: np.ndarray, threshold: float = 0.25) -> int:
    refractory = round(0.25 * 512)
    peaks = 0
    last_peak = -refractory
    for i in range(1, len(signal) - 1):
        if i - last_peak < refractory:
            continue
        if signal[i] > threshold and signal[i] >= signal[i - 1] and signal[i] > signal[i + 1]:
            peaks += 1
            last_peak = i
    return peaks


class ABPAccuracyTests(unittest.TestCase):
    def test_pressure_and_hr_matrix_is_finite_and_bounded(self) -> None:
        for hr in (20, 30, 40, 60, 80, 120, 180, 250, 300):
            for systolic, diastolic in ((80, 40), (120, 80), (180, 110), (240, 180)):
                with self.subTest(hr=hr, pressure=(systolic, diastolic)):
                    signal = generate_abp(ECGState(
                        heart_rate=hr,
                        hrv_std=0,
                        rhythm=RhythmType.NSR,
                        sys_bp=systolic,
                        dia_bp=diastolic,
                    ), seconds=max(5.0, 120.0 / hr))
                    self.assertTrue(np.isfinite(signal).all())
                    self.assertGreaterEqual(float(signal.min()), 0.0)
                    self.assertLessEqual(float(signal.max()), systolic + 1.0)
                    self.assertGreater(float(signal.max()), diastolic + 0.65 * (systolic - diastolic))

    def test_no_perfusion_rhythms_are_flat_zero(self) -> None:
        for rhythm in (RhythmType.ASYSTOLE, RhythmType.VF, RhythmType.PEA):
            with self.subTest(rhythm=rhythm):
                state = ECGState(heart_rate=80, rhythm=rhythm)
                signal = generate_abp(state)
                self.assertFalse(np.any(signal))
                generator = WaveformGenerator()
                generator.generate(state, 512)
                self.assertFalse(np.any(generator.generate_pleth(state, 512)))
                self.assertFalse(np.any(generator.generate_pap(state, 512)))

    def test_pleth_shape_matches_two_component_gaussian_reference(self) -> None:
        generator = WaveformGenerator()
        self.assertAlmostEqual(generator._pleth_shape(0.2), 1.0872732731, places=6)
        self.assertAlmostEqual(generator._pleth_shape(0.45), 0.3575756774, places=6)
        self.assertLess(generator._pleth_shape(0.0), generator._pleth_shape(0.2))

    def test_pleth_tracks_hr_and_perfusion_scale(self) -> None:
        hr60 = generate_pleth(ECGState(
            heart_rate=60, hrv_std=0, rhythm=RhythmType.NSR,
            sys_bp=120, dia_bp=80, spo2=98,
        ), seconds=8)
        hr120 = generate_pleth(ECGState(
            heart_rate=120, hrv_std=0, rhythm=RhythmType.NSR,
            sys_bp=120, dia_bp=80, spo2=98,
        ), seconds=8)
        narrow_pp = generate_pleth(ECGState(
            heart_rate=80, hrv_std=0, rhythm=RhythmType.NSR,
            sys_bp=95, dia_bp=80, spo2=98,
        ), seconds=8)
        wide_pp = generate_pleth(ECGState(
            heart_rate=80, hrv_std=0, rhythm=RhythmType.NSR,
            sys_bp=160, dia_bp=70, spo2=98,
        ), seconds=8)

        self.assertGreater(count_visible_pulses(hr120), count_visible_pulses(hr60))
        self.assertGreater(float(np.max(wide_pp)), float(np.max(narrow_pp)))
        self.assertTrue(np.isfinite(hr120).all())
        self.assertLessEqual(float(np.max(hr120)), 2.0)

    def test_rhythm_specific_pulse_pressure(self) -> None:
        ranges = {}
        for rhythm in (
            RhythmType.NSR, RhythmType.AFIB, RhythmType.PVC,
            RhythmType.SVT, RhythmType.VT,
        ):
            np.random.seed(4)
            signal = generate_abp(ECGState(
                heart_rate=120, hrv_std=0, rhythm=rhythm,
                sys_bp=120, dia_bp=80,
            ), seconds=20)
            ranges[rhythm] = float(np.ptp(signal))

        self.assertGreater(ranges[RhythmType.NSR], ranges[RhythmType.SVT])
        self.assertGreater(ranges[RhythmType.SVT], ranges[RhythmType.VT])
        self.assertGreater(ranges[RhythmType.PVC], ranges[RhythmType.VT])
        self.assertGreater(ranges[RhythmType.AFIB], ranges[RhythmType.VT])

    def test_pvc_has_weak_and_post_pause_strong_pulses(self) -> None:
        generator = WaveformGenerator(fs=512)
        state = ECGState(heart_rate=80, hrv_std=0, rhythm=RhythmType.PVC)
        factors = [
            generator._abp_pulse_factor(RhythmType.PVC, beat, 1.0, 80)
            for beat in range(4)
        ]
        self.assertEqual(factors[:2], [1.0, 1.0])
        self.assertLess(factors[2], 0.5)
        self.assertGreater(factors[3], 1.0)

    def test_packet_boundaries_remain_continuous(self) -> None:
        signal = generate_abp(ECGState(
            heart_rate=180, hrv_std=0, rhythm=RhythmType.AFIB,
            sys_bp=240, dia_bp=180,
        ), seconds=30)
        self.assertLess(float(np.max(np.abs(np.diff(signal)))), 20.0)

    def test_pap_tracks_configured_pressure(self) -> None:
        signal = generate_pap(ECGState(
            heart_rate=80,
            hrv_std=0,
            rhythm=RhythmType.NSR,
            pap_sys=30,
            pap_dia=12,
        ))
        self.assertTrue(np.isfinite(signal).all())
        self.assertGreater(float(signal.max()), 28.0)
        self.assertGreaterEqual(float(signal.min()), 12.0)
        self.assertLessEqual(float(signal.max()), 30.5)

    def test_capnogram_reaches_baseline_and_etco2_plateau(self) -> None:
        signal = generate_etco2(ECGState(etco2=42, resp_rate=15), seconds=8)
        self.assertTrue(np.isfinite(signal).all())
        self.assertEqual(float(signal.min()), 0.0)
        self.assertGreater(float(signal.max()), 41.0)
        self.assertLessEqual(float(signal.max()), 42.0)


if __name__ == "__main__":
    unittest.main()
