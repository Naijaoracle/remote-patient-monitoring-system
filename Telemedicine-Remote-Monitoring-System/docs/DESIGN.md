// Filepath: /docs/DESIGN.md

# System Design Document

## Overview

This document provides an in-depth look at the design of the Telemedicine Remote Monitoring System, which leverages blockchain technology and BLE devices to securely monitor patient health data remotely.

## System Architecture

### Components

1. **BLE Medical Devices**
   - Peripheral devices that collect health data.
   - Communicate with the central device via BLE.
2. **Mobile Application**
   - Acts as the central device in the BLE network.
   - Verifies proximity and signs data.
   - Sends data to the blockchain network.
3. **Blockchain Network**
   - Private blockchain using Proof of Authority (PoA) consensus.
   - Validators are trusted healthcare providers.
   - Stores data immutably in a distributed ledger.
4. **Smart Contracts**
   - Define the rules for data recording and validator management.
   - Ensure data integrity and authenticity.

### Data Flow

1. **Data Collection**
   - BLE devices collect measurements and sign the data.
2. **Proximity Verification**
   - Data is transmitted to the mobile app over BLE, confirming proximity.
3. **Data Signing**
   - Mobile app timestamps and signs the data.
4. **Blockchain Submission**
   - Double-signed data is sent to the blockchain.
5. **Validation**
   - Validators confirm the data is from trusted devices.
6. **Storage**
   - Data is stored immutably on the blockchain.

## Security Considerations

- **Digital Signatures**
  - Ensures data is from legitimate devices.
- **Proximity Verification**
  - Short-range BLE communication mitigates remote attacks.
- **Immutable Ledger**
  - Blockchain prevents data tampering.
- **Validator Accountability**
  - Validators stake their reputation; dishonest nodes can be removed.

## Consensus Mechanism

- **Proof of Authority (PoA)**
  - Validators are pre-approved entities.
  - Faster transaction times suitable for IoT devices.
  - Validators can be added or removed via consensus.

## Smart Contracts

### Measurement.sol

- **Purpose**: Records and emits measurement events.
- **Functions**:
  - `recordMeasurement()`: Called by the mobile app to record data.

### ValidatorManager.sol

- **Purpose**: Manages the list of validators.
- **Functions**:
  - `addValidator()`: Adds a new validator.
  - `removeValidator()`: Removes a validator.
  - `getValidators()`: Retrieves the list of validators.

## BLE Device Specifications

- **Short-range Communication**
  - BLE ensures devices are within proximity.
- **Low Power Consumption**
  - Devices enter sleep mode when not transmitting.
- **Security**
  - Data is signed and encrypted.

## Mobile Application

- **Roles**
  - Central device in BLE communication.
  - Interface for patients to view data.
  - Signs and forwards data to the blockchain.

## Scalability

- **Blockchain**
  - PoA consensus allows for higher throughput.
  - Validators can scale with network growth.
- **BLE Devices**
  - Modular design allows adding more device types.

## Potential Enhancements

- **Integration with Electronic Health Records (EHR)**
  - Seamless data sharing with healthcare providers.
- **Advanced Analytics**
  - Machine learning for predictive health insights.
- **User Authentication**
  - Biometric authentication for app access.

## Conclusion

The system is designed to provide secure, reliable remote patient monitoring by combining BLE proximity verification and blockchain's immutable ledger, ensuring that healthcare providers receive accurate and trustworthy data.

---

For implementation details, refer to the `INSTALLATION.md` and `API.md` documents.
