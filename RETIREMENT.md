# Retirement

Current v3 retirement and "do not do early" rules live in `BUILD_PLAN_V3.md`.

Use `BUILD_PLAN_V2.md` only for shipped v2 behavior and old rejection context.

Retirement/deletion work must stay separate from replacement work. Do not remove old runtime paths in the same commit that introduces their v3 replacement unless `BUILD_PLAN_V3.md` explicitly calls for it.
