# Prove AgentOS before Eve adaptation

QuantFlow will prove a plain AgentOS runtime path before adapting Eve agents into AgentOS. The first proof should create an AgentOS session with built-in software, send a prompt, observe session events, capture a reply, and record the result. Only after that works should QuantFlow attempt Eve-through-AgentOS, so failures can be diagnosed as AgentOS runtime issues, Eve packaging issues, or bridge/adaptation issues instead of one combined unknown.
