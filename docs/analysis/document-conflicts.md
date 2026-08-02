# Document conflicts

| Topic            | Earlier text                                  | Controlling decision                                | Resolution                                        |
| ---------------- | --------------------------------------------- | --------------------------------------------------- | ------------------------------------------------- |
| UI library       | Internal library, MUI or Ant Design after POC | Spec H DEC-01 and Guide 19.1 require MUI            | MUI only through `packages/ui`                    |
| Error message    | Some examples use localized `message`         | Appendix H/Guide 19.4 use `message_key`             | Contract uses `message_key`; clients localize     |
| Concurrency HTTP | Older catalog permits 409                     | Appendix H permits 428 missing and 412/409 mismatch | 428 missing If-Match, 412 mismatch                |
| Transfer state   | Older wording can imply Transferred           | Appendix H states it does not exist                 | Store `transferred_at`; use AWAITING_CONFIRMATION |
| Backend choice   | Earlier specification leaves it open          | Guide 19.1 requires NestJS 11                       | NestJS 11                                         |
| Database state   | Generic enum wording                          | Guide 19.3 rejects PostgreSQL business enums        | `varchar` plus canonical CHECK                    |
