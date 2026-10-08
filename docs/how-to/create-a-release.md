# Create a release

For maintainers. Releases are published from a maintainer's machine
with the scripts in `package.json`.

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
8.4.0 on are published as `@seneca/transport`; `--access public` is
required because the name is scoped. Versions up to 8.3.0 were
published as `seneca-transport`, which Seneca 3 still depends on. The
published files are listed in the `files` field: `transport.js`,
`lib/`, `docs/` (these pages and the example programs), `README.md`
and `LICENSE`. Check the contents with `npm pack --dry-run` before
publishing.
