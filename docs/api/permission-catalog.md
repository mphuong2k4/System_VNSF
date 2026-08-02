# Permission catalog

| Resource/action                | Program manager      | School manager               | Student                 |
| ------------------------------ | -------------------- | ---------------------------- | ----------------------- |
| student.read/write             | all, field policy    | assigned effective schools   | self, allowed fields    |
| submission review              | final                | school / final for one-level | no                      |
| submission submit              | support only         | school-managed only          | self-managed self       |
| bank reveal/verify             | explicit / yes       | no                           | own masked/re-auth edit |
| manual transfer create/correct | yes                  | no                           | no                      |
| transfer confirmation          | monitor              | limited monitor              | own only                |
| report/export                  | scoped column policy | assigned schools             | own                     |

Super Admin is technical administration only; business access requires audited break-glass.
