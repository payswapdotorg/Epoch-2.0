# ACR-002 — Task-conditioned reconstruction, capability reproduction, and engineering abundance

**Status:** APPROVED / EFFECTIVE  
**Date:** 2026-10-09  
**Repository:** payswapdotorg/Epoch-2.0

## Decision

Epoch's long-term goal is to automate every engineering task that can be reliably automated and continually find lower-cost ways of delivering required engineering outcomes without relaxing hard quality, safety, reliability, performance, durability or compliance constraints.

The reconstructed world must contain the level and type of detail appropriate to the declared work. Epoch must not require maximum detail before useful work can begin. It should start with available evidence, mark unknowns and inferences, then refine the world to the level needed for the next decision, tolerance and risk.

When a capability of external software cannot be embedded or exposed adequately through a permitted, reliable and maintainable native integration, Epoch shall provide a Capability Reproduction Factory. The factory scopes the missing capability, characterizes its observable behavior and quality bar, evaluates existing/open/licensed foundations, builds an Epoch-native mini-app and proves its quality against repeatable tests. It reproduces a capability slice, not automatically the entire reference product.

Native integration remains preferred when it meets the requirement. Reproduction is the fallback for capabilities that cannot be natively embedded, integrated or operated to the required standard.

## Binding outcomes

1. Task-conditioned reconstruction profiles specify information needs by work type, decision, tolerance, risk and downstream validation.
2. The canonical world preserves evidence, source, uncertainty, assumptions, units, revisions and fitness-for-purpose. Unknowns must not silently become facts.
3. External software is treated as a shared, observable and controllable environment where authorized, not merely a set of MCP/API calls.
4. Connected software and reproduced mini-apps use a generic environment/capability surface. A new vendor or capability must not require a new UI surface type.
5. A mini-app provides both human interaction and agent-usable structured state/actions at workbench quality; a hidden function wrapper alone is insufficient.
6. Claims of parity or superiority require task-specific quality evidence, a declared version and repeatable benchmarks.
7. Human demonstrations and Arena expert deliverables may produce reusable capability candidates, but never automatically grant correctness, permissions or autonomy.
8. Arena remains the final escalation route when the user and current agents cannot close a capability gap.
9. Epoch systematically searches for lower total lifecycle cost/time while maintaining mandatory outcomes and engineering constraints.
10. The existing visual-first milestone and current eligible wave W002/W003/W004 remain unchanged. This extension must not delay Web/Desktop visual closure.

## Rights and implementation-internal analysis

The factory may use public documentation, standards, authorized observation, lawful black-box testing, compatible open-source projects, licensed components, source/binaries owned by the requester, and vendor-authorized materials.

Decompilation or other implementation-internal analysis is permitted only when the project records specific authority and a reviewer has established that the intended technique/use is lawful under applicable license terms and relevant law. It is not a default step. The factory must not bypass access controls or copy protected code, private/proprietary datasets, product assets or distinctive branding without the required rights. When the rights basis is unclear, implementation-internal analysis is blocked pending review; a clean-room behavioral implementation may proceed only on sources and methods approved for that case.

This is an architecture control, not legal advice. Record product/version, ownership/license basis, jurisdictions considered, permitted evidence/methods, restrictions, reviewer and review date for each request.

Official legal materials for qualified review, not blanket permissions:
- EU Software Directive 2009/24/EC, especially Articles 5(3) and 6: https://eur-lex.europa.eu/eli/dir/2009/24/oj/eng
- U.S. Copyright Act, 17 U.S.C. § 1201, including subsection (f): https://www.govinfo.gov/content/pkg/USCODE-2024-title17/html/USCODE-2024-title17-chap12-sec1201.htm
- U.S. Copyright Office § 1201 rulemaking: https://www.copyright.gov/1201/

## Execution impact

This ACR adds contracts and future work orders W027–W035. None becomes eligible until its dependencies are complete. Documentation alone must not advance the current frontier. The TL remains the sole owner of integration, merge, architecture-policy registration and execution-state transitions.

## Required repository outcomes

- task-conditioned reconstruction and fitness-for-purpose contracts;
- application environment and activity/demonstration contracts;
- rights-gated capability reproduction and benchmark contracts;
- capability-gap learning and structured Arena return contracts;
- cost/quality frontier objective and end-to-end acceptance;
- explicit dependencies, isolated ownership and TL handoff.
