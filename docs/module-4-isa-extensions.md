# Module 4: ISA Extensions (M, A, F, D, C, Zicsr, Zifencei)

---

## Step 1: Learning Objectives & Prerequisites

> [!NOTE]
> **🎯 Learning Objectives**
> 
> By the end of this module, you will be able to:
> 1. **Define RV64GC Baseline**: Define the full RV64GC standard extension suite required to boot modern 64-bit Linux kernels.
> 2. **Master Integer Math (M Extension)**: Explain hardware multiplication and division signedness, edge cases, and 32-bit word instruction behavior.
> 3. **Understand Atomic Synchronization (A Extension)**: Master Load-Reserved (`lr`), Store-Conditional (`sc`), Reservation Sets, and Atomic Memory Operations (AMOs).
> 4. **Understand Floating-Point Mechanics (F & D Extensions)**: Understand single and double-precision floating-point state, NaN-boxing rules, and rounding control via `fcsr`.
> 5. **Decode Compressed Instructions (C Extension / RVC)**: Decode 16-bit compressed instructions across the three opcode quadrants and explain 16-bit to 32-bit instruction expansion.
> 6. **Describe Pipeline & Cache Fences**: Describe memory fence synchronization (`fence`) and instruction cache invalidation (`fence.i`).

**Prerequisites**: Module 1 (RV64I registers & ALU decoding) and Module 3 (Privilege modes & CSR mechanics).

---

## Step 2: Deep Dive into the Extension Suite

The standard RISC-V application baseline for general-purpose computing is designated as **RV64GC** (where **G** = `IMAFD_Zicsr_Zifencei` and **C** = Compressed Instructions). This complete suite is mandatory to execute standard Linux distributions, multi-threaded userspace runtimes, and JIT compilers.

---

### A. M Extension (Integer Multiplication & Division)

The **M extension** introduces hardware integer multiplication and division for both 64-bit doublewords and 32-bit words:

#### 1. 64-Bit Multiplication
Multiplication of two 64-bit integers produces a full 128-bit intermediate product:

$$\text{Product}[127:0] = rs1 \times rs2$$

- **`mul`**: Computes the 128-bit product and returns the **low 64 bits** (`Product[63:0]`). The result is identical for signed and unsigned integers in 2's complement arithmetic.
- **`mulh` / `mulhu` / `mulhsu`**: Returns the **high 64 bits** (`Product[127:64]`), which depends on operand signedness:
  - `mulh`: Signed $\times$ Signed
  - `mulhu`: Unsigned $\times$ Unsigned
  - `mulhsu`: Signed ($rs1$) $\times$ Unsigned ($rs2$)

| Instruction | Format | Operation | Product Slice | Signedness ($rs1 \times rs2$) |
| :--- | :--- | :--- | :--- | :--- |
| **`mul`** | R-Type | Low 64-bit product | $[63:0]$ | Signed / Unsigned (Identical) |
| **`mulh`** | R-Type | High 64-bit product | $[127:64]$ | Signed $\times$ Signed |
| **`mulhu`** | R-Type | High 64-bit product | $[127:64]$ | Unsigned $\times$ Unsigned |
| **`mulhsu`** | R-Type | High 64-bit product | $[127:64]$ | Signed ($rs1$) $\times$ Unsigned ($rs2$) |

#### 2. 32-Bit Word Operations (`mulw`, `divw`, `remw`)
In 64-bit architectures, operations on 32-bit values require explicit sign-extension:
- `mulw`: Multiplies the lower 32 bits of $rs1$ and $rs2$, and sign-extends the lower 32 bits of the result to 64 bits.
- `divw` / `divuw`: Performs 32-bit signed / unsigned division, sign-extending the 32-bit quotient to 64 bits.
- `remw` / `remuw`: Performs 32-bit signed / unsigned remainder, sign-extending the 32-bit remainder to 64 bits.

#### 3. Division by Zero & Overflow Semantics
Unlike x86 or MIPS architectures, RISC-V specifies that **integer division by zero does not trigger a hardware exception or trap**:

| Condition | Dividend ($rs1$) | Divisor ($rs2$) | `div` Result | `rem` Result | Trap Generated? |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Division by Zero** | $x$ | $0$ | $-1$ (`0xFFFFFFFFFFFFFFFF`) | $x$ (Dividend) | **No Trap** |
| **Signed Overflow** | `INT64_MIN` (`-2⁶³`) | $-1$ | `INT64_MIN` | $0$ | **No Trap** |
| **Unsigned Div Zero** | $x$ | $0$ | $2^{64} - 1$ (`0xFFFFFFFFFFFFFFFF`) | $x$ (Dividend) | **No Trap** |

