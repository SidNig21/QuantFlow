import Foundation

public final class KernelStore {
    private let database: SQLiteDatabase
    private var eventSubscribers: [UUID: (KernelEvent) -> Void] = [:]

    public init(path: String) throws {
        database = try SQLiteDatabase(path: path)
        try installSchema()
    }

    public static func inMemory() throws -> KernelStore { try KernelStore(path: ":memory:") }

    public func dispatch(_ command: KernelCommand, requestedBy: String = "operator") throws -> KernelCommandResult {
        let commandID = KernelIDs.make(); let now = KernelIDs.timestamp()
        try database.execute("INSERT INTO commands (id, command_type, requested_by, payload_json, status, created_at) VALUES (?, ?, ?, '{}', 'pending', ?)", [.text(commandID), .text(command.type), .text(requestedBy), .integer(now)])
        do {
            let result = try database.transaction { try apply(command, commandID: commandID) }
            try database.execute("UPDATE commands SET status = 'accepted', result_json = ?, completed_at = ? WHERE id = ?", [.text("{\"subject_id\":\"\(result.subjectID)\"}"), .integer(KernelIDs.timestamp()), .text(commandID)])
            eventSubscribers.values.forEach { $0(result.event) }
            return result
        } catch {
            try? database.execute("UPDATE commands SET status = 'rejected', rejection_reason = ?, completed_at = ? WHERE id = ?", [.text(error.localizedDescription), .integer(KernelIDs.timestamp()), .text(commandID)])
            throw error
        }
    }

    public func snapshot(workflowID: KernelID) throws -> WorkflowSnapshot {
        guard let workflow = try workflow(workflowID) else { throw KernelError.missing(workflowID) }
        return WorkflowSnapshot(workflow: workflow, tiles: try tiles(workflowID), workers: try workers(workflowID), tasks: try tasks(workflowID), connections: try connections(workflowID), receipts: try receipts(workflowID))
    }

    public func events(workflowID: KernelID) throws -> [KernelEvent] {
        try database.query("SELECT id, workflow_id, task_id, tile_id, kind, created_at FROM events WHERE workflow_id = ? ORDER BY created_at, id", [.text(workflowID)]) { row in
            KernelEvent(id: database.text(row, 0)!, workflowID: database.text(row, 1)!, taskID: database.text(row, 2), tileID: database.text(row, 3), kind: database.text(row, 4)!, createdAt: database.integer(row, 5))
        }
    }

    public func workflows() throws -> [Workflow] {
        try database.query("SELECT id, name, objective, status FROM workflows ORDER BY created_at") {
            Workflow(id: database.text($0, 0)!, name: database.text($0, 1)!, objective: database.text($0, 2)!, status: WorkflowStatus(rawValue: database.text($0, 3)!)!)
        }
    }

    @discardableResult
    public func subscribe(_ handler: @escaping (KernelEvent) -> Void) -> UUID {
        let id = UUID()
        eventSubscribers[id] = handler
        return id
    }

    public func unsubscribe(_ id: UUID) { eventSubscribers[id] = nil }

