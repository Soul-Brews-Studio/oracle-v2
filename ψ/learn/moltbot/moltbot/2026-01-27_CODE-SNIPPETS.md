# Moltbot Code Snippets & Patterns

## Project Overview

**Moltbot** is a sophisticated multi-platform macOS agent framework that provides:
- Menu bar status indicator with real-time activity visualization
- Web-based chat interface (Canvas) for interaction
- Local and remote gateway connectivity modes
- Voice wake word detection (Swabble)
- Permission management and system integration
- Process/node pairing and approval workflows

---

## 1. Main Entry Points

### MenuBar App (SwiftUI)

**File**: `apps/macos/Sources/Clawdbot/MenuBar.swift`

```swift
@main
struct MoltbotApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @State private var state: AppState
    private static let logger = Logger(subsystem: "com.clawdbot", category: "app")
    private let gatewayManager = GatewayProcessManager.shared
    private let controlChannel = ControlChannel.shared
    private let activityStore = WorkActivityStore.shared
    private let connectivityCoordinator = GatewayConnectivityCoordinator.shared

    var body: some Scene {
        MenuBarExtra { MenuContent(state: self.state, updater: self.delegate.updaterController) } label: {
            CritterStatusLabel(
                isPaused: self.state.isPaused,
                isSleeping: self.isGatewaySleeping,
                isWorking: self.state.isWorking,
                earBoostActive: self.state.earBoostActive,
                blinkTick: self.state.blinkTick,
                sendCelebrationTick: self.state.sendCelebrationTick,
                gatewayStatus: self.gatewayManager.status,
                animationsEnabled: self.state.iconAnimationsEnabled && !self.isGatewaySleeping,
                iconState: self.effectiveIconState)
        }
        .menuBarExtraStyle(.menu)
    }
}
```

The app uses SwiftUI's `@main` macro with `MenuBarExtra` for menu bar UI. Key architecture:
- `AppDelegate` handles lifecycle and deep link routing
- Reactive state binding via `@Observable` pattern
- Gateway manager for local service spawning
- Activity store for real-time status visualization

### CLI Entry Point

**File**: `apps/macos/Sources/ClawdbotMacCLI/EntryPoint.swift`

```swift
@main
struct MoltbotMacCLI {
    static func main() async {
        let args = Array(CommandLine.arguments.dropFirst())
        let command = parseRootCommand(args)
        switch command?.name {
        case nil:
            printUsage()
        case "-h", "--help", "help":
            printUsage()
        case "connect":
            await runConnect(command?.args ?? [])
        case "discover":
            await runDiscover(command?.args ?? [])
        case "wizard":
            await runWizardCommand(command?.args ?? [])
        default:
            fputs("moltbot-mac: unknown command\n", stderr)
            printUsage()
            exit(1)
        }
    }
}
```

Simple async CLI router supporting:
- `connect`: Configure and establish connections
- `discover`: Find available gateways
- `wizard`: Interactive setup flow

---

## 2. Core Implementations

### Gateway Process Manager

**File**: `apps/macos/Sources/Clawdbot/GatewayProcessManager.swift`

```swift
@MainActor
@Observable
final class GatewayProcessManager {
    static let shared = GatewayProcessManager()

    enum Status: Equatable {
        case stopped
        case starting
        case running(details: String?)
        case attachedExisting(details: String?)
        case failed(String)
    }

    private(set) var status: Status = .stopped {
        didSet { CanvasManager.shared.refreshDebugStatus() }
    }

    private(set) var log: String = ""
    private(set) var environmentStatus: GatewayEnvironmentStatus = .checking
    private var desiredActive = false

    func setActive(_ active: Bool) {
        // Remote mode should never spawn a local gateway
        if CommandResolver.connectionModeIsRemote() {
            self.desiredActive = false
            self.stop()
            self.status = .stopped
            return
        }
        self.desiredActive = active
        if active {
            self.startIfNeeded()
        } else {
            self.stop()
        }
    }

    func startIfNeeded() {
        guard self.desiredActive else { return }
        guard !CommandResolver.connectionModeIsRemote() else {
            self.status = .stopped
            return
        }

        // Avoid spawning multiple concurrent "start" tasks
        switch self.status {
        case .starting, .running, .attachedExisting:
            return
        case .stopped, .failed:
            break
        }

        self.status = .starting
        Task { [weak self] in
            guard let self else { return }
            // First try to latch onto existing gateway
            if await self.attachExistingGatewayIfAvailable() {
                return
            }
            await self.enableLaunchdGateway()
        }
    }
}
```