---

### B. A Extension (Atomic Operations)

The **A extension** provides hardware primitives for race-free synchronization across multiple cores (harts) and concurrent execution contexts.

#### 1. Load-Reserved / Store-Conditional (`lr.w` / `lr.d`, `sc.w` / `sc.d`)

Load-Reserved and Store-Conditional provide a lock-free optimistic concurrency mechanism:
- **`lr` (Load-Reserved)**: Loads a word (`.w`) or doubleword (`.d`) from memory and registers an active **Reservation Set** on that target physical address.
- **`sc` (Store-Conditional)**: Attempts to write a new value to the physical address, conditionally succeeding only if the reservation is still valid:
  - **If Valid**: Writes the new value to memory and returns `0` in `rd` (**Success**).
  - **If Invalid** (interrupted, context-switched, or modified by another hart): Cancels the store, leaves memory untouched, and returns `1` in `rd` (**Failure**).

![CPU / Hart Memory Bus Reservation Controller](assets/images/rv64-reservation-controller.svg)

#### 2. Atomic Memory Operations (AMOs)
AMOs atomically perform a read-modify-write sequence directly in memory or cache in a single instruction:
- **Instructions**: `amoadd`, `amoswap`, `amoxor`, `amoand`, `amoor`, `amomax`, `amomin`, `amomaxu`, `amominu`.
- **Ordering Bits**: Each AMO instruction encodes two ordering bits:
  - `aq` (Acquire): Guarantees that subsequent memory operations cannot be reordered before this AMO.
  - `rl` (Release): Guarantees that preceding memory operations cannot be reordered after this AMO.

---

### C. F & D Extensions (Single & Double Precision Floating-Point)

The **F (Single-Precision 32-bit)** and **D (Double-Precision 64-bit)** extensions add IEEE 754-2008 compliant floating-point capabilities:

- **Register State**: Adds 32 independent 64-bit Floating-Point Registers (`f0`–`f31`).
- **Control & Status Register (`fcsr`)**: A 32-bit CSR containing:
  - `frm` (bits `[7:5]`): Rounding Mode (RNE, RTZ, RDN, RUP, RMM, DYN).
  - `fflags` (bits `[4:0]`): Accrued Exception Flags (`NV` Invalid, `DZ` Divide by Zero, `OF` Overflow, `UF` Underflow, `NX` Inexact).

> [!IMPORTANT]
> **NaN-Boxing Rule (Critical Architectural Constraint)**
> 
> In RV64, single-precision (32-bit) floating-point values stored in 64-bit `f` registers **must be NaN-boxed**:
> - The upper 32 bits (`bits [63:32]`) must be filled with all 1s (`0xFFFFFFFF`).
> - If an instruction reads a single-precision value and the upper 32 bits are not all 1s, the hardware does not interpret the lower 32 bits as a valid float. Instead, it treats the operand as a **canonical Quiet NaN**.

---

### D. C Extension (Compressed 16-Bit Instructions / RVC)

The **C extension** reduces binary footprint by **25–30%** by encoding frequently used 32-bit instructions into 16-bit parcels without reducing architectural expressiveness:

- **2-Byte Instruction Alignment**: Instructions can be aligned on any 2-byte boundary (`PC % 2 == 0`).
- **Four Quadrants**: The lowest 2 bits (`inst[1:0]`) divide the 16-bit encoding space into four quadrants:

| Quadrant Bits `[1:0]` | Quadrant Name | Typical Operations Mapped |
| :--- | :--- | :--- |
| **`00`** | **Quadrant 0** | Stack-pointer loads/stores, wide immediate arithmetic (`c.addi4spn`, `c.lw`, `c.sw`, `c.ld`, `c.sd`). |
| **`01`** | **Quadrant 1** | Control flow and arithmetic (`c.j`, `c.jal`, `c.beqz`, `c.bnez`, `c.addi`, `c.li`, `c.lui`, `c.srli`, `c.srai`, `c.andi`, `c.sub`). |
| **`10`** | **Quadrant 2** | Register jumps and stack-pointer ops (`c.slli`, `c.lwsp`, `c.ldsp`, `c.swsp`, `c.sdsp`, `c.jr`, `c.jalr`, `c.mv`, `c.add`, `c.ebreak`). |
| **`11`** | **Reserved** | Reserved for standard 32-bit (or longer) instructions (`inst[1:0] == 11_2`). |

---

### E. Zicsr & Zifencei Extensions

