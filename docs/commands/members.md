# envy members / envy accept

| Command                                                      | What it does                                                                                              |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `envy members ls [--json]`                                   | members, roles, access and key fingerprints                                                               |
| `envy members invite <email> [--role admin\|member\|viewer]` | prints a link that works once, for 7 days, for that email's GitHub account                                |
| `envy accept <link>`                                         | joins with the link and shows your fingerprint                                                            |
| `envy members grant [member] [--access <stages>] [--yes]`    | shows the waiting member's fingerprint; compare it with them, then their keys are wrapped on your machine |
| `envy members access <member> <stages\|all>`                 | chooses which environments a member can read, such as `development,staging`                               |
| `envy members role <member> <role>`                          | changes a role                                                                                            |
| `envy members rm <member> [--yes]`                           | removes them and gives every environment they could read a new key; change the real credentials too       |

Roles: owner, admin (manage people and tokens), member (push), viewer (pull only).

## Access per environment

A role says what someone can do; access says where. Members and viewers can be
limited to some stages, for example a contractor who gets `development` only:

```sh
envy members grant sam --access development
envy members access sam development,staging   # later: add staging
envy members access sam all                   # every environment again
```

- `shared` is always included, and in a monorepo a stage covers every app.
- They only ever get the keys of those environments, so even a hacked server
  could not give them the others in readable form. The server refuses the
  others too.
- Taking a stage away gives it a new key that only the people who keep it can
  open. Change the real credentials they may have copied.
- A new stage (`envy env add`) is not given to limited members.
- Admins and owners always have every environment, because they manage the keys.

The dashboard's Members page does the same: an **Access** column, a choice when
giving access, and **Change** for members who already have it.
