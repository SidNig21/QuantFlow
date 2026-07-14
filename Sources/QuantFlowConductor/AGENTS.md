# Conductor Projection Guide

This module is read-only. It may query and observe `QuantFlowCore`, but it must
never call `KernelStore.dispatch`, retain a private plan, or write an external
planner/runtime store. Operator actions belong in the App layer and must route
through an explicit Kernel command.
