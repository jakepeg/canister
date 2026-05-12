# Unit Economics Model

## Inputs

- `planPriceUsd`
- `includedGb`
- `storageCostPerGbPerMonthUsd`
- `reservedMonths`
- `safetyMultiplier`
- `paymentFeePct`
- `paymentFeeFixedUsd`
- `opsReserveUsd`

## Formula

```text
reserveCostUsd = includedGb * storageCostPerGbPerMonthUsd * reservedMonths * safetyMultiplier
paymentFeesUsd = (planPriceUsd * paymentFeePct) + paymentFeeFixedUsd
grossMarginUsd = planPriceUsd - reserveCostUsd - paymentFeesUsd - opsReserveUsd
grossMarginPct = grossMarginUsd / planPriceUsd
```

## Scenarios

Use three scenarios for release approval:

- `Base`: current known ICP storage assumptions
- `Upside`: lower realized costs / better mix
- `Stress`: higher storage and fee assumptions

## Suggested Baseline Assumptions

- `safetyMultiplier = 1.5`
- `paymentFeePct = 0.04`
- `paymentFeeFixedUsd = 0.30`
- `opsReserveUsd = 1.00` for Signature, `2.00` for Legacy
- `reservedMonths`:
  - Signature: `60` (5 years)
  - Legacy: `600` (50 years)

## Release Gate

- Do not ship pricing/limit changes unless stress scenario margin is `>= 55%`.
- Re-run model before:
  - any tier price change,
  - any upload limit increase,
  - any retention extension,
  - enabling backup replication.
