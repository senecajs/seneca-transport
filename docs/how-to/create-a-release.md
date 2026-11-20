# Create a release

For maintainers. Releases are published from a maintainer's machine
with the scripts in `package.json`.

Version 9.0.0 is the first version published under the scoped name
`@seneca/transport`. The first publish of a new scoped name is a manual
bootstrap publish by a maintainer whose npm account uses two-factor
authentication (`npm publish --access public`). After that, releases
are planned to move to a GitHub Actions workflow with npm trusted
publishing; this page will be updated when that workflow exists.

1. Review GitHub issues and pull requests; merge what belongs in the
   release. Make sure the `build` workflow is green on `master`.
2. Add an entry to `CHANGES.md`: `## X.Y.Z YYYY-MM-DD` followed by the
   release notes.
3. Set `"version": "X.Y.Z"` in `package.json` by hand (do not use
   `npm version`, which would also commit and tag).
4. From a clean checkout of `master` run:

   ```sh
   npm run repo-publish
   ```

   This runs `reset` (removes `node_modules` and lock files, installs,
   tests), then `repo-publish-quick`: `prettier`, the tests,
   `repo-tag` (commits everything as `vX.Y.Z`, pushes, tags `vX.Y.Z`
   and pushes the tag) and `npm publish --access public`. Use
   `npm run repo-publish-quick` to skip the reinstall.
5. Go to the [GitHub releases page](https://github.com/senecajs/seneca-transport/releases),
   draft a new release for the tag, paste the `CHANGES.md` entry and
   publish it.
6. Notify core maintainers of the release via email.

`npm publish` uses the `name` field of `package.json`, so releases from
9.0.0 on are published as `@seneca/transport`; `--access public` is
required because the name is scoped. Versions up to 8.3.0 were
published as `seneca-transport`. Version 8.4.0 was never published;
its changes are part of 9.0.0. Never deprecate `seneca-transport`:
`seneca@3.38.0` depends on it, and it remains the transport of Seneca 3
applications. The published files are listed in the `files` field:
`transport.js`, `lib/`, `docs/` (these pages and the example programs),
`README.md` and `LICENSE`. Check the contents with
`npm pack --dry-run` before publishing.
