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
    id: "module-2-sv39-mmu",
    title: "Module 2: Sv39 MMU & Page Tables",
    category: "Modules & Implementation",
    description: "Sv39 3-level page table walk, satp CSR layout, PTE permissions, Yantra C++ MMU/TLB implementation, and concrete walkthrough.",
    content: `# Module 2: Sv39 MMU, Page Tables, and TLB Acceleration

---

## Step 1: Learning Objectives & Prerequisites

### Learning Objectives
By the end of this module, you will be able to:
1. Deconstruct a 39-bit RISC-V Virtual Address into its 9-bit Virtual Page Numbers (\`VPN[2]\`, \`VPN[1]\`, \`VPN[0]\`) and 12-bit Page Offset.
2. Parse the \`satp\` (Supervisor Address Translation and Protection) CSR bitfields.
3. Trace a 3-level page table walk from root Physical Page Number (\`PPN\`) down to a leaf Page Table Entry (\`PTE\`).
4. Decode PTE access permission bits (\`V\`, \`R\`, \`W\`, \`X\`, \`U\`, \`A\`, \`D\`) and explain Copy-on-Write (\`COW\`) behavior.
5. Explain TLB hit/miss mechanics and why \`SFENCE.VMA\` is required when altering page mappings.

### Prerequisites
Module 1 (CPU registers, PC execution loop), hexadecimal address arithmetic, and bitwise manipulation.

---

## 1. The Core Hardware Problem

An operating system like Linux executes multiple processes simultaneously. If processes directly accessed physical RAM using raw addresses, a buggy or malicious application could corrupt kernel memory or read secrets from another process.

To prevent this, the CPU's **Memory Management Unit (MMU)** sits between the CPU core and the physical memory bus. It translates private **Virtual Addresses (VA)** generated by instructions into shared **Physical Addresses (PA)** in DRAM.

![Sv39 MMU Translation Flow and Address Formats](assets/images/sv39-mmu-translation-flow.png)

---

## 2. Mental Model: A 3-Tier Filing Cabinet

Think of virtual address translation as finding a document in a huge library filing cabinet:

- **\`satp\` Register**: Points to the location of the **Main Building** (Root Page Table at Level 2).
- **\`VPN[2]\`**: Tells you which **Room** to enter.
- **\`VPN[1]\`**: Tells you which **Cabinet** inside that room to open.
- **\`VPN[0]\`**: Tells you which **Folder** inside that cabinet to pull out.
- **\`Page Offset\`**: The exact **Page/Line Number** inside the document itself.

---

## 3. Bitfield Structures in RISC-V Sv39

### A. Virtual Address (39 bits valid, sign-extended to 64 bits)

RISC-V Sv39 uses a 39-bit virtual address space ($2^{39} = 512\\,\\text{GiB}$ per process). Bits \`[63:39]\` must match bit 38 (canonical address check).

- **Page Size**: $2^{12} = 4096\\,\\text{bytes}\\,(4\\,\\text{KiB})$.
- **Entries per table**: Each page table page is $4\\,\\text{KiB}$ and contains 512 entries ($512 \\times 8\\,\\text{bytes/PTE} = 4096\\,\\text{bytes}$). A 9-bit index ranges from 0 to 511.

---

### B. \`satp\` CSR Layout (64-bit)

Control register governing supervisor address translation:

![RISC-V satp Register Format](assets/images/riscv-satp-register-format.png)

- **\`MODE = 0\` (Bare)**: Virtual memory disabled; $VA = PA$.
- **\`MODE = 8\` (Sv39)**: Page-based 3-level virtual memory enabled.
- **\`PPN\`**: Physical Page Number of the Root (Level-2) Page Table.  
  $$\\text{Root physical address} = \\text{PPN} \\times 4096 = \\text{PPN} \\ll 12$$

---

### C. Page Table Entry (PTE) Layout (64-bit)

Each page table entry stores translation mappings and security permissions:

![RISC-V Sv39 Page Table Entry (PTE) Format](assets/images/sv39-page-table-entry-format.png)

#### Flags (Bits [7:0]):
- **\`V\` (Valid, bit 0)**: Must be 1 for entry to be active.
- **\`R\` (Read, bit 1), \`W\` (Write, bit 2), \`X\` (Execute, bit 3)**:
  - If $R = 0, W = 0, X = 0$: This entry points to the next-level page table page.
  - If any of $R, W, X$ is 1: This entry is a **Leaf PTE** pointing to an actual physical RAM page.
- **\`U\` (User, bit 4)**: Accessible in User-mode (U-mode) if 1.
- **\`A\` (Accessed, bit 6)**: Set to 1 by hardware/emulator upon read/write/fetch.
- **\`D\` (Dirty, bit 7)**: Set to 1 by hardware/emulator upon a store operation.

---

## Step 3: Source-Code Investigation (Yantra Implementation)

In the Yantra emulator, MMU address translation and TLB caching logic follow a structured C++ flow:

\`\`\`cpp
struct TlbEntry {
    uint64_t vpn;      // Virtual Page Number
    uint64_t ppn;      // Translated Physical Page Number
    uint8_t flags;     // Permission flags (R, W, X, U, etc.)
    bool valid;
};

class Mmu {
private:
    TlbEntry tlb[256]; // Direct-mapped or associative TLB cache

public:
    uint64_t translate(
        uint64_t va,
        AccessType access_type,
        PrivilegeMode mode
    ) {
        // 1. Bare Mode Check
        if (satp.mode == SATP_MODE_BARE || mode == PRIV_MACHINE) {
            return va; // Direct physical mapping
        }

        uint64_t vpn = va >> 12;      // Extract Virtual Page Number
        uint64_t offset = va & 0xFFF; // Extract 12-bit page offset

        // 2. TLB Lookup
        TlbEntry* entry = tlb_lookup(vpn);
        if (entry && entry->valid) {
            check_permissions(entry->flags, access_type, mode);
            return (entry->ppn << 12) | offset;
        }

        // 3. TLB Miss -> 3-Level Page Table Walk
        uint64_t pa = page_walk(va, access_type, mode);
        return pa;
    }

    uint64_t page_walk(
        uint64_t va,
        AccessType access_type,
        PrivilegeMode mode
    ) {
        uint64_t vpn[3] = {
            (va >> 12) & 0x1FF, // VPN[0]
            (va >> 21) & 0x1FF, // VPN[1]
            (va >> 30) & 0x1FF  // VPN[2]
        };

        // Start at Root Page Table (Level 2)
        uint64_t a = satp.ppn << 12;

        for (int i = 2; i >= 0; --i) {
            // Calculate Page Table Entry address
            uint64_t pte_addr = a + (vpn[i] * 8);

            // Read 64-bit Page Table Entry
            uint64_t pte = bus.read64(pte_addr);

            // Check whether the PTE is valid
            if (!(pte & PTE_V)) {
                raise_page_fault(va, access_type);
            }

            // Check if this is a Leaf Entry (R, W, or X)
            if (pte & (PTE_R | PTE_W | PTE_X)) {
                check_permissions(pte, access_type, mode);

                // Extract Physical Page Number
                uint64_t ppn = (pte >> 10) & 0x003FFFFFFFFFFFULL;

                // Populate TLB
                tlb_insert(vpn_full, ppn, pte);

                // Construct Physical Address
                return (ppn << 12) | (va & 0xFFF);
            }

            // Not a leaf: Move to the next-level page table
            a = ((pte >> 10) & 0x003FFFFFFFFFFFULL) << 12;
        }

        // Reached Level 0 without finding a Leaf Entry
        raise_page_fault(va, access_type);
    }
};
\`\`\`

---

## Step 4: Concrete Walkthrough (3-Level Page Walk)

Let's trace a virtual memory access for address \`0x0000000080001020\` (Read Access in U-mode):

### Initial Parameters
- \`va = 0x0000000080001020\`
- \`satp.ppn = 0x80200\` (Root Table Physical Address = \`0x80200000\`)
- \`VPN[2] = 0x002\` (bits \`[38:30]\`)
- \`VPN[1] = 0x000\` (bits \`[29:21]\`)
- \`VPN[0] = 0x001\` (bits \`[20:12]\`)
- \`Offset = 0x020\` (bits \`[11:0]\`)

---

### Walk Execution Steps

#### Level 2 (Root Lookup):
- **Read PTE at address**: $\\text{Root\\_PA} + (\\text{VPN}[2] \\times 8) = 0x80200000 + (2 \\times 8) = 0x80200010$.
- **Loaded PTE_2**: \`0x0002010000000001\` ($V=1, R=0, W=0, X=0$).
- **Result**: Non-leaf entry. Points to Level-1 table address:  
  $$0x20100 \\ll 12 = 0x80400000$$

#### Level 1 Lookup:
- **Read PTE at address**: $0x80400000 + (\\text{VPN}[1] \\times 8) = 0x80400000 + 0 = 0x80400000$.
- **Loaded PTE_1**: \`0x0002020000000001\` ($V=1, R=0, W=0, X=0$).
- **Result**: Non-leaf entry. Points to Level-0 table address:  
  $$0x20200 \\ll 12 = 0x80800000$$

#### Level 0 (Leaf Lookup):
- **Read PTE at address**: $0x80800000 + (\\text{VPN}[0] \\times 8) = 0x80800000 + (1 \\times 8) = 0x80800008$.
- **Loaded PTE_0**: \`0x000205000000001F\` ($V=1, R=1, W=1, X=1, U=1, A=1, D=1$).
- **Result**: Leaf entry! $\\text{PPN} = 0x20500$.
- **Physical Page Base Address**: $0x20500 \\ll 12 = 0x81400000$.

---

### Final Physical Address Calculation:

$$\\text{PA} = \\text{Physical Page Base} + \\text{Offset} = 0x81400000 \\mid 0x020 = 0x81401020$$

---

## Step 5: Edge Cases & Real-World Considerations

### 1. Invalid Page Faults
If \`PTE_V == 0\`, or an attempt is made to Write to a page where \`PTE_W == 0\`, the MMU triggers a **Page Fault Exception** (Load Page Fault, Store/AMO Page Fault, or Instruction Page Fault).

### 2. Copy-on-Write (COW)
Operating systems like Linux optimize process creation (\`fork()\`) by marking shared pages as **Read-Only** (\`W=0\`). When a child process attempts to write to the page, a **Store Page Fault** triggers. The kernel copies the $4\\,\\text{KiB}$ page, sets \`W=1\` for the new copy, and updates the PTE.

### 3. Superpages (Gigapages & Megapages)
- If a leaf PTE ($R/W/X \\neq 0$) is encountered at Level 2, it maps a **1 GiB Gigapage**.
- If a leaf PTE is encountered at Level 1, it maps a **2 MiB Megapage**.
- Superpages reduce page table walking overhead and improve TLB efficiency for kernel memory.

### 4. \`SFENCE.VMA\` Instruction
Whenever the OS alters page table entries or switches \`satp\`, old translations in the emulator's TLB become stale. The CPU executes \`SFENCE.VMA\`, causing the emulator to clear cached TLB entries.

---

## Step 6: System Connectivity

- **Upstream Dependency**: Receives raw virtual addresses generated during instruction fetch (\`pc\`) and memory execution (\`LOAD\`/\`STORE\`) from the CPU Core (Module 1).
- **Downstream Dependency**: Converts valid VAs into physical addresses, routing memory requests to the physical DRAM Subsystem (\`0x80000000\`) or MMIO Peripheral Bus (UART, PLIC, CLINT, VirtIO).

---

## Step 7: Summary & Review

### Key Takeaways:
1. **Sv39** translates 39-bit virtual addresses to 56-bit physical addresses using 3-level page tables ($4\\,\\text{KiB}$ pages).
2. The **\`satp\` CSR** holds the root page table physical address (\`PPN\`) and enables MMU translation (\`MODE = 8\`).
3. An entry with $R=0, W=0, X=0$ points to a sub-table; any set $R/W/X$ bit designates a leaf page.
4. A **TLB** caches recent virtual-to-physical translations to skip expensive 3-memory-lookup page walks.
5. **\`SFENCE.VMA\`** flushes stale TLB mappings when page tables change.
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
