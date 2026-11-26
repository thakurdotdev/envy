# envy env

- `envy env ls [--json]` lists environments with their latest version and tags (default, shared, protected).

`shared` is not a place to deploy: it holds values every environment needs (an org name, a log level), set once. `envy pull` and `envy run` merge it under the chosen environment, and a value with the same name in the environment wins.

- `envy env add <name> [--protected]` adds an environment to the root and the same stage to every app, in one step; each key is made on your machine and wrapped for every active member.