    private func apply(_ command: KernelCommand, commandID: KernelID) throws -> KernelCommandResult {
        let now = KernelIDs.timestamp()
        switch command {
        case let .createWorkflow(name, objective):
            let id = KernelIDs.make()
            try database.execute("INSERT INTO workflows (id, name, objective, status, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?)", [.text(id), .text(name), .text(objective), .integer(now), .integer(now)])
            return try result(commandID, id, workflowID: id, taskID: nil, tileID: nil, kind: "workflow.created")
        case let .createTile(workflowID, displayName, kind, x, y):
            try requireWorkflow(workflowID); let id = KernelIDs.make()
            try database.execute("INSERT INTO tiles (id, workflow_id, display_name, tile_kind, x, y, width, height, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 320, 240, 'idle', ?, ?)", [.text(id), .text(workflowID), .text(displayName), .text(kind.rawValue), .real(x), .real(y), .integer(now), .integer(now)])
            return try result(commandID, id, workflowID: workflowID, taskID: nil, tileID: id, kind: "tile.created")
        case let .moveTile(tileID, x, y):
            guard let tile = try tile(tileID) else { throw KernelError.missing(tileID) }
            try database.execute("UPDATE tiles SET x = ?, y = ?, updated_at = ? WHERE id = ?", [.real(x), .real(y), .integer(now), .text(tileID)])
            return try result(commandID, tileID, workflowID: tile.workflowID, taskID: nil, tileID: tileID, kind: "tile.moved")
        case let .createWorker(tileID, role, harness, model):
            guard let tile = try tile(tileID) else { throw KernelError.missing(tileID) }; let id = KernelIDs.make()
            try database.execute("INSERT INTO worker_instances (id, tile_id, workflow_id, role, harness, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'spawning', ?, ?)", [.text(id), .text(tileID), .text(tile.workflowID), .text(role), .text(harness), .text(model), .integer(now), .integer(now)])
            return try result(commandID, id, workflowID: tile.workflowID, taskID: nil, tileID: tileID, kind: "worker.created")
        case let .createTask(workflowID, title, objective):
            try requireWorkflow(workflowID); let id = KernelIDs.make(); let correlationID = KernelIDs.make()
            try database.execute("INSERT INTO tasks (id, workflow_id, correlation_id, title, objective, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'open', ?, ?)", [.text(id), .text(workflowID), .text(correlationID), .text(title), .text(objective), .integer(now), .integer(now)])
            try appendReceipt(workflowID, taskID: id, type: .taskCreated, summary: title)
            return try result(commandID, id, workflowID: workflowID, taskID: id, tileID: nil, kind: "task.created")
        case let .transitionTask(taskID, to):
            guard let task = try task(taskID) else { throw KernelError.missing(taskID) }
            guard Self.canTransition(task.status, to) else { throw KernelError.invalidTransition(task.status, to) }
            if to == .complete && !hasVerificationPassed(taskID) {
                throw KernelError.database("Task requires a verification_passed receipt before completion")
            }
            try database.execute("UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?", [.text(to.rawValue), .integer(now), .text(taskID)])
            try appendReceipt(task.workflowID, taskID: taskID, type: Self.receipt(for: to), summary: "Task moved to \(to.rawValue).")
            return try result(commandID, taskID, workflowID: task.workflowID, taskID: taskID, tileID: nil, kind: "task.\(to.rawValue)")
        case let .postReceipt(workflowID, taskID, type, summary):
            try requireWorkflow(workflowID); let id = try appendReceipt(workflowID, taskID: taskID, type: type, summary: summary)
            return try result(commandID, id, workflowID: workflowID, taskID: taskID, tileID: nil, kind: "receipt.posted")
        case let .createConnection(workflowID, from, to, semantic, label):
            try requireWorkflow(workflowID); let id = KernelIDs.make()
            try database.execute("INSERT INTO connections (id, workflow_id, from_tile_id, to_tile_id, semantic_type, label, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", [.text(id), .text(workflowID), .text(from), .text(to), .text(semantic.rawValue), label.map(SQLiteValue.text) ?? .null, .integer(now)])
            return try result(commandID, id, workflowID: workflowID, taskID: nil, tileID: from, kind: "connection.created")
        }
    }

    private func result(_ commandID: KernelID, _ subjectID: KernelID, workflowID: KernelID, taskID: KernelID?, tileID: KernelID?, kind: String) throws -> KernelCommandResult {
        let event = KernelEvent(id: KernelIDs.make(), workflowID: workflowID, taskID: taskID, tileID: tileID, kind: kind, createdAt: KernelIDs.timestamp())
        try database.execute("INSERT INTO events (id, workflow_id, task_id, tile_id, kind, created_at) VALUES (?, ?, ?, ?, ?, ?)", [.text(event.id), .text(workflowID), taskID.map(SQLiteValue.text) ?? .null, tileID.map(SQLiteValue.text) ?? .null, .text(kind), .integer(event.createdAt)])
        return KernelCommandResult(commandID: commandID, subjectID: subjectID, event: event)
    }

