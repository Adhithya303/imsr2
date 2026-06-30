"""Binary waveform packet contract tests."""

from __future__ import annotations

import struct
import sys
import unittest
from pathlib import Path

import numpy as np

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from engine.state_machine import LEAD_ORDER, SAMPLES_PER_PKT, _encode_packet
from models.ecg_state import ECGState


class PacketProtocolTests(unittest.TestCase):
    def test_packet_header_and_waveforms_are_big_endian(self) -> None:
        self.assertEqual(SAMPLES_PER_PKT, 26)
        state = ECGState(
            heart_rate=72,
            spo2=97,
            sys_bp=118,
            dia_bp=76,
            pap_sys=24,
            pap_dia=9,
            etco2=41,
            resp_rate=14,
        )
        leads = {
            name: np.linspace(index, index + 0.25, SAMPLES_PER_PKT, dtype=np.float32)
            for index, name in enumerate(LEAD_ORDER)
        }

        packet = _encode_packet(leads, state.heart_rate, state)
        header = struct.unpack_from(">HffffffffHH", packet)

        self.assertEqual(header[0], 0xECEC)
        self.assertEqual(header[-2], SAMPLES_PER_PKT)
        self.assertEqual(header[-1], len(LEAD_ORDER))
        self.assertEqual(header[1:9], (72, 97, 118, 76, 24, 9, 41, 14))

        offset = struct.calcsize(">HffffffffHH")
        for index, lead_name in enumerate(LEAD_ORDER):
            decoded = np.frombuffer(
                packet,
                dtype=">f4",
                count=SAMPLES_PER_PKT,
                offset=offset,
            )
            np.testing.assert_allclose(decoded, leads[lead_name], rtol=1e-6)
            offset += SAMPLES_PER_PKT * 4

        severity, rhythm_length = struct.unpack_from("BB", packet, offset)
        offset += 2
        self.assertEqual(severity, 0)
        self.assertEqual(packet[offset:offset + rhythm_length], b"NSR")


if __name__ == "__main__":
    unittest.main()
