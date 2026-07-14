# Server-backed agents use canonical service launch

Eve-style agents are agents when they expose a talkable model-backed participant, even if their launch command starts a dev server. QuantFlow should treat `npm run dev` as the canonical launch shape for Eve agents and use a delivery adapter to talk to the running service; terminal chat shims such as `npm run chat` are temporary bridge plumbing, not the product model.
