# @handrail/sdk-node

Handrail Signals Node SDK package target for Product Signals and Runtime Signals.

## Package Identity and Compatibility Alias Policy

`@handrail/sdk-node` is the canonical package identity for this Signals Node SDK
port. The package metadata in this repository should continue to use
`@handrail/sdk-node` as the package name.

The legacy `handrail-apm-node-sdk` ADR
`docs/adr/0001-node-sdk-package-naming.md` kept `@handrail/apm-node` as the
canonical legacy install and import path for that repo, and said that any future
rename must preserve `@handrail/apm-node` as a compatibility package or
documented alias for a supported migration window.

This port makes the scoped decision for the new Signals SDK repository: it does
not create, publish, or document `@handrail/apm-node` as an active alias package
for `@handrail/sdk-node` in this owner goal. Existing app consumers remain on
their current `@handrail/apm-node` dependency and import path until a later
consumer/package migration goal defines the compatibility-window mechanics.

Any `@handrail/apm-node` alias package, npm deprecation notice, generated
install snippet change, consumer dependency update, or consumer import migration
is out of scope for this SDK port.

## Known Consumers and Migration Boundary

The only known current consumers of the legacy Node SDK are:

- Hitcents Website
- Demo app

Those consumers must not be migrated as part of this SDK port. This repository is
the target canonical package for the Handrail Signals Node SDK, but this port does
not change consumer app dependencies, imports, generated install snippets,
publishing configuration, or deployment state.

Consumer dependency and import migration for Hitcents Website and Demo app belongs
to a later owner goal after the `@handrail/sdk-node` port is complete. Until that
later migration work is explicitly scoped, keep app consumer repositories and app
package manifests unchanged.

This SDK-port goal is limited to the Node SDK package surface. Browser error
capture and browser Runtime Signals are out of scope for this goal and should not
be implied by this package documentation.
