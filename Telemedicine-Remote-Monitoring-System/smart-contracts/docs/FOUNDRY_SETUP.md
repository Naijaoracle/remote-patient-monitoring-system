# Foundry Setup

This repo now supports a dual smart-contract toolchain:
- Truffle (existing)
- Hardhat (added)
- Foundry (scaffolded)

## Files added
- `foundry.toml`
- `foundry-test/ValidatorManager.t.sol`
- `foundry-test/Measurement.t.sol`

## Install Foundry
```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

## Run tests
```bash
forge test -vv
```

## Run invariant tests
```bash
npm run test:foundry:invariant
```

## Notes
- `forge-std` is installed under `lib/forge-std` and used by invariant tests.
- Contracts are sourced from `contracts/` via `foundry.toml` (`src = 'contracts'`).
