# Workflow patches

GitHub requires the `workflow` OAuth scope to add or change files under
`.github/workflows/`. The session that prepared this branch did not have
it, so the workflow change is provided here as a git patch instead.

Apply it from a checkout with normal credentials:

```sh
git am .patches/*.patch
git rm -r .patches
git commit -m "ci: remove applied workflow patches"
git push
```

| Patch | Changes |
| ----- | ------- |
| `0001-ci-run-the-build-workflow-on-master-and-on-Node.js-2.patch` | `.github/workflows/build.yml`: trigger on `master` and `main` (the workflow only listened on `main`, while the default branch is `master`), and test on Node.js 24 and 22. |

`git apply --check .patches/*.patch` verifies that the patch applies.
