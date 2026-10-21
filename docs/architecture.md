# Yantra System Architecture

The **Yantra** system emulator is an architecture-compliant, high-performance C++20 implementation of the **RISC-V 64-bit (RV64GC)** specification. It is designed to model the exact hardware behavior required to run bare-metal firmware (OpenSBI), an operating system kernel (Linux 6.8), and interactive userspace environments (BusyBox).

![Yantra Full-System Architecture](assets/images/yantra-architecture.png)

---

## 1. CPU Core (`RV64GC`)

The CPU Core implements the complete RV64GC architectural profile with 64-bit general-purpose and floating-point data paths:

### Register State
- **General Purpose Registers (x0 - x31)**: 32 integer registers, each strictly 64 bits wide (`XLEN = 64`). Register `x0` is hardwired to zero (`0x0000000000000000`).
- **Floating Point Registers (f0 - f31)**: 32 floating-point registers, each 64 bits wide (`FLEN = 64`), adhering to IEEE 754-2008.
- **Program Counter (PC)**: 64-bit register holding the address of the current instruction, reset to `0x80000000` (or BootROM reset vector `0x1000`).

### ISA Extensions
- **RV64I**: Base integer instruction set with 64-bit arithmetic and logic.
- **M**: Integer multiplication and division (`MUL`, `MULW`, `DIV`, `DIVU`, `REM`, `REMU`).
- **A**: Atomic memory instructions (`LR.W/D`, `SC.W/D`, `AMOADD`, `AMOSWAP`, `AMOAND`, `AMOOR`, `AMOXOR`, `AMOMIN/MAX`).
- **F & D**: Single and double precision floating-point operations.
- **C**: 16-bit compressed instruction support for code density.
- **Zicsr & Zifencei**: CSR manipulation instructions and instruction-fetch synchronization.

### Privilege Levels & Trap Delegation
- **Machine Mode (M)**: Highest privilege level; root control for platform firmware and physical hardware interrupts.
- **Supervisor Mode (S)**: Operating system kernel mode; protected paging and virtual memory execution.
- **User Mode (U)**: Unprivileged execution mode for application binaries.
- **Delegation Registers**: `medeleg` (machine exception delegation) and `mideleg` (machine interrupt delegation) allow low-overhead direct trap delivery to Supervisor mode without entering M-mode on every page fault or timer tick.
- **Trap Vectors & State**: `mstatus`, `sstatus`, `sepc`, `stvec`, `scause`, `stval`, `mtvec`, `mepc`.

---

## 2. Sv39 MMU & Memory Subsystem

The memory subsystem is responsible for physical memory mapping, address translation, and protection:

### 3-Level Page Table Walking (Sv39)
- **Virtual Address (VA)**: 39-bit virtual space partitioned into three 9-bit VPNs and a 12-bit offset:
  - `VPN[2]` (Level 2): Points to 1 GB megapages.
  - `VPN[1]` (Level 1): Points to 2 MB megapages.
  - `VPN[0]` (Level 0): Points to 4 KB base pages.
- Resolves to a 56-bit **Physical Address (PA)** in DRAM.

### Hardware TLB Accelerator
- **Direct-Mapped Cache**: Caches exact `(VPN, ASID) -> (PPN, Permissions)` translation entries.
- **SATP Cache Tagging**: Flushes or revalidates automatically upon `SATP` register modifications or execution of `SFENCE.VMA`.

### Copy-on-Write (COW) Support
- **PTE Permission Enforcement**: Read-only tracking on shared physical pages.
- **Write Detection**: Detects store instructions targeting shared pages with write permissions cleared.
- **Private Copy Allocation**: Transparently allocates a new physical frame and maps write access upon write attempts during `fork()`.

### Main Memory (DRAM)
- **512 MB Physical DRAM**: Mapped at base address `0x80000000` spanning through `0x9FFFFFFF`.

---

## 3. System Bus & Peripherals

The system crossbar routes memory access based on physical address decode windows:

| Device | Base Address | Size | Functionality |
| :--- | :--- | :--- | :--- |
| **SiFive CLINT** | `0x02000000` | 64 KB | Core Local Interruptor providing `mtime` and `mtimecmp` timer interrupts. |
| **SiFive PLIC** | `0x0C000000` | 64 MB | Platform-Level Interrupt Controller arbitrating external device IRQs to M/S modes. |
| **UART 16550A** | `0x10000000` | 256 B | Standard serial console with TX/RX FIFOs and non-blocking multi-threaded terminal I/O. |
| **VirtIO-MMIO** | `0x10001000` | 4 KB | Legacy VirtIO block storage device providing high-throughput direct DMA access to disk images (`/dev/vda`). |
