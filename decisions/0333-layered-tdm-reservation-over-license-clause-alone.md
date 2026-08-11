---
Status: accepted
Date: 2026-08-11T06:35:52.651Z
Thread-Id: 01KZQRFXW2YE3JXDBEWQ84CTVQ
---

# 0333. Express the AI-training refusal in machine-readable form, not license prose alone

## Context

The anti-AI-training requirement is the weakest of the four and needed an honest strategy rather than a reassuring clause. A copyright license only binds someone who needs permission; if AI training is fair use, the trainer never accepted the license and its terms never attach. US law currently leans against the rightsholder (Bartz v. Anthropic, Jun 2025: training on lawfully-acquired works is fair use; this repo is public and lawfully accessible). The one mechanism with statutory teeth is the EU DSM Directive 2019/790 Art. 4(3) rights reservation, made enforceable against model providers by AI Act Art. 53(1)(c). Critically, a Hamburg Higher Regional Court ruling of 10 Dec 2025 held that natural-language opt-outs in terms of use are INSUFFICIENT - the reservation must be genuinely machine-readable.

## Options

- License clause only - a prose reservation in LICENSE/NOTICE; simplest, but per the Hamburg ruling does not satisfy Art. 4(3) and therefore buys close to nothing legally
- Adopt a dedicated anti-AI license as the base - says the right thing but is unvetted, has no SPDX id and reads to scanners as no license at all
- Layered: PolyForm base + a propagating Required Notice reservation + W3C TDMRep, robots.txt and ai.txt - covers both the contractual and the statutory route

## Outcome

Chose the layered approach: the reservation lives in LICENSE as a propagating `Required Notice:` line, in NOTICE as explicit prose invoking Art. 4(3), and in three machine-readable files (.well-known/tdmrep.json implementing the W3C TDM Reservation Protocol with tdm-reservation 1, robots.txt with 28 AI-crawler blocks, ai.txt). KNOWN AND ACCEPTED LIMITATION, stated to the user before they chose: these three files only function at the root of a domain the rightsholder controls. Crawlers read github.com/robots.txt, not the repo's, so while the project is GitHub-hosted they are documentation of intent and a git-timestamped objection, NOT active controls. The conclusion that follows and should drive future work: for this requirement, HOSTING is a larger lever than licensing, and a self-hosted mirror on an owned domain is what actually activates the EU mechanism.
