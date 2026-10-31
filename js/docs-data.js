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

> [!NOTE]
> **🎯 Learning Objectives**
> 
> By the end of this module, you will be able to:
> 1. **Deconstruct Virtual Addresses**: Partition a 39-bit RISC-V Virtual Address into its 9-bit Virtual Page Numbers (\`VPN[2]\`, \`VPN[1]\`, \`VPN[0]\`) and 12-bit Page Offset.
> 2. **Parse the \`satp\` CSR**: Decode the \`MODE\` (paging scheme), \`ASID\` (address space identifier), and root \`PPN\` (physical page number).
> 3. **Trace a 3-Level Page Table Walk**: Traverse from the Level-2 root table down to a Level-0 leaf Page Table Entry (\`PTE\`).
> 4. **Decode PTE Permissions**: Interpret protection flags (\`V\`, \`R\`, \`W\`, \`X\`, \`U\`, \`A\`, \`D\`) and explain Copy-on-Write (\`COW\`) mechanics.
> 5. **TLB Caching & Invalidation**: Understand translation cache hit/miss mechanics and why \`SFENCE.VMA\` is mandatory upon page mapping changes.

**Prerequisites**: Module 1 (CPU registers, PC execution loop), hexadecimal address arithmetic, and bitwise manipulation.

---

## 1. The Core Hardware Problem

An operating system like Linux executes multiple user applications simultaneously. If applications directly accessed physical RAM using raw addresses, a buggy or malicious process could overwrite kernel memory or inspect secrets belonging to another process.

To provide hardware isolation, the CPU's **Memory Management Unit (MMU)** sits between the CPU core and the physical memory bus. It translates private **Virtual Addresses (VA)** generated by instructions into shared **Physical Addresses (PA)** in DRAM.

![Sv39 MMU Translation Flow and Address Formats](assets/images/sv39-mmu-translation-flow.png)

---

## 2. Mental Model: A 3-Tier Filing Cabinet

Think of virtual address translation as finding a document in a vast library filing cabinet:

- **\`satp\` Register** &rarr; **Main Building**: Points to the base address of the Root Page Table (Level 2) in DRAM.
- **\`VPN[2]\`** &rarr; **Room Number**: Selects the 1 GiB gigapage directory entry.
- **\`VPN[1]\`** &rarr; **Cabinet inside Room**: Selects the 2 MiB megapage directory entry.
- **\`VPN[0]\`** &rarr; **Folder inside Cabinet**: Selects the 4 KiB base page table entry.
- **\`Page Offset\`** &rarr; **Page & Line Number**: The exact byte offset inside the physical 4 KiB page frame.

---

## 3. Bitfield Structures in RISC-V Sv39

### A. Virtual Address (39 bits valid, sign-extended to 64 bits)

RISC-V Sv39 uses a 39-bit virtual address space ($2^{39} = 512\\text{ GiB}$ per process). Bits \`[63:39]\` must match bit 38 (canonical address check).

- **Page Size**: $2^{12} = 4096\\text{ bytes } (4\\text{ KiB})$
- **Entries per table**: Each page table page is $4\\text{ KiB}$ and contains 512 entries ($512 \\times 8\\text{ bytes/PTE} = 4096\\text{ bytes}$). A 9-bit index ranges from 0 to 511.

---

### B. \`satp\` CSR Layout (64-bit)

The **Supervisor Address Translation and Protection (\`satp\`)** register controls MMU paging:

![RISC-V satp Register Format](assets/images/riscv-satp-register-format.png)

| Field | Bits | Description |
| :--- | :--- | :--- |
| **\`MODE\`** | \`[63:60]\` (4 bits) | \`0\` = Bare (Virtual memory disabled; $VA = PA$)<br>\`8\` = Sv39 (3-level page translation enabled)<br>\`9\` = Sv48, \`10\` = Sv57 |
| **\`ASID\`** | \`[59:44]\` (16 bits) | Address Space Identifier used to tag TLB entries per process. |
| **\`PPN\`** | \`[43:0]\` (44 bits) | Physical Page Number of the Level-2 Root Page Table in DRAM. |

$$\\text{Root Physical Address} = \\text{satp.PPN} \\times 4096 = \\text{satp.PPN} \\ll 12$$

---

### C. Page Table Entry (PTE) Layout (64-bit)

Each 64-bit PTE stores translation mappings, physical page numbers, and hardware security flags:

![RISC-V Sv39 Page Table Entry (PTE) Format](assets/images/sv39-page-table-entry-format.png)

#### Permission & Status Flags (Bits [7:0]):

| Bit | Flag | Name | Semantic & Hardware Rule |
| :---: | :---: | :--- | :--- |
| **0** | **\`V\`** | Valid | Must be \`1\` for the entry to be active. If \`0\`, access triggers a Page Fault. |
| **1** | **\`R\`** | Read | Grants read permission to the page. |
| **2** | **\`W\`** | Write | Grants write permission to the page. |
| **3** | **\`X\`** | Execute | Grants instruction-fetch execution permission. |
| **4** | **\`U\`** | User | Accessible in User Mode (\`U-mode\`) if \`1\`. If \`0\`, only accessible in Supervisor Mode (\`S-mode\`). |
| **5** | **\`G\`** | Global | Global mapping across all address spaces (not flushed on ASID switch). |
| **6** | **\`A\`** | Accessed | Set to \`1\` by hardware/emulator upon any read, write, or fetch. |
| **7** | **\`D\`** | Dirty | Set to \`1\` by hardware/emulator upon a memory store operation. |

> [!IMPORTANT]
> **Leaf vs. Pointer Entry Rule**:
> - If $R = 0, W = 0, X = 0$: This entry is a **pointer** to the next-level page table.
> - If any of $R, W, X$ is \`1\`: This entry is a **Leaf PTE** mapping directly to physical DRAM.

---

## Step 3: Source-Code Investigation (Yantra Implementation)

In the Yantra emulator, MMU address translation and TLB caching logic follow a structured C++20 implementation:

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

            // Read 64-bit Page Table Entry from DRAM
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
- **Virtual Address**: \`va = 0x0000000080001020\`
- **Root Table Base**: \`satp.ppn = 0x80200\` $\\to$ \`Root_PA = 0x80200000\`
- **\`VPN[2]\`**: \`0x002\` (bits \`[38:30]\`)
- **\`VPN[1]\`**: \`0x000\` (bits \`[29:21]\`)
- **\`VPN[0]\`**: \`0x001\` (bits \`[20:12]\`)
- **\`Offset\`**: \`0x020\` (bits \`[11:0]\`)

---

### Step-by-Step Lookup Trace:

#### 1. Level 2 (Root Lookup)
- **PTE Address**: $\\text{Root\\_PA} + (\\text{VPN}[2] \\times 8) = 0x80200000 + (2 \\times 8) = 0x80200010$
- **Loaded PTE Value**: \`0x0002010000000001\` ($V=1, R=0, W=0, X=0$)
- **Action**: Non-leaf pointer entry. Extract PPN \`0x20100\`.
- **Level-1 Table Base**: $0x20100 \\ll 12 = 0x80400000$

#### 2. Level 1 Lookup
- **PTE Address**: $0x80400000 + (\\text{VPN}[1] \\times 8) = 0x80400000 + 0 = 0x80400000$
- **Loaded PTE Value**: \`0x0002020000000001\` ($V=1, R=0, W=0, X=0$)
- **Action**: Non-leaf pointer entry. Extract PPN \`0x20200\`.
- **Level-0 Table Base**: $0x20200 \\ll 12 = 0x80800000$

#### 3. Level 0 (Leaf Lookup)
- **PTE Address**: $0x80800000 + (\\text{VPN}[0] \\times 8) = 0x80800000 + (1 \\times 8) = 0x80800008$
- **Loaded PTE Value**: \`0x000205000000001F\` ($V=1, R=1, W=1, X=1, U=1, A=1, D=1$)
- **Action**: **Leaf entry reached!** Permissions match read in U-mode. Extract PPN \`0x20500\`.
- **Physical Page Base**: $0x20500 \\ll 12 = 0x81400000$

#### 4. Final Physical Address Calculation:
$$\\text{PA} = \\text{Physical Page Base} + \\text{Offset} = 0x81400000 \\mid 0x020 = 0x81401020$$

---

## Step 5: Edge Cases & Real-World Considerations

### 1. Invalid Page Faults
If \`PTE_V == 0\`, or an attempt is made to write to a page where \`PTE_W == 0\`, the MMU triggers a **Page Fault Exception** (\`Load Page Fault\`, \`Store/AMO Page Fault\`, or \`Instruction Page Fault\`).

### 2. Copy-on-Write (COW)
Operating systems like Linux optimize process creation (\`fork()\`) by marking shared pages as **Read-Only** (\`W=0\`). When a child process attempts to write to the page, a **Store Page Fault** triggers. The kernel copies the 4 KiB page, sets \`W=1\` on the new copy, and updates the PTE.

### 3. Superpages (Gigapages & Megapages)
- If a leaf PTE ($R/W/X \\neq 0$) is encountered at Level 2, it maps a **1 GiB Gigapage**.
- If a leaf PTE is encountered at Level 1, it maps a **2 MiB Megapage**.
- Superpages bypass lower page tables and improve TLB reach for kernel code and large heaps.

### 4. \`SFENCE.VMA\` Instruction
Whenever the OS modifies page table entries or changes \`satp\`, cached translations in the TLB become stale. The CPU executes \`SFENCE.VMA\`, instructing the hardware/emulator to invalidate its TLB cache.

---

## Step 6: System Connectivity

- **Upstream Dependency**: Receives raw virtual addresses generated during instruction fetch (\`PC\`) and memory execution (\`LOAD\`/\`STORE\`) from the CPU Core (Module 1).
- **Downstream Dependency**: Converts valid VAs into physical addresses, routing memory requests to the physical DRAM Subsystem (\`0x80000000\`) or MMIO Peripheral Bus (UART, PLIC, CLINT, VirtIO).

---

## Step 7: Summary & Review

> [!TIP]
> ### 📌 Key Takeaways
> 1. **Sv39 Address Space**: Translates 39-bit virtual addresses to 56-bit physical addresses using 3-level page tables (4 KiB pages).
> 2. **\`satp\` Register**: Holds the root page table physical address (\`PPN\`) and enables MMU translation (\`MODE = 8\`).
> 3. **PTE Format**: An entry with $R=0, W=0, X=0$ points to a sub-table; any set $R/W/X$ bit designates a leaf page.
> 4. **TLB Acceleration**: Caches recent virtual-to-physical translations to skip expensive 3-memory-lookup page walks.
> 5. **\`SFENCE.VMA\`**: Flushes stale TLB mappings whenever page tables change.
`
  },
  {
    id: "module-3-privileged-traps",
    title: "Module 3: Privileged Architecture & Trap Handling",
    category: "Modules & Implementation",
    description: "RISC-V privilege modes (M/S/U), CSR bitfields, trap entry/return sequence, trap delegation (medeleg/mideleg), and Yantra C++ trap implementation.",
    content: `# Module 3: Privileged Architecture, CSRs, and Trap Handling

---

## Step 1: Learning Objectives & Prerequisites

> [!NOTE]
> **🎯 Learning Objectives**
> 
> By the end of this module, you will be able to:
> 1. **Distinguish Privilege Modes**: Distinguish between Machine (M), Supervisor (S), and User (U) privilege modes in RISC-V.
> 2. **Parse Key CSRs**: Parse key Control and Status Registers (CSRs), including \`mstatus\`/\`sstatus\`, \`stvec\`/\`mtvec\`, \`sepc\`/\`mepc\`, \`scause\`/\`mcause\`, and delegation registers (\`medeleg\`/\`mideleg\`).
> 3. **Trace Trap Entry Mechanics**: Trace the trap entry mechanism when an exception (e.g., \`ecall\`, page fault) or interrupt occurs.
> 4. **Explain Trap Delegation**: Explain how Trap Delegation allows Supervisor mode (Linux) to handle exceptions without triggering OpenSBI firmware overhead in Machine mode.
> 5. **Trace Trap Return Instructions**: Trace trap return instructions (\`mret\` / \`sret\`) and privilege state restoration.

**Prerequisites**: Module 1 (CPU Core State & PC loop) and Module 2 (Sv39 MMU & Page Fault exceptions).

---

## Step 2: Conceptual Foundation (First Principles)

## 1. The Core Hardware Problem

An operating system must prevent user applications from executing arbitrary hardware commands or tampering with kernel memory. However, applications frequently need operating system services (e.g., reading a file, printing to terminal, or allocating memory).

To achieve this safely, the hardware enforces **Privilege Rings**. Applications run in a restricted ring. When they need kernel services, they execute a special instruction (\`ecall\`) that triggers a controlled hardware context-switch called a **Trap**.

![RISC-V Privilege Modes & Trap Delegation Hierarchy](assets/images/riscv-privilege-levels.svg)

---

## 2. Control and Status Registers (CSRs)

Unlike general-purpose registers (\`x0\`–\`x31\`), CSRs govern system status, privilege levels, interrupt configuration, and trap vector locations. They are accessed via dedicated CSR instructions (\`csrrw\`, \`csrrs\`, \`csrrc\`).

### Key CSR Responsibilities:

| CSR Name | Description | Key Bitfields |
| :--- | :--- | :--- |
| **\`mstatus\` / \`sstatus\`** | Global Status Register | **\`MIE\` / \`SIE\`**: Global interrupt enable bits.<br>**\`MPIE\` / \`SPIE\`**: Saved interrupt enables prior to trap.<br>**\`MPP\` / \`SPP\`**: Saved previous privilege mode prior to trap. |
| **\`mtvec\` / \`stvec\`** | Trap Vector Base Address | High bits hold entry PC address; bit \`[0]\` sets mode (\`0\` = Direct, \`1\` = Vectored). |
| **\`mepc\` / \`sepc\`** | Exception Program Counter | Saves the \`pc\` value where the trap occurred. |
| **\`mcause\` / \`scause\`** | Exception / Interrupt Cause | Bit \`[63]\` indicates Interrupt (\`1\`) vs Exception (\`0\`). Lower bits indicate exact cause code. |
| **\`mtval\` / \`stval\`** | Trap Value | Stores faulting memory address (e.g., for page faults) or instruction word. |
| **\`medeleg\` / \`mideleg\`** | Exception / Interrupt Delegation | Bitmask in M-mode indicating which traps bypass M-mode and go directly to S-mode. |

---

## 3. Trap Execution Mechanics

When a trap occurs (e.g., \`ecall\` in U-mode targeting S-mode):

1. **Save Return Address**: The hardware copies current \`pc\` into \`sepc\`.
2. **Save Cause & Value**: The reason for the trap is written to \`scause\`, and relevant fault data to \`stval\`.
3. **Save Privilege & Interrupt State**:
   - Current privilege mode (U-mode) is written to \`sstatus.SPP\`.
   - Global interrupt enable (\`sstatus.SIE\`) is saved into \`sstatus.SPIE\`.
   - Global interrupts are disabled (\`sstatus.SIE = 0\`).
4. **Switch Privilege Mode**: Privilege drops or elevates to the target mode (S-mode).
5. **Jump to Vector**: \`pc\` is updated to the address in \`stvec\`.

When the trap handler completes, it executes \`sret\`:

1. \`pc\` is restored from \`sepc\`.
2. Privilege level is restored from \`sstatus.SPP\`.
3. Interrupt enable state is restored (\`sstatus.SIE = sstatus.SPIE\`).

---

## Step 3: Source-Code Investigation (Yantra Implementation)

In the Yantra emulator, privilege transitions and trap handling are implemented centrally:

\`\`\`cpp
enum PrivilegeMode {
    PRIV_USER       = 0,
    PRIV_SUPERVISOR = 1,
    PRIV_MACHINE    = 3
};

void Cpu::raise_trap(uint64_t cause, uint64_t tval) {
    // 1. Check if the trap should be delegated to Supervisor Mode
    bool is_interrupt = (cause >> 63) & 1;
    uint64_t exception_code = cause & 0xFFFFFFFF;
    bool delegate = false;

    if (priv_mode <= PRIV_SUPERVISOR) {
        if (is_interrupt) {
            delegate = (mideleg >> exception_code) & 1;
        } else {
            delegate = (medeleg >> exception_code) & 1;
        }
    }

    // 2. Dispatch to the target privilege level (S-Mode or M-Mode)
    if (delegate) {
        // Delegate to S-Mode
        sstatus.spp  = priv_mode;      // Save previous privilege mode
        sstatus.spie = sstatus.sie;    // Save previous interrupt enable state
        sstatus.sie  = 0;              // Disable interrupts

        sepc   = pc;                   // Save faulting PC
        scause = cause;                // Save cause code
        stval  = tval;                 // Save faulting value/address

        priv_mode = PRIV_SUPERVISOR;   // Switch to S-Mode
        pc = stvec & ~0x3ULL;          // Jump to S-Mode trap vector (Direct mode)
    } else {
        // Target M-Mode
        mstatus.mpp  = priv_mode;      // Save previous privilege mode
        mstatus.mpie = mstatus.mie;    // Save previous interrupt enable state
        mstatus.mie  = 0;              // Disable interrupts

        mepc   = pc;                   // Save faulting PC
        mcause = cause;                // Save cause code
        mtval  = tval;                 // Save faulting value/address

        priv_mode = PRIV_MACHINE;      // Switch to M-Mode
        pc = mtvec & ~0x3ULL;          // Jump to M-Mode trap vector (Direct mode)
    }
}

// Trap Return Execution (sret / mret)
void Cpu::execute_sret() {
    pc          = sepc;                // Restore PC from saved exception PC
    priv_mode   = sstatus.spp;         // Restore previous privilege level
    sstatus.sie = sstatus.spie;        // Restore interrupt enable state
    sstatus.spie = 1;                  // Re-enable SPIE
    sstatus.spp  = PRIV_USER;          // Default back to user mode
}

void Cpu::execute_mret() {
    pc          = mepc;                // Restore PC from saved exception PC
    priv_mode   = mstatus.mpp;         // Restore previous privilege level
    mstatus.mie = mstatus.mpie;        // Restore interrupt enable state
    mstatus.mpie = 1;                  // Re-enable MPIE
    mstatus.mpp  = PRIV_USER;          // Default back to user mode
}
\`\`\`

---

## Step 4: Concrete Walkthrough (System Call Trap & Return)

Let's trace a Linux System Call (\`ecall\`) issued by a User program:

### Initial State

| State Element | Value | Meaning |
| :--- | :--- | :--- |
| **\`priv_mode\`** | \`PRIV_USER\` (0) | CPU is currently executing in unprivileged User Mode. |
| **\`PC\`** | \`0x0000000000010400\` | Address of the userspace \`ecall\` instruction. |
| **\`medeleg[8]\`** | \`1\` | Environment call from U-mode is delegated directly to S-mode. |
| **\`stvec\`** | \`0x80200000\` | Base address of the Linux kernel trap handler. |

---

### Step-by-Step Trap Sequence

#### 1. Instruction Execution
- CPU fetches instruction \`ecall\` (\`0x00000073\`) at \`PC = 0x0000000000010400\`.
- Exception generated: **Cause = 8** (\`Environment Call from U-mode\`).

#### 2. Delegation Check
- Read \`medeleg\` bit 8 $\\to$ \`1\`.
- Target mode determined: **S-Mode** (Supervisor). Direct delegation bypasses M-mode OpenSBI firmware overhead.

#### 3. Trap State Save
- \`sepc\` $\\leftarrow$ \`0x0000000000010400\`
- \`scause\` $\\leftarrow$ \`8\` (\`0x0000000000000008\`)
- \`stval\` $\\leftarrow$ \`0\`
- \`sstatus.SPP\` $\\leftarrow$ \`PRIV_USER\` (0)
- \`sstatus.SPIE\` $\\leftarrow$ \`sstatus.SIE\`
- \`sstatus.SIE\` $\\leftarrow$ \`0\`

#### 4. Privilege Switch & Vector Jump
- \`priv_mode\` $\\leftarrow$ \`PRIV_SUPERVISOR\` (1)
- \`PC\` $\\leftarrow$ \`stvec & ~0x3ULL\` (\`0x80200000\`)

#### 5. OS Kernel Trap Handling
- Linux reads \`scause\` (8), inspects system call number in register \`x17\` (\`a7\`).
- Executes system call, writes return code into register \`x10\` (\`a0\`).
- Advances \`sepc\` by 4 (\`sepc = 0x0000000000010404\`) to resume after \`ecall\`.

#### 6. Trap Return (\`sret\`)
- CPU executes \`sret\`.
- \`PC\` $\\leftarrow$ \`sepc\` (\`0x0000000000010404\`)
- \`priv_mode\` $\\leftarrow$ \`sstatus.SPP\` (\`PRIV_USER\`)
- \`sstatus.SIE\` $\\leftarrow$ \`sstatus.SPIE\`

---

## Step 5: Edge Cases & Real-World Considerations

### 1. Undelegated Traps (Firmware Hand-off)
If an exception bit in \`medeleg\` is \`0\`, the trap jumps to M-mode (\`mtvec\`), where OpenSBI firmware handles it (e.g., SBI service calls like timer setup or console I/O).

### 2. Double Traps & Stack Overflow
If a page fault occurs while executing inside the trap handler before \`sepc\` and \`sstatus\` are saved, \`sepc\` gets overwritten, resulting in kernel panic or double-fault crash.

### 3. \`sepc\` Advancement on \`ecall\`
Unlike asynchronous hardware interrupts (where \`sepc\` points to the next instruction to execute), synchronous exceptions point to the faulting instruction itself. For \`ecall\`, the OS kernel trap handler must explicitly increment \`sepc += 4\` before executing \`sret\`, or the CPU will loop endlessly re-executing \`ecall\`.

---

## Step 6: System Connectivity

- **Upstream Dependency**: Receives exception triggers from Module 1 (illegal instructions), Module 2 (page faults), and Module 5 (hardware interrupts from PLIC/CLINT).
- **Downstream Dependency**: Coordinates with OpenSBI in M-mode and Linux Kernel in S-mode to maintain system stability and OS isolation.

---

## Step 7: Summary & Review

> [!TIP]
> ### 📌 Key Takeaways
> 1. **Privilege Levels**: RISC-V defines three standard privilege levels: User (U), Supervisor (S), and Machine (M).
> 2. **CSR Role**: CSRs manage trap states, vectors, interrupt masks, and privilege history across context switches.
> 3. **Trap Delegation**: Trap Delegation (\`medeleg\` / \`mideleg\`) routes exceptions directly to Supervisor mode, avoiding slow M-mode firmware context switches.
> 4. **Hardware State Save**: On trap entry, \`sepc\` captures faulting PC, \`sstatus\` saves previous state, interrupts are disabled, and PC shifts to \`stvec\`.
> 5. **Trap Return**: \`sret\` / \`mret\` restores privilege mode, enables interrupts, and sets PC back to \`sepc\`.
`
  },
  {
    id: "module-4-isa-extensions",
    title: "Module 4: ISA Extensions (M, A, F, D, C, Zicsr, Zifencei)",
    category: "Modules & Implementation",
    description: "Full RV64GC extension suite: hardware integer math (M), atomic synchronization (lr/sc/AMOs), FPU NaN-boxing (F/D), compressed RVC (C), and fence.i.",
    content: `# Module 4: ISA Extensions (M, A, F, D, C, Zicsr, Zifencei)

---

## Step 1: Learning Objectives & Prerequisites

> [!NOTE]
> **🎯 Learning Objectives**
> 
> By the end of this module, you will be able to:
> 1. **Define RV64GC Baseline**: Define the full RV64GC standard extension suite required to boot modern 64-bit Linux kernels.
> 2. **Master Integer Math (M Extension)**: Explain hardware multiplication and division signedness, edge cases, and 32-bit word instruction behavior.
> 3. **Understand Atomic Synchronization (A Extension)**: Master Load-Reserved (\`lr\`), Store-Conditional (\`sc\`), Reservation Sets, and Atomic Memory Operations (AMOs).
> 4. **Understand Floating-Point Mechanics (F & D Extensions)**: Understand single and double-precision floating-point state, NaN-boxing rules, and rounding control via \`fcsr\`.
> 5. **Decode Compressed Instructions (C Extension / RVC)**: Decode 16-bit compressed instructions across the three opcode quadrants and explain 16-bit to 32-bit instruction expansion.
> 6. **Describe Pipeline & Cache Fences**: Describe memory fence synchronization (\`fence\`) and instruction cache invalidation (\`fence.i\`).

**Prerequisites**: Module 1 (RV64I registers & ALU decoding) and Module 3 (Privilege modes & CSR mechanics).

---

## Step 2: Deep Dive into the Extension Suite

The standard RISC-V application baseline for general-purpose computing is designated as **RV64GC** (where **G** = \`IMAFD_Zicsr_Zifencei\` and **C** = Compressed Instructions). This complete suite is mandatory to execute standard Linux distributions, multi-threaded userspace runtimes, and JIT compilers.

---

### A. M Extension (Integer Multiplication & Division)

The **M extension** introduces hardware integer multiplication and division for both 64-bit doublewords and 32-bit words:

#### 1. 64-Bit Multiplication
Multiplication of two 64-bit integers produces a full 128-bit intermediate product:

$$\\text{Product}[127:0] = rs1 \\times rs2$$

- **\`mul\`**: Computes the 128-bit product and returns the **low 64 bits** (\`Product[63:0]\`). The result is identical for signed and unsigned integers in 2's complement arithmetic.
- **\`mulh\` / \`mulhu\` / \`mulhsu\`**: Returns the **high 64 bits** (\`Product[127:64]\`), which depends on operand signedness:
  - \`mulh\`: Signed $\\times$ Signed
  - \`mulhu\`: Unsigned $\\times$ Unsigned
  - \`mulhsu\`: Signed ($rs1$) $\\times$ Unsigned ($rs2$)

| Instruction | Format | Operation | Product Slice | Signedness ($rs1 \\times rs2$) |
| :--- | :--- | :--- | :--- | :--- |
| **\`mul\`** | R-Type | Low 64-bit product | $[63:0]$ | Signed / Unsigned (Identical) |
| **\`mulh\`** | R-Type | High 64-bit product | $[127:64]$ | Signed $\\times$ Signed |
| **\`mulhu\`** | R-Type | High 64-bit product | $[127:64]$ | Unsigned $\\times$ Unsigned |
| **\`mulhsu\`** | R-Type | High 64-bit product | $[127:64]$ | Signed ($rs1$) $\\times$ Unsigned ($rs2$) |

#### 2. 32-Bit Word Operations (\`mulw\`, \`divw\`, \`remw\`)
In 64-bit architectures, operations on 32-bit values require explicit sign-extension:
- \`mulw\`: Multiplies the lower 32 bits of $rs1$ and $rs2$, and sign-extends the lower 32 bits of the result to 64 bits.
- \`divw\` / \`divuw\`: Performs 32-bit signed / unsigned division, sign-extending the 32-bit quotient to 64 bits.
- \`remw\` / \`remuw\`: Performs 32-bit signed / unsigned remainder, sign-extending the 32-bit remainder to 64 bits.

#### 3. Division by Zero & Overflow Semantics
Unlike x86 or MIPS architectures, RISC-V specifies that **integer division by zero does not trigger a hardware exception or trap**:

| Condition | Dividend ($rs1$) | Divisor ($rs2$) | \`div\` Result | \`rem\` Result | Trap Generated? |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Division by Zero** | $x$ | $0$ | $-1$ (\`0xFFFFFFFFFFFFFFFF\`) | $x$ (Dividend) | **No Trap** |
| **Signed Overflow** | \`INT64_MIN\` (\`-2⁶³\`) | $-1$ | \`INT64_MIN\` | $0$ | **No Trap** |
| **Unsigned Div Zero** | $x$ | $0$ | $2^{64} - 1$ (\`0xFFFFFFFFFFFFFFFF\`) | $x$ (Dividend) | **No Trap** |

---

### B. A Extension (Atomic Operations)

The **A extension** provides hardware primitives for race-free synchronization across multiple cores (harts) and concurrent execution contexts.

#### 1. Load-Reserved / Store-Conditional (\`lr.w\` / \`lr.d\`, \`sc.w\` / \`sc.d\`)

Load-Reserved and Store-Conditional provide a lock-free optimistic concurrency mechanism:
- **\`lr\` (Load-Reserved)**: Loads a word (\`.w\`) or doubleword (\`.d\`) from memory and registers an active **Reservation Set** on that target physical address.
- **\`sc\` (Store-Conditional)**: Attempts to write a new value to the physical address, conditionally succeeding only if the reservation is still valid:
  - **If Valid**: Writes the new value to memory and returns \`0\` in \`rd\` (**Success**).
  - **If Invalid** (interrupted, context-switched, or modified by another hart): Cancels the store, leaves memory untouched, and returns \`1\` in \`rd\` (**Failure**).

![CPU / Hart Memory Bus Reservation Controller](assets/images/rv64-reservation-controller.svg)

#### 2. Atomic Memory Operations (AMOs)
AMOs atomically perform a read-modify-write sequence directly in memory or cache in a single instruction:
- **Instructions**: \`amoadd\`, \`amoswap\`, \`amoxor\`, \`amoand\`, \`amoor\`, \`amomax\`, \`amomin\`, \`amomaxu\`, \`amominu\`.
- **Ordering Bits**: Each AMO instruction encodes two ordering bits:
  - \`aq\` (Acquire): Guarantees that subsequent memory operations cannot be reordered before this AMO.
  - \`rl\` (Release): Guarantees that preceding memory operations cannot be reordered after this AMO.

---

### C. F & D Extensions (Single & Double Precision Floating-Point)

The **F (Single-Precision 32-bit)** and **D (Double-Precision 64-bit)** extensions add IEEE 754-2008 compliant floating-point capabilities:

- **Register State**: Adds 32 independent 64-bit Floating-Point Registers (\`f0\`–\`f31\`).
- **Control & Status Register (\`fcsr\`)**: A 32-bit CSR containing:
  - \`frm\` (bits \`[7:5]\`): Rounding Mode (RNE, RTZ, RDN, RUP, RMM, DYN).
  - \`fflags\` (bits \`[4:0]\`): Accrued Exception Flags (\`NV\` Invalid, \`DZ\` Divide by Zero, \`OF\` Overflow, \`UF\` Underflow, \`NX\` Inexact).

> [!IMPORTANT]
> **NaN-Boxing Rule (Critical Architectural Constraint)**
> 
> In RV64, single-precision (32-bit) floating-point values stored in 64-bit \`f\` registers **must be NaN-boxed**:
> - The upper 32 bits (\`bits [63:32]\`) must be filled with all 1s (\`0xFFFFFFFF\`).
> - If an instruction reads a single-precision value and the upper 32 bits are not all 1s, the hardware does not interpret the lower 32 bits as a valid float. Instead, it treats the operand as a **canonical Quiet NaN**.

---

### D. C Extension (Compressed 16-Bit Instructions / RVC)

The **C extension** reduces binary footprint by **25–30%** by encoding frequently used 32-bit instructions into 16-bit parcels without reducing architectural expressiveness:

- **2-Byte Instruction Alignment**: Instructions can be aligned on any 2-byte boundary (\`PC % 2 == 0\`).
- **Four Quadrants**: The lowest 2 bits (\`inst[1:0]\`) divide the 16-bit encoding space into four quadrants:

| Quadrant Bits \`[1:0]\` | Quadrant Name | Typical Operations Mapped |
| :--- | :--- | :--- |
| **\`00\`** | **Quadrant 0** | Stack-pointer loads/stores, wide immediate arithmetic (\`c.addi4spn\`, \`c.lw\`, \`c.sw\`, \`c.ld\`, \`c.sd\`). |
| **\`01\`** | **Quadrant 1** | Control flow and arithmetic (\`c.j\`, \`c.jal\`, \`c.beqz\`, \`c.bnez\`, \`c.addi\`, \`c.li\`, \`c.lui\`, \`c.srli\`, \`c.srai\`, \`c.andi\`, \`c.sub\`). |
| **\`10\`** | **Quadrant 2** | Register jumps and stack-pointer ops (\`c.slli\`, \`c.lwsp\`, \`c.ldsp\`, \`c.swsp\`, \`c.sdsp\`, \`c.jr\`, \`c.jalr\`, \`c.mv\`, \`c.add\`, \`c.ebreak\`). |
| **\`11\`** | **Reserved** | Reserved for standard 32-bit (or longer) instructions (\`inst[1:0] == 11_2\`). |

---

### E. Zicsr & Zifencei Extensions

- **\`Zicsr\` (Control and Status Register Instructions)**: Defines atomic CSR access instructions (\`csrrw\`, \`csrrs\`, \`csrrc\`, \`csrrwi\`, \`csrrsi\`, \`csrrci\`).
- **\`Zifencei\` (Instruction-Fetch Fence)**: 
  - \`fence.i\` synchronizes memory writes with the instruction fetch stream.
  - Mandatory when self-modifying code, JIT engines, or OS kernel bootloaders write executable instructions to DRAM before executing them, ensuring stale cache entries or prefetch buffers are purged.

---

## Step 3: Source-Code Investigation (Yantra Implementation)

In **Yantra**, atomic reservations and compressed instruction decoding are integrated into the core execution pipeline:

\`\`\`cpp
#include <cstdint>

// 1. Atomic Reservation State inside CPU Core struct
struct Cpu {
    uint64_t reservation_addr; // Physical address reserved by LR
    bool reservation_valid;    // True if reservation is active

    void invalidate_reservation() {
        reservation_valid = false;
    }
};

// 2. Compressed Instruction Expansion (RVC -> 32-bit RISC-V)
uint32_t expand_compressed(uint16_t inst16) {
    uint8_t quadrant = inst16 & 0x3;
    uint8_t funct3 = (inst16 >> 13) & 0x7;
    
    switch (quadrant) {
    case 0b01: { // Quadrant 1
        switch (funct3) {
        case 0x0: { // c.addi -> addi rd, rd, imm
            uint8_t rd = (inst16 >> 7) & 0x1F;
            int32_t imm = ((inst16 >> 12) & 1) ? -1 : 0; // Sign extend
            imm = (imm & ~0x1F) | ((inst16 >> 2) & 0x1F);
            return make_i_type(0x13, rd, 0x0, rd, imm); // Returns 32-bit ADDI
        }
        }
        break;
    }
    // ... Quadrant 0 & 2 expansions
    }
    
    return 0; // Invalid / unhandled RVC
}
\`\`\`

---

## Step 4: Concrete Walkthrough (Atomic Lock Acquisition)

Let's trace how a concurrent spinlock acquisition is executed using \`lr.w\` and \`sc.w\`:

\`\`\`assembly
spinlock_acquire:
    lr.w   t0, (a0)              # Load current lock state into t0 & reserve address in a0
    bnez   t0, spinlock_acquire  # If lock is held (t0 != 0), retry
    sc.w   t1, t2, (a0)          # Attempt to store new value (t2=1) into lock address
    bnez   t1, spinlock_acquire  # If t1 == 1 (sc failed), retry
    ret                          # Lock acquired!
\`\`\`

### Trace Step 1: \`lr.w t0, (a0)\` Executed
1. Reads 32-bit word from DRAM at physical address \`a0\`.
2. Sets \`reservation_addr = PA(a0)\` and marks \`reservation_valid = true\`.

### Trace Step 2: Interrupt / Context Switch Scenario
1. If a timer interrupt occurs before \`sc.w\`, the CPU hardware trap handler executes \`raise_trap()\`.
2. The trap handler calls \`invalidate_reservation()\`, setting \`reservation_valid = false\`.

### Trace Step 3: \`sc.w t1, t2, (a0)\` Executed
1. Inspects \`reservation_valid\`. Because an interrupt occurred, \`reservation_valid == false\`.
2. The store is aborted, preserving memory state. Register \`t1\` receives \`1\` (**Failure**).
3. The branch \`bnez t1, spinlock_acquire\` evaluates to true, cleanly branching back to retry lock acquisition.

---

## Step 5: Edge Cases & Real-World Considerations

### 1. Reservation Invalidation on Traps
Any privilege level change, hardware exception, timer/device interrupt, or store instruction executed by any CPU core to the reserved address block must clear \`reservation_valid\`. Failing to invalidate reservations on traps leads to subtle concurrency bugs and race conditions in kernel mutexes.

### 2. Division Overflow Edge Case
In 2's complement 64-bit arithmetic, \`INT64_MIN\` (\`-9223372036854775808\` / \`0x8000000000000000\`) divided by \`-1\` produces $+2^{63}$, which cannot fit into a signed 64-bit integer. RISC-V explicitly specifies that \`INT64_MIN / -1\` returns \`INT64_MIN\` **without generating an architectural trap**.

### 3. Misaligned Compressed Instruction Fetches
When RVC is enabled, instructions can be aligned on 2-byte boundaries (\`PC = 0x80000002\`). Fetching a standard 32-bit instruction that straddles across two separate 4 KiB page boundaries can trigger a **Page Fault on the second half of the instruction word**. The emulator must handle split-page instruction fetches seamlessly.

---

## Step 6: System Connectivity

- **Upstream Dependency**: Replaces the simple 32-bit PC increment (\`PC += 4\`) from Module 1 with variable-length instruction fetch steps (\`PC += 2\` for compressed or \`PC += 4\` for standard instructions).
- **Downstream Dependency**: Powers Linux thread scheduling, pthread mutex synchronization, kernel atomic operations, and compact BusyBox binary execution in Module 5.

---

## Step 7: Summary & Review

> [!TIP]
> **📌 Key Takeaways**
> 
> 1. **RV64GC Baseline**: RV64GC represents the standard 64-bit RISC-V application baseline (\`I\`, \`M\`, \`A\`, \`F\`, \`D\`, \`C\`, \`Zicsr\`, \`Zifencei\`).
> 2. **M Extension Math**: Handles 64-bit/32-bit integer arithmetic; division by zero returns all 1s without trapping.
> 3. **A Extension Synchronization**: Implements lock-free atomic sequences via Load-Reserved (\`lr\`) and Store-Conditional (\`sc\`), dependent on reservation set state.
> 4. **C Extension Density**: Compresses common instructions into 16-bit parcels, requiring 2-byte alignment support (\`PC % 2 == 0\`).
> 5. **NaN-Boxing**: Single-precision floats inside 64-bit FPRs must be NaN-boxed with upper 32 bits set to \`0xFFFFFFFF\`.
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
