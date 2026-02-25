import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:flutter/material.dart';
import 'package:flutter_ble_peripheral/flutter_ble_peripheral.dart';
import 'package:flutter_blue_plus/flutter_blue_plus.dart';
import 'package:http/http.dart' as http;

const String kServiceUuid = 'bf27730d-860a-4e09-889c-2d8b6a9e0fe7';
const int kManufacturerId = 0x1337;
const int kRssiProximityThreshold = -85;

void main() {
  runApp(const RpmApp());
}

class RpmApp extends StatelessWidget {
  const RpmApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'RPM PoA Client',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.teal),
        useMaterial3: true,
      ),
      home: const RpmHomePage(),
    );
  }
}

enum AppMode { gateway, deviceSimulator }

class _SensorReading {
  _SensorReading({required this.heartRate, required this.spo2});

  final int heartRate;
  final int spo2;

  String get type => 'heart_rate';
  String get value => heartRate.toString();
  String get unit => 'bpm';
}

class RpmHomePage extends StatefulWidget {
  const RpmHomePage({super.key});

  @override
  State<RpmHomePage> createState() => _RpmHomePageState();
}

class _RpmHomePageState extends State<RpmHomePage> {
  final _baseUrlCtrl = TextEditingController(text: 'http://127.0.0.1:8099');
  final _operatorKeyCtrl = TextEditingController(text: 'demo-operator-key');
  final _patientIdCtrl = TextEditingController(text: 'patient-001');
  final _actorIdCtrl = TextEditingController(text: 'clinician-001');
  final _actorOrgCtrl = TextEditingController(text: 'clinic-a');
  final _purposeCtrl = TextEditingController(text: 'treatment');
  final _validatorCtrl = TextEditingController(text: '0xf3e63b5ad8ce0cc5e41d725a1a10d219681a5798');
  final _simHrCtrl = TextEditingController(text: '76');
  final _simSpo2Ctrl = TextEditingController(text: '98');

  final _blePeripheral = FlutterBlePeripheral();
  final List<ScanResult> _scanResults = <ScanResult>[];

  AppMode _mode = AppMode.gateway;
  StreamSubscription<List<ScanResult>>? _scanSub;
  StreamSubscription<bool>? _isScanningSub;
  StreamSubscription<PeripheralState>? _peripheralStateSub;

  ScanResult? _selectedResult;
  bool _isScanning = false;
  bool _proximityConfirmed = false;
  bool _initialized = false;
  bool _busy = false;
  bool _isAdvertising = false;
  String _status = 'Idle';
  PeripheralState _peripheralState = PeripheralState.unknown;

  String get _gatewayDeviceAddress {
    if (_selectedResult == null) {
      return '';
    }
    return _toEvmAddress(_selectedResult!.device.remoteId.str);
  }

  String get _centralAddress => _toEvmAddress('central:${_actorIdCtrl.text.trim()}');
  String get _simLocalName => 'RPM-MED-${_toShortDigest(_actorIdCtrl.text.trim()).substring(0, 6)}';

  @override
  void initState() {
    super.initState();
    _scanSub = FlutterBluePlus.scanResults.listen((results) {
      final filtered = results.where(_looksLikeMedicalSimulator).toList();
      setState(() {
        _scanResults
          ..clear()
          ..addAll(filtered);
      });
    });
    _isScanningSub = FlutterBluePlus.isScanning.listen((value) {
      setState(() {
        _isScanning = value;
      });
    });
    _peripheralStateSub = _blePeripheral.onPeripheralStateChanged?.listen((state) {
      setState(() {
        _peripheralState = state;
      });
    });
  }

  @override
  void dispose() {
    _scanSub?.cancel();
    _isScanningSub?.cancel();
    _peripheralStateSub?.cancel();
    _baseUrlCtrl.dispose();
    _operatorKeyCtrl.dispose();
    _patientIdCtrl.dispose();
    _actorIdCtrl.dispose();
    _actorOrgCtrl.dispose();
    _purposeCtrl.dispose();
    _validatorCtrl.dispose();
    _simHrCtrl.dispose();
    _simSpo2Ctrl.dispose();
    super.dispose();
  }

