# Linkary public copy policy

Customer-facing Linkary copy must describe the product, the user action, and the result. It must not expose internal implementation details that are not necessary for the user to complete the task.

## Do not expose in normal public or user-facing UI

- internal authentication SDK names
- access-token terminology
- server API keys or credential language
- infrastructure implementation details
- internal provider-selection logic
- TwitterAPI.io or other paid data-provider names
- internal database or Worker terminology

## Allowed where it helps the user

- X, Telegram, Google, email, and other platforms the user intentionally connects
- Coinbase Wallet when the wallet brand itself is relevant to the user
- Linkary verification labels such as Manual, Linkary tracked, Telegram verified, or Provider verified

## Internal surfaces

Superadmin and engineering documentation may name providers when needed for operations, security, cost control, or configuration. Normal creators and projects should not need to know which internal API or SDK produced a workflow.

## Creator Earn Access

The public flow should be described as:

Creator -> Sign in -> Receive approved Linkary post -> Post on X -> Submit post link -> Review -> Access approved -> Create profile

Manual review is the default. Automated provider verification must never be represented as active unless it is actually configured and operational.