    @discardableResult private func appendReceipt(_ workflowID: KernelID, taskID: KernelID?, type: ReceiptType, summary: String) throws -> KernelID {
        let id = KernelIDs.make()
        try database.execute("INSERT INTO receipts (id, workflow_id, task_id, type, summary, created_at) VALUES (?, ?, ?, ?, ?, ?)", [.text(id), .text(workflowID), taskID.map(SQLiteValue.text) ?? .null, .text(type.rawValue), .text(summary), .integer(KernelIDs.timestamp())])
        return id
    }

    private func requireWorkflow(_ id: KernelID) throws { if try workflow(id) == nil { throw KernelError.missing(id) } }
    private func hasVerificationPassed(_ taskID: KernelID) -> Bool {
        (try? database.query("SELECT id FROM receipts WHERE task_id = ? AND type = 'verification_passed' LIMIT 1", [.text(taskID)]) { _ in true }.first) ?? false
    }
    private func workflow(_ id: KernelID) throws -> Workflow? { try database.query("SELECT id, name, objective, status FROM workflows WHERE id = ?", [.text(id)]) { Workflow(id: database.text($0, 0)!, name: database.text($0, 1)!, objective: database.text($0, 2)!, status: WorkflowStatus(rawValue: database.text($0, 3)!)!) }.first }
    private func tile(_ id: KernelID) throws -> Tile? { try database.query("SELECT id, workflow_id, display_name, tile_kind, x, y, width, height, status FROM tiles WHERE id = ?", [.text(id)], makeTile).first }
    private func tiles(_ workflowID: KernelID) throws -> [Tile] { try database.query("SELECT id, workflow_id, display_name, tile_kind, x, y, width, height, status FROM tiles WHERE workflow_id = ? ORDER BY created_at", [.text(workflowID)], makeTile) }
    private func makeTile(_ row: OpaquePointer) -> Tile { Tile(id: database.text(row, 0)!, workflowID: database.text(row, 1)!, displayName: database.text(row, 2)!, kind: TileKind(rawValue: database.text(row, 3)!)!, x: database.real(row, 4), y: database.real(row, 5), width: database.real(row, 6), height: database.real(row, 7), status: TileStatus(rawValue: database.text(row, 8)!)!) }
    private func workers(_ workflowID: KernelID) throws -> [WorkerInstance] { try database.query("SELECT id, tile_id, workflow_id, role, harness, model, status FROM worker_instances WHERE workflow_id = ? ORDER BY created_at", [.text(workflowID)]) { WorkerInstance(id: database.text($0, 0)!, tileID: database.text($0, 1)!, workflowID: database.text($0, 2)!, role: database.text($0, 3)!, harness: database.text($0, 4)!, model: database.text($0, 5)!, status: WorkerStatus(rawValue: database.text($0, 6)!)!) } }
    private func tasks(_ workflowID: KernelID) throws -> [Task] { try database.query("SELECT id, workflow_id, correlation_id, title, objective, status FROM tasks WHERE workflow_id = ? ORDER BY created_at", [.text(workflowID)]) { Task(id: database.text($0, 0)!, workflowID: database.text($0, 1)!, correlationID: database.text($0, 2)!, title: database.text($0, 3)!, objective: database.text($0, 4)!, status: TaskStatus(rawValue: database.text($0, 5)!)!) } }
    private func task(_ id: KernelID) throws -> Task? { try database.query("SELECT id, workflow_id, correlation_id, title, objective, status FROM tasks WHERE id = ?", [.text(id)]) { Task(id: database.text($0, 0)!, workflowID: database.text($0, 1)!, correlationID: database.text($0, 2)!, title: database.text($0, 3)!, objective: database.text($0, 4)!, status: TaskStatus(rawValue: database.text($0, 5)!)!) }.first }
    private func receipts(_ workflowID: KernelID) throws -> [Receipt] { try database.query("SELECT id, workflow_id, task_id, type, summary FROM receipts WHERE workflow_id = ? ORDER BY created_at, id", [.text(workflowID)]) { Receipt(id: database.text($0, 0)!, workflowID: database.text($0, 1)!, taskID: database.text($0, 2), type: ReceiptType(rawValue: database.text($0, 3)!)!, summary: database.text($0, 4)!) } }
    private func connections(_ workflowID: KernelID) throws -> [Connection] { try database.query("SELECT id, workflow_id, from_tile_id, to_tile_id, semantic_type, label FROM connections WHERE workflow_id = ? ORDER BY created_at", [.text(workflowID)]) { Connection(id: database.text($0, 0)!, workflowID: database.text($0, 1)!, fromTileID: database.text($0, 2)!, toTileID: database.text($0, 3)!, semantic: ConnectionSemantic(rawValue: database.text($0, 4)!)!, label: database.text($0, 5)) } }