  bool _looksLikeMedicalSimulator(ScanResult result) {
    final adv = result.advertisementData;
    final hasService = adv.serviceUuids.any(
      (uuid) => uuid.toString().toLowerCase() == kServiceUuid.toLowerCase(),
    );
    final hasName = adv.advName.startsWith('RPM-MED-');
    final hasManufacturer = adv.manufacturerData.containsKey(kManufacturerId);
    return hasService || (hasName && hasManufacturer);
  }

  Future<void> _switchMode(AppMode mode) async {
    if (_mode == mode) {
      return;
    }
    if (_isAdvertising) {
      await _stopAdvertising();
    }
    if (_isScanning) {
      await FlutterBluePlus.stopScan();
    }
    setState(() {
      _mode = mode;
      _status = mode == AppMode.gateway
          ? 'Gateway mode enabled'
          : 'Device Simulator mode enabled';
      _scanResults.clear();
      _selectedResult = null;
      _proximityConfirmed = false;
    });
  }

  Future<void> _startScan() async {
    setState(() {
      _status = 'Scanning for BLE medical simulators...';
      _scanResults.clear();
      _selectedResult = null;
      _proximityConfirmed = false;
    });
    await FlutterBluePlus.startScan(timeout: const Duration(seconds: 8));
  }

  void _selectScanResult(ScanResult result) {
    final meetsRssi = result.rssi >= kRssiProximityThreshold;
    final serviceMatch = _looksLikeMedicalSimulator(result);
    setState(() {
      _selectedResult = result;
      _proximityConfirmed = meetsRssi && serviceMatch;
      _status = _proximityConfirmed
          ? 'Proximity confirmed via BLE ad (RSSI ${result.rssi} dBm)'
          : 'Device seen, but proximity threshold not met (RSSI ${result.rssi} dBm)';
    });
  }

  _SensorReading _readingFromSelection() {
    final defaultHr = int.tryParse(_simHrCtrl.text.trim()) ?? 76;
    final defaultSpo2 = int.tryParse(_simSpo2Ctrl.text.trim()) ?? 98;
    final result = _selectedResult;
    if (result == null) {
      return _SensorReading(heartRate: defaultHr, spo2: defaultSpo2);
    }
    final bytes = result.advertisementData.manufacturerData[kManufacturerId];
    if (bytes == null || bytes.length < 2) {
      return _SensorReading(heartRate: defaultHr, spo2: defaultSpo2);
    }
    return _SensorReading(heartRate: bytes[0], spo2: bytes[1]);
  }

  Future<void> _startAdvertising() async {
    await _runBusy(() async {
      final support = await _blePeripheral.isSupported;
      if (!support) {
        throw Exception('BLE peripheral mode not supported on this device');
      }
      await _blePeripheral.enableBluetooth(askUser: true);
      await _blePeripheral.hasPermission();

      final hr = (int.tryParse(_simHrCtrl.text.trim()) ?? 76).clamp(30, 220);
      final spo2 = (int.tryParse(_simSpo2Ctrl.text.trim()) ?? 98).clamp(50, 100);
      final payload = Uint8List.fromList(<int>[hr, spo2]);
      final advertiseData = AdvertiseData(
        serviceUuid: kServiceUuid,
        localName: _simLocalName,
        manufacturerId: kManufacturerId,
        manufacturerData: payload,
      );
      await _blePeripheral.start(advertiseData: advertiseData);
      setState(() {
        _isAdvertising = true;
        _status = 'Advertising BLE medical device ($_simLocalName)';
      });
    });
  }

  Future<void> _stopAdvertising() async {
    await _runBusy(() async {
      await _blePeripheral.stop();
      setState(() {
        _isAdvertising = false;
        _status = 'Stopped BLE advertising';
      });
    });
  }

