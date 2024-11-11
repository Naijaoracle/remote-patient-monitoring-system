// Filepath: /ble-devices/README.md

# BLE Medical Devices

This directory contains code and documentation related to the BLE medical devices used in the Telemedicine Remote Monitoring System.

## Contents

- **code/**: Firmware source code for the BLE devices.
- **docs/**: Documentation on device specifications and communication protocols.

## Overview

The BLE medical devices collect patient health data and transmit it securely to the central smartphone application. The devices use Bluetooth Low Energy for short-range communication, ensuring proximity verification.

## Key Features

- **Proximity Verification**: Short-range BLE communication ensures devices are within the patient's vicinity.
- **Secure Data Transmission**: Data is signed and encrypted to prevent tampering and unauthorized access.
- **Low Power Consumption**: Devices enter sleep mode to conserve battery life.
- **Support for Multiple Sensors**: Heart rate, blood pressure, and glucose monitoring.

## Getting Started

Refer to the `code/README.md` for instructions on building and flashing the firmware.

## Documentation

Detailed device specifications can be found in `docs/BLEDeviceSpecs.md`.
