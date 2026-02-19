# Dual Toolchain Plan: Hardhat Now, Foundry Next

## Phase 1 (Current): Hardhat baseline
- Keep Truffle in place for backward compatibility.
- Add Hardhat config, deploy script, and Hardhat-native tests.
- Use Hardhat as the default local contract dev/test flow.

## Phase 2: Foundry add-on
- Add Foundry config (`foundry.toml`) and `test/foundry` suite.
- Recreate critical contract tests in Foundry for speed and fuzzing.
- Add fuzz/invariant tests for:
  - quorum rules
  - last-validator protection
  - challenge replay prevention
  - proximity window boundaries

## Phase 3: CI split strategy
- Fast path: Foundry unit/fuzz tests on every PR.
- Compatibility path: Hardhat tests and deployment scripts on merge/main.
- Keep Truffle commands available until migration is complete.

## Exit criteria to retire Truffle (optional)
- Hardhat deploy scripts cover all current migrations.
- Foundry + Hardhat test parity reached.
- Team confirms no active Truffle-only workflows remain.