  Future<void> _registerActorAndConsent() async {
    await _runBusy(() async {
      final actorId = _actorIdCtrl.text.trim();
      final patientId = _patientIdCtrl.text.trim();
      final purpose = _purposeCtrl.text.trim();
      await _post(
        '/api/actors',
        {
          'actorId': actorId,
          'role': 'clinician',
          'org': _actorOrgCtrl.text.trim(),
          'scopes': <String>['vitals:write'],
          'active': true,
        },
      );
      await _post(
        '/api/consent',
        {
          'patientId': patientId,
          'granted': true,
          'actorId': actorId,
          'purposes': <String>[purpose],
          'allowedActorIds': <String>[actorId],
          'allowedRoles': <String>['clinician'],
          'requiredScopes': <String>['vitals:write'],
        },
      );
      setState(() {
        _status = 'Actor + consent configured';
      });
    });
  }

  Future<void> _initDemo() async {
    if (!_proximityConfirmed || _gatewayDeviceAddress.isEmpty) {
      setState(() {
        _status = 'Scan/select BLE simulator first to confirm proximity.';
      });
      return;
    }
    await _runBusy(() async {
      await _post(
        '/api/init',
        {
          'deviceId': _gatewayDeviceAddress,
          'centralId': _centralAddress,
          'validatorId': _validatorCtrl.text.trim(),
        },
      );
      setState(() {
        _initialized = true;
        _status = 'Demo initialized for BLE device $_gatewayDeviceAddress';
      });
    });
  }

  Future<void> _submitMeasurement() async {
    if (!_initialized) {
      setState(() {
        _status = 'Initialize demo first.';
      });
      return;
    }
    await _runBusy(() async {
      final reading = _readingFromSelection();
      final result = await _post('/api/submit', {
        'type': reading.type,
        'value': reading.value,
        'unit': reading.unit,
        'patientId': _patientIdCtrl.text.trim(),
        'purpose': _purposeCtrl.text.trim(),
        'actorId': _actorIdCtrl.text.trim(),
      });
      final txHash = (result['txHash'] ?? '').toString();
      setState(() {
        _status = txHash.isEmpty
            ? 'Measurement submitted'
            : 'Measurement submitted tx=$txHash (HR ${reading.heartRate}, SpO2 ${reading.spo2})';
      });
    });
  }

