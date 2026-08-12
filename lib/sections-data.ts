export interface TechSection {
  id: string
  number: string
  title: string
  subtitle: string
  description: string
  ascii: string
  specs: { label: string; value: string }[]
  commands: string[]
}

export const techSections: TechSection[] = [
  {
    id: "kernel-systems",
    number: "01",
    title: "Kernel & Systems",
    subtitle: "Low-level architecture",
    description:
      "Exploring the foundational layer where hardware meets software. Kernel modules, system calls, and memory management form the backbone of every computing experience.",
    ascii: `
    ┌─────────────────────────┐
    │  KERNEL SPACE            │
    │  ┌───────┐ ┌───────┐   │
    │  │ SCHED │ │  MEM  │   │
    │  └───┬───┘ └───┬───┘   │
    │      │         │        │
    │  ┌───┴─────────┴───┐   │
    │  │   SYSTEM CALLS   │   │
    │  └─────────────────┘   │
    │  ┌───────────────────┐  │
    │  │   USER SPACE       │  │
    │  └───────────────────┘  │
    └─────────────────────────┘`,
    specs: [
      { label: "Architecture", value: "x86_64 / ARM64" },
      { label: "Scheduler", value: "CFS (Completely Fair)" },
      { label: "Memory Model", value: "Virtual Paging" },
      { label: "IPC", value: "Pipes, Sockets, Shared Mem" },
    ],
    commands: [
      "$ uname -a",
      "Linux monochrome 6.1.0 #1 SMP x86_64",
      "$ cat /proc/meminfo | head -3",
      "MemTotal:   16384000 kB",
      "MemFree:     8192000 kB",
      "MemAvailable: 12288000 kB",
    ],
  },
  {
    id: "network-topologies",
    number: "02",
    title: "Network Topologies",
    subtitle: "Distributed connectivity",
    description:
      "Mapping the invisible infrastructure that connects billions of nodes. From mesh networks to star topologies, understanding how data traverses the physical and logical layers.",
    ascii: `
       [A]───────[B]
       /│\\         │\\
      / │ \\        │ \\
    [C] │ [D]──────[E] [F]
     \\  │ /        │  /
      \\ │/         │ /
       [G]───────[H]
        │           │
       [I]───────[J]`,
    specs: [
      { label: "Protocol", value: "TCP/IP Stack" },
      { label: "Topology", value: "Hybrid Mesh" },
      { label: "Latency", value: "< 10ms p99" },
      { label: "Bandwidth", value: "10 Gbps" },
    ],
    commands: [
      "$ traceroute node-alpha.mesh",
      "1  gateway (10.0.0.1)  0.5ms",
      "2  switch-core (10.0.1.1)  1.2ms",
      "3  node-alpha (10.0.2.42)  2.1ms",
      "$ netstat -an | wc -l",
      "2048 active connections",
    ],
  },
  {
    id: "distributed-ledger",
    number: "03",
    title: "Distributed Ledger",
    subtitle: "Consensus architecture",
    description:
      "Decentralized systems where trust is computed, not assumed. Examining consensus mechanisms, Merkle trees, and the cryptographic primitives that secure distributed state.",
    ascii: `
    Block #1021        Block #1022
    ┌──────────┐      ┌──────────┐
    │ Hash: 0xA│─────>│ Hash: 0xB│
    │ Prev: 0x9│      │ Prev: 0xA│
    │ Nonce: 42│      │ Nonce: 87│
    │ Tx: 12   │      │ Tx: 8    │
    └──────────┘      └──────────┘
         │                  │
    ┌────┴────┐        ┌────┴────┐
    │ Merkle  │        │ Merkle  │
    │  Root   │        │  Root   │
    └─────────┘        └─────────┘`,
    specs: [
      { label: "Consensus", value: "Proof of Stake" },
      { label: "Block Time", value: "~12 seconds" },
      { label: "Hash Function", value: "SHA-256" },
      { label: "Finality", value: "2 epochs (~12.8 min)" },
    ],
    commands: [
      "$ ledger query --block latest",
      "Block #1022 | Hash: 0xB3F...A2",
      "$ ledger verify --merkle-root",
      "Root: 0x7D2...F1 [VALID]",
      "$ ledger peers --count",
      "Active Peers: 12,847",
    ],
  },
  {
    id: "compiler-design",
    number: "04",
    title: "Compiler Design",
    subtitle: "Language transformation",
    description:
      "The art of translating human intent into machine execution. Lexical analysis, parsing, AST transformation, and code generation form the pipeline that bridges abstraction and silicon.",
    ascii: `
    Source Code
        │
    ┌───▼───┐
    │ LEXER │ ──> Tokens
    └───┬───┘
    ┌───▼────┐
    │ PARSER │ ──> AST
    └───┬────┘
    ┌───▼──────────┐
    │ SEMANTIC     │
    │ ANALYSIS     │ ──> Typed AST
    └───┬──────────┘
    ┌───▼──────────┐
    │ CODE GEN     │ ──> IR / Binary
    └──────────────┘`,
    specs: [
      { label: "Frontend", value: "Recursive Descent" },
      { label: "IR", value: "SSA Form" },
      { label: "Optimization", value: "LLVM Pass Pipeline" },
      { label: "Target", value: "x86_64 / WASM" },
    ],
    commands: [
      "$ compile --emit-ast main.src",
      "AST: Program(FnDecl(main, Block(...)))",
      "$ compile --emit-ir main.src",
      "define i32 @main() { ret i32 0 }",
      "$ compile -O2 main.src -o main",
      "Compiled: 2.4KB binary [0 warnings]",
    ],
  },
  {
    id: "graphics-pipelines",
    number: "05",
    title: "Graphics Pipelines",
    subtitle: "Rendering architecture",
    description:
      "From vertices to pixels, the graphics pipeline transforms mathematical abstractions into visual reality. Shaders, rasterization, and GPU compute redefine what screens can display.",
    ascii: `
    Vertices ──> Vertex Shader
                     │
              Primitive Assembly
                     │
               Rasterization
                     │
              Fragment Shader
                     │
              ┌──────┴──────┐
              │  Framebuffer │
              │  ┌──┬──┬──┐ │
              │  │░░│▓▓│██│ │
              │  ├──┼──┼──┤ │
              │  │▓▓│░░│▓▓│ │
              │  └──┴──┴──┘ │
              └─────────────┘`,
    specs: [
      { label: "API", value: "Vulkan / WebGPU" },
      { label: "Shading", value: "PBR (Cook-Torrance)" },
      { label: "Resolution", value: "4K @ 120Hz" },
      { label: "Draw Calls", value: "< 1000 / frame" },
    ],
    commands: [
      "$ gpu-info --capabilities",
      "Compute Units: 80 | VRAM: 16GB",
      "$ render --scene cornell-box.gltf",
      "Triangles: 12,450 | FPS: 144",
      "$ shader compile fragment.glsl",
      "Fragment shader: 128 ALU ops",
    ],
  },
  {
    id: "logic-synthesis",
    number: "06",
    title: "Logic Synthesis",
    subtitle: "Digital design",
    description:
      "Where Boolean algebra meets silicon. Logic gates, flip-flops, and RTL design form the bridge between abstract computation theory and physical circuit implementation.",
    ascii: `
        A ──┐
            ├──[AND]──┐
        B ──┘         │
                      ├──[OR]── Q
        C ──┐         │
            ├──[AND]──┘
        D ──┘

    Truth Table:
    A B C D │ Q
    0 0 0 0 │ 0
    1 1 0 0 │ 1
    0 0 1 1 │ 1
    1 1 1 1 │ 1`,
    specs: [
      { label: "HDL", value: "SystemVerilog" },
      { label: "Process", value: "5nm FinFET" },
      { label: "Clock", value: "3.2 GHz" },
      { label: "Gates", value: "~10B transistors" },
    ],
    commands: [
      "$ synth --target fpga design.sv",
      "LUTs: 4,200 | FFs: 1,800",
      "$ simulate --cycles 1000",
      "All assertions passed [1000/1000]",
      "$ timing-report --critical-path",
      "Slack: +0.3ns [TIMING MET]",
    ],
  },
  {
    id: "concurrency-models",
    number: "07",
    title: "Concurrency Models",
    subtitle: "Parallel execution",
    description:
      "Managing simultaneous execution paths without chaos. Actor models, CSP channels, and lock-free data structures enable programs to harness multi-core architectures safely.",
    ascii: `
    Thread 1 ──┐         ┌── Thread 4
               │         │
    Thread 2 ──┼──[CH]──┼── Thread 5
               │    │    │
    Thread 3 ──┘    │    └── Thread 6
                    │
              ┌─────┴─────┐
              │  Channel   │
              │  Buffer    │
              │  [|||||||] │
              │  Cap: 128  │
              └───────────┘`,
    specs: [
      { label: "Model", value: "CSP + Actor Hybrid" },
      { label: "Threads", value: "M:N Green Threads" },
      { label: "Channels", value: "Bounded MPMC" },
      { label: "Scheduler", value: "Work-Stealing" },
    ],
    commands: [
      "$ runtime --stats",
      "Goroutines: 14,200 | Threads: 8",
      "$ channel inspect --id main-ch",
      "Buffer: 42/128 | Blocked: 0",
      "$ deadlock-detect --scan",
      "No deadlocks detected [SAFE]",
    ],
  },
  {
    id: "hardware-abstraction",
    number: "08",
    title: "Hardware Abstraction",
    subtitle: "Interface layers",
    description:
      "The invisible translators between software intent and hardware capability. HALs, device drivers, and firmware form the contract that makes portable computing possible.",
    ascii: `
    ┌─────────────────────────┐
    │     APPLICATION          │
    ├─────────────────────────┤
    │     OS / RUNTIME         │
    ├─────────────────────────┤
    │     HAL INTERFACE        │
    │  ┌─────┐ ┌─────┐       │
    │  │ GPU │ │ NIC │ ...   │
    │  └──┬──┘ └──┬──┘       │
    ├─────┼───────┼───────────┤
    │     │  SILICON │         │
    │     └────┬────┘         │
    │        [HW]              │
    └─────────────────────────┘`,
    specs: [
      { label: "Interface", value: "MMIO / PIO" },
      { label: "Bus", value: "PCIe Gen5 x16" },
      { label: "DMA", value: "IOMMU Protected" },
      { label: "Firmware", value: "UEFI 2.10" },
    ],
    commands: [
      "$ lspci -v | head -4",
      "00:02.0 VGA: Device [ACCEL]",
      "  Memory at 0xFE000000 (64-bit)",
      "$ hal query --device gpu0",
      "Status: ACTIVE | Driver: v12.1",
      "$ dmesg | grep firmware",
      "Firmware loaded: hal-core v3.2.1",
    ],
  },
]

export const navLinks = techSections.map((s) => ({
  id: s.id,
  number: s.number,
  title: s.title,
}))
