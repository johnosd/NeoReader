import tempfile
import unittest
from pathlib import Path

import android_device_qa as qa


class AndroidDeviceQaTests(unittest.TestCase):
    def test_parse_devices_tracks_ready_and_unauthorized_devices(self) -> None:
        raw = """List of devices attached
SERIAL1 device product:dream model:Galaxy_S device:dream transport_id:1
SERIAL2 unauthorized usb:1-2 transport_id:2
"""

        devices = qa.parse_devices(raw)

        self.assertEqual(devices[0]["serial"], "SERIAL1")
        self.assertEqual(devices[0]["state"], "device")
        self.assertEqual(devices[0]["model"], "Galaxy_S")
        self.assertEqual(devices[1]["state"], "unauthorized")

    def test_analyze_logs_classifies_and_redacts_samples(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            log = Path(directory) / "logcat.txt"
            log.write_text(
                "\ufeffFATAL EXCEPTION: main\n"
                "java.net.UnknownHostException token=secret user@example.com\n",
                encoding="utf-8",
            )

            analysis = qa.analyze_logs([log])

        categories = {finding["category"]: finding for finding in analysis["findings"]}
        self.assertEqual(categories["crash"]["severity"], "critical")
        network_sample = categories["network"]["samples"][0]["text"]
        self.assertIn("token=[redacted]", network_sample)
        self.assertIn("[email-redacted]", network_sample)
        self.assertNotIn("secret", network_sample)

    def test_percentile_uses_nearest_rank(self) -> None:
        values = [489, 456, 471, 445, 461, 461, 481, 494, 482, 496]
        self.assertEqual(qa.percentile(values, 0.95), 496)

    def test_package_metadata_extracts_version(self) -> None:
        metadata = qa.package_metadata("  versionCode=42 minSdk=24\n  versionName=1.2.3\n")
        self.assertEqual(metadata["versionCode"], "42")
        self.assertEqual(metadata["versionName"], "1.2.3")


if __name__ == "__main__":
    unittest.main()
