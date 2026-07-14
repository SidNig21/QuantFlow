# Harness Boundary Guide

Harnesses adapt external runtimes and return evidence only. This module must
never import a UI target, receive `KernelStore`, dispatch a Kernel command, or
persist a runtime mirror. The App layer chooses which returned evidence becomes
a Kernel command, receipt, or visible transcript.