**Pattern**: Smart process lifecycle management with idempotency:
- Coalesces rapid start requests
- Attempts to attach to existing processes before spawning
- State machine prevents thrashing
- Weak references for cleanup

### Connection Mode Coordinator

**File**: `apps/macos/Sources/Clawdbot/ConnectionModeCoordinator.swift`

```swift
@MainActor
final class ConnectionModeCoordinator {
    static let shared = ConnectionModeCoordinator()

    func apply(mode: AppState.ConnectionMode, paused: Bool) async {
        if let lastMode = self.lastMode, lastMode != mode {
            GatewayProcessManager.shared.clearLastFailure()
            NodesStore.shared.lastError = nil
        }
        self.lastMode = mode

        switch mode {
        case .unconfigured:
            _ = await NodeServiceManager.stop()
            NodesStore.shared.lastError = nil
            await RemoteTunnelManager.shared.stopAll()
            WebChatManager.shared.resetTunnels()
            GatewayProcessManager.shared.stop()
            await GatewayConnection.shared.shutdown()
            await ControlChannel.shared.disconnect()

        case .local:
            _ = await NodeServiceManager.stop()
            WebChatManager.shared.resetTunnels()
            let shouldStart = GatewayAutostartPolicy.shouldStartGateway(mode: .local, paused: paused)
            if shouldStart {
                GatewayProcessManager.shared.setActive(true)
                _ = await GatewayProcessManager.shared.waitForGatewayReady()
            }
            do {
                try await ControlChannel.shared.configure(mode: .local)
            } catch {
                self.logger.error("control channel local configure failed: \(error)")
            }

        case .remote:
            GatewayProcessManager.shared.stop()
            WebChatManager.shared.resetTunnels()
            do {
                NodesStore.shared.lastError = nil
                if let error = await NodeServiceManager.start() {
                    NodesStore.shared.lastError = "Node service start failed: \(error)"
                }
                _ = try await GatewayEndpointStore.shared.ensureRemoteControlTunnel()
                try await ControlChannel.shared.configure(mode: .remote(...))
            } catch {
                self.logger.error("remote tunnel/configure failed: \(error)")
            }
        }
    }
}
```

**Pattern**: Centralized state machine for switching between connection modes:
- Unconfigured → Local (spawn local gateway)
- Unconfigured → Remote (SSH tunnels to remote host)
- Handles cleanup of conflicting resources
- Async/await for coordinating multiple services

### Activity Tracking Store

**File**: `apps/macos/Sources/Clawdbot/WorkActivityStore.swift`

```swift
@MainActor
@Observable
final class WorkActivityStore {
    static let shared = WorkActivityStore()

    struct Activity: Equatable {
        let sessionKey: String
        let role: SessionRole
        let kind: ActivityKind
        let label: String
        let startedAt: Date
        var lastUpdate: Date
    }

    private(set) var current: Activity?
    private(set) var iconState: IconState = .idle
    private(set) var lastToolLabel: String?
    private var jobs: [String: Activity] = [:]
    private var tools: [String: Activity] = [:]
    private var toolSeqBySession: [String: Int] = [:]
    private let toolResultGrace: TimeInterval = 2.0

    func handleJob(sessionKey: String, state: String) {
        let isStart = state.lowercased() == "started" || state.lowercased() == "streaming"
        if isStart {
            let activity = Activity(
                sessionKey: sessionKey,
                role: self.role(for: sessionKey),
                kind: .job,
                label: "job",
                startedAt: Date(),
                lastUpdate: Date())
            self.setJobActive(activity)
        } else {
            // Job ended; clear everything
            self.clearTool(sessionKey: sessionKey)
            self.clearJob(sessionKey: sessionKey)
        }
    }

    func handleTool(
        sessionKey: String,
        phase: String,
        name: String?,
        meta: String?,
        args: [String: AnyCodable]?)
    {
        if phase.lowercased() == "start" {
            let activity = Activity(
                sessionKey: sessionKey,
                role: self.role(for: sessionKey),
                kind: .tool(toolKind),
                label: label,
                startedAt: Date(),
                lastUpdate: Date())
            self.setToolActive(activity)
        } else {
            // Delay removal to avoid flicker on rapid bursts
            let seq = self.toolSeqBySession[sessionKey, default: 0]
            Task { [weak self] in
                let nsDelay = UInt64((self?.toolResultGrace ?? 0) * 1_000_000_000)
                try? await Task.sleep(nanoseconds: nsDelay)
                await MainActor.run {
                    guard let self else { return }
                    guard self.toolSeqBySession[sessionKey, default: 0] == seq else { return }
                    self.clearTool(sessionKey: sessionKey)
                }
            }
        }
    }
}
```

