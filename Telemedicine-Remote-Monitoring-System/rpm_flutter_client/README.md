# RPM Flutter MVP Client

Single APK with two runtime modes for two-phone testing:

1. `Gateway` mode
   - scans BLE medical simulators
   - confirms proximity (BLE service UUID + RSSI)
   - registers actor/consent, initializes demo, and submits measurement
2. `Device Simulator` mode
   - advertises as BLE peripheral medical device
   - broadcasts simulated HR/SpO2 payload in manufacturer data

## Run

From this folder:

```bash
flutter pub get
flutter run
```

Start backend first:

```bash
cd ../
npm run demo:portal
```

Default API URL in app: `http://127.0.0.1:8099`

## Requirements

- Android 8+ with BLE support
- Flutter SDK + Android toolchain on laptop
- 2 phones for full BLE topology (one Gateway, one Device Simulator)
- Phone and laptop on same Wi-Fi LAN

For real-device testing, set API URL to laptop LAN IP:
- `http://<laptop-lan-ip>:8099`

## Two-Phone + Laptop Setup

1. Laptop (same Wi-Fi):
   - run `npm run demo:portal`
   - optionally run PoA validators (`blockchain-network/scripts/start-node.sh node1` and `node2`)
2. Phone B:
   - open app in `Device Simulator` mode
   - set simulated vitals and start advertising
3. Phone A:
   - open app in `Gateway` mode
   - scan/select Phone B
   - run `Register Actor + Consent` -> `Init Demo` -> `Submit Measurement`

## Notes

- BLE proximity is the app-side gate for submission.
- Final validation/acceptance is performed by backend validator logic and PoA network components on the laptop.
- For real phones, use the laptop LAN IP (not `127.0.0.1`) in the app base URL.
- This app is MVP/demo-oriented, not production-hardened.
