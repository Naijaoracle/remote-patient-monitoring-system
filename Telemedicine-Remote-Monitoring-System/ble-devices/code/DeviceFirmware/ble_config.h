// Filepath: /ble-devices/code/DeviceFirmware/ble_config.h

#ifndef BLE_CONFIG_H
#define BLE_CONFIG_H

#define DEVICE_NAME "MedicalDevice001"
#define BLE_ADV_INTERVAL 1000 // Advertising interval in milliseconds
#define TX_POWER_LEVEL 0      // Transmission power level

// BLE UUIDs
#define SERVICE_UUID 0x180D          // Heart Rate Service
#define CHARACTERISTIC_UUID 0x2A37   // Heart Rate Measurement

// Encryption keys (for demonstration purposes only)
#define PRIVATE_KEY "DevicePrivateKey"
#define PUBLIC_KEY "DevicePublicKey"

#endif // BLE_CONFIG_H
