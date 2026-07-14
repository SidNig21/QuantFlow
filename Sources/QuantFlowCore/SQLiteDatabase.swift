import CSQLite

enum SQLiteValue { case text(String), integer(Int64), real(Double), null }

final class SQLiteDatabase {
    private var handle: OpaquePointer?
    private let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

    init(path: String) throws {
        var pointer: OpaquePointer?
        let result = sqlite3_open_v2(path, &pointer, SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE | SQLITE_OPEN_FULLMUTEX, nil)
        guard result == SQLITE_OK, let pointer else {
            sqlite3_close(pointer)
            throw KernelError.database("Could not open SQLite database")
        }
        handle = pointer
        try execute("PRAGMA foreign_keys = ON")
        sqlite3_busy_timeout(pointer, 2_500)
    }

    deinit { sqlite3_close(handle) }

    func executeScript(_ script: String) throws {
        var error: UnsafeMutablePointer<CChar>?
        guard sqlite3_exec(handle, script, nil, nil, &error) == SQLITE_OK else {
            defer { sqlite3_free(error) }
            throw KernelError.database(error.map { String(cString: $0) } ?? "SQLite schema error")
        }
    }

    func execute(_ sql: String, _ values: [SQLiteValue] = []) throws {
        let statement = try prepare(sql); defer { sqlite3_finalize(statement) }
        try bind(values, statement)
        guard sqlite3_step(statement) == SQLITE_DONE else { throw error() }
    }

    func query<T>(_ sql: String, _ values: [SQLiteValue] = [], _ map: (OpaquePointer) throws -> T) throws -> [T] {
        let statement = try prepare(sql); defer { sqlite3_finalize(statement) }
        try bind(values, statement)
        var output: [T] = []
        while true {
            let result = sqlite3_step(statement)
            if result == SQLITE_DONE { return output }
            guard result == SQLITE_ROW else { throw error() }
            output.append(try map(statement))
        }
    }

    func transaction<T>(_ body: () throws -> T) throws -> T {
        try execute("BEGIN IMMEDIATE")
        do { let result = try body(); try execute("COMMIT"); return result }
        catch { try? execute("ROLLBACK"); throw error }
    }

    func text(_ row: OpaquePointer, _ index: Int32) -> String? {
        guard let value = sqlite3_column_text(row, index) else { return nil }
        return String(cString: value)
    }
    func integer(_ row: OpaquePointer, _ index: Int32) -> Int64 { sqlite3_column_int64(row, index) }
    func real(_ row: OpaquePointer, _ index: Int32) -> Double { sqlite3_column_double(row, index) }

    private func prepare(_ sql: String) throws -> OpaquePointer {
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(handle, sql, -1, &statement, nil) == SQLITE_OK, let statement else { throw error() }
        return statement
    }
    private func bind(_ values: [SQLiteValue], _ statement: OpaquePointer) throws {
        for (offset, value) in values.enumerated() {
            let index = Int32(offset + 1)
            let result: Int32
            switch value {
            case let .text(value): result = sqlite3_bind_text(statement, index, value, -1, transient)
            case let .integer(value): result = sqlite3_bind_int64(statement, index, value)
            case let .real(value): result = sqlite3_bind_double(statement, index, value)
            case .null: result = sqlite3_bind_null(statement, index)
            }
            guard result == SQLITE_OK else { throw error() }
        }
    }
    private func error() -> KernelError { KernelError.database(handle.flatMap { sqlite3_errmsg($0) }.map { String(cString: $0) } ?? "Unknown SQLite error") }
}
