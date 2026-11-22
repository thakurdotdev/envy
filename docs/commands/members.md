# envy members / envy accept

| Command                                                      | What it does                                                                                              |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `envy members ls [--json]`                                   | members, roles and key fingerprints                                                                       |
| `envy members invite <email> [--role admin\|member\|viewer]` | prints a link that works once, for 7 days, for that email's GitHub account                                |
| `envy accept <link>`                                         | joins with the link and shows your fingerprint                                                            |
| `envy members grant [member] [--yes]`                        | shows the waiting member's fingerprint; compare it with them, then their keys are wrapped on your machine |
| `envy members role <member> <role>`                          | changes a role                                                                                            |
| `envy members rm <member> [--yes]`                           | removes them and gives every environment a new key; change the real credentials too                       |

Roles: owner, admin (manage people and tokens), member (push), viewer (pull only).
