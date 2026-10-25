# Module 3: Privileged Architecture, CSRs, and Trap Handling

---

## Step 1: Learning Objectives & Prerequisites

> [!NOTE]
> **🎯 Learning Objectives**
> 
> By the end of this module, you will be able to:
> 1. **Distinguish Privilege Modes**: Distinguish between Machine (M), Supervisor (S), and User (U) privilege modes in RISC-V.
> 2. **Parse Key CSRs**: Parse key Control and Status Registers (CSRs), including `mstatus`/`sstatus`, `stvec`/`mtvec`, `sepc`/`mepc`, `scause`/`mcause`, and delegation registers (`medeleg`/`mideleg`).
> 3. **Trace Trap Entry Mechanics**: Trace the trap entry mechanism when an exception (e.g., `ecall`, page fault) or interrupt occurs.
> 4. **Explain Trap Delegation**: Explain how Trap Delegation allows Supervisor mode (Linux) to handle exceptions without triggering OpenSBI firmware overhead in Machine mode.
> 5. **Trace Trap Return Instructions**: Trace trap return instructions (`mret` / `sret`) and privilege state restoration.

**Prerequisites**: Module 1 (CPU Core State & PC loop) and Module 2 (Sv39 MMU & Page Fault exceptions).

---

## Step 2: Conceptual Foundation (First Principles)

## 1. The Core Hardware Problem

An operating system must prevent user applications from executing arbitrary hardware commands or tampering with kernel memory. However, applications frequently need operating system services (e.g., reading a file, printing to terminal, or allocating memory).

To achieve this safely, the hardware enforces **Privilege Rings**. Applications run in a restricted ring. When they need kernel services, they execute a special instruction (`ecall`) that triggers a controlled hardware context-switch called a **Trap**.

![RISC-V Privilege Modes & Trap Delegation Hierarchy](assets/images/riscv-privilege-levels.svg)

---

## 2. Control and Status Registers (CSRs)

Unlike general-purpose registers (`x0`–`x31`), CSRs govern system status, privilege levels, interrupt configuration, and trap vector locations. They are accessed via dedicated CSR instructions (`csrrw`, `csrrs`, `csrrc`).

### Key CSR Responsibilities:

| CSR Name | Description | Key Bitfields |
| :--- | :--- | :--- |
| **`mstatus` / `sstatus`** | Global Status Register | **`MIE` / `SIE`**: Global interrupt enable bits.<br>**`MPIE` / `SPIE`**: Saved interrupt enables prior to trap.<br>**`MPP` / `SPP`**: Saved previous privilege mode prior to trap. |
| **`mtvec` / `stvec`** | Trap Vector Base Address | High bits hold entry PC address; bit `[0]` sets mode (`0` = Direct, `1` = Vectored). |
| **`mepc` / `sepc`** | Exception Program Counter | Saves the `pc` value where the trap occurred. |
| **`mcause` / `scause`** | Exception / Interrupt Cause | Bit `[63]` indicates Interrupt (`1`) vs Exception (`0`). Lower bits indicate exact cause code. |
| **`mtval` / `stval`** | Trap Value | Stores faulting memory address (e.g., for page faults) or instruction word. |
| **`medeleg` / `mideleg`** | Exception / Interrupt Delegation | Bitmask in M-mode indicating which traps bypass M-mode and go directly to S-mode. |

---

## 3. Trap Execution Mechanics

When a trap occurs (e.g., `ecall` in U-mode targeting S-mode):

1. **Save Return Address**: The hardware copies current `pc` into `sepc`.
2. **Save Cause & Value**: The reason for the trap is written to `scause`, and relevant fault data to `stval`.
3. **Save Privilege & Interrupt State**:
   - Current privilege mode (U-mode) is written to `sstatus.SPP`.
   - Global interrupt enable (`sstatus.SIE`) is saved into `sstatus.SPIE`.
   - Global interrupts are disabled (`sstatus.SIE = 0`).
4. **Switch Privilege Mode**: Privilege drops or elevates to the target mode (S-mode).
5. **Jump to Vector**: `pc` is updated to the address in `stvec`.

