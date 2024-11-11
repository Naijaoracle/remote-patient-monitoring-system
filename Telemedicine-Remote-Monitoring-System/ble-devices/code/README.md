// Filepath: /ble-devices/code/README.md

# BLE Device Firmware

This directory contains the firmware code for the BLE medical devices used in the Telemedicine Remote Monitoring System.

## Contents

- **DeviceFirmware/**: Source code for the BLE device firmware.
  - `main.c`: Main application code.
  - `ble_config.h`: BLE configuration settings.

## Requirements

- C Compiler compatible with your microcontroller (e.g., GCC for ARM)
- BLE stack/library provided by the microcontroller vendor
- Hardware development kit for the BLE module

## Building the Firmware

1. Navigate to the `DeviceFirmware` directory:

   ```bash
   cd DeviceFirmware/

2. Compile the firmware:
    make all

3. Flash the firmware:
    make flash