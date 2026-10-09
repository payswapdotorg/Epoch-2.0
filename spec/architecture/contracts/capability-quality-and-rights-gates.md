# Capability Quality, Reference Benchmarks and Rights Gates

## Quality status

Every capability publishes an evidence-backed status:
- PROTOTYPE: incomplete or smoke-tested.
- QUALIFIED_FOR_NAMED_TASKS: passes a defined task suite within explicit limits.
- REFERENCE_COMPARABLE: passes required differential tests for a named reference version/domain.
- REFERENCE_SUPERIOR_ON_NAMED_METRICS: exceeds stated metrics without losing required correctness.
- ENGINEERING_QUALIFIED: also passes applicable domain, safety and review gates.

Do not claim “top tier,” “equivalent,” “fully automated” or “reference superior” without task coverage, versions, thresholds, evidence and known limitations.

## Benchmark dimensions

Choose measures appropriate to each capability: task success/correctness; engineering accuracy and tolerances; coverage; reliability/repeatability; latency/throughput/resources/offline behavior; errors/recovery/data-loss; usability/accessibility; import/export/interoperability; security/privacy/authorization; and total lifecycle cost including maintenance, compute, licensing and rework.

Use normal cases, edge cases, invalid inputs, interruptions, large data, concurrency where relevant, malformed files, migration/version changes and known failure modes. Preserve test corpus rights and provenance. A CAD visualizer and a structural solver must not share one misleading universal score.

## Engineering gates

Safety, compliance, mandatory performance, durability, reliability and explicit client requirements are hard constraints, not weighted preferences. Cost or speed cannot compensate for a failure. If evidence is insufficient, mark conditional/blocked or request qualified review.

## Rights/provenance gate

Record reference product/version; ownership/license rights; jurisdictions reviewed; inspection method; permitted documentation, outputs and test materials; allowed/prohibited decompilation or internal analysis; any anti-circumvention restrictions; dependencies and license compatibility; approving reviewer and date; scope/expiration/revocation.

Separate evidence paths: public documentation, lawful observed behavior, standards, compatible open-source code, licensed components, materials owned by the requester, vendor-authorized private information, and specifically authorized implementation-internal analysis. These are not interchangeable. Legal exceptions are fact-specific and not blanket authorization to clone a product. Stop for review when the rights basis is ambiguous.

References for legal review:
- EU Software Directive: https://eur-lex.europa.eu/eli/dir/2009/24/oj/eng
- U.S. 17 U.S.C. § 1201: https://www.govinfo.gov/content/pkg/USCODE-2024-title17/html/USCODE-2024-title17-chap12-sec1201.htm
- U.S. Copyright Office § 1201 rulemaking: https://www.copyright.gov/1201/

## Release gates

Block release if rights/provenance is unresolved, dependency-license review is missing, benchmarks are not reproducible, thresholds or safety checks fail, limitations are concealed, or autonomy exceeds the approved permission/risk profile.