When the trap handler completes, it executes `sret`:

1. `pc` is restored from `sepc`.
2. Privilege level is restored from `sstatus.SPP`.
3. Interrupt enable state is restored (`sstatus.SIE = sstatus.SPIE`).

---

## Step 3: Source-Code Investigation (Yantra Implementation)

In the Yantra emulator, privilege transitions and trap handling are implemented centrally:

```cpp
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
```

---

## Step 4: Concrete Walkthrough (System Call Trap & Return)

Let's trace a Linux System Call (`ecall`) issued by a User program:

### Initial State

| State Element | Value | Meaning |
| :--- | :--- | :--- |
| **`priv_mode`** | `PRIV_USER` (0) | CPU is currently executing in unprivileged User Mode. |
| **`PC`** | `0x0000000000010400` | Address of the userspace `ecall` instruction. |
| **`medeleg[8]`** | `1` | Environment call from U-mode is delegated directly to S-mode. |
| **`stvec`** | `0x80200000` | Base address of the Linux kernel trap handler. |

---

### Step-by-Step Trap Sequence

#### 1. Instruction Execution
- CPU fetches instruction `ecall` (`0x00000073`) at `PC = 0x0000000000010400`.
- Exception generated: **Cause = 8** (`Environment Call from U-mode`).

#### 2. Delegation Check
- Read `medeleg` bit 8 $\to$ `1`.
- Target mode determined: **S-Mode** (Supervisor). Direct delegation bypasses M-mode OpenSBI firmware overhead.

#### 3. Trap State Save
- `sepc` $\leftarrow$ `0x0000000000010400`
- `scause` $\leftarrow$ `8` (`0x0000000000000008`)
- `stval` $\leftarrow$ `0`
- `sstatus.SPP` $\leftarrow$ `PRIV_USER` (0)
- `sstatus.SPIE` $\leftarrow$ `sstatus.SIE`
- `sstatus.SIE` $\leftarrow$ `0`

#### 4. Privilege Switch & Vector Jump
- `priv_mode` $\leftarrow$ `PRIV_SUPERVISOR` (1)
- `PC` $\leftarrow$ `stvec & ~0x3ULL` (`0x80200000`)

#### 5. OS Kernel Trap Handling
- Linux reads `scause` (8), inspects system call number in register `x17` (`a7`).
- Executes system call, writes return code into register `x10` (`a0`).
- Advances `sepc` by 4 (`sepc = 0x0000000000010404`) to resume after `ecall`.

#### 6. Trap Return (`sret`)
- CPU executes `sret`.
- `PC` $\leftarrow$ `sepc` (`0x0000000000010404`)
- `priv_mode` $\leftarrow$ `sstatus.SPP` (`PRIV_USER`)
- `sstatus.SIE` $\leftarrow$ `sstatus.SPIE`

---

## Step 5: Edge Cases & Real-World Considerations

### 1. Undelegated Traps (Firmware Hand-off)
If an exception bit in `medeleg` is `0`, the trap jumps to M-mode (`mtvec`), where OpenSBI firmware handles it (e.g., SBI service calls like timer setup or console I/O).

### 2. Double Traps & Stack Overflow
If a page fault occurs while executing inside the trap handler before `sepc` and `sstatus` are saved, `sepc` gets overwritten, resulting in kernel panic or double-fault crash.

### 3. `sepc` Advancement on `ecall`
Unlike asynchronous hardware interrupts (where `sepc` points to the next instruction to execute), synchronous exceptions point to the faulting instruction itself. For `ecall`, the OS kernel trap handler must explicitly increment `sepc += 4` before executing `sret`, or the CPU will loop endlessly re-executing `ecall`.

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
> 3. **Trap Delegation**: Trap Delegation (`medeleg` / `mideleg`) routes exceptions directly to Supervisor mode, avoiding slow M-mode firmware context switches.
> 4. **Hardware State Save**: On trap entry, `sepc` captures faulting PC, `sstatus` saves previous state, interrupts are disabled, and PC shifts to `stvec`.
> 5. **Trap Return**: `sret` / `mret` restores privilege mode, enables interrupts, and sets PC back to `sepc`.
