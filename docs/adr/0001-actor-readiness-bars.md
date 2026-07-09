# Actor readiness bars

QuantFlow will not treat all Dock-launched actors as alive at process spawn. Agent cards require a proven send/reply round trip before they count as alive, while worker cards require a trustworthy process-ready milestone. This chooses stronger proof for conversational actors because the product goal is not just to show terminals, but to prove that tile-bound actors can actually be coordinated.