**Pattern**: Real-time activity tracking with debouncing:
- Sequence numbers prevent race conditions on rapid updates
- Grace period delays cleanup to avoid UI flicker
- Separate tracking of jobs vs tools
- Icon state derives from current activity

---

## 3. Interesting Patterns

### Transparent Mouse Handler Overlay

**File**: `apps/macos/Sources/Clawdbot/MenuBar.swift`

```swift
/// Transparent overlay that intercepts clicks without stealing MenuBarExtra ownership
private final class StatusItemMouseHandlerView: NSView {
    var onLeftClick: (() -> Void)?
    var onRightClick: (() -> Void)?
    var onHoverChanged: ((Bool) -> Void)?
    private var tracking: NSTrackingArea?

    override func mouseDown(with event: NSEvent) {
        if let onLeftClick {
            onLeftClick()
        } else {
            super.mouseDown(with: event)
        }
    }

    override func rightMouseDown(with event: NSEvent) {
        self.onRightClick?()
        // Do not call super; menu will be driven by isMenuPresented binding.
    }

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        if let tracking {
            self.removeTrackingArea(tracking)
        }
        let options: NSTrackingArea.Options = [
            .mouseEnteredAndExited,
            .activeAlways,
            .inVisibleRect,
        ]
        let area = NSTrackingArea(rect: self.bounds, options: options, owner: self, userInfo: nil)
        self.addTrackingArea(area)
        self.tracking = area
    }

    override func mouseEntered(with event: NSEvent) {
        self.onHoverChanged?(true)
    }

    override func mouseExited(with event: NSEvent) {
        self.onHoverChanged?(false)
    }
}
```

**Pattern**: Non-blocking event delegation:
- Transparent NSView sits atop status item
- Captures mouse events without blocking menu bar extras
- Reactive callbacks for UI state updates
- Dynamic tracking area management for performance

### Web Chat Manager - Dual Presentation Modes

**File**: `apps/macos/Sources/Clawdbot/WebChatManager.swift`

```swift
enum WebChatPresentation {
    case window
    case panel(anchorProvider: () -> NSRect?)

    var isPanel: Bool {
        if case .panel = self { return true }
        return false
    }
}

@MainActor
final class WebChatManager {
    static let shared = WebChatManager()

    private var windowController: WebChatSwiftUIWindowController?
    private var windowSessionKey: String?
    private var panelController: WebChatSwiftUIWindowController?
    private var panelSessionKey: String?
    private var cachedPreferredSessionKey: String?

    func togglePanel(sessionKey: String, anchorProvider: @escaping () -> NSRect?) {
        if let controller = self.panelController {
            if self.panelSessionKey != sessionKey {
                controller.close()
                self.panelController = nil
                self.panelSessionKey = nil
            } else {
                if controller.isVisible {
                    controller.close()
                } else {
                    controller.presentAnchored(anchorProvider: anchorProvider)
                }
                return
            }
        }

        let controller = WebChatSwiftUIWindowController(
            sessionKey: sessionKey,
            presentation: .panel(anchorProvider: anchorProvider))
        controller.onClosed = { [weak self] in
            self?.panelHidden()
        }
        self.panelController = controller
        self.panelSessionKey = sessionKey
        controller.presentAnchored(anchorProvider: anchorProvider)
    }
}
```

**Pattern**: Semantic enum for presentation modes:
- Anchor provider pattern for dynamic positioning
- Session key caching to minimize bootstrap overhead
- Weak self references prevent retain cycles
- Toggle semantics (show if hidden, hide if shown)

### Hover HUD with Debounced Visibility

**File**: `apps/macos/Sources/Clawdbot/HoverHUD.swift`

```swift
@MainActor
@Observable
final class HoverHUDController {
    static let shared = HoverHUDController()

    struct Model {
        var isVisible: Bool = false
        var isSuppressed: Bool = false
        var hoveringStatusItem: Bool = false
        var hoveringPanel: Bool = false
    }

    private(set) var model = Model()
    private var showTask: Task<Void, Never>?
    private var dismissTask: Task<Void, Never>?
    private let hoverShowDelay: TimeInterval = 0.18

    func statusItemHoverChanged(inside: Bool, anchorProvider: @escaping () -> NSRect?) {
        self.model.hoveringStatusItem = inside

        if inside {
            self.dismissTask?.cancel()
            self.dismissTask = nil
            self.showTask?.cancel()
            self.showTask = Task { [weak self] in
                guard let self else { return }
                try? await Task.sleep(nanoseconds: UInt64(self.hoverShowDelay * 1_000_000_000))
                await MainActor.run { [weak self] in
                    guard let self else { return }
                    guard !Task.isCancelled else { return }
                    guard self.model.hoveringStatusItem else { return }
                    guard !self.model.isSuppressed else { return }
                    self.present()
                }
            }
        } else {
            self.showTask?.cancel()
            self.showTask = nil
            self.scheduleDismiss()
        }
    }
}
```

