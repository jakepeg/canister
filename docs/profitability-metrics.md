# Profitability Metrics

## Core Metrics

- Plan mix (`free`, `signature`, `legacy`)
- Bytes stored by plan
- Active vs expired Signature capsules
- Payment conversion and fee rate by method
- Revenue per capsule and gross margin estimate per cohort

## Data Sources

- Backend query: `getProfitabilitySnapshot` (admin only)
- Relay logs for Stripe intent creation and webhook confirmation
- Product analytics for create-flow and unlock funnel

## Alert Thresholds

- Stress-case projected margin below `55%`
- Signature expired:active ratio drift outside expected range
- Fallback pricing usage in production (must be zero)
- Payment confirmation failures above baseline

## Operational Cadence

- Weekly dashboard review
- Monthly pricing/limits review against reserve assumptions
- Quarterly retention policy review
