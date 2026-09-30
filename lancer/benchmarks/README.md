# Phase 0 Benchmarks

性能优化必须以本目录数据与 [docs/BENCHMARK_PLAN.md](../docs/BENCHMARK_PLAN.md) 为准。

清单：startup、idle RSS、logs 10k/100k/1M、100MB/1GB/5GB、keyword/regex search、1/3/10 pod stream × 5/30 min、open/close log×100、terminal×100、cluster switch×50。

Phase 0 仅建立目录与计划；harness 在 Phase 2 log engine 后补齐。不要把 mock viewer 的数字当成生产基线。
