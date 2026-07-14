# Canvas Projection

This module is an ephemeral Kernel read model for the native SwiftUI canvas.

- It owns no durable workflow state and writes no database rows directly.
- It refreshes snapshots only after Kernel events.
- Drag translation is temporary view state; its final location is sent through a
  Kernel tile command and arrives back in the next snapshot.
- Pan, zoom, and selection are view-local presentation state, never Kernel data.