    private static func canTransition(_ from: TaskStatus, _ to: TaskStatus) -> Bool {
        switch (from, to) {
        case (.open, .claimed), (.claimed, .working), (.claimed, .open), (.working, .submitted), (.working, .blocked), (.working, .failed), (.submitted, .verifying), (.submitted, .working), (.submitted, .failed), (.verifying, .complete), (.verifying, .working), (.verifying, .failed), (.blocked, .working), (.blocked, .failed): true
        default: false
        }
    }
    private static func receipt(for status: TaskStatus) -> ReceiptType {
        switch status { case .claimed: .taskClaimed; case .working: .taskStarted; case .submitted: .taskSubmitted; case .verifying: .verificationStarted; case .complete: .taskCompleted; case .blocked: .taskBlocked; case .failed: .taskFailed; case .open: .progress }
    }

    private func installSchema() throws {
        try database.executeScript("""
        CREATE TABLE IF NOT EXISTS workflows (id TEXT PRIMARY KEY, name TEXT NOT NULL, objective TEXT NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS tiles (id TEXT PRIMARY KEY, workflow_id TEXT NOT NULL REFERENCES workflows(id), display_name TEXT NOT NULL, tile_kind TEXT NOT NULL, x REAL NOT NULL, y REAL NOT NULL, width REAL NOT NULL, height REAL NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS worker_instances (id TEXT PRIMARY KEY, tile_id TEXT NOT NULL REFERENCES tiles(id), workflow_id TEXT NOT NULL REFERENCES workflows(id), role TEXT NOT NULL, harness TEXT NOT NULL, model TEXT NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, workflow_id TEXT NOT NULL REFERENCES workflows(id), correlation_id TEXT NOT NULL, title TEXT NOT NULL, objective TEXT NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS receipts (id TEXT PRIMARY KEY, workflow_id TEXT NOT NULL REFERENCES workflows(id), task_id TEXT REFERENCES tasks(id), type TEXT NOT NULL, summary TEXT NOT NULL, created_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, workflow_id TEXT NOT NULL REFERENCES workflows(id), task_id TEXT REFERENCES tasks(id), tile_id TEXT REFERENCES tiles(id), kind TEXT NOT NULL, created_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS connections (id TEXT PRIMARY KEY, workflow_id TEXT NOT NULL REFERENCES workflows(id), from_tile_id TEXT NOT NULL REFERENCES tiles(id), to_tile_id TEXT NOT NULL REFERENCES tiles(id), semantic_type TEXT NOT NULL, label TEXT, created_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS commands (id TEXT PRIMARY KEY, command_type TEXT NOT NULL, requested_by TEXT NOT NULL, payload_json TEXT NOT NULL, result_json TEXT, status TEXT NOT NULL, rejection_reason TEXT, created_at INTEGER NOT NULL, completed_at INTEGER);
        CREATE TRIGGER IF NOT EXISTS receipts_update_block BEFORE UPDATE ON receipts BEGIN SELECT RAISE(ABORT, 'receipt is append-only'); END;
        CREATE TRIGGER IF NOT EXISTS receipts_delete_block BEFORE DELETE ON receipts BEGIN SELECT RAISE(ABORT, 'receipt is append-only'); END;
        CREATE TRIGGER IF NOT EXISTS events_update_block BEFORE UPDATE ON events BEGIN SELECT RAISE(ABORT, 'event is append-only'); END;
        CREATE TRIGGER IF NOT EXISTS events_delete_block BEFORE DELETE ON events BEGIN SELECT RAISE(ABORT, 'event is append-only'); END;
        """)
    }
}