**Pattern**: Debounced UI state machine:
- Task cancellation prevents rapid show/hide cycles
- Multiple guard checks ensure state consistency
- Millisecond precision for smooth UX
- Suppressible (e.g., when menu is open)

---

## 4. Key Algorithms

### Runtime Version Parsing & Validation

**File**: `apps/macos/Sources/Clawdbot/RuntimeLocator.swift`

```swift
struct RuntimeVersion: Comparable, CustomStringConvertible {
    let major: Int
    let minor: Int
    let patch: Int

    var description: String { "\(self.major).\(self.minor).\(self.patch)" }

    static func < (lhs: RuntimeVersion, rhs: RuntimeVersion) -> Bool {
        if lhs.major != rhs.major { return lhs.major < rhs.major }
        if lhs.minor != rhs.minor { return lhs.minor < rhs.minor }
        return lhs.patch < rhs.patch
    }

    static func from(string: String) -> RuntimeVersion? {
        // Accept optional leading "v" and ignore trailing metadata
        let pattern = #"(\d+)\.(\d+)\.(\d+)"#
        guard let match = string.range(of: pattern, options: .regularExpression) else { return nil }
        let versionString = String(string[match])
        let parts = versionString.split(separator: ".")
        guard parts.count == 3,
              let major = Int(parts[0]),
              let minor = Int(parts[1]),
              let patch = Int(parts[2])
        else { return nil }
        return RuntimeVersion(major: major, minor: minor, patch: patch)
    }
}

enum RuntimeLocator {
    private static let minNode = RuntimeVersion(major: 22, minor: 0, patch: 0)

    static func resolve(searchPaths: [String]) -> Result<RuntimeResolution, RuntimeResolutionError> {
        let pathEnv = searchPaths.joined(separator: ":")

        guard let binary = findExecutable(named: "node", searchPaths: searchPaths) else {
            return .failure(.notFound(searchPaths: searchPaths))
        }
        guard let rawVersion = readVersion(of: binary, pathEnv: pathEnv) else {
            return .failure(.versionParse(kind: .node, raw: "(unreadable)", path: binary, searchPaths: searchPaths))
        }
        guard let parsed = RuntimeVersion.from(string: rawVersion) else {
            return .failure(.versionParse(kind: .node, raw: rawVersion, path: binary, searchPaths: searchPaths))
        }
        guard parsed >= self.minNode else {
            return .failure(.unsupported(kind: .node, found: parsed, required: self.minNode, path: binary, searchPaths: searchPaths))
        }

        return .success(RuntimeResolution(kind: .node, path: binary, version: parsed))
    }
}
```

**Algorithm**: Multi-stage validation with semantic versioning:
1. Binary discovery via PATH search
2. Version string extraction (shell invocation)
3. Regex parsing with flexible format support
4. Lexicographic comparison for version gates
5. Detailed error reporting with search path context

### Command PATH Resolution with Deduplication

**File**: `apps/macos/Sources/Clawdbot/CommandResolver.swift`

```swift
static func preferredPaths(home: URL, current: [String], projectRoot: URL) -> [String] {
    var extras = [
        home.appendingPathComponent("Library/pnpm").path,
        "/opt/homebrew/bin",
        "/usr/local/bin",
        "/usr/bin",
        "/bin",
    ]
    #if DEBUG
    // Dev-only convenience
    extras.insert(projectRoot.appendingPathComponent("node_modules/.bin").path, at: 0)
    #endif
    let moltbotPaths = self.clawdbotManagedPaths(home: home)
    if !moltbotPaths.isEmpty {
        extras.insert(contentsOf: moltbotPaths, at: 1)
    }
    extras.insert(contentsOf: self.nodeManagerBinPaths(home: home), at: 1 + moltbotPaths.count)
    var seen = Set<String>()
    // Preserve order while stripping duplicates for deterministic PATH lookups
    return (extras + current).filter { seen.insert($0).inserted }
}
```

**Algorithm**: Ordered PATH construction with deduplication:
- Priority: dev pnpm, moltbot-managed, node-managed, system
- Set-based deduplication maintains insertion order
- Deterministic for reproducible binary resolution
- Build-time conditionals for dev ergonomics