- **`Zicsr` (Control and Status Register Instructions)**: Defines atomic CSR access instructions (`csrrw`, `csrrs`, `csrrc`, `csrrwi`, `csrrsi`, `csrrci`).
- **`Zifencei` (Instruction-Fetch Fence)**: 
  - `fence.i` synchronizes memory writes with the instruction fetch stream.
  - Mandatory when self-modifying code, JIT engines, or OS kernel bootloaders write executable instructions to DRAM before executing them, ensuring stale cache entries or prefetch buffers are purged.

---

## Step 3: Source-Code Investigation (Yantra Implementation)

In **Yantra**, atomic reservations and compressed instruction decoding are integrated into the core execution pipeline:

```cpp
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
```

---

## Step 4: Concrete Walkthrough (Atomic Lock Acquisition)

Let's trace how a concurrent spinlock acquisition is executed using `lr.w` and `sc.w`:

```assembly
spinlock_acquire:
    lr.w   t0, (a0)              # Load current lock state into t0 & reserve address in a0
    bnez   t0, spinlock_acquire  # If lock is held (t0 != 0), retry
    sc.w   t1, t2, (a0)          # Attempt to store new value (t2=1) into lock address
    bnez   t1, spinlock_acquire  # If t1 == 1 (sc failed), retry
    ret                          # Lock acquired!
```

### Trace Step 1: `lr.w t0, (a0)` Executed
1. Reads 32-bit word from DRAM at physical address `a0`.
2. Sets `reservation_addr = PA(a0)` and marks `reservation_valid = true`.

### Trace Step 2: Interrupt / Context Switch Scenario
1. If a timer interrupt occurs before `sc.w`, the CPU hardware trap handler executes `raise_trap()`.
2. The trap handler calls `invalidate_reservation()`, setting `reservation_valid = false`.

### Trace Step 3: `sc.w t1, t2, (a0)` Executed
1. Inspects `reservation_valid`. Because an interrupt occurred, `reservation_valid == false`.
2. The store is aborted, preserving memory state. Register `t1` receives `1` (**Failure**).
3. The branch `bnez t1, spinlock_acquire` evaluates to true, cleanly branching back to retry lock acquisition.

---

## Step 5: Edge Cases & Real-World Considerations

### 1. Reservation Invalidation on Traps
Any privilege level change, hardware exception, timer/device interrupt, or store instruction executed by any CPU core to the reserved address block must clear `reservation_valid`. Failing to invalidate reservations on traps leads to subtle concurrency bugs and race conditions in kernel mutexes.

### 2. Division Overflow Edge Case
In 2's complement 64-bit arithmetic, `INT64_MIN` (`-9223372036854775808` / `0x8000000000000000`) divided by `-1` produces $+2^{63}$, which cannot fit into a signed 64-bit integer. RISC-V explicitly specifies that `INT64_MIN / -1` returns `INT64_MIN` **without generating an architectural trap**.

### 3. Misaligned Compressed Instruction Fetches
When RVC is enabled, instructions can be aligned on 2-byte boundaries (`PC = 0x80000002`). Fetching a standard 32-bit instruction that straddles across two separate 4 KiB page boundaries can trigger a **Page Fault on the second half of the instruction word**. The emulator must handle split-page instruction fetches seamlessly.

---

## Step 6: System Connectivity

- **Upstream Dependency**: Replaces the simple 32-bit PC increment (`PC += 4`) from Module 1 with variable-length instruction fetch steps (`PC += 2` for compressed or `PC += 4` for standard instructions).
- **Downstream Dependency**: Powers Linux thread scheduling, pthread mutex synchronization, kernel atomic operations, and compact BusyBox binary execution in Module 5.

---

## Step 7: Summary & Review

> [!TIP]
> **📌 Key Takeaways**
> 
> 1. **RV64GC Baseline**: RV64GC represents the standard 64-bit RISC-V application baseline (`I`, `M`, `A`, `F`, `D`, `C`, `Zicsr`, `Zifencei`).
> 2. **M Extension Math**: Handles 64-bit/32-bit integer arithmetic; division by zero returns all 1s without trapping.
> 3. **A Extension Synchronization**: Implements lock-free atomic sequences via Load-Reserved (`lr`) and Store-Conditional (`sc`), dependent on reservation set state.
> 4. **C Extension Density**: Compresses common instructions into 16-bit parcels, requiring 2-byte alignment support (`PC % 2 == 0`).
> 5. **NaN-Boxing**: Single-precision floats inside 64-bit FPRs must be NaN-boxed with upper 32 bits set to `0xFFFFFFFF`.