  Future<Map<String, dynamic>> _post(String path, Map<String, dynamic> body) async {
    final url = Uri.parse('${_baseUrlCtrl.text.trim()}$path');
    final response = await http.post(
      url,
      headers: _headers(actorId: _actorIdCtrl.text.trim()),
      body: jsonEncode(body),
    );
    final parsed = _safeDecode(response.body);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception('POST $path failed (${response.statusCode}): ${parsed['error'] ?? response.body}');
    }
    return parsed;
  }

  Map<String, String> _headers({String actorId = ''}) {
    final headers = <String, String>{'Content-Type': 'application/json'};
    final key = _operatorKeyCtrl.text.trim();
    if (key.isNotEmpty) {
      headers['x-api-key'] = key;
    }
    if (actorId.isNotEmpty) {
      headers['x-actor-id'] = actorId;
    }
    return headers;
  }

  Future<void> _runBusy(Future<void> Function() action) async {
    setState(() {
      _busy = true;
    });
    try {
      await action();
    } catch (e) {
      setState(() {
        _status = 'Error: $e';
      });
    } finally {
      if (mounted) {
        setState(() {
          _busy = false;
        });
      }
    }
  }

  Map<String, dynamic> _safeDecode(String raw) {
    try {
      final decoded = jsonDecode(raw);
      if (decoded is Map<String, dynamic>) {
        return decoded;
      }
      return <String, dynamic>{'data': decoded};
    } catch (_) {
      return <String, dynamic>{'raw': raw};
    }
  }

  String _toEvmAddress(String input) {
    final digest = sha256.convert(utf8.encode(input)).toString();
    return '0x${digest.substring(0, 40)}';
  }

  String _toShortDigest(String input) => sha256.convert(utf8.encode(input)).toString();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('RPM PoA Flutter MVP')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SegmentedButton<AppMode>(
              segments: const [
                ButtonSegment(value: AppMode.gateway, label: Text('Gateway')),
                ButtonSegment(value: AppMode.deviceSimulator, label: Text('Device Simulator')),
              ],
              selected: <AppMode>{_mode},
              onSelectionChanged: (s) => _switchMode(s.first),
            ),
            const SizedBox(height: 12),
            _field(_baseUrlCtrl, 'Portal Base URL (Gateway mode)'),
            _field(_operatorKeyCtrl, 'Operator API key (required)'),
            const Divider(height: 24),
            if (_mode == AppMode.gateway) _buildGatewayPanel(),
            if (_mode == AppMode.deviceSimulator) _buildSimulatorPanel(),
            const SizedBox(height: 16),
            Text('Status: $_status'),
          ],
        ),
      ),
    );
  }

  Widget _buildGatewayPanel() {
    final selected = _selectedResult;
    final reading = _readingFromSelection();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Gateway: scan nearby BLE simulator, confirm proximity, then submit to PoA pipeline.',
        ),
        const SizedBox(height: 8),
        FilledButton(
          onPressed: _busy || _isScanning ? null : _startScan,
          child: Text(_isScanning ? 'Scanning...' : 'Scan BLE Simulators'),
        ),
        const SizedBox(height: 8),
        Text('Proximity confirmed: ${_proximityConfirmed ? 'YES' : 'NO'}'),
        if (selected != null) ...[
          Text('Selected BLE: ${selected.device.remoteId.str}'),
          Text('RSSI: ${selected.rssi} dBm'),
          Text('Derived device address: $_gatewayDeviceAddress'),
          Text('Latest reading from advertisement: HR ${reading.heartRate}, SpO2 ${reading.spo2}'),
        ],
        const SizedBox(height: 8),
        ..._scanResults.map((r) {
          return ListTile(
            dense: true,
            title: Text(r.advertisementData.advName.isEmpty ? 'Unnamed device' : r.advertisementData.advName),
            subtitle: Text('${r.device.remoteId.str} | RSSI ${r.rssi} dBm'),
            trailing: TextButton(
              onPressed: _busy ? null : () => _selectScanResult(r),
              child: const Text('Use'),
            ),
          );
        }),
        const Divider(height: 20),
        _field(_actorIdCtrl, 'Actor ID'),
        _field(_actorOrgCtrl, 'Actor Org'),
        _field(_patientIdCtrl, 'Patient ID'),
        _field(_purposeCtrl, 'Purpose'),
        _field(_validatorCtrl, 'Validator Address (EVM)'),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            FilledButton(
              onPressed: _busy ? null : _registerActorAndConsent,
              child: const Text('Register Actor + Consent'),
            ),
            FilledButton(
              onPressed: _busy ? null : _initDemo,
              child: const Text('Init Demo'),
            ),
            FilledButton(
              onPressed: _busy ? null : _submitMeasurement,
              child: const Text('Submit Measurement'),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildSimulatorPanel() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Device Simulator: advertise as BLE medical device using service UUID + manufacturer payload.',
        ),
        const SizedBox(height: 8),
        Text('Peripheral state: ${_peripheralState.name}'),
        Text('Advertising: ${_isAdvertising ? 'YES' : 'NO'}'),
        Text('Local name: $_simLocalName'),
        const SizedBox(height: 8),
        _field(_simHrCtrl, 'Simulated Heart Rate (bpm)'),
        _field(_simSpo2Ctrl, 'Simulated SpO2 (%)'),
        Wrap(
          spacing: 8,
          children: [
            FilledButton(
              onPressed: _busy || _isAdvertising ? null : _startAdvertising,
              child: const Text('Start Advertising'),
            ),
            FilledButton.tonal(
              onPressed: _busy || !_isAdvertising ? null : _stopAdvertising,
              child: const Text('Stop Advertising'),
            ),
          ],
        ),
        const SizedBox(height: 8),
        const Text(
          'Gateway mode on the other phone confirms proximity by scanning this BLE advertisement.',
        ),
      ],
    );
  }

  Widget _field(TextEditingController ctrl, String label) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: TextField(
        controller: ctrl,
        decoration: InputDecoration(
          labelText: label,
          border: const OutlineInputBorder(),
        ),
      ),
    );
  }
}
