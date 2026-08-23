# Contributing

Use pnpm 11 and Node.js 24.

```sh
pnpm --config.minimumReleaseAge=0 install
pnpm --config.minimumReleaseAge=0 dev
pnpm --config.minimumReleaseAge=0 check
```

Add a Changeset for user-visible changes:

```sh
pnpm --config.minimumReleaseAge=0 changeset
```

Keep changes focused. Raw input, optimizer, trainer, storage, and inference boundaries should remain explicit.
