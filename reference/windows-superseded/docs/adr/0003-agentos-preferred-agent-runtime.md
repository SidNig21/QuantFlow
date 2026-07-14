# AgentOS preferred agent runtime

QuantFlow will treat AgentOS as the preferred long-term runtime for model-backed Agents when the actor can run inside AgentOS cleanly. This is a preference, not a monopoly: native PTY, Eve server, or other runtimes may remain valid when they provide a clearer contract, but new talkable agents should first be evaluated against the AgentOS session model because it provides isolation, session events, transcript persistence, bindings, permissions, and resume behavior that match QuantFlow's collaboration goals.
