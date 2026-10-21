/**
 * RV64 Technical Documentation Database
 * Warm beige, cream and skin editorial system
 */

window.DOCS_DATABASE = [
  {
    id: "architecture",
    title: "System Architecture",
    category: "Architecture & Execution",
    description: "Full-system architecture diagram and hardware specification for Yantra RV64GC emulator.",
    content: `# Yantra System Architecture

The **Yantra** system emulator is an architecture-compliant, high-performance C++20 implementation of the **RISC-V 64-bit (RV64GC)** specification. It is designed to model the exact hardware behavior required to run bare-metal firmware (OpenSBI), an operating system kernel (Linux 6.8), and interactive userspace environments (BusyBox).

![Yantra Full-System Architecture](assets/images/yantra-architecture.png)

---

## 1. CPU Core (\`RV64GC\`)

The CPU Core implements the complete RV64GC architectural profile with 64-bit general-purpose and floating-point data paths:

### Register State
- **General Purpose Registers (x0 - x31)**: 32 integer registers, each strictly 64 bits wide (\`XLEN = 64\`). Register \`x0\` is hardwired to zero (\`0x0000000000000000\`).
- **Floating Point Registers (f0 - f31)**: 32 floating-point registers, each 64 bits wide (\`FLEN = 64\`), adhering to IEEE 754-2008.
- **Program Counter (PC)**: 64-bit register holding the address of the current instruction, reset to \`0x80000000\` (or BootROM reset vector \`0x1000\`).

### ISA Extensions
- **RV64I**: Base integer instruction set with 64-bit arithmetic and logic.
- **M**: Integer multiplication and division (\`MUL\`, \`MULW\`, \`DIV\`, \`DIVU\`, \`REM\`, \`REMU\`).
- **A**: Atomic memory instructions (\`LR.W/D\`, \`SC.W/D\`, \`AMOADD\`, \`AMOSWAP\`, \`AMOAND\`, \`AMOOR\`, \`AMOXOR\`, \`AMOMIN/MAX\`).
- **F & D**: Single and double precision floating-point operations.
- **C**: 16-bit compressed instruction support for code density.
- **Zicsr & Zifencei**: CSR manipulation instructions and instruction-fetch synchronization.

### Privilege Levels & Trap Delegation
- **Machine Mode (M)**: Highest privilege level; root control for platform firmware and physical hardware interrupts.
- **Supervisor Mode (S)**: Operating system kernel mode; protected paging and virtual memory execution.
- **User Mode (U)**: Unprivileged execution mode for application binaries.
- **Delegation Registers**: \`medeleg\` (machine exception delegation) and \`mideleg\` (machine interrupt delegation) allow low-overhead direct trap delivery to Supervisor mode without entering M-mode on every page fault or timer tick.
- **Trap Vectors & State**: \`mstatus\`, \`sstatus\`, \`sepc\`, \`stvec\`, \`scause\`, \`stval\`, \`mtvec\`, \`mepc\`.

---

## 2. Sv39 MMU & Memory Subsystem

The memory subsystem is responsible for physical memory mapping, address translation, and protection:

### 3-Level Page Table Walking (Sv39)
- **Virtual Address (VA)**: 39-bit virtual space partitioned into three 9-bit VPNs and a 12-bit offset:
  - \`VPN[2]\` (Level 2): Points to 1 GB megapages.
  - \`VPN[1]\` (Level 1): Points to 2 MB megapages.
  - \`VPN[0]\` (Level 0): Points to 4 KB base pages.
- Resolves to a 56-bit **Physical Address (PA)** in DRAM.

### Hardware TLB Accelerator
- **Direct-Mapped Cache**: Caches exact \`(VPN, ASID) -> (PPN, Permissions)\` translation entries.
- **SATP Cache Tagging**: Flushes or revalidates automatically upon \`SATP\` register modifications or execution of \`SFENCE.VMA\`.

### Copy-on-Write (COW) Support
- **PTE Permission Enforcement**: Read-only tracking on shared physical pages.
- **Write Detection**: Detects store instructions targeting shared pages with write permissions cleared.
- **Private Copy Allocation**: Transparently allocates a new physical frame and maps write access upon write attempts during \`fork()\`.

### Main Memory (DRAM)
- **512 MB Physical DRAM**: Mapped at base address \`0x80000000\` spanning through \`0x9FFFFFFF\`.

---

## 3. System Bus & Peripherals

The system crossbar routes memory access based on physical address decode windows:

| Device | Base Address | Size | Functionality |
| :--- | :--- | :--- | :--- |
| **SiFive CLINT** | \`0x02000000\` | 64 KB | Core Local Interruptor providing \`mtime\` and \`mtimecmp\` timer interrupts. |
| **SiFive PLIC** | \`0x0C000000\` | 64 MB | Platform-Level Interrupt Controller arbitrating external device IRQs to M/S modes. |
| **UART 16550A** | \`0x10000000\` | 256 B | Standard serial console with TX/RX FIFOs and non-blocking multi-threaded terminal I/O. |
| **VirtIO-MMIO** | \`0x10001000\` | 4 KB | Legacy VirtIO block storage device providing high-throughput direct DMA access to disk images (\`/dev/vda\`). |
`
  },
  {
    id: "execution-flow",
    title: "System Execution Flow",
    category: "Architecture & Execution",
    description: "Step-by-step diagram and walkthrough of the 6-stage execution lifecycle from CLI to Linux root prompt.",
    content: `# Yantra Execution Flow & Boot Sequence

Understanding how the **Yantra** emulator transitions from binary command-line arguments to booting OpenSBI, mounting an ext4 root filesystem in Linux 6.8, and serving an interactive BusyBox shell.

![Yantra System Execution & Linux Boot Flow](assets/images/yantra-execution-flow.png)

---

## Six-Stage Execution Lifecycle

The execution lifecycle of Yantra is structured into six discrete, deterministic phases:

### 1. CLI Argument Parsing
The emulator parses command-line arguments to locate target images, or falls back to bundled defaults:
- \`--bios <path>\`: OpenSBI firmware binary (\`payloads/fw_jump.bin\`).
- \`--kernel <path>\`: Uncompressed Linux kernel image (\`payloads/Image\`).
- \`--dtb <path>\`: Device Tree Blob (\`payloads/virt.dtb\`).
- \`--disk <path>\`: VirtIO ext4 filesystem disk image (\`payloads/busybear.bin\`).

\`\`\`powershell
$ yantra \\
  --bios fw_jump.bin \\
  --kernel Image \\
  --dtb virt.dtb \\
  --disk rootfs.img
\`\`\`

### 2. Hardware & Memory Allocation
- Allocates **512 MB contiguous DRAM** mapped from \`0x80000000\` to \`0x9FFFFFFF\`.
- Maps MMIO regions for memory-mapped peripherals:
  - UART 16550A: \`0x10000000\`
  - SiFive CLINT: \`0x02000000\`
  - SiFive PLIC: \`0x0C000000\`
  - VirtIO Block: \`0x10001000\`

### 3. Firmware & Kernel Payload Loading
The loader copies system binaries directly into simulated DRAM memory:
- \`fw_jump.bin\` (OpenSBI): Placed at DRAM base \`0x80000000\`.
- \`Image\` (Linux Kernel): Loaded at standard kernel base \`0x80200000\`.
- \`virt.dtb\` (Device Tree): Placed in upper DRAM memory, with its address placed in register \`a1\`.

### 4. CPU Initialization & Reset State
The hardware reset vector sets the initial architectural state:
- **PC**: Set to OpenSBI entry point (\`0x80000000\`).
- **Privilege Mode**: Set to **Machine Mode (M-Mode)**.
- **x0 - x31**: Initialized to \`0x0000000000000000\`.
- **f0 - f31**: Initialized to \`0x0000000000000000\`.
- **CSRs**: Initialized to reset defaults (\`mstatus\`, \`misa\`, \`medeleg\`, \`mideleg\`, \`mtvec\`).
- **Registers \`a0\` and \`a1\`**: \`a0 = 0\` (Hart ID), \`a1 = dtb_addr\` (Device Tree address in DRAM).

### 5. Fetch-Decode-Execute CPU Loop
The core execution engine executes instructions continuously in a deterministic loop:
1. **Fetch**: Fetches 16-bit or 32-bit instruction words from memory via the Sv39 MMU and TLB.
2. **Decode**: Decodes opcode, registers (\`rd\`, \`rs1\`, \`rs2\`), immediate fields, and instruction format.
3. **Execute**: Dispatches to integer ALU, FPU unit, Atomic memory operations, or CSR read/write logic.
4. **Check Interrupts**: Inspects timer interrupts (CLINT \`mtime\` >= \`mtimecmp\`) and external device interrupts (PLIC pending bits).
5. **Handle Traps / Advance PC**: Traps invoke hardware vector routines; normal instructions increment PC by 2 (compressed) or 4 bytes.

### 6. Operating System Handover & Shell
- **OpenSBI Execution**: OpenSBI executes in M-mode, initializes hardware timers and UART, configures PMP (Physical Memory Protection), and delegates exceptions.
- **S-Mode Handover**: OpenSBI executes \`mret\` with \`mstatus.MPP\` set to Supervisor mode, transferring execution to Linux at \`0x80200000\`.
- **Linux Kernel Boot**: Linux initializes paging (Sv39), discovers devices through the Device Tree, mounts the VirtIO block device \`/dev/vda\` as ext4 root, and executes \`/sbin/init\`.
- **User Prompt**: BusyBox initiates an interactive root shell on the UART console:

\`\`\`text
welcome to Linux!
(none) login: nvidia
Password: nvidia
nvidia@(none):~#
\`\`\`
`
  },
  {
    id: "module-1-rv64i-base",
    title: "Module 1: RV64I Base ISA & Core State",
    category: "Modules & Implementation",
    description: "Detailed register file specification, hardwired zero, I-Type instruction format decoding, and step-by-step execution trace.",
    content: `# Module 1: RV64I Base Integer ISA & CPU Core State

---

## 1. Executive Summary & Overview

The **RV64I** base integer instruction set forms the mandatory, fundamental layer of the 64-bit RISC-V architecture. In the **Yantra** system emulator, the CPU core maintains execution state using 32 general-purpose registers (\`x0\` through \`x31\`) alongside a 64-bit Program Counter (\`pc\`). Every 32-bit instruction fetched from physical memory is processed through a deterministic **Fetch-Decode-Execute** state machine that manages ALU computation, register file mutation, and PC advancement.

---

## 2. Core CPU State & Register File Architecture

In RV64I, register width ($XLEN$) is strictly 64 bits (\`uint64_t\`).

| Register Index | ABI Name | Description / Saved State Rule | Hardware Constraint |
| :--- | :--- | :--- | :--- |
| \`x0\` | \`zero\` | Hardwired Zero | Immutable (\`0x0000000000000000\`) |
| \`x1\` | \`ra\` | Return Address | Caller-saved |
| \`x2\` | \`sp\` | Stack Pointer | Callee-saved |
| \`x3\` | \`gp\` | Global Pointer | Set on process startup |
| \`x4\` | \`tp\` | Thread Pointer | Thread-local storage |
| \`x5\`–\`x7\` | \`t0\`–\`t2\` | Temporary Registers | Caller-saved |
| \`x8\` / \`x9\` | \`s0\`/\`fp\`, \`s1\` | Saved Register / Frame Pointer | Callee-saved |
| \`x10\`–\`x17\` | \`a0\`–\`a7\` | Function Arguments / Return Values | Caller-saved |
| \`x18\`–\`x27\` | \`s2\`–\`s11\` | Saved Registers | Callee-saved |
| \`x28\`–\`x31\` | \`t3\`–\`t6\` | Temporary Registers | Caller-saved |
| \`pc\` | — | 64-bit Program Counter | 4-byte aligned (2-byte with RVC) |

![CPU State (RV64GC) Register File & Program Counter](assets/images/rv64-cpu-state-registers.png)

---

## 3. Register Access Mechanics & Hardwired Zero (\`x0\`)

### 3.1 Architectural Purpose
Register \`x0\` is hardwired to constant zero at the hardware level. This eliminates the need for separate dedicated instructions for common operations:

- **NOP (No Operation)**: \`addi x0, x0, 0\`
- **MV rd, rs (Move)**: \`addi rd, rs, 0\`
- **NEG rd, rs (Negate)**: \`sub rd, x0, rs\`
- **SETEZ rd, rs (Set if Equal to Zero)**: \`sltiu rd, rs, 1\`

### 3.2 Software Enforcement in Yantra
To ensure that writes directed to \`x0\` are safely discarded and reads always return zero, register access is guarded via helper functions:

\`\`\`cpp
// Reads always return 0 for x0
uint64_t read_reg(uint8_t reg) const {
    return (reg == 0) ? 0 : regs[reg];
}

// Writes targeting x0 are explicitly ignored
void write_reg(uint8_t reg, uint64_t val) {
    if (reg != 0) {
        regs[reg] = val;
    }
}
\`\`\`

---

## 4. I-Type Instruction Format & Decoding

The **I-type** instruction layout packs a 12-bit signed immediate operand, source register index, destination register index, function code, and opcode into a fixed 32-bit word:

![RISC-V Instruction Format (I-Type) & ADDI Example](assets/images/rv64-i-type-instruction-format.png)

### Field Breakdown:
- **\`imm[11:0]\`** (bits \`[31:20]\`): 12-bit 2's complement signed immediate operand. Range: -2048 to +2047.
- **\`rs1\`** (bits \`[19:15]\`): Source register 1 index (0–31). Value read from this register is used as an operand.
- **\`funct3\`** (bits \`[14:12]\`): Sub-operation code. For integer immediate ops:
  - \`000\`: \`ADDI\`
  - \`010\`: \`SLTI\`
  - \`011\`: \`SLTIU\`
  - \`100\`: \`XORI\`
  - \`110\`: \`ORI\`
  - \`111\`: \`ANDI\`
- **\`rd\`** (bits \`[11:7]\`): Destination register index (0–31). Result of the operation is written to this register.
- **\`opcode\`** (bits \`[6:0]\`): Identifies the instruction class. \`0010011_2\` (\`0x13\`) designates \`OP-IMM\` (integer immediate operations).

---

### Deconstruction of Example Instruction (\`0xFFF00293\`)

- **Raw Word**: \`0xFFF00293\` (\`111111111111 00000 000 00101 0010011_2\`)
- **\`opcode\`** (\`inst[6:0]\`): \`0x13\` (\`0010011_2\` -> \`OP-IMM\`)
- **\`rd\`** (\`inst[11:7]\`): \`5\` (\`00101_2\` -> Register \`x5\` / \`t0\`)
- **\`funct3\`** (\`inst[14:12]\`): \`0\` (\`000_2\` -> \`ADDI\` operation)
- **\`rs1\`** (\`inst[15:19]\`): \`0\` (\`00000_2\` -> Register \`x0\`)
- **\`imm[11:0]\`** (\`inst[31:20]\`): \`0xFFF\` (12-bit 2's complement representation of -1)

---

## 5. Sign-Extension Mechanics in RV64

In 64-bit architecture, 12-bit immediates must be arithmetic sign-extended to 64-bit values prior to ALU evaluation.

1. **Raw Extract**: 
   \`\`\`cpp
   imm12 = (inst >> 20) & 0xFFF; // -> 0xFFF
   \`\`\`
2. **Signed Cast**: Casting the 32-bit field \`(int32_t)inst >> 20\` preserves the sign bit (bit 31 of original instruction word).
3. **64-bit Widen**: Widening \`(int32_t)(-1)\` to \`uint64_t\` fills top 52 bits with 1s:

$$imm_sext = 0xFFFFFFFFFFFFFFFF_{16} (-1_{10})$$

> [!WARNING]
> **Critical Guardrail**: Zero-extending \`0xFFF\` would produce \`0x0000000000000FFF\` (+4095), which would corrupt address offsets and arithmetic calculations.

---

## 6. Step-by-Step Execution Trace (\`addi x5, x0, 10\`)

Given initial state: \`PC = 0x80000000\`, \`regs[x5] = 0x0000000000000000\`:

![Step-by-Step Execution Trace (addi x5, x0, 10)](assets/images/rv64-execution-trace-addi.png)

### Execution Trace Stages:

1. **1. FETCH**: Read 32-bit word from \`memory[PC]\`. Instruction word fetched: \`inst = 0x00A00293\`.
2. **2. DECODE**: Extract instruction fields:
   - \`opcode\`: \`0x13 (0010011_2)\` -> \`OP-IMM\` (Immediate arithmetic)
   - \`rd\`: \`5\` -> Register \`x5\`
   - \`funct3\`: \`0\` -> \`ADDI\` operation
   - \`rs1\`: \`0\` -> Register \`x0\`
   - \`imm12\`: \`0x00A (10)\` -> 12-bit immediate
3. **3. SIGN EXTENSION**: Extend 12-bit immediate \`0x00A\` (\`0000 0000 1010_2\`) to 64-bit:
   - \`imm_sext = 0x000000000000000A (10)\`
4. **4. OPERAND FETCH & EXECUTE (ALU)**:
   - Read \`rs1 = x0\` -> \`val1 = read_reg(x0) = 0\`
   - Compute \`result = val1 + imm_sext = 0 + 10 = 10\` (\`0x000000000000000A\`)
5. **5. WRITEBACK**: Write computed result to destination register \`x5\`:
   - \`write_reg(x5, 0x000000000000000A)\`
   - Register file updated: \`regs[x5]\` becomes \`0x000000000000000A\`.
6. **6. PROGRAM COUNTER UPDATE**: Advance PC to next instruction:
   - \`Next PC = PC + 4 = 0x80000004\`

---

## 7. Edge Cases & Implementation Checklist

- [x] **x0 Target Writes**: Instructions targeting \`x0\` execute normally in ALU, but target writeback is discarded silently.
- [x] **Sign Extension**: All I-type, S-type, B-type, and J-type immediates must undergo sign-extension before computation.
- [x] **Word Operations (RV64I ADDIW / ADDW)**: 32-bit word operations truncate results to 32 bits and sign-extend bit 31 through bit 63.
- [x] **PC Alignment**: PC increment must handle standard 4-byte boundaries and 2-byte boundaries when the compressed instruction extension (RVC) is present.
`
  },
  {
    id: "rv64-register-model",
    title: "RV64 Register Model",
    category: "Modules & Implementation",
    description: "Specification and ABI conventions for registers x0-x31, Floating-Point, and PC.",
    content: `# RV64 Register Model

The standard RISC-V 64-bit integer register state consists of 32 general-purpose registers (\`x0\` through \`x31\`), each **64 bits wide** (\`XLEN = 64\`), plus the Program Counter (\`pc\`).

---

## General Purpose Registers (GPRs)

\`x0\` is hardwired to zero. Writes to \`x0\` are discarded with zero side-effects.

| Register | ABI Name | Description | Saver |
| :--- | :--- | :--- | :--- |
| \`x0\` | \`zero\` | Hard-wired Zero | - |
| \`x1\` | \`ra\` | Return Address | Caller |
| \`x2\` | \`sp\` | Stack Pointer | Callee |
| \`x3\` | \`gp\` | Global Pointer | - |
| \`x4\` | \`tp\` | Thread Pointer | - |
| \`x5\`-\`x7\` | \`t0\`-\`t2\` | Temporaries | Caller |
| \`x8\` | \`s0\` / \`fp\` | Saved Register / Frame Pointer | Callee |
| \`x9\` | \`s1\` | Saved Register | Callee |
| \`x10\`-\`x11\`| \`a0\`-\`a1\` | Function Arguments / Return Values | Caller |
| \`x12\`-\`x17\`| \`a2\`-\`a7\` | Function Arguments | Caller |
| \`x18\`-\`x27\`| \`s2\`-\`s11\` | Saved Registers | Callee |
| \`x28\`-\`x31\`| \`t3\`-\`t6\` | Temporaries | Caller |
| \`pc\` | \`pc\` | 64-bit Program Counter | - |

---

## C++20 Register File Implementation

\`\`\`cpp
#include <array>
#include <cstdint>

namespace rv64 {

class RegisterFile {
private:
    std::array<uint64_t, 32> regs_{};
    uint64_t pc_{0x80000000}; // Reset vector pointing to DRAM

public:
    [[nodiscard]] inline uint64_t read(uint8_t index) const noexcept {
        return (index == 0) ? 0ULL : regs_[index];
    }

    inline void write(uint8_t index, uint64_t value) noexcept {
        if (index != 0) [[likely]] {
            regs_[index] = value;
        }
    }

    [[nodiscard]] inline uint64_t pc() const noexcept { return pc_; }
    inline void set_pc(uint64_t new_pc) noexcept { pc_ = new_pc; }
};

} // namespace rv64
\`\`\`

> [!TIP]
> Use the interactive **Register Explorer** on the right sidebar to examine any register's calling convention and reset characteristics.
`
  },
  {
    id: "sv39-mmu",
    title: "Sv39 Virtual Memory MMU",
    category: "Modules & Implementation",
    description: "Detailed breakdown of the 3-level page table walk, TLB, and Copy-On-Write implementation.",
    content: `# Sv39 Virtual Memory Architecture

The RV64 architecture employs the **Sv39** MMU scheme, supporting a 39-bit virtual address space mapped onto up to 56 bits of physical address space.

---

## Virtual Address Partitioning (39 bits)

A 39-bit virtual address is split into three 9-bit Virtual Page Numbers (VPN[2], VPN[1], VPN[0]) and a 12-bit physical page offset:

\`\`\`
 38         30 29         21 20         12 11          0
+-------------+-------------+-------------+-------------+
|    VPN[2]   |    VPN[1]   |    VPN[0]   | Page Offset |
+-------------+-------------+-------------+-------------+
    9 bits        9 bits        9 bits        12 bits
\`\`\`

- **Level 2 (VPN[2])**: Points to 1 GB Gigabit Megapages.
- **Level 1 (VPN[1])**: Points to 2 MB Megapages.
- **Level 0 (VPN[0])**: Points to 4 KB Standard Pages.

---

## 3-Level Page Table Walking Logic

1. Let \`base = satp.ppn << 12\`.
2. For level \`i = 2, 1, 0\`:
   - Compute \`pte_addr = base + vpn[i] * 8\`.
   - Read 64-bit PTE from DRAM.
   - If \`pte.V == 0\` or (\`pte.R == 0\` and \`pte.W == 1\`), trigger **Page Fault Exception**.
   - If \`pte.R == 1\` or \`pte.X == 1\`, leaf entry found.
   - Else, update \`base = pte.ppn << 12\` and continue down.
`
  },
  {
    id: "peripherals",
    title: "Peripherals & Memory Map",
    category: "Devices & Platform",
    description: "Memory layout and drivers for UART 16550A, SiFive CLINT, PLIC, and VirtIO Block.",
    content: `# Peripherals & Memory Map

The system bus bridges the RV64 core to physical RAM and memory-mapped hardware controllers.

---

## Physical Address Map

| Address Range | Device | Size | Interrupt (IRQ) |
| :--- | :--- | :--- | :--- |
| \`0x00001000\` - \`0x00001FFF\` | Boot ROM | 4 KB | - |
| \`0x02000000\` - \`0x0200FFFF\` | SiFive CLINT | 64 KB | Software / Timer |
| \`0x0C000000\` - \`0x0FFFFFFF\` | SiFive PLIC | 64 MB | External Interrupts |
| \`0x10000000\` - \`0x100000FF\` | UART 16550A | 256 B | PLIC IRQ #10 |
| \`0x10001000\` - \`0x10001FFF\` | VirtIO Block | 4 KB | PLIC IRQ #1 |
| \`0x80000000\` - \`0x9FFFFFFF\` | Main DRAM | 512 MB | - |
`
  },
  {
    id: "linux-boot",
    title: "Linux Boot & Interactive Shell",
    category: "Devices & Platform",
    description: "End-to-end boot timeline from BootROM reset vector to BusyBox root prompt.",
    content: `# Linux Boot Process

Booting Linux on Yantra follows the standardized RISC-V boot specification:

\`\`\`text
 [ Hardware Reset (PC = 0x80000000) ]
               |
               v
 [ OpenSBI Firmware (0x80000000, M-Mode) ]
               |
               v
 [ Linux 6.8 Kernel (0x80200000, S-Mode) ]
               |
               v
 [ Userspace init -> /bin/sh (U-Mode) ]
\`\`\`

---

## Login Credentials

When Linux kernel initialization completes and invokes \`/sbin/init\`, you will be greeted with the login prompt:

\`\`\`text
welcome to Linux!
(none) login: nvidia
Password: nvidia
\`\`\`

- **Default User**: \`nvidia\`
- **Default Password**: \`nvidia\`
`
  },
  {
    id: "build-and-run",
    title: "Building & Running Yantra",
    category: "Guides & Toolchain",
    description: "Step-by-step compilation guide using CMake and Visual Studio 2022 MSVC on Windows.",
    content: `# Building & Running the Emulator

Yantra is built using **CMake 3.20+** and modern **C++20** compilers. On Windows, Microsoft Visual Studio 2022 (MSVC) is the primary supported toolchain.

---

## Compilation Steps (MSVC Release Mode)

\`\`\`powershell
# 1. Generate CMake build files for x64 architecture
cmake -B build-msvc -A x64

# 2. Compile the Release target with multi-threaded optimizations
cmake --build build-msvc --config Release -j
\`\`\`

> [!IMPORTANT]
> Always compile in **Release mode** (\`--config Release\`). Emulation throughput increases by over 12x due to inlined instruction decoding.
`
  },
  {
    id: "pdf-workflow",
    title: "PDF Ingestion & Vercel Deploy",
    category: "Guides & Toolchain",
    description: "How to upload PDF documents and push automatically to Git and Vercel.",
    content: `# PDF Ingestion & Automatic Vercel Deployment

This documentation system was architected to be **100% frontend**—no database, no backend servers, and **zero environment variables** to configure on Vercel.

---

## Method 1: In-Browser Drag & Drop (Instant)
1. Click the **"Import PDF"** button in the top navigation bar.
2. Drag and drop any specification PDF.
3. The built-in client-side engine parses the text and generates clean markdown in real time.
4. Preview the document and click **"Save & Add to Website"**.

---

## Method 2: Python Script with Auto-Push
\`\`\`bash
# Run the PDF ingestion tool
python scripts/import_pdf.py "path/to/specification.pdf"
\`\`\`
`
  }
];