### IPC Protocol & Request/Response Types

**File**: `apps/macos/Sources/ClawdbotIPC/IPC.swift`

```swift
public enum Request: Sendable {
    case notify(
        title: String,
        body: String,
        sound: String?,
        priority: NotificationPriority?,
        delivery: NotificationDelivery?)
    case ensurePermissions([Capability], interactive: Bool)
    case runShell(
        command: [String],
        cwd: String?,
        env: [String: String]?,
        timeoutSec: Double?,
        needsScreenRecording: Bool)
    case status
    case agent(message: String, thinking: String?, session: String?, deliver: Bool, to: String?)
    case rpcStatus
    case canvasPresent(session: String, path: String?, placement: CanvasPlacement?)
    case canvasHide(session: String)
    case canvasEval(session: String, javaScript: String)
    case canvasSnapshot(session: String, outPath: String?)
    case cameraSnap(facing: CameraFacing?, maxWidth: Int?, quality: Double?, outPath: String?)
    case cameraClip(facing: CameraFacing?, durationMs: Int?, includeAudio: Bool, outPath: String?)
    case screenRecord(screenIndex: Int?, durationMs: Int?, fps: Double?, includeAudio: Bool, outPath: String?)
}

public struct Response: Codable, Sendable {
    public var ok: Bool
    public var message: String?
    /// Optional payload (PNG bytes, stdout text, etc.)
    public var payload: Data?
}
```

**Pattern**: Type-safe IPC protocol using associated values:
- Enum-based request types prevent invalid combinations
- `Sendable` for thread-safe cross-process communication
- Optional fields allow graceful degradation
- Binary payload support for rich responses (images, recordings)

---

## 5. Application State Management

### Observable AppState with Persistence

**File**: `apps/macos/Sources/Clawdbot/AppState.swift`

```swift
@MainActor
@Observable
final class AppState {
    enum ConnectionMode: String {
        case unconfigured
        case local
        case remote
    }

    var isPaused: Bool {
        didSet { self.ifNotPreview { UserDefaults.standard.set(self.isPaused, forKey: pauseDefaultsKey) } }
    }

    var launchAtLogin: Bool {
        didSet {
            guard !self.isInitializing else { return }
            self.ifNotPreview { Task { AppStateStore.updateLaunchAtLogin(enabled: self.launchAtLogin) } }
        }
    }

    var swabbleEnabled: Bool {
        didSet {
            self.ifNotPreview {
                UserDefaults.standard.set(self.swabbleEnabled, forKey: swabbleEnabledKey)
                Task { await VoiceWakeRuntime.shared.refresh(state: self) }
            }
        }
    }

    var swabbleTriggerWords: [String] {
        didSet {
            self.ifNotPreview {
                UserDefaults.standard.set(self.swabbleTriggerWords, forKey: swabbleTriggersKey)
                if self.swabbleEnabled {
                    Task { await VoiceWakeRuntime.shared.refresh(state: self) }
                }
                self.scheduleVoiceWakeGlobalSyncIfNeeded()
            }
        }
    }

    private func ifNotPreview(_ action: () -> Void) {
        guard !self.isPreview else { return }
        action()
    }
}
```

**Pattern**: Reactive persistence with preview safety:
- `didSet` observers trigger side effects (persistence, async updates)
- Preview mode bypass prevents SwiftUI preview crashes
- Initialization guard prevents spurious saves
- Automatic UI invalidation via `@Observable`

---

## Summary of Key Technical Insights

1. **Singleton-based Service Architecture**: All major components (GatewayProcessManager, WebChatManager, etc.) use static `shared` properties for centralized lifecycle management.

2. **Task-based Concurrency**: Heavy use of Swift's async/await with structured concurrency, task cancellation for debouncing, and weak reference capture to prevent leaks.

3. **Semantic State Machines**: Connection modes, gateway status, and activity tracking use enums with associated values for type-safe state transitions.

4. **Event Interception Pattern**: The transparent mouse handler view demonstrates how to capture events without stealing system event handling.

5. **Graceful Degradation**: Multiple fallback paths (attach existing gateway, launch new one, fall back to system notification center).

6. **Cross-process Communication**: Type-safe IPC protocol using associated-value enums with binary payload support.

7. **Permission & Capability Management**: Declarative capability enums (AppleScript, Accessibility, Screen Recording) with interactive prompts.

8. **Smart Process Management**: Idempotent startup logic prevents process thrashing even with rapid requests from multiple sources.
