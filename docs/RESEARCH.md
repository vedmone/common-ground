# Why a shared review room

Research reviewed October 28–29, 2026. This is a product hypothesis supported by human-computer interaction research, not a claim that this application has already demonstrated measured superiority.

## The user problem

Design feedback is situated. "This is too heavy" is meaningful only in relation to a target, surrounding content, a moment in the interaction and the user's intended outcome. A transcript preserves the words but often loses the referent. Requiring the user to restate everything as an exact prompt increases coordination effort.

## Relevant evidence

1. [Clark & Brennan, Grounding in Communication (1991)](https://web.stanford.edu/~clark/1990s/Clark%2C%20H.H.%20_%20Brennan%2C%20S.E.%20_Grounding%20in%20communication_%201991.pdf): participants continuously establish evidence of shared understanding. Product implication: the AI should point back, acknowledge uncertainty and allow fast conversational correction.
2. [Gergle, Kraut & Fussell, Using Visual Information for Grounding and Awareness in Collaborative Tasks (2013)](https://collablab.northwestern.edu/pubs/HCI2013-GergleKrautFussell-UsingVisualInformationforGroundingandAwarenessinCollaborativeTasks.pdf): immediate shared visual context supports both task awareness and conversational grounding. Product implication: keep voice and preview synchronized, preserve target identity, and surface changes immediately.
3. [D'Angelo & Begel, Shared Gaze Awareness for Pair Programmers (CHI 2017)](https://www.microsoft.com/en-us/research/publication/improving-communication-pair-programmers-using-shared-gaze-awareness/): visible attention helped partners resolve implicit references. Product implication: use separate cursors and purposeful highlights as communication.
4. [Huang & Thomaz, Joint Attention in Human–Robot Interaction](https://cdn.aaai.org/ocs/2173/2173-9657-1-PB.pdf): responding to, initiating and confirming shared attention can improve transparency and collaboration. Product implication: the AI cursor must be able to initiate attention, not merely follow the human cursor.

These studies involve human collaboration or embodied agents. Applying the findings to this AI design room is an inference that still requires evaluation with actual users.

## Competitive landscape

- [Google DeepMind AI Pointer](https://deepmind.google/blog/ai-pointer/) explores point-and-speak interaction and natural references such as "this" and "that".
- [Gemini Live in Chrome](https://support.google.com/gemini/answer/16363185) provides interruptible conversation while sharing browser context, including content highlighting.
- [Cursor Design Mode](https://prod.cursor.com/docs/agent/design-mode) connects selected interface elements and annotations to agent source edits.
- [Cua](https://cua.ai/) provides independent human and agent cursors on a shared desktop.
- [VoiceDOM](https://voicedom.dev/) joins voice feedback to DOM element context for coding-agent handoff.

Individual primitives already exist. The opportunity is their integration into a coherent review ritual: observe, point, clarify, implement, demonstrate, accept or refine. Absence from this research is not proof that no competitor offers the same workflow.

## Interaction decisions

- Hover is tentative; a locked selection is strong evidence.
- The AI's cursor makes its chosen referent visible before acting.
- Clarify only when different interpretations would materially change the result.
- Preserve the target and conversation when generating an edit.
- Separate "thinking" from "editing" and "ready"; never imply completion prematurely.
- Keep a visible checkpoint and a reliable undo path.
- Describe the observed result, not an unverified claim about the source.
- Keep audio, transcript, element context and accepted/rejected versions associated.

## Evaluation plan

Compare four modes on the same ambiguous UI feedback tasks: typed prompts; voice transcripts; voice plus human pointing; voice plus reciprocal AI pointing and clarification. Measure time to accepted change, target errors, rework, clarification turns, accepted edit rate, perceived effort and calibrated trust. The product earns a "better" claim by reducing coordination effort and wrong edits.
